// Worg - the orgs server's web frontend - in a VS Code panel.
//
// The panel is an iframe onto the server's own worg, opened with
// `?embed=vscode&app=<view>`, so every view worg has is here without being
// written twice. The webview script is only a relay; what goes over it:
//
//   worg -> plugin   worg:ready   send me the token
//                    worg:login   logged in (or out) in worg's own form: keep it
//                    worg:app     this view is showing (the tab is titled from it)
//                    worg:open    open this heading in the editor
//   plugin -> worg   worg:token   the token, again every time Auth changes it
//                    worg:theme   light or dark, following the VS Code theme
//                    worg:app     switch to this view
//
// The token is posted to the frame at worg's origin only, never put on the url.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { Auth } from './auth';
import { Sets } from './sets';
import { proxyFor, stopProxy } from './worg-proxy';

// The views worg has, by the name it switches on, and what each is called.
export const WORG_VIEWS: { app: string, label: string }[] = [
    { app: 'Agenda',        label: 'Agenda' },
    { app: 'Search',        label: 'Search' },
    { app: 'StoredQueries', label: 'Saved Queries' },
    { app: 'Kanban',        label: 'Kanban' },
    { app: 'GanttChart',    label: 'Gantt Chart' },
    { app: 'Columns',       label: 'Column View' },
    { app: 'ClockReport',   label: 'Clock Report' },
    { app: 'Tables',        label: 'Tables' },
    { app: 'Files',         label: 'Files' },
    { app: 'Links',         label: 'Links' },
    { app: 'MindMap',       label: 'Mind Map' },
    { app: 'Collections',   label: 'Collections' },
    { app: 'Contacts',      label: 'Contacts' },
    { app: 'Code',          label: 'Code' },
    { app: 'Drill',         label: 'Flashcards' },
    { app: 'Diff',          label: 'Diff & History' },
    { app: 'Presentation',  label: 'Presentation' },
    { app: 'VoiceNotes',    label: 'Voice Notes' },
    { app: 'Starmap',       label: 'Starmap' },
];

// The command that opens a view straight from the palette. The agenda's is the
// older org.showAgenda, which opens worg's unless the classic one is asked for.
export function worgCommand(app: string): string {
    return app === 'Agenda' ? 'org.showAgenda' : 'org.showWorg' + app;
}

function viewLabel(app: string): string {
    const v = WORG_VIEWS.find(v => v.app === app);
    return v ? v.label : app;
}

function themeMode(): 'light' | 'dark' {
    const kind = vscode.window.activeColorTheme.kind;
    // 4 is HighContrastLight, which the typings this builds against predate.
    return kind === vscode.ColorThemeKind.Light || (kind as number) === 4 ? 'light' : 'dark';
}

function worgBase(): string {
    return Sets.worgUrl.replace(/\/+$/, '');
}

// Where the panel's iframe loads worg from: the server itself, or - for an
// https server whose self-signed certificate the user has said to trust - the
// loopback proxy in front of it (see worg-proxy.ts).
async function frameBase(): Promise<string> {
    const base = worgBase();
    if (Sets.allowSelfSigned && base.startsWith('https:')) {
        try {
            return await proxyFor(base);
        } catch (e) {
            vscode.window.showWarningMessage(`Could not start the local proxy for worg (${e.message}); loading ${base} directly.`);
        }
    }
    return base;
}

function nonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 32; i++) {
        s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
}

export class WorgPanel {
    // One panel per view it was opened for, so "Agenda" brings back the agenda
    // panel rather than opening a second one.
    private static panels = new Map<string, WorgPanel>();

    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    public static async show(app: string) {
        const open = WorgPanel.panels.get(app);
        if (open) {
            open.panel.reveal();
            // It may have been walked to another view since; take it back.
            open.post({ type: 'worg:app', app });
            return;
        }
        // No login here: with no token to hand over worg shows its own form,
        // and a login made there comes back as `worg:login` and is kept.
        WorgPanel.panels.set(app, new WorgPanel(app));
    }

    private constructor(private readonly app: string) {
        this.panel = vscode.window.createWebviewPanel(
            'worg',
            viewLabel(app),
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true });
        this.panel.webview.html = '<!DOCTYPE html><html><body></body></html>';
        frameBase().then(b => {
            // Closed while the proxy was starting.
            if (WorgPanel.panels.get(this.app) === this) {
                this.panel.webview.html = this.html(b);
            }
        });

