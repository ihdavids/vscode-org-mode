// The org files of the workspace and what is in them, for anything that looks
// across files: following an id: link, finding backlinks, offering headings to
// link to. An open document is read from the editor (unsaved changes and all),
// anything else from disk, cached until the file changes.

/* SDOC: Developers
* Waiting for the server's writes
  Many commands ask the orgs server to change a file (refile, archive,
  clock, run a block). VS Code notices the change on disk in its own time.
  =settled(files)= waits until every open, unmodified copy of those files
  reads as the disk does, so the next command - or keystroke - sees the new
  text. Commands that make the server write call it before they return.

  =readLines= reads a file for looking across files: the editor's copy if
  it is open (unsaved changes and all), the disk otherwise, cached on mtime.
EDOC */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { isHeadingLine, parseHeading, COMMON_KEYWORDS } from './outline/model';

const cache = new Map<string, { mtime: number, lines: string[] }>();

export async function orgFiles(): Promise<string[]> {
    const found = await vscode.workspace.findFiles('**/*.org', '{**/node_modules/**,**/.git/**}', 5000);
    const set = new Set(found.map(u => u.fsPath));
    // Open files outside the workspace count too.
    vscode.workspace.textDocuments.filter(d => d.languageId === 'org' && d.uri.scheme === 'file').forEach(d => set.add(d.uri.fsPath));
    return Array.from(set);
}

export function readLines(file: string): string[] {
    const open = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'file' && d.uri.fsPath === file);
    if (open) {
        return open.getText().split(/\r?\n/);
    }
    try {
        const mtime = fs.statSync(file).mtime.getTime();
        const hit = cache.get(file);
        if (hit && hit.mtime === mtime) {
            return hit.lines;
        }
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        cache.set(file, { mtime, lines });
        return lines;
    } catch (e) {
        return [];
    }
}

export interface HeadingRef {
    file: string;
    line: number;
    level: number;
    title: string;
    todo: string;
    tags: string[];
    olp: string[];      // the titles above it, outermost first
}

// Every heading in a file, with the path of titles over each.
export function headingsIn(file: string, keywords: string[] = COMMON_KEYWORDS): HeadingRef[] {
    const lines = readLines(file);
    const out: HeadingRef[] = [];
    const stack: { level: number, title: string }[] = [];
    lines.forEach((text, line) => {
        if (!isHeadingLine(text)) {
            return;
        }
        const h = parseHeading(text, line, keywords);
        while (stack.length && stack[stack.length - 1].level >= h.level) {
            stack.pop();
        }
        out.push({ file, line, level: h.level, title: h.title, todo: h.todo, tags: h.tags, olp: stack.map(s => s.title) });
        stack.push({ level: h.level, title: h.title });
    });
    return out;
}

// A path as a link from one file to another writes it: relative when that is
// shorter, as org writes them.
export function relativeLink(fromFile: string, toFile: string): string {
    const rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/');
    return rel.startsWith('.') ? rel : './' + rel;
}

// A file named by a link, from the file the link is in.
export function resolvePath(fromFile: string, p: string): string {
    if (p.startsWith('~/')) {
        return path.join(process.env.HOME || '', p.slice(2));
    }
    return path.isAbsolute(p) ? p : path.resolve(path.dirname(fromFile), p);
}

export async function openAt(file: string, line: number, ch: number = 0, preview = false): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc, { preview });
    const pos = new vscode.Position(Math.max(0, Math.min(line, doc.lineCount - 1)), ch);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    return editor;
}

// The orgs server writes files behind the editor's back; VS Code notices and
// reloads them in its own time. Wait (a few seconds at most) until every open,
// unmodified copy of these files reads as the disk does, so whatever runs next
// - the next command, the next keystroke - works on the new text.
export async function settled(files: string[]): Promise<void> {
    const norm = (s: string) => s.replace(/\r\n/g, '\n');
    const waiting = () => vscode.workspace.textDocuments.filter(d =>
        d.uri.scheme === 'file' && files.indexOf(d.uri.fsPath) >= 0 && !d.isDirty && fs.existsSync(d.uri.fsPath) &&
        norm(d.getText()) !== norm(fs.readFileSync(d.uri.fsPath, 'utf8')));
    for (let t = 0; t < 3000 && waiting().length; t += 50) {
        await new Promise(r => setTimeout(r, 50));
    }
}

// What a file holds on disk, ignoring any copy open in the editor.
export function diskLines(file: string): string[] {
    try {
        return fs.readFileSync(file, 'utf8').split(/\r?\n/);
    } catch (e) {
        return [];
    }
}
