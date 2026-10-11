import * as vscode from 'vscode';
/* SDOC: Developers
* Logging in, or not
  =Auth= holds the token from a login and refreshes it before it runs out.
  =probe()= asks the server, with no token, whether it answers: =open= (a
  =noAuth: true= server - no login needed), =closed=, or =unreachable=.
  =isLoggedIn()= is true for a valid token or an open server, so everything
  that waits for a login works against a noAuth server; =onAccessChanged=
  tells the status bar (=connection.ts=).
EDOC */

import * as https from 'https';
import * as crypto from 'crypto';
import { Sets } from './sets';
import { URL } from 'url';
import {Request, RequestInfo, Headers} from 'node-fetch';

const fetchModule = import('node-fetch');
let callFetch = null;
async function fetch(url, ...args) {
    if (callFetch === null) {
        const temp = await fetchModule;
        callFetch = temp['default'];
    }
    return callFetch(url, ...args);
}

// The agent for a request to the orgs server: none over plain http, which an
// https agent refuses outright, and one that takes a self-signed certificate
// when the user has said to.
export function orgsAgent(): https.Agent | undefined {
    if (!Sets.orgsConnection.startsWith('https:')) {
        return undefined;
    }
    return Sets.allowSelfSigned ? new https.Agent({ rejectUnauthorized: false }) : https.globalAgent;
}

export interface AuthToken {
    token: string;
    expiresAt: number; // unix timestamp ms
}

export class Auth {
    private static instance: Auth;
    private context: vscode.ExtensionContext;
    private currentToken: AuthToken | null = null;
    private loginPanel: vscode.WebviewPanel | null = null;
    private loginPromiseResolve: ((value: boolean) => void) | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    // Told whenever the token changes - logged in, refreshed or logged out - so
    // anything holding a copy (the worg panels) can be handed the new one.
    private tokenChanged = new vscode.EventEmitter<AuthToken | null>();
    public readonly onTokenChanged = this.tokenChanged.event;
    // What the server at the configured address said when asked without a
    // token: 'open' (noAuth - no login wanted), 'closed' (log in), or
    // 'unreachable'. Undefined until asked.
    private access: { url: string, state: 'open' | 'closed' | 'unreachable' } | undefined;
    private accessChanged = new vscode.EventEmitter<'open' | 'closed' | 'unreachable'>();
    public readonly onAccessChanged = this.accessChanged.event;

    private constructor() {}

    public static get(): Auth {
        if (!Auth.instance) {
            Auth.instance = new Auth();
        }
        return Auth.instance;
    }

