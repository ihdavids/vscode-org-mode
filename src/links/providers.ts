// Links in the editor. Following one is VS Code's own Go to Definition (F12,
// Ctrl+click, gd in vim); backlinks to a heading are its Find References
// (Shift+F12, gr in vim); an image link shows the picture on hover. Insert
// Link offers every heading in the workspace, and Store Link remembers where
// you are so you can link to it from somewhere else.

/* SDOC: Developers
* Links in the editor
  Following a link is VS Code's Go to Definition (=LinkDefinitions=),
  backlinks are its Find References (=Backlinks=), so F12, Shift+F12 and
  vim's =gd= / =gr= work with nothing bound. =resolve= turns a target into a
  place: this file for =*heading=, =#custom-id= and =<<target>>=; the file
  for =file:= links and their =::= searches; the workspace, then the orgs
  server (=GET /id/=), for =id:=. =ClickableLinks= makes them Ctrl+clickable
  through a =command:= uri; =LinkHover= previews images and headings.
EDOC */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LinkAt, Target, findLinks, linkAt, parseTarget, resolveIn, isImage, linkToHeading, formatLink } from './model';
import { orgFiles, readLines, headingsIn, relativeLink, resolvePath, openAt } from '../org-files';
import { headingAt } from '../outline/model';
import { Auth } from '../auth';
import { ODb } from '../db';

export interface Place { file: string; line: number; ch: number; }
type Resolved = Place | { url: string } | undefined;

// Where a link goes. A url is opened outside; anything else is a place in a
// file: this one for *headings, #custom ids and <<targets>>; the workspace,
// then the orgs server, for an id: nobody has open.
export async function resolve(fromFile: string, fromLines: string[], raw: string): Promise<Resolved> {
    const t = parseTarget(raw);
    if (t.kind === 'url') {
        return { url: t.url };
    }
    if (t.kind === 'file') {
        const file = resolvePath(fromFile, t.path);
        if (!/\.org$/i.test(file) && !t.search && t.line === undefined) {
            return { url: vscode.Uri.file(file).toString() };
        }
        const where = t.search ? resolveIn(readLines(file), t.search) : t.line !== undefined ? { line: t.line, ch: 0 } : undefined;
        return { file, line: where ? where.line : 0, ch: where ? where.ch : 0 };
    }
    const here = resolveIn(fromLines, t);
    if (here) {
        return { file: fromFile, line: here.line, ch: here.ch };
    }
    if (t.kind === 'id' || t.kind === 'customId') {
        for (const file of await orgFiles()) {
            if (file === fromFile) {
                continue;
            }
            const at = resolveIn(readLines(file), t);
            if (at) {
                return { file, line: at.line, ch: 0 };
            }
        }
        if (Auth.get().isLoggedIn()) {
            const todo = await ODb.byId(t.text);
            if (todo && todo.Filename) {
                return { file: todo.Filename, line: todo.LineNum, ch: 0 };
            }
        }
    }
    return undefined;
}

function docLines(doc: vscode.TextDocument): string[] {
    return doc.getText().split(/\r?\n/);
}

async function follow(doc: vscode.TextDocument, link: LinkAt) {
    const to = await resolve(doc.fileName, docLines(doc), link.target);
    if (!to) {
        vscode.window.showWarningMessage(`Nothing found for [[${link.target}]]`);
        return;
    }
    if ('url' in to) {
        await vscode.env.openExternal(vscode.Uri.parse(to.url));
        return;
    }
    await openAt(to.file, to.line, to.ch);
}

// -- Providers ---------------------------------------------------------------

