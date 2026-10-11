// Statistics cookies kept up to date as you work: change a child's keyword, or
// tick a box, and the [2/5] or [40%] on the heading above follows. The edit
// goes into the same undo step as the change that caused it.

import * as vscode from 'vscode';
import { Sets } from './sets';
import { updateCookies, fileKeywords } from './outline/model';
import { diffLines } from './lines';

function keywordsOf(lines: string[]): { todo: string[], done: string[] } {
    const own = fileKeywords(lines);
    if (own) {
        return own;
    }
    return {
        todo: (Sets.getProp<string[]>('todoKeywords', ['TODO']) || []).filter(k => k),
        done: (Sets.getProp<string[]>('doneKeywords', ['DONE']) || []).filter(k => k),
    };
}

async function refresh(editor: vscode.TextEditor) {
    const doc = editor.document;
    const lines = doc.getText().split(/\r?\n/);
    const k = keywordsOf(lines);
    const next = updateCookies(lines, k.todo, k.done);
    const d = diffLines(lines, next);
    if (!d) {
        return;
    }
    const range = new vscode.Range(d.startLine, d.startCh, d.endLine, d.endCh);
    await editor.edit(b => b.replace(range, d.text), { undoStopBefore: false, undoStopAfter: false });
}

export function activateStats(ctx: vscode.ExtensionContext) {
    let pending: NodeJS.Timeout | undefined;
    ctx.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || e.document !== editor.document || e.document.languageId !== 'org' || !Sets.getProp<boolean>('autoStatistics', true)) {
                return;
            }
            // Only edits that could move a count: keywords, boxes, headings coming or going.
            const relevant = e.contentChanges.some(c => /[*\[\]\n]|[A-Z]{3,}/.test(c.text) || c.rangeLength > 0);
            if (!relevant) {
                return;
            }
            if (pending) {
                clearTimeout(pending);
            }
            pending = setTimeout(() => { pending = undefined; refresh(editor); }, 250);
        }),
        vscode.commands.registerCommand('org.updateStatistics', () => vscode.window.activeTextEditor && refresh(vscode.window.activeTextEditor)),
    );
}
