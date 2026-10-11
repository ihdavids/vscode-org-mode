// Moving subtrees between places: Refile and Copy To offer every heading the
// orgs server can file under (type to find one), Archive sends a subtree to its
// archive, and Archive All Done clears a file of finished work. Select across
// several headings to move them all at once.

import * as vscode from 'vscode';
import * as path from 'path';
import { ODb } from './db';
import { linesOf } from './edit-lines';
import { isHeadingLine, subtreeEnd, parseHeading, chosenHeadings } from './outline/model';
import { Sets } from './sets';
import { settled } from './org-files';

async function sources(editor: vscode.TextEditor): Promise<{ targets: any[], titles: string[] } | undefined> {
    const doc = editor.document;
    if (doc.isUntitled) {
        vscode.window.showWarningMessage('Save the file first: the orgs server works on files.');
        return undefined;
    }
    if (doc.isDirty && !await doc.save()) {
        return undefined;
    }
    const lines = linesOf(doc);
    const sel = editor.selection;
    const heads = chosenHeadings(lines, { start: sel.start.line, end: sel.isEmpty ? sel.start.line : sel.end.line });
    if (heads.length === 0) {
        vscode.window.setStatusBarMessage('Not under a heading', 2000);
        return undefined;
    }
    const targets: any[] = [];
    for (const h of heads) {
        const hash = await ODb.lookuphash(doc.fileName, h);
        if (typeof hash !== 'string' || hash === '' || / /.test(hash)) {
            vscode.window.showErrorMessage(`The orgs server does not know the heading at line ${h + 1} - is the file in one of its org directories?`);
            return undefined;
        }
        targets.push({ Type: 'hash', Id: hash, Filename: doc.fileName });
    }
    const titles = heads.map(h => parseHeading(lines[h], h, []).title);
    return { targets, titles };
}

interface TargetPick extends vscode.QuickPickItem { to: any; }

async function pickTarget(placeHolder: string, exclude: string): Promise<any | undefined> {
    const res = await ODb.refileTargets();
    if (!res) {
        return undefined;
    }
    if (!res.Ok) {
        vscode.window.showErrorMessage('No refile targets: ' + (res.Msg || 'the server did not say why'));
        return undefined;
    }
    const items: TargetPick[] = [];
    const files = new Set<string>();
    for (const t of res.Targets || []) {
        files.add(t.Filename);
        if (!t.Hash) {
            continue;
        }
        const olp: string[] = t.Olp || [];
        items.push({
            label: (t.Level === 1 ? '$(symbol-class) ' : '$(symbol-field) ') + (t.Todo ? t.Todo + ' ' : '') + olp[olp.length - 1],
            description: olp.slice(0, -1).join(' › '),
            detail: vscode.workspace.asRelativePath(t.Filename),
            to: { Type: 'hash', Id: t.Hash, Filename: t.Filename },
        });
    }
    // Each file's end, for filing at the top level.
    Array.from(files).sort().forEach(f => items.push({
        label: '$(file) ' + path.basename(f),
        description: 'top level, at the end',
        detail: vscode.workspace.asRelativePath(f),
        to: { Type: 'file', Filename: f },
    }));
    const pick = await vscode.window.showQuickPick(items.filter(i => i.to.Id !== exclude), {
        placeHolder, matchOnDescription: true, matchOnDetail: true,
    });
    return pick && pick.to;
}

async function done(res: any, verb: string, files: string[]) {
    if (!res) {
        return;
    }
    // The server wrote these files: let the editor catch up before going on.
    await settled(files.concat((res.Results || []).map((r: any) => r.Filename)));
    const failed = (res.Results || []).filter((r: any) => !r.Ok);
    if (res.Ok) {
        vscode.window.setStatusBarMessage(`$(check) ${verb} ${res.Done || 0} subtree${res.Done === 1 ? '' : 's'}`, 4000);
    } else {
        vscode.window.showErrorMessage(`${verb} failed: ${failed.map((r: any) => `${r.Headline}: ${r.Msg}`).join('; ') || res.Msg}`);
    }
}

async function moveTo(op: 'refile' | 'copy') {
    const editor = vscode.window.activeTextEditor;
    const src = editor && await sources(editor);
    if (!src) {
        return;
    }
    const what = src.titles.length === 1 ? `"${src.titles[0]}"` : `${src.titles.length} subtrees`;
    const to = await pickTarget(`${op === 'copy' ? 'Copy' : 'Refile'} ${what} to… (type to find a heading)`, src.targets[0].Id);
    if (to) {
        await done(await ODb.move(op, src.targets, to), op === 'copy' ? 'Copied' : 'Refiled', [src.targets[0].Filename, to.Filename]);
    }
}

export const refile = () => moveTo('refile');
export const copyTo = () => moveTo('copy');

export async function archive(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const src = editor && await sources(editor);
    if (src) {
        await done(await ODb.move('archive', src.targets), 'Archived', [src.targets[0].Filename]);
    }
}

// Every finished subtree in the file (the outermost, if one sits in another).
export async function archiveAllDone(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const doc = editor.document;
    const doneWords = (Sets.getProp<string[]>('doneKeywords', ['DONE']) || []).filter(k => k);
    const lines = linesOf(doc);
    const heads: number[] = [];
    let coveredTo = -1;
    lines.forEach((l, i) => {
        if (i >= coveredTo && isHeadingLine(l) && doneWords.indexOf(parseHeading(l, i, doneWords).todo) >= 0) {
            heads.push(i);
            coveredTo = subtreeEnd(lines, i);
        }
    });
    if (heads.length === 0) {
        vscode.window.showInformationMessage('Nothing finished to archive.');
        return;
    }
    const ok = await vscode.window.showWarningMessage(
        `Archive ${heads.length} finished subtree${heads.length === 1 ? '' : 's'}?`, { modal: true, detail: heads.slice(0, 8).map(h => parseHeading(lines[h], h, doneWords).title).join('\n') }, 'Archive');
    if (ok !== 'Archive' || (doc.isDirty && !await doc.save())) {
        return;
    }
    const targets: any[] = [];
    for (const h of heads) {
        targets.push({ Type: 'hash', Id: await ODb.lookuphash(doc.fileName, h), Filename: doc.fileName });
    }
    await done(await ODb.move('archive', targets), 'Archived', [doc.fileName]);
}

export function activateRefile(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
        vscode.commands.registerCommand('org.refile', refile),
        vscode.commands.registerCommand('org.copySubtree', copyTo),
        vscode.commands.registerCommand('org.archive', archive),
        vscode.commands.registerCommand('org.archiveAllDone', archiveAllDone),
    );
}
