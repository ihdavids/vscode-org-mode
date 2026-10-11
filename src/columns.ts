// Column view (org's C-c C-x C-c): the headings of the file as rows, their
// keyword, priority, tags and properties as columns, edited in place. The
// columns are the file's #+COLUMNS: line's, or the ones it uses most. A
// column summed with {:} or {+} (effort, by default) shows each parent the
// total of what is under it. Edits go straight into the document: undoable,
// and no server needed.

import * as vscode from 'vscode';
import * as path from 'path';
import { linesOf, replaceLines } from './edit-lines';
import { setHeadingParts, setProperty, removeProperty, fileKeywords } from './outline/model';
import { BUILT_IN, columnsFor, rowsFor } from './columns-model';
import { Sets } from './sets';

function keywords(lines: string[]): { todo: string[], done: string[] } {
    return fileKeywords(lines) || {
        todo: (Sets.getProp<string[]>('todoKeywords', ['TODO']) || []).filter(k => k),
        done: (Sets.getProp<string[]>('doneKeywords', ['DONE']) || []).filter(k => k),
    };
}

class ColumnView {
    private static current: ColumnView | undefined;
    private panel: vscode.WebviewPanel;
    private doc: vscode.TextDocument;
    private subs: vscode.Disposable[] = [];

    static show(ctx: vscode.ExtensionContext, doc: vscode.TextDocument) {
        if (ColumnView.current) {
            ColumnView.current.doc = doc;
            ColumnView.current.panel.reveal(vscode.ViewColumn.Beside, true);
            ColumnView.current.post();
            return;
        }
        ColumnView.current = new ColumnView(ctx, doc);
    }

    private constructor(private ctx: vscode.ExtensionContext, doc: vscode.TextDocument) {
        this.doc = doc;
        const media = vscode.Uri.file(path.join(ctx.extensionPath, 'media'));
        this.panel = vscode.window.createWebviewPanel('orgColumns', 'Columns', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] });
        const asset = (f: string) => this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(media.fsPath, f)));
        const nonce = Math.random().toString(36).slice(2);
        this.panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${asset('columns.css')}"></head>
<body><header><h1 id="title"></h1><span id="hint">Tab moves between cells · Enter keeps the change · Esc puts it back</span></header>
<div id="grid"></div><script nonce="${nonce}" src="${asset('columns.js')}"></script></body></html>`;
        let pending: NodeJS.Timeout | undefined;
        this.subs.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document === this.doc) {
                    if (pending) {
                        clearTimeout(pending);
                    }
                    pending = setTimeout(() => this.post(), 200);
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(e => {
                if (e && e.document.languageId === 'org' && e.document !== this.doc) {
                    this.doc = e.document;
                    this.post();
                }
            }),
            this.panel.webview.onDidReceiveMessage(m => this.received(m)),
        );
        this.panel.onDidDispose(() => {
            this.subs.forEach(s => s.dispose());
            ColumnView.current = undefined;
        });
    }

    private post() {
        const lines = linesOf(this.doc);
        const k = keywords(lines);
        const cols = columnsFor(lines);
        this.panel.title = 'Columns: ' + path.basename(this.doc.fileName);
        this.panel.webview.postMessage({
            command: 'data', title: path.basename(this.doc.fileName), columns: cols,
            rows: rowsFor(lines, cols, k.todo.concat(k.done)), todo: k.todo, done: k.done,
        });
    }

    private async received(m: any) {
        if (m.command === 'ready') {
            this.post();
            return;
        }
        const editor = await vscode.window.showTextDocument(this.doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: true });
        if (m.command === 'goto') {
            const pos = new vscode.Position(m.line, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            await vscode.window.showTextDocument(this.doc, { viewColumn: editor.viewColumn });
            return;
        }
        if (m.command !== 'edit') {
            return;
        }
        const lines = linesOf(this.doc);
        // The row it was made from has to still be there.
        if (lines[m.line] !== m.text) {
            this.post();
            return;
        }
        const k = keywords(lines);
        const kw = k.todo.concat(k.done);
        const value = String(m.value).trim();
        if (BUILT_IN.indexOf(m.key) >= 0) {
            const parts = m.key === 'ITEM' ? { title: value } : m.key === 'TODO' ? { todo: value } : m.key === 'PRIORITY' ? { priority: value.replace(/[^A-Z0-9]/gi, '').slice(0, 1).toUpperCase() }
                : { tags: value.split(/[:\s]+/).filter(t => t) };
            await replaceLines(editor, m.line, m.line + 1, [setHeadingParts(lines[m.line], parts, kw)]);
        } else if (value === '') {
            const r = removeProperty(lines, m.line, m.key);
            if (r) {
                await replaceLines(editor, r.start, r.end, r.lines);
            }
        } else {
            const r = setProperty(lines, m.line, m.key, value);
            await replaceLines(editor, r.start, r.end, r.lines);
        }
    }
}

export function activateColumns(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand('org.columnView', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'org') {
            vscode.window.showInformationMessage('Open an org file to see its column view.');
            return;
        }
        ColumnView.show(ctx, editor.document);
    }));
}