        this.panel.webview.onDidReceiveMessage(m => this.receive(m), null, this.disposables);
        Auth.get().onTokenChanged(() => this.sendToken(), null, this.disposables);
        vscode.window.onDidChangeActiveColorTheme(
            () => this.post({ type: 'worg:theme', mode: themeMode() }), null, this.disposables);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    private dispose() {
        WorgPanel.panels.delete(this.app);
        if (WorgPanel.panels.size === 0) {
            stopProxy();
        }
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    private post(msg: any) {
        this.panel.webview.postMessage({ toWorg: msg });
    }

    private sendToken() {
        const t = Auth.get().getTokenInfo();
        this.post({ type: 'worg:token', token: t ? t.token : null, expiresAt: t ? t.expiresAt : undefined });
    }

    private async receive(m: any) {
        if (!m || typeof m.type !== 'string') {
            return;
        }
        switch (m.type) {
            case 'worg:ready':
                this.sendToken();
                this.post({ type: 'worg:theme', mode: themeMode() });
                break;
            case 'worg:app':
                this.panel.title = m.title || viewLabel(m.app);
                break;
            case 'worg:login':
                // Kept by Auth, which hands it to every open panel in turn.
                await Auth.get().adopt(m.token, m.expiresAt);
                break;
            case 'worg:open':
                await openHeading(m.filename, m.line, m.heading, this.panel.viewColumn);
                break;
            case 'silent':
                // worg loaded nothing it would talk to us with: say why.
                this.post({ type: 'diagnosis', ...(await diagnose(worgBase())) });
                break;
            case 'external':
                vscode.env.openExternal(vscode.Uri.parse(worgBase() + '/'));
                break;
        }
    }

    private html(base: string): string {
        let origin: string;
        try {
            origin = new URL(base).origin;
        } catch {
            return `<!DOCTYPE html><html><body><p>org.worgUrl / org.orgsConnection is not a url: ${escapeHtml(base)}</p></body></html>`;
        }
        const src = `${base}/?embed=vscode&app=${encodeURIComponent(this.app)}&theme=${themeMode()}`;
        const n = nonce();
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background); }
  iframe { border: 0; width: 100%; height: 100vh; display: block; }
  #stuck { display: none; position: absolute; inset: 0; padding: 24px; box-sizing: border-box;
           font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  #old { display: none; position: absolute; top: 0; left: 0; right: 0; padding: 8px 12px; font-family: var(--vscode-font-family);
         color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); background: var(--vscode-editorWidget-background);
         border-bottom: 1px solid var(--vscode-editorWarning-foreground, #c90); }
  #old button { margin-left: 8px; }
  #stuck code { font-family: var(--vscode-editor-font-family); }
  #stuck button { margin-top: 12px; margin-right: 8px; color: var(--vscode-button-foreground); background: var(--vscode-button-background);
                  border: 0; padding: 6px 12px; cursor: pointer; }
</style>
</head>
<body>
<iframe id="worg" src="${escapeHtml(src)}" allow="clipboard-read; clipboard-write; microphone"></iframe>
<div id="old">
  The orgs server at <code>${escapeHtml(worgBase())}</code> is serving a worg built before VS Code support,
  so this panel cannot pick the view, log it in, or open headings in the editor.
  Rebuild it with <code>tools/buildworg.sh</code> and <code>go build</code> in orgs, then restart the server.
  <button id="oldclose">Dismiss</button>
</div>
<div id="stuck">
  <h3>Could not reach worg</h3>
  <p>Nothing usable came back from <code>${escapeHtml(worgBase())}</code>${base !== worgBase() ? ` (through the local proxy at <code>${escapeHtml(base)}</code>)` : ''}.</p>
  <p><code id="why"></code></p>
  <ul>
    <li>Is the orgs server running at that address? The address is <code>org.worgUrl</code>, or <code>org.orgsConnection</code> when that is empty.</li>
    <li>A server on https with a self-signed certificate only loads in a panel with
        <code>org.allowSelfSigned</code> on, or with <code>org.worgUrl</code> pointed at the server's http address.</li>
  </ul>
  <button id="retry">Retry</button><button id="external">Open in browser</button>
</div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const frame = document.getElementById('worg');
  const stuck = document.getElementById('stuck');
  const old = document.getElementById('old');
  const why = document.getElementById('why');
  document.getElementById('oldclose').addEventListener('click', () => { old.style.display = 'none'; });
  const origin = ${JSON.stringify(origin)};
  let answered = false;
  // Out to worg, and only to worg's origin: the token goes this way.
  window.addEventListener('message', e => {
    if (e.data && e.data.toWorg) {
      if (e.data.toWorg.type === 'diagnosis') { show(e.data.toWorg); return; }
      if (frame.contentWindow) frame.contentWindow.postMessage(e.data.toWorg, origin);
      return;
    }
    // In from worg, and only from the frame - anything else is dropped.
    if (e.source === frame.contentWindow && e.origin === origin && e.data && typeof e.data.type === 'string') {
      if (e.data.type === 'worg:ready') { answered = true; stuck.style.display = 'none'; old.style.display = 'none'; }
      vscode.postMessage(e.data);
    }
  });
  // An old worg is still worg - usable, it just cannot be steered - so it
  // gets a bar over the top rather than a cover over all of it.
  function show(d) {
    if (answered) return;
    if (d.kind === 'old') {
      old.style.display = 'block';
    } else {
      why.textContent = d.detail || '';
      stuck.style.display = 'block';
    }
  }
  function watch() {
    answered = false;
    setTimeout(() => { if (!answered) vscode.postMessage({ type: 'silent' }); }, 8000);
  }
  document.getElementById('retry').addEventListener('click', () => {
    stuck.style.display = 'none';
    frame.src = frame.src;
    watch();
  });
  document.getElementById('external').addEventListener('click', () => vscode.postMessage({ type: 'external' }));
  watch();