    public init(context: vscode.ExtensionContext) {
        this.context = context;
        const stored = context.globalState.get<AuthToken>('orgs.authToken');
        if (stored && stored.token && stored.expiresAt) {
            this.currentToken = stored;
            this.scheduleRefresh();
        }
        // A new address is a new server to ask.
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('org.orgsConnection')) {
                this.access = undefined;
                this.probe();
            }
        }));
        this.probe();
    }

    // Whether the plugin can talk to the server: a login that has not run out,
    // or a server that wants none.
    public isLoggedIn(): boolean {
        return (this.currentToken !== null && !this.isExpired()) || this.isOpen();
    }

    // A server started with noAuth: true answers everybody.
    public isOpen(): boolean {
        return !!this.access && this.access.url === Sets.orgsConnection && this.access.state === 'open';
    }

    public accessState(): 'open' | 'closed' | 'unreachable' | undefined {
        return this.access && this.access.url === Sets.orgsConnection ? this.access.state : undefined;
    }

    // Ask the server, without a token, whether it answers. Remembered per
    // address; whoever listens to onAccessChanged hears when it changes.
    public async probe(): Promise<'open' | 'closed' | 'unreachable'> {
        const url = Sets.orgsConnection;
        let state: 'open' | 'closed' | 'unreachable';
        try {
            const res = await fetch(new Request(new URL(url + '/status').toString(), {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                agent: orgsAgent(),
            }));
            state = res.status === 401 || res.status === 403 ? 'closed' : res.ok ? 'open' : 'unreachable';
        } catch (e) {
            state = 'unreachable';
        }
        const before = this.accessState();
        this.access = { url, state };
        if (state !== before) {
            this.accessChanged.fire(state);
            // Anything waiting for a login (the agenda, the clock) goes now.
            if (state === 'open') {
                this.tokenChanged.fire(this.currentToken);
            }
        }
        return state;
    }

    public isExpired(): boolean {
        if (!this.currentToken) {
            return true;
        }
        return Date.now() >= this.currentToken.expiresAt;
    }

    public getToken(): string | null {
        if (!this.currentToken || this.isExpired()) {
            return null;
        }
        return this.currentToken.token;
    }

    // The token with its expiry, for passing on to something that has to know
    // when it runs out.
    public getTokenInfo(): AuthToken | null {
        return this.currentToken !== null && !this.isExpired() ? this.currentToken : null;
    }

    public async ensureLoggedIn(): Promise<boolean> {
        if (this.isLoggedIn()) {
            return true;
        }
        // Not asked yet (or asked another address): a noAuth server needs no login page.
        if (this.accessState() === undefined && await this.probe() === 'open') {
            return true;
        }
        if (this.currentToken && this.isExpired()) {
            vscode.window.showWarningMessage('Orgs session expired. Please log in again.');
        }
        return await this.showLoginPage();
    }

    private async showLoginPage(): Promise<boolean> {
        if (this.loginPanel) {
            this.loginPanel.reveal();
            return new Promise<boolean>((resolve) => {
                this.loginPromiseResolve = resolve;
            });
        }

        this.loginPanel = vscode.window.createWebviewPanel(
            'orgsLogin',
            'Orgs Login',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        this.loginPanel.webview.html = this.getLoginHtml();

        const promise = new Promise<boolean>((resolve) => {
            this.loginPromiseResolve = resolve;
        });

        this.loginPanel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'login') {
                const success = await this.doLogin(message.username, message.password);
                if (success) {
                    this.loginPanel?.webview.postMessage({ command: 'success' });
                    setTimeout(() => {
                        this.loginPanel?.dispose();
                    }, 500);
                    this.loginPromiseResolve?.(true);
                    this.loginPromiseResolve = null;
                } else {
                    this.loginPanel?.webview.postMessage({ command: 'error', text: 'Login failed. Check your credentials.' });
                }
            }
        }, undefined, this.context.subscriptions);

        this.loginPanel.onDidDispose(() => {
            this.loginPanel = null;
            if (this.loginPromiseResolve) {
                this.loginPromiseResolve(this.isLoggedIn());
                this.loginPromiseResolve = null;
            }
        }, null, this.context.subscriptions);

        return promise;
    }

    // What is sent in place of the password: a hash of it with this user's salt
    // from the server, so the password never leaves the machine. This is worg's
    // clienthash.ts and the server's keystore.go ClientHash again - the prefix,
    // separators and order must match both exactly.
    //
    // A server too old to answer GET /salt can only take the password itself.
    private async secretFor(username: string, password: string, agent: https.Agent | undefined): Promise<string> {
        let salt: string | null = null;
        try {
            const url = new URL(Sets.orgsConnection + '/salt');
            url.searchParams.set('user', username);
            const res = await fetch(new Request(url.toString(), {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                agent: agent,
            }));
            if (res.ok) {
                const data = await res.json();
                salt = data.salt || null;
            }
        } catch (e) {
            salt = null;
        }
        if (!salt) {
            console.warn('orgs: the server did not answer GET /salt, so the password is sent as cleartext. It is probably older than this plugin.');
            return password;
        }
        return 'sha256c:' + crypto.createHash('sha256')
            .update('orgs-client-v1:' + username + ':' + salt + ':' + password, 'utf8')
            .digest('hex');
    }

    private async doLogin(username: string, password: string): Promise<boolean> {
        try {
            const url = new URL(Sets.orgsConnection + '/login');
            const headers: Headers = new Headers();
            headers.set('Content-Type', 'application/json');
            headers.set('Accept', 'application/json');

            const httpsAgent = orgsAgent();

            const request: RequestInfo = new Request(url.toString(), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ username: username, password: await this.secretFor(username, password, httpsAgent) }),
                agent: httpsAgent,
            });

            const res = await fetch(request);
            if (!res.ok) {
                return false;
            }
            const data = await res.json();
            if (data.token && data.ExpiresAt) {
                const expiresAt = new Date(data.ExpiresAt).getTime();
                this.currentToken = { token: data.token, expiresAt };
                await this.context.globalState.update('orgs.authToken', this.currentToken);
                this.scheduleRefresh();
                this.tokenChanged.fire(this.currentToken);
                return true;
            }
            return false;
        } catch (e) {
            vscode.window.showErrorMessage('Login request failed: ' + e.message);
            return false;
        }
    }

    // A token from a login made somewhere else - worg's own form, inside a
    // worg panel - kept exactly as one of ours would be: saved, so it outlives
    // the panel and VS Code, and refreshed from here on. Null is a logout.
    public async adopt(token: string | null, expiresAt?: number) {
        if (!token) {
            if (this.currentToken) {
                await this.logout();
            }
            return;
        }
        if (this.currentToken && this.currentToken.token === token) {
            return;
        }
        this.currentToken = { token, expiresAt: expiresAt || Date.now() + 60 * 60 * 1000 };
        await this.context.globalState.update('orgs.authToken', this.currentToken);
        this.scheduleRefresh();
        this.tokenChanged.fire(this.currentToken);
    }

    public async logout() {
        this.cancelRefresh();
        this.currentToken = null;
        await this.context.globalState.update('orgs.authToken', undefined);
        this.tokenChanged.fire(null);
    }

    private cancelRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    private scheduleRefresh() {
        this.cancelRefresh();
        if (!this.currentToken) {
            return;
        }
        const remaining = this.currentToken.expiresAt - Date.now();
        // Refresh at 75% of the token's remaining lifetime, minimum 10s
        const delay = Math.max(remaining * 0.75, 10_000);
        this.refreshTimer = setTimeout(() => this.refreshToken(), delay);
    }

    private async refreshToken() {
        this.refreshTimer = null;
        if (!this.currentToken || this.isExpired()) {
            return;
        }
        try {
            const url = new URL(Sets.orgsConnection + '/refresh');
            const headers: Headers = new Headers();
            headers.set('Content-Type', 'application/json');
            headers.set('Accept', 'application/json');
            headers.set('Authorization', 'Bearer ' + this.currentToken.token);

            const httpsAgent = orgsAgent();

            const request: RequestInfo = new Request(url.toString(), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({}),
                agent: httpsAgent,
            });

            const res = await fetch(request);
            if (!res.ok) {
                console.log('Token refresh failed with status ' + res.status);
                return;
            }
            const data = await res.json();
            if (data.token && data.ExpiresAt) {
                const expiresAt = new Date(data.ExpiresAt).getTime();
                this.currentToken = { token: data.token, expiresAt };
                await this.context.globalState.update('orgs.authToken', this.currentToken);
                this.scheduleRefresh();
                this.tokenChanged.fire(this.currentToken);
            }
        } catch (e) {
            console.log('Token refresh error: ' + e.message);
        }
    }

    private getLoginHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 80vh;
        }
        .login-container {
            width: 300px;
            padding: 30px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            background: var(--vscode-editor-background);
        }
        h2 {
            color: var(--vscode-foreground);
            margin-top: 0;
            text-align: center;
        }
        .field {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: var(--vscode-foreground);
        }
        input {
            width: 100%;
            padding: 6px 8px;
            box-sizing: border-box;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        button {
            width: 100%;
            padding: 8px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .error {
            color: var(--vscode-errorForeground);
            margin-top: 10px;
            text-align: center;
            display: none;
        }
        .success {
            color: var(--vscode-testing-iconPassed);
            margin-top: 10px;
            text-align: center;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h2>Orgs Server Login</h2>
        <div class="field">
            <label for="username">Username</label>
            <input type="text" id="username" autofocus />
        </div>
        <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" />
        </div>
        <button id="loginBtn" onclick="doLogin()">Log In</button>
        <div class="error" id="error"></div>
        <div class="success" id="success">Logged in successfully!</div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function doLogin() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            if (!username || !password) return;
            document.getElementById('loginBtn').disabled = true;
            document.getElementById('error').style.display = 'none';
            vscode.postMessage({ command: 'login', username, password });
        }
        document.getElementById('password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doLogin();
        });
        document.getElementById('username').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('password').focus();
        });
        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.command === 'error') {
                document.getElementById('error').textContent = msg.text;
                document.getElementById('error').style.display = 'block';
                document.getElementById('loginBtn').disabled = false;
            } else if (msg.command === 'success') {
                document.getElementById('success').style.display = 'block';
                document.getElementById('loginBtn').disabled = true;
            }
        });
    </script>
</body>
</html>`;
    }
}