class LinkDefinitions implements vscode.DefinitionProvider {
    async provideDefinition(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.Definition | undefined> {
        const link = linkAt(doc.lineAt(pos.line).text, pos.character);
        if (!link) {
            return undefined;
        }
        const to = await resolve(doc.fileName, docLines(doc), link.target);
        return to && 'file' in to ? new vscode.Location(vscode.Uri.file(to.file), new vscode.Position(to.line, to.ch)) : undefined;
    }
}

// Ctrl+click on a link. Urls are left to VS Code, which finds them already.
class ClickableLinks implements vscode.DocumentLinkProvider {
    provideDocumentLinks(doc: vscode.TextDocument): vscode.DocumentLink[] {
        const out: vscode.DocumentLink[] = [];
        for (let i = 0; i < doc.lineCount; i++) {
            const text = doc.lineAt(i).text;
            if (text.indexOf('[[') < 0) {
                continue;
            }
            for (const l of findLinks(text)) {
                if (l.desc === undefined && parseTarget(l.target).kind === 'url' && !text.startsWith('[[', l.start)) {
                    continue;
                }
                const args = encodeURIComponent(JSON.stringify([doc.uri.toString(), i, l.start + 2]));
                const link = new vscode.DocumentLink(new vscode.Range(i, l.start, i, l.end), vscode.Uri.parse(`command:org.followLinkAt?${args}`));
                link.tooltip = 'Follow link';
                out.push(link);
            }
        }
        return out;
    }
}

// An image link shows the image; a link to a heading shows the heading and
// the first lines under it.
class LinkHover implements vscode.HoverProvider {
    async provideHover(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.Hover | undefined> {
        const text = doc.lineAt(pos.line).text;
        const link = linkAt(text, pos.character);
        if (!link) {
            return undefined;
        }
        const t = parseTarget(link.target);
        const range = new vscode.Range(pos.line, link.start, pos.line, link.end);
        if (isImage(t)) {
            const file = resolvePath(doc.fileName, t.path);
            if (!fs.existsSync(file)) {
                return new vscode.Hover(new vscode.MarkdownString(`$(warning) No such image: \`${t.path}\``, true), range);
            }
            const md = new vscode.MarkdownString(`![${path.basename(file)}](${vscode.Uri.file(file).toString()}|width=360)`);
            return new vscode.Hover(md, range);
        }
        if (t.kind === 'url') {
            return undefined;
        }
        const to = await resolve(doc.fileName, docLines(doc), link.target);
        if (!to || !('file' in to)) {
            return new vscode.Hover(new vscode.MarkdownString(`$(warning) Nothing found for \`${link.target}\``, true), range);
        }
        const lines = readLines(to.file);
        const preview = lines.slice(to.line, to.line + 6).join('\n');
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${vscode.workspace.asRelativePath(to.file)}:${to.line + 1}**\n`);
        md.appendCodeblock(preview, 'org');
        return new vscode.Hover(md, range);
    }
}

// Does a link, found in `fromFile`, point at the heading at `line` of `toFile`?
function pointsAt(t: Target, fromFile: string, toFile: string, toLines: string[], line: number): boolean {
    if (t.kind === 'url') {
        return false;
    }
    if (t.kind === 'file') {
        if (resolvePath(fromFile, t.path) !== toFile) {
            return false;
        }
        if (!t.search) {
            return false;
        }
        t = t.search;
    } else if (t.kind !== 'id' && fromFile !== toFile) {
        return false;
    }
    const at = resolveIn(toLines, t);
    return !!at && headingAt(toLines, at.line) === line;
}

// Find References on a heading: every link to it, in every org file.
class Backlinks implements vscode.ReferenceProvider {
    async provideReferences(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.Location[]> {
        const lines = docLines(doc);
        const line = headingAt(lines, pos.line);
        if (line < 0) {
            return [];
        }
        return backlinks(doc.fileName, lines, line);
    }
}

export async function backlinks(file: string, lines: string[], line: number): Promise<vscode.Location[]> {
    const out: vscode.Location[] = [];
    for (const from of await orgFiles()) {
        const fromLines = from === file ? lines : readLines(from);
        fromLines.forEach((text, i) => {
            if (text.indexOf('[[') < 0) {
                return;
            }
            for (const l of findLinks(text)) {
                if (pointsAt(parseTarget(l.target), from, file, lines, line)) {
                    out.push(new vscode.Location(vscode.Uri.file(from), new vscode.Range(i, l.start, i, l.end)));
                }
            }
        });
    }
    return out;
}

// -- Commands ----------------------------------------------------------------

// org's C-c C-o: follow the link under the cursor.
export async function openLink(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const pos = editor.selection.active;
    const link = linkAt(editor.document.lineAt(pos.line).text, pos.character);
    if (!link) {
        vscode.window.setStatusBarMessage('No link under the cursor', 2000);
        return;
    }
    await follow(editor.document, link);
}

export async function followLinkAt(uri: string, line: number, ch: number): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    const link = linkAt(doc.lineAt(line).text, ch);
    if (link) {
        await follow(doc, link);
    }
}

interface Stored { file: string; line: number; desc: string; search: string; id?: string; }
let stored: Stored | undefined;

// org's C-c l: remember the heading the cursor is under, to link to it from
// anywhere with Insert Link. The link goes on the clipboard too.
export async function storeLink(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const lines = docLines(editor.document);
    const line = headingAt(lines, editor.selection.active.line);
    const file = editor.document.fileName;
    if (line < 0) {
        stored = { file, line: 0, desc: path.basename(file), search: '' };
    } else {
        const l = linkToHeading(lines, line);
        const id = l.target.startsWith('id:') ? l.target : undefined;
        stored = { file, line, desc: l.desc, search: id ? '' : l.target, id };
    }
    await vscode.env.clipboard.writeText(formatLink(stored.id || `file:${file}${stored.search ? '::' + stored.search : ''}`, stored.desc));
    vscode.window.setStatusBarMessage(`$(link) Stored a link to "${stored.desc}" - Insert Link puts it in`, 4000);
}

function targetFrom(fromFile: string, to: { file: string, search: string, id?: string }): string {
    if (to.id) {
        return to.id;
    }
    if (to.file === fromFile) {
        return to.search || `file:${relativeLink(fromFile, to.file)}`;
    }
    return `file:${relativeLink(fromFile, to.file)}${to.search ? '::' + to.search : ''}`;
}

interface Pick extends vscode.QuickPickItem { make?: () => Promise<{ target: string, desc: string } | undefined>; }

// org's C-c C-l: a link to a heading (any in the workspace), a file, or a url.
// With text selected, that text is the description.
export async function insertLink(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const here = editor.document.fileName;
    const items: Pick[] = [];
    if (stored) {
        const s = stored;
        items.push({ label: `$(pinned) ${s.desc}`, description: 'stored link', detail: vscode.workspace.asRelativePath(s.file),
            make: async () => ({ target: targetFrom(here, s), desc: s.desc }) });
    }
    items.push({ label: '$(globe) A web address…', make: async () => {
        const url = await vscode.window.showInputBox({ prompt: 'Link to', placeHolder: 'https://' });
        return url ? { target: url.trim(), desc: '' } : undefined;
    } });
    items.push({ label: '$(file) A file…', make: async () => {
        const f = await vscode.window.showOpenDialog({ canSelectMany: false, defaultUri: vscode.Uri.file(path.dirname(here)) });
        return f && f.length ? { target: `file:${relativeLink(here, f[0].fsPath)}`, desc: path.basename(f[0].fsPath) } : undefined;
    } });
    const files = await orgFiles();
    // This file's headings first, then everyone else's.
    files.sort((a, b) => (a === here ? -1 : b === here ? 1 : a.localeCompare(b)));
    for (const file of files) {
        const lines = readLines(file);
        for (const h of headingsIn(file)) {
            items.push({
                label: `${'$(symbol-' + (h.level === 1 ? 'class' : 'field') + ')'} ${h.title}`,
                description: h.olp.join(' › '),
                detail: file === here ? undefined : vscode.workspace.asRelativePath(file),
                make: async () => {
                    const l = linkToHeading(lines, h.line);
                    const id = l.target.startsWith('id:') ? l.target : undefined;
                    return { target: targetFrom(here, { file, search: id ? '' : l.target, id }), desc: l.desc };
                },
            });
        }
    }
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Link to… (type to find any heading)', matchOnDescription: true, matchOnDetail: true });
    const made = pick && pick.make && await pick.make();
    if (!made) {
        return;
    }
    const selected = editor.document.getText(editor.selection);
    let desc = selected;
    if (!selected) {
        const d = await vscode.window.showInputBox({ prompt: 'Description (empty for none)', value: made.desc });
        if (d === undefined) {
            return;
        }
        desc = d;
    }
    await editor.edit(b => b.replace(editor.selection, formatLink(made.target, desc)));
}

// The backlinks to the heading at the cursor, in VS Code's references peek.
export async function showBacklinks(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const lines = docLines(editor.document);
    const line = headingAt(lines, editor.selection.active.line);
    if (line < 0) {
        vscode.window.setStatusBarMessage('Not under a heading', 2000);
        return;
    }
    const locs = await backlinks(editor.document.fileName, lines, line);
    if (!locs.length) {
        vscode.window.setStatusBarMessage('$(link) No links to this heading', 3000);
        return;
    }
    await vscode.commands.executeCommand('editor.action.showReferences', editor.document.uri, new vscode.Position(line, 0), locs);
}

export function activateLinks(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
        vscode.languages.registerDefinitionProvider('org', new LinkDefinitions()),
        vscode.languages.registerDocumentLinkProvider('org', new ClickableLinks()),
        vscode.languages.registerHoverProvider('org', new LinkHover()),
        vscode.languages.registerReferenceProvider('org', new Backlinks()),
        vscode.commands.registerCommand('org.openLink', openLink),
        vscode.commands.registerCommand('org.followLinkAt', followLinkAt),
        vscode.commands.registerCommand('org.storeLink', storeLink),
        vscode.commands.registerCommand('org.insertLink', insertLink),
        vscode.commands.registerCommand('org.showBacklinks', showBacklinks),
    );
}