</script>
</body>
</html>`;
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Where a file the server named is on this machine. The same path when the
// server is local; otherwise through `org.serverPathMap` (server prefix ->
// local prefix), and failing that whatever in the workspace has its name.
async function localPath(filename: string): Promise<string | null> {
    const name = filename.replace(/\\/g, '/');
    if (fs.existsSync(name)) {
        return name;
    }
    const map = Sets.serverPathMap || {};
    for (const from of Object.keys(map)) {
        const f = from.replace(/\\/g, '/');
        if (name.startsWith(f)) {
            const mapped = path.join(map[from], name.substring(f.length));
            if (fs.existsSync(mapped)) {
                return mapped;
            }
        }
    }
    const found = await vscode.workspace.findFiles('**/' + path.posix.basename(name), '**/node_modules/**', 10);
    if (found.length === 1) {
        return found[0].fsPath;
    }
    if (found.length > 1) {
        const pick = await vscode.window.showQuickPick(found.map(u => u.fsPath),
            { placeHolder: `${name} is not on this machine - which one is it?` });
        return pick || null;
    }
    return null;
}

// The line the heading is on now. The server's line can be stale against an
// editor with unsaved changes, so when the line it gave is not the heading the
// nearest line that is wins.
function headingLine(doc: vscode.TextDocument, line: number, heading?: string): number {
    const at = Math.max(0, Math.min(line || 0, doc.lineCount - 1));
    if (!heading) {
        return at;
    }
    const isIt = (i: number) => {
        const t = doc.lineAt(i).text;
        return /^\*+\s/.test(t) && t.indexOf(heading) >= 0;
    };
    if (isIt(at)) {
        return at;
    }
    for (let d = 1; d < doc.lineCount; d++) {
        if (at - d >= 0 && isIt(at - d)) { return at - d; }
        if (at + d < doc.lineCount && isIt(at + d)) { return at + d; }
        if (at - d < 0 && at + d >= doc.lineCount) { break; }
    }
    return at;
}

async function openHeading(filename: string, line: number | undefined, heading: string | undefined, panelColumn: vscode.ViewColumn | undefined) {
    if (!filename) {
        return;
    }
    const file = await localPath(filename);
    if (!file) {
        vscode.window.showWarningMessage(`Could not find ${filename} on this machine. Set org.serverPathMap if the server keeps its files elsewhere.`);
        return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    // Beside the panel rather than over it: an editor already showing in
    // another column is reused, else a new one opens next to the panel.
    const other = vscode.window.visibleTextEditors.find(e => e.viewColumn !== undefined && e.viewColumn !== panelColumn);
    const column = other ? other.viewColumn : vscode.ViewColumn.Beside;
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: column });
    const pos = new vscode.Position(headingLine(doc, line === undefined ? 0 : line, heading), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

// Why worg has not said it is ready: a server that is not there, or one whose
// embedded worg is too old to know about being in a panel. Asked of the server
// directly, from node, where the certificate can be trusted as the user said.
export async function diagnose(base: string): Promise<{ kind: 'old' | 'unreachable', detail?: string }> {
    const get = (url: string) => new Promise<string>((resolve, reject) => {
        const lib = url.startsWith('https:') ? https : http;
        const u = new URL(url);
        const opts: https.RequestOptions = {
            protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
            rejectUnauthorized: !Sets.allowSelfSigned,
        };
        const req = (lib as typeof https).get(opts, res => {
            if ((res.statusCode || 500) >= 400) {
                res.resume();
                reject(new Error(`${url} answered ${res.statusCode}`));
                return;
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', d => body += d);
            res.on('end', () => resolve(body));
        });
        req.setTimeout(5000, () => { req.abort(); reject(new Error(`${url} did not answer in 5s`)); });
        req.on('error', reject);
    });
    try {
        const index = await get(base + '/');
        const main = /src="\/?(static\/js\/main\.[0-9a-f]+\.js)"/.exec(index);
        if (!main) {
            return { kind: 'unreachable', detail: `${base}/ is not a worg page` };
        }
        const js = await get(base + '/' + main[1]);
        return js.indexOf('worg:ready') >= 0
            ? { kind: 'unreachable', detail: 'worg loaded on the server but not in the panel' }
            : { kind: 'old' };
    } catch (e) {
        // A refused connection to localhost comes back as an AggregateError
        // with no message of its own; the code is the useful part.
        return { kind: 'unreachable', detail: e.message || e.code || String(e) };
    }
}
