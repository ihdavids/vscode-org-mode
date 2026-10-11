// Narrow to subtree (org's C-x n s): one subtree in a tab of its own, as an org
// document - tables, links and completion all work in it. Saving it writes
// the subtree back into its file and saves the file; changes made to the file
// itself show up in it. Close the tab to widen.

/* SDOC: Developers
* Narrowing
  =org-narrow:= is a small file system (=NarrowFs=): reading a narrowed uri
  gives the subtree's lines from its source document, found by the heading
  line it started at (or, if that moved, by its text); writing replaces
  those lines with a =WorkspaceEdit= and saves the source. Changes to the
  source fire a change event for its narrowed views, so they reload.
EDOC */

import * as vscode from 'vscode';
import * as path from 'path';
import { headingAt, subtreeEnd, parseHeading, isHeadingLine, COMMON_KEYWORDS } from './outline/model';

interface Narrowed { uri: vscode.Uri; source: vscode.Uri; heading: string; line: number; mtime: number; }

class NarrowFs implements vscode.FileSystemProvider {
    private changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this.changed.event;
    private views = new Map<string, Narrowed>();
    private next = 1;

    // A tab for the subtree at a heading line of a document.
    add(doc: vscode.TextDocument, line: number): vscode.Uri {
        const heading = doc.lineAt(line).text;
        const title = parseHeading(heading, line, COMMON_KEYWORDS).title.replace(/[\\/]/g, '-');
        const id = String(this.next++);
        const uri = vscode.Uri.from({ scheme: 'org-narrow', path: `/${path.basename(doc.fileName, '.org')} › ${title}.org`, query: id });
        this.views.set(id, { uri, source: doc.uri, heading, line, mtime: Date.now() });
        return uri;
    }

    private view(uri: vscode.Uri): Narrowed {
        const v = this.views.get(uri.query);
        if (!v) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return v;
    }

    // Where the subtree is now: at the line it was, or wherever its heading went.
    private locate(v: Narrowed, doc: vscode.TextDocument): { start: number, end: number } {
        const lines = doc.getText().split(/\r?\n/);
        let start = v.line < lines.length && lines[v.line] === v.heading ? v.line : lines.indexOf(v.heading);
        if (start < 0) {
            throw vscode.FileSystemError.Unavailable(`The heading "${v.heading.trim()}" is no longer in ${path.basename(doc.fileName)}`);
        }
        start = headingAt(lines, start);
        return { start, end: subtreeEnd(lines, start) };
    }

    // The views of a document, told it changed, so they reload.
    touched(doc: vscode.TextDocument) {
        const events: vscode.FileChangeEvent[] = [];
        this.views.forEach(v => {
            if (v.source.toString() === doc.uri.toString()) {
                v.mtime = Date.now();
                events.push({ type: vscode.FileChangeType.Changed, uri: v.uri });
            }
        });
        if (events.length) {
            this.changed.fire(events);
        }
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const v = this.view(uri);
        const doc = await vscode.workspace.openTextDocument(v.source);
        const at = this.locate(v, doc);
        v.line = at.start;
        const text = doc.getText(new vscode.Range(at.start, 0, at.end, 0)).replace(/\r?\n$/, '');
        return Buffer.from(text, 'utf8');
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const v = this.view(uri);
        const doc = await vscode.workspace.openTextDocument(v.source);
        const at = this.locate(v, doc);
        const text = Buffer.from(content).toString('utf8').replace(/\r?\n$/, '');
        const first = text.split(/\r?\n/)[0];
        if (!isHeadingLine(first)) {
            throw vscode.FileSystemError.NoPermissions('A narrowed subtree has to start with its heading');
        }
        const range = at.end >= doc.lineCount
            ? new vscode.Range(at.start, 0, doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length)
            : new vscode.Range(at.start, 0, at.end, 0);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(v.source, range, at.end >= doc.lineCount ? text : text + '\n');
        await vscode.workspace.applyEdit(edit);
        v.heading = first;
        v.line = at.start;
        v.mtime = Date.now();
        await doc.save();
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const v = this.view(uri);
        return { type: vscode.FileType.File, ctime: 0, mtime: v.mtime, size: 0 };
    }

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => undefined);
    }
    readDirectory(): [string, vscode.FileType][] {
        return [];
    }
    createDirectory(): void {
        throw vscode.FileSystemError.NoPermissions();
    }
    delete(): void {
        throw vscode.FileSystemError.NoPermissions();
    }
    rename(): void {
        throw vscode.FileSystemError.NoPermissions();
    }
}

export function activateNarrow(ctx: vscode.ExtensionContext) {
    const fsp = new NarrowFs();
    let pending: NodeJS.Timeout | undefined;
    ctx.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('org-narrow', fsp, { isCaseSensitive: true }),
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.scheme === 'file' && e.document.languageId === 'org') {
                if (pending) {
                    clearTimeout(pending);
                }
                pending = setTimeout(() => fsp.touched(e.document), 300);
            }
        }),
        vscode.commands.registerCommand('org.narrowToSubtree', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'org') {
                return;
            }
            const lines = editor.document.getText().split(/\r?\n/);
            const line = headingAt(lines, editor.selection.active.line);
            if (line < 0) {
                vscode.window.setStatusBarMessage('Not under a heading', 2000);
                return;
            }
            const uri = fsp.add(editor.document, line);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.languages.setTextDocumentLanguage(doc, 'org');
            const offset = editor.selection.active.line - line;
            const shown = await vscode.window.showTextDocument(doc, { preview: false });
            const pos = new vscode.Position(Math.min(offset, doc.lineCount - 1), editor.selection.active.character);
            shown.selection = new vscode.Selection(pos, pos);
        }),
    );
}
