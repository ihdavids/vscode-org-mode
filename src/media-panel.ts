// Pictures and maths beside the text: the images linked and the LaTeX written
// in the subtree the cursor is in, drawn (KaTeX for the maths) in a panel that
// follows you about the file. Click one to go to it. VS Code cannot draw
// images inside the text itself; this is the next best thing.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { headingAt, subtreeEnd } from './outline/model';
import { findMedia } from './media-model';
import { resolvePath } from './org-files';

class MediaPanel {
    static current: MediaPanel | undefined;
    private panel: vscode.WebviewPanel;
    private subs: vscode.Disposable[] = [];
    private doc: vscode.TextDocument | undefined;
    private key = '';

    static show(ctx: vscode.ExtensionContext) {
        if (MediaPanel.current) {
            MediaPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
            MediaPanel.current.update(true);
            return;
        }
        MediaPanel.current = new MediaPanel(ctx);
    }

    private constructor(ctx: vscode.ExtensionContext) {
        const media = vscode.Uri.file(path.join(ctx.extensionPath, 'media'));
        // Images can be anywhere a link points.
        this.panel = vscode.window.createWebviewPanel('orgMedia', 'Pictures & Maths', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file('/')] });
        const asset = (f: string) => this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(media.fsPath, f)));
        const nonce = Math.random().toString(36).slice(2);
        const cdn = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
        this.panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} data:; font-src https://cdn.jsdelivr.net; style-src ${this.panel.webview.cspSource} https://cdn.jsdelivr.net 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
<link rel="stylesheet" href="${cdn}katex.min.css"><link rel="stylesheet" href="${asset('media-panel.css')}"></head>
<body><header id="where"></header><main id="items"></main>
<script nonce="${nonce}" src="${cdn}katex.min.js"></script>
<script nonce="${nonce}" src="${asset('media-panel.js')}"></script></body></html>`;
        let pending: NodeJS.Timeout | undefined;
        const soon = () => {
            if (pending) {
                clearTimeout(pending);
            }
            pending = setTimeout(() => this.update(false), 150);
        };
        this.subs.push(
            vscode.window.onDidChangeTextEditorSelection(soon),
            vscode.window.onDidChangeActiveTextEditor(soon),
            vscode.workspace.onDidChangeTextDocument(e => e.document === this.doc && (this.key = '', soon())),
            this.panel.webview.onDidReceiveMessage(async m => {
                if (m.command === 'ready') {
                    this.update(true);
                } else if (m.command === 'goto' && this.doc) {
                    const editor = await vscode.window.showTextDocument(this.doc, { viewColumn: vscode.ViewColumn.One });
                    const pos = new vscode.Position(m.line, 0);
                    editor.selection = new vscode.Selection(pos, pos);
                    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                }
            }),
        );
        this.panel.onDidDispose(() => {
            this.subs.forEach(s => s.dispose());
            MediaPanel.current = undefined;
        });
    }

    // What the subtree around the cursor holds; the whole file above the first heading.
    update(force: boolean) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'org') {
            return;
        }
        const doc = editor.document;
        const lines = doc.getText().split(/\r?\n/);
        const h = headingAt(lines, editor.selection.active.line);
        const from = h < 0 ? 0 : h;
        const to = h < 0 ? lines.length : subtreeEnd(lines, h);
        const key = `${doc.uri.toString()}:${doc.version}:${from}:${to}`;
        if (!force && key === this.key) {
            return;
        }
        this.key = key;
        this.doc = doc;
        const items = findMedia(lines, from, to).map(m => {
            if (m.kind !== 'image') {
                return m;
            }
            const file = resolvePath(doc.fileName, m.text);
            return Object.assign({}, m, {
                src: fs.existsSync(file) ? this.panel.webview.asWebviewUri(vscode.Uri.file(file)).toString() : '',
                name: path.basename(file),
            });
        });
        this.panel.webview.postMessage({
            command: 'show',
            where: h < 0 ? path.basename(doc.fileName) : lines[h].replace(/^\*+\s*/, ''),
            items,
        });
    }
}

export function activateMediaPanel(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand('org.showMediaPanel', () => MediaPanel.show(ctx)));
}
