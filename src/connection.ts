// The orgs server's state in the status bar, in an org file: connected (a
// quiet cloud), wanting a login, or out of reach (in the warning colour).
// Click it to log in or out, check again, open worg, or change the address.

import * as vscode from 'vscode';
import { Auth } from './auth';
import { Sets } from './sets';

let item: vscode.StatusBarItem;

function show() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'org') {
        item.hide();
        return;
    }
    const a = Auth.get();
    const state = a.accessState();
    const url = Sets.orgsConnection;
    item.backgroundColor = undefined;
    if (state === undefined) {
        item.text = '$(sync~spin) orgs';
        item.tooltip = `Looking for the orgs server at ${url}`;
    } else if (state === 'unreachable') {
        item.text = '$(warning) orgs';
        item.tooltip = `The orgs server at ${url} is not answering. The agenda, clock, refile and the rest need it. Click for options.`;
        item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (!a.isLoggedIn()) {
        item.text = '$(account) orgs: log in';
        item.tooltip = `Log in to the orgs server at ${url}`;
    } else {
        item.text = '$(cloud) orgs';
        item.tooltip = state === 'open' ? `Connected to ${url} - it needs no login` : `Logged in to ${url}`;
    }
    item.show();
}

async function menu() {
    const a = Auth.get();
    const items = [
        a.isLoggedIn() ? (a.isOpen() ? undefined : { label: '$(sign-out) Log out', id: 'logout' }) : { label: '$(sign-in) Log in', id: 'login' },
        { label: '$(refresh) Check again', id: 'probe' },
        { label: '$(globe) Open worg', id: 'worg' },
        { label: '$(gear) Change the server address…', id: 'settings', description: Sets.orgsConnection },
    ].filter(x => x);
    const pick = await vscode.window.showQuickPick(items, { placeHolder: `orgs server: ${Sets.orgsConnection}` });
    if (!pick) {
        return;
    }
    if (pick.id === 'login') {
        await a.ensureLoggedIn();
    } else if (pick.id === 'logout') {
        await a.logout();
    } else if (pick.id === 'probe') {
        await a.probe();
    } else if (pick.id === 'worg') {
        await vscode.commands.executeCommand('org.showAgenda');
    } else {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'org.orgsConnection');
    }
    show();
}

export function activateConnection(ctx: vscode.ExtensionContext) {
    item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
    item.command = 'org.connectionMenu';
    const timer = setInterval(() => Auth.get().probe(), 2 * 60 * 1000);
    ctx.subscriptions.push(item, { dispose: () => clearInterval(timer) },
        vscode.commands.registerCommand('org.connectionMenu', menu),
        Auth.get().onAccessChanged(show),
        Auth.get().onTokenChanged(show),
        vscode.window.onDidChangeActiveTextEditor(show),
        // Back at the window after a while: is the server still there?
        vscode.window.onDidChangeWindowState(s => s.focused && Auth.get().probe()),
    );
    show();
}
