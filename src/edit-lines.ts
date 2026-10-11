// Rewriting a block of a document's lines with one edit that touches only what
// changed: one undo, and the cursor, markers and vim's idea of where things are
// left alone wherever nothing moved.
/* SDOC: Developers
* Writing back with minimal edits
  =replaceLines(editor, start, end, lines)= rewrites a block of a document
  with the single smallest edit (=diffLines= in =lines.ts=): common lines
  and the common start and end of a changed line are left alone. That keeps
  undo to one step, and leaves the cursor, markers and VSCodeVim's idea of
  where things are undisturbed wherever nothing moved - writing a whole
  table back used to move the cursor twice and confuse vim.
EDOC */

import * as vscode from 'vscode';
import { diffLines } from './lines';

export function linesOf(doc: vscode.TextDocument): string[] {
    const out: string[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
        out.push(doc.lineAt(i).text);
    }
    return out;
}

// Replace lines [start, end) with `lines`, then put the cursor on `cursorLine`
// (at the same column, or `cursorCh` when given).
export async function replaceLines(editor: vscode.TextEditor, start: number, end: number, lines: string[],
                                   cursorLine?: number, cursorCh?: number): Promise<boolean> {
    const doc = editor.document;
    const old: string[] = [];
    for (let i = start; i < end; i++) {
        old.push(doc.lineAt(i).text);
    }
    const d = diffLines(old, lines);
    if (d) {
        const range = new vscode.Range(start + d.startLine, d.startCh, start + d.endLine, d.endCh);
        const ok = await editor.edit(b => b.replace(range, d.text));
        if (!ok) {
            return false;
        }
    }
    if (cursorLine !== undefined) {
        const line = Math.min(cursorLine, doc.lineCount - 1);
        const ch = cursorCh !== undefined ? cursorCh : Math.min(editor.selection.active.character, doc.lineAt(line).text.length);
        const pos = new vscode.Position(line, ch);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));
    }
    return true;
}
