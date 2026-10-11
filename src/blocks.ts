// Running things: one Run command does what the cursor is on - recalculates a
// table, runs a source block, a #+CALL: or inline code, refreshes a dynamic
// block - and Run All, Update All and Tangle do a whole file. Small Run and
// Update links sit above each block. The orgs server does the running and
// writes #+RESULTS: into the file, so the file is saved first.

import * as vscode from 'vscode';
import * as path from 'path';
import { ODb } from './db';
import { Sets } from './sets';
import { isHeadingLine } from './outline/model';
import { isTableLine } from './tables/model';
import { isTblfmLine } from './tables/formulas';
import { settled } from './org-files';

export type BlockKind = 'src' | 'dynamic' | 'call' | 'inline' | 'table';

// What runnable thing a line is in, and where it starts.
export function blockAt(lines: string[], line: number): { kind: BlockKind, start: number } | undefined {
    const text = lines[line] || '';
    if (isTableLine(text) || isTblfmLine(text)) {
        return { kind: 'table', start: line };
    }
    if (/^\s*#\+CALL:/i.test(text)) {
        return { kind: 'call', start: line };
    }
    for (let i = line; i >= 0; i--) {
        const l = lines[i];
        if (i < line && (/^\s*#\+END/i.test(l) || isHeadingLine(l))) {
            break;
        }
        if (/^\s*#\+BEGIN_SRC\b/i.test(l)) {
            return { kind: 'src', start: i };
        }
        if (/^\s*#\+BEGIN:/i.test(l)) {
            return { kind: 'dynamic', start: i };
        }
        if (i === line && /^\s*#\+END_SRC/i.test(l)) {
            continue;
        }
    }
    if (/\b(?:src_[\w-]+(?:\[[^\]]*\])?\{|call_[\w-]+\()/.test(text)) {
        return { kind: 'inline', start: line };
    }
    return undefined;
}

async function saved(doc: vscode.TextDocument): Promise<boolean> {
    if (doc.isUntitled) {
        vscode.window.showWarningMessage('Save the file first: the orgs server runs it from disk.');
        return false;
    }
    return !doc.isDirty || await doc.save();
}

function report(res: any, what: string) {
    if (!res) {
        return;
    }
    if (res.Ok) {
        const first = res.Ran && res.Ran[0] && res.Ran[0].Result && String(res.Ran[0].Result.Raw || res.Ran[0].Result.Result || '').trim().split('\n')[0];
        vscode.window.setStatusBarMessage(`$(check) ${what}${first ? ': ' + first.slice(0, 80) : res.Msg ? ' - ' + res.Msg : ''}`, 5000);
        return;
    }
    vscode.window.showErrorMessage(`${what} failed: ${res.Msg || 'the server did not say why'}`);
}

export async function runAt(uri?: string, line?: number): Promise<void> {
    let editor = vscode.window.activeTextEditor;
    if (uri !== undefined) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
        editor = await vscode.window.showTextDocument(doc);
        const pos = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(pos, pos);
    }
    if (!editor) {
        return;
    }
    const doc = editor.document;
    const at = line !== undefined ? line : editor.selection.active.line;
    const lines = doc.getText().split(/\r?\n/);
    const block = blockAt(lines, at);
    if (!block) {
        vscode.window.setStatusBarMessage('Nothing to run here: a table, a source block, a #+CALL:, inline code or a dynamic block', 3500);
        return;
    }
    if (block.kind === 'table') {
        await vscode.commands.executeCommand('org.execTable');
        return;
    }
    if (!await saved(doc)) {
        return;
    }
    if (block.kind === 'dynamic') {
        report(await ODb.dynamicBlocks(doc.fileName, block.start), 'Updated');
    } else {
        report(await ODb.babelExec(doc.fileName, block.kind === 'src' ? block.start : at), 'Ran');
    }
    await settled([doc.fileName]);
}

export async function runAll(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor && await saved(editor.document)) {
        report(await ODb.babelExecAll(editor.document.fileName), 'Ran every block');
        await settled([editor.document.fileName]);
    }
}

export async function updateAllDynamicBlocks(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor && await saved(editor.document)) {
        report(await ODb.dynamicBlocks(editor.document.fileName, 0, true), 'Updated');
        await settled([editor.document.fileName]);
    }
}

export async function tangle(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !await saved(editor.document)) {
        return;
    }
    const res: any = await ODb.tangle(editor.document.fileName);
    if (!res) {
        return;
    }
    if (res.error) {
        vscode.window.showErrorMessage('Tangle failed: ' + res.error);
        return;
    }
    const files: any[] = res.files || [];
    if (files.length === 0) {
        vscode.window.showInformationMessage('Nothing to tangle: no source block has a :tangle header.');
        return;
    }
    const names = files.map(f => path.basename(f.filename)).join(', ');
    const open = await vscode.window.showInformationMessage(`Tangled ${files.length} file${files.length === 1 ? '' : 's'}: ${names}`, 'Open');
    if (open) {
        const pick = files.length === 1 ? files[0] : await vscode.window.showQuickPick(
            files.map(f => ({ label: path.basename(f.filename), description: `${f.lines} lines`, detail: f.filename, f })), { placeHolder: 'Open which?' }).then(p => p && p.f);
        if (pick) {
            await vscode.window.showTextDocument(vscode.Uri.file(pick.filename));
        }
    }
}

// Run and Update above blocks, Recalculate on a #+TBLFM: line.
class BlockLenses implements vscode.CodeLensProvider {
    private changed = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this.changed.event;

    constructor() {
        vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration('org.blockCodeLens') && this.changed.fire());
    }

    provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
        if (!Sets.getProp<boolean>('blockCodeLens', true)) {
            return [];
        }
        const out: vscode.CodeLens[] = [];
        const uri = doc.uri.toString();
        const lens = (line: number, title: string, command: string, args: any[] = []) =>
            out.push(new vscode.CodeLens(new vscode.Range(line, 0, line, 0), { title, command, arguments: args }));
        for (let i = 0; i < doc.lineCount; i++) {
            const text = doc.lineAt(i).text;
            if (/^\s*#\+BEGIN_SRC\b/i.test(text)) {
                lens(i, '$(play) Run', 'org.runAt', [uri, i]);
                if (/:tangle\s+(?!no\b)\S+/.test(text)) {
                    lens(i, '$(file-symlink-file) Tangle file', 'org.tangle');
                }
            } else if (/^\s*#\+CALL:/i.test(text)) {
                lens(i, '$(play) Run', 'org.runAt', [uri, i]);
            } else if (/^\s*#\+BEGIN:/i.test(text)) {
                lens(i, '$(refresh) Update', 'org.runAt', [uri, i]);
            } else if (isTblfmLine(text) && i > 0 && !isTblfmLine(doc.lineAt(i - 1).text)) {
                lens(i, '$(symbol-operator) Recalculate', 'org.runAt', [uri, i]);
            }
        }
        return out;
    }
}

export function activateBlocks(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
        vscode.languages.registerCodeLensProvider('org', new BlockLenses()),
        vscode.commands.registerCommand('org.run', () => runAt()),
        vscode.commands.registerCommand('org.runAt', (uri: string, line: number) => runAt(uri, line)),
        vscode.commands.registerCommand('org.runAllBlocks', runAll),
        vscode.commands.registerCommand('org.updateAllDynamicBlocks', updateAllDynamicBlocks),
        vscode.commands.registerCommand('org.tangle', tangle),
    );
}
