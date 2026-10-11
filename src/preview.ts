// Previews made by the orgs server's exporters: the active file as a web page
// or as slides, and a query's headings as a Gantt chart or a mind map. Shown
// beside the editor; redrawn when an org file is saved, keeping the scroll
// position; a file preview follows the org file you are in, as Markdown's
// does. A click on a heading in the page goes to it in the editor.

/* SDOC: Developers
* Previews
  One panel per kind (web, reveal, impress, gantt, mind map), filled from
  the server's exporters (=ODb.exportText=). The page gets a small script
  first (=SHIM=): =acquireVsCodeApi= once (pages from the server may ask for
  it again), the scroll position kept in the webview state across redraws,
  and =s= to save. Redrawn on save, not on a timer.
EDOC */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ODb } from './db';
import { Sets } from './sets';
import { openAt } from './org-files';

type Kind = 'web' | 'reveal' | 'impress' | 'gantt' | 'mindmap';

const KINDS: { [k in Kind]: { title: string, exporter: string, ofQuery: boolean } } = {
    web: { title: 'Web', exporter: 'html', ofQuery: false },
    reveal: { title: 'Reveal', exporter: 'revealjs', ofQuery: false },
    impress: { title: 'Impress', exporter: 'impressjs', ofQuery: false },
    gantt: { title: 'Gantt', exporter: 'mermaid', ofQuery: true },
    mindmap: { title: 'Mind Map', exporter: 'mindmap', ofQuery: true },
};

// Put at the top of every page: the vscode api once (a page that asks for it
// again gets the same one, rather than an error), the scroll position kept
// across redraws, and S to save the page.
const SHIM = `<script>
(function () {
    var api = acquireVsCodeApi();
    window.acquireVsCodeApi = function () { return api; };
    window.addEventListener('load', function () {
        var s = api.getState();
        if (s && s.y) { window.scrollTo(s.x || 0, s.y); }
    });
    var timer;
    window.addEventListener('scroll', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { api.setState({ x: window.scrollX, y: window.scrollY }); }, 100);
    });
    window.addEventListener('keydown', function (e) {
        if (e.key === 's' && !e.ctrlKey && !e.metaKey && !(e.target && /input|textarea/i.test(e.target.tagName))) {
            api.postMessage({ command: 'save' });
            e.preventDefault();
        }
    });
})();
</script>`;

function page(html: string): string {
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + SHIM) : SHIM + html;
}

function message(text: string): string {
    return `<!DOCTYPE html><html><body style="font-family: var(--vscode-font-family); color: var(--vscode-descriptionForeground); padding: 2em">${text}</body></html>`;
}

class Preview {
    private static open = new Map<Kind, Preview>();
    private panel: vscode.WebviewPanel;
    private source: string;     // the file previewed, or the query
    private subs: vscode.Disposable[] = [];
    private html = '';

    static async show(kind: Kind, source: string) {
        const existing = Preview.open.get(kind);
        if (existing) {
            existing.source = source;
            existing.panel.reveal(vscode.ViewColumn.Beside, true);
            await existing.render();
            return;
        }
        const p = new Preview(kind, source);
        Preview.open.set(kind, p);
        await p.render();
    }

    private constructor(private kind: Kind, source: string) {
        this.source = source;
        this.panel = vscode.window.createWebviewPanel('orgPreview.' + kind, KINDS[kind].title,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
        this.subs.push(
            vscode.workspace.onDidSaveTextDocument(d => {
                if (d.languageId === 'org' && (KINDS[this.kind].ofQuery || d.fileName === this.source)) {
                    this.render();
                }
            }),
            // A file preview follows the org file you are in.
            vscode.window.onDidChangeActiveTextEditor(e => {
                if (!KINDS[this.kind].ofQuery && e && e.document.languageId === 'org' && !e.document.isUntitled && e.document.fileName !== this.source) {
                    this.source = e.document.fileName;
                    this.render();
                }
            }),
            this.panel.webview.onDidReceiveMessage(m => this.received(m)),
        );
        this.panel.onDidDispose(() => {
            this.subs.forEach(s => s.dispose());
            Preview.open.delete(this.kind);
        });
    }

    private async render() {
        const k = KINDS[this.kind];
        this.panel.title = `${k.title}: ${k.ofQuery ? this.source : path.basename(this.source)}`;
        const res: any = await ODb.exportText(k.exporter, this.source);
        if (!res) {
            this.panel.webview.html = message('The orgs server did not answer.');
            return;
        }
        if (!res.Ok) {
            this.panel.webview.html = message(`Could not make the ${k.title.toLowerCase()} view: ${String(res.Msg).replace(/</g, '&lt;')}`);
            return;
        }
        this.html = res.Msg;
        this.panel.webview.html = page(res.Msg);
    }

    private async received(m: any) {
        if (m.command === 'open' && m.text) {
            await openAt(m.text, Number(m.line) || 0);
        } else if (m.command === 'save') {
            const where = await vscode.window.showSaveDialog({ filters: { 'Web page': ['html'] } });
            if (where) {
                fs.writeFileSync(where.fsPath, this.html, 'utf8');
            }
        }
    }
}

async function showFile(kind: Kind) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'org' || editor.document.isUntitled) {
        vscode.window.showInformationMessage('Open a saved org file to preview it.');
        return;
    }
    if (editor.document.isDirty) {
        await editor.document.save();
    }
    await Preview.show(kind, editor.document.fileName);
}

// Gantt and mind map draw the headings a query finds: one of the named
// queries in org.gantts, or one typed in.
async function showQuery(kind: Kind) {
    const named = Sets.gantts;
    const items = Object.keys(named).map(k => ({ label: k, description: named[k], query: named[k] }))
        .concat([{ label: '$(edit) A query of my own…', description: '', query: '' }]);
    const pick = items.length > 1 ? await vscode.window.showQuickPick(items, { placeHolder: 'Draw which headings?' }) : items[0];
    if (!pick) {
        return;
    }
    let query = pick.query;
    if (!query) {
        query = await vscode.window.showInputBox({ prompt: 'A query', placeHolder: 'IsTodo() && HasProperty("EFFORT")' });
        if (!query) {
            return;
        }
    }
    await Preview.show(kind, query);
}

export function activatePreview(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
        vscode.commands.registerCommand('org.showWeb', () => showFile('web')),
        vscode.commands.registerCommand('org.showReveal', () => showFile('reveal')),
        vscode.commands.registerCommand('org.showImpress', () => showFile('impress')),
        vscode.commands.registerCommand('org.showGantt', () => showQuery('gantt')),
        vscode.commands.registerCommand('org.showMindMap', () => showQuery('mindmap')),
    );
}
