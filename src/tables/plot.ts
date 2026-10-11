// A chart of the table under the cursor, beside it, that keeps up as the table
// is edited. org-plot's #+PLOT: line above the table says how; without one the
// first column of words is the x axis and the columns of numbers are plotted.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TableAt, tableAt, tablesIn, place } from './editor';
import { parsePlotLine, plotData } from './plotdata';

let panel: vscode.WebviewPanel | undefined;
// Which table the panel shows: by name when it has one, else where it was.
let source: { uri: vscode.Uri, name?: string, line: number } | undefined;

function find(doc: vscode.TextDocument): TableAt | undefined {
    if (!source) {
        return undefined;
    }
    const tables = tablesIn(doc);
    if (source.name) {
        const named = tables.find(t => t.name === source.name);
        if (named) {
            return named;
        }
    }
    // The table nearest where it last was: lines added above move it.
    let best: TableAt | undefined;
    for (const t of tables) {
        if (!best || Math.abs(t.first - source.line) < Math.abs(best.first - source.line)) {
            best = t;
        }
    }
    return best;
}

function post(doc: vscode.TextDocument) {
    if (!panel) {
        return;
    }
    const at = find(doc);
    if (!at) {
        panel.webview.postMessage({ command: 'error', message: 'The table is gone.' });
        return;
    }
    source.line = at.first;
    const title = at.name || `Table at line ${at.first + 1}`;
    const data = plotData(at.table, at.plot ? parsePlotLine(at.plot) : {}, title);
    if (typeof data === 'string') {
        panel.webview.postMessage({ command: 'error', message: data });
        return;
    }
    panel.title = 'Plot: ' + data.title;
    panel.webview.postMessage({ command: 'data', data });
}

function html(webview: vscode.Webview, root: vscode.Uri): string {
    const asset = (f: string) => webview.asWebviewUri(vscode.Uri.file(path.join(root.fsPath, 'media', f)));
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${asset('table-plot.css')}">
<title>Plot</title>
</head>
<body>
<header>
  <h1 id="title"></h1>
  <button id="toggle" title="Show the numbers as a table">Table</button>
  <button id="save" title="Save the chart as an svg file">Save SVG</button>
  <button id="goto" title="Go to the table">Table in file</button>
</header>
<div id="legend"></div>
<div id="chart"></div>
<div id="table" style="display:none"></div>
<div id="note"></div>
<div id="error"></div>
<div id="tip"></div>
<script nonce="${nonce}" src="${asset('table-plot.js')}"></script>
</body>
</html>`;
}

export async function plotTable(ctx: vscode.ExtensionContext): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const at = editor && tableAt(editor.document, editor.selection.active);
    if (!at) {
        vscode.window.setStatusBarMessage('Not in a table', 2000);
        return;
    }
    source = { uri: editor.document.uri, name: at.name, line: at.first };
    if (panel) {
        panel.reveal(vscode.ViewColumn.Beside, true);
        post(editor.document);
        return;
    }
    panel = vscode.window.createWebviewPanel('orgTablePlot', 'Plot', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(ctx.extensionPath, 'media'))],
    });
    panel.webview.html = html(panel.webview, vscode.Uri.file(ctx.extensionPath));
    const subs: vscode.Disposable[] = [];
    let pending: NodeJS.Timeout | undefined;
    subs.push(vscode.workspace.onDidChangeTextDocument(e => {
        if (source && e.document.uri.toString() === source.uri.toString()) {
            if (pending) {
                clearTimeout(pending);
            }
            pending = setTimeout(() => post(e.document), 250);
        }
    }));
    panel.webview.onDidReceiveMessage(async msg => {
        const doc = source && vscode.workspace.textDocuments.find(d => d.uri.toString() === source.uri.toString());
        if (msg.command === 'ready' && doc) {
            post(doc);
        } else if (msg.command === 'save') {
            const where = await vscode.window.showSaveDialog({
                defaultUri: source ? vscode.Uri.file(path.join(path.dirname(source.uri.fsPath), (source.name || 'table') + '.svg')) : undefined,
                filters: { 'SVG image': ['svg'] },
            });
            if (where) {
                fs.writeFileSync(where.fsPath, msg.svg, 'utf8');
            }
        } else if (msg.command === 'goto' && doc) {
            const ed = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            const t = find(doc);
            if (t) {
                place(ed, t.first, 0, 0);
            }
        }
    }, undefined, subs);
    panel.onDidDispose(() => {
        subs.forEach(s => s.dispose());
        panel = undefined;
        source = undefined;
    });
}
