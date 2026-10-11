// Capture a thought from anywhere in VS Code, without leaving what you are
// doing: Ctrl+Alt+O Q, pick where it goes (the last place you used is first),
// type a line, Enter. It goes through the orgs server's capture templates.

import * as vscode from 'vscode';
import { ODb } from './db';
import { settled } from './org-files';

let context: vscode.ExtensionContext;

export async function quickCapture(): Promise<void> {
    const templates: any[] = (await ODb.captureTemplates() as any) || [];
    if (!Array.isArray(templates) || templates.length === 0) {
        vscode.window.showInformationMessage('The orgs server has no capture templates (captureTemplates: in its yaml).');
        return;
    }
    const last = context.globalState.get<string>('org.quickCapture.last');
    const items = templates
        .map(t => ({ label: t.Name, description: t.CapTarget ? `${t.CapTarget.Filename}${t.CapTarget.Id ? ' › ' + t.CapTarget.Id : ''}` : '', name: t.Name }))
        .sort((a, b) => (a.name === last ? -1 : b.name === last ? 1 : 0));
    const pick = items.length === 1 ? items[0] : await vscode.window.showQuickPick(items, { placeHolder: 'Capture to…', matchOnDescription: true });
    if (!pick) {
        return;
    }
    const text = await vscode.window.showInputBox({ prompt: `Capture to ${pick.label}`, placeHolder: 'What is on your mind?', ignoreFocusOut: true });
    if (!text || !text.trim()) {
        return;
    }
    await context.globalState.update('org.quickCapture.last', pick.name);
    const res: any = await ODb.capture(pick.name, text.trim(), '', [], {}, '');
    if (res && res.Ok) {
        vscode.window.setStatusBarMessage(`$(check) Captured to ${pick.label}`, 3000);
        await settled(vscode.workspace.textDocuments.filter(d => d.languageId === 'org').map(d => d.uri.fsPath));
    } else {
        vscode.window.showErrorMessage(`Capture failed: ${res && res.Msg || 'the orgs server did not answer'}`);
    }
}

export function activateQuickCapture(ctx: vscode.ExtensionContext) {
    context = ctx;
    ctx.subscriptions.push(vscode.commands.registerCommand('org.quickCapture', quickCapture));
}
