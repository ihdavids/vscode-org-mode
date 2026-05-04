import * as vscode from 'vscode';
import * as https from 'https';
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

interface AuthToken {
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
    }

    public isLoggedIn(): boolean {
        return this.currentToken !== null && !this.isExpired();
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

    public async ensureLoggedIn(): Promise<boolean> {
        if (this.isLoggedIn()) {
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

    private async doLogin(username: string, password: string): Promise<boolean> {
        try {
            const url = new URL(Sets.orgsConnection + '/login');
            const headers: Headers = new Headers();
            headers.set('Content-Type', 'application/json');
            headers.set('Accept', 'application/json');

            var httpsAgent = https.globalAgent;
            if (Sets.allowSelfSigned) {
                httpsAgent = new https.Agent({ rejectUnauthorized: false });
            }

            const request: RequestInfo = new Request(url.toString(), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ username: username, password: password }),
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
                return true;
            }
            return false;
        } catch (e) {
            vscode.window.showErrorMessage('Login request failed: ' + e.message);
            return false;
        }
    }

    public async logout() {
        this.cancelRefresh();
        this.currentToken = null;
        await this.context.globalState.update('orgs.authToken', undefined);
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

            var httpsAgent = https.globalAgent;
            if (Sets.allowSelfSigned) {
                httpsAgent = new https.Agent({ rejectUnauthorized: false });
            }

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
