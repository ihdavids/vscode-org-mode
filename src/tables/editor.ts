// The table under the cursor, read out of the document and put back. Every
// table command is: find it, change the model, write it back - one edit, so one
// undo - and put the cursor in the cell it belongs in.

import * as vscode from 'vscode';
import { OrgTable, Measure, isTableLine, isRuleLine, measureWith, cellIndexAt, cellTextStart, diffLines } from './model';
import { isTblfmLine, parseTblfm, Formula } from './formulas';
import { Sets } from '../sets';

export interface TableAt {
    first: number;     // document line of the table's first row
    last: number;      // and of its last
    tblfm: string[];   // the #+TBLFM: lines straight under it
    name?: string;     // its #+NAME:, if it has one
    plot?: string;     // its #+PLOT: line, if it has one
    table: OrgTable;
    row: number;       // where the cursor is, in table rows; -1 when not in it
    col: number;
    pastEnd?: boolean; // on or after the bar closing the row: after its last cell
}

export function measure(): Measure {
    return measureWith(Sets.prettyLinks);
}

export function formulas(at: TableAt): Formula[] {
    return parseTblfm(at.tblfm);
}

// The table a line is in, or that a #+TBLFM: line belongs to.
export function tableAt(doc: vscode.TextDocument, pos: vscode.Position): TableAt | undefined {
    let line = pos.line;
    while (line >= 0 && line < doc.lineCount && isTblfmLine(doc.lineAt(line).text)) {
        line--;
    }
    if (line < 0 || !isTableLine(doc.lineAt(line).text)) {
        return undefined;
    }
    let first = line;
    while (first > 0 && isTableLine(doc.lineAt(first - 1).text)) {
        first--;
    }
    let last = line;
    while (last + 1 < doc.lineCount && isTableLine(doc.lineAt(last + 1).text)) {
        last++;
    }
    const at = read(doc, first, last);
    if (pos.line >= first && pos.line <= last) {
        at.row = pos.line - first;
        const text = doc.lineAt(pos.line).text;
        at.col = at.table.rows[at.row].rule ? 0 : cellIndexAt(text, pos.character);
        // Vim's cursor sits on the last character, so on a closed row that is the bar.
        at.pastEnd = /\|\s*$/.test(text) && pos.character >= text.lastIndexOf('|') && text.indexOf('|') !== text.lastIndexOf('|');
    }
    return at;
}

function read(doc: vscode.TextDocument, first: number, last: number): TableAt {
    const lines: string[] = [];
    for (let i = first; i <= last; i++) {
        lines.push(doc.lineAt(i).text);
    }
    const tblfm: string[] = [];
    for (let i = last + 1; i < doc.lineCount && isTblfmLine(doc.lineAt(i).text); i++) {
        tblfm.push(doc.lineAt(i).text);
    }
    let name: string | undefined;
    let plot: string | undefined;
    for (let i = first - 1; i >= 0 && /^\s*#\+\w+:/.test(doc.lineAt(i).text); i--) {
        const text = doc.lineAt(i).text;
        const m = /^\s*#\+NAME:\s*(.+?)\s*$/i.exec(text);
        if (m) {
            name = m[1];
        }
        if (/^\s*#\+PLOT:/i.test(text)) {
            plot = text;
        }
    }
    return { first, last, tblfm, name, plot, table: OrgTable.parse(lines), row: -1, col: -1 };
}

// Every table in the document, top to bottom.
export function tablesIn(doc: vscode.TextDocument): TableAt[] {
    const out: TableAt[] = [];
    let i = 0;
    while (i < doc.lineCount) {
        if (isTableLine(doc.lineAt(i).text)) {
            let last = i;
            while (last + 1 < doc.lineCount && isTableLine(doc.lineAt(last + 1).text)) {
                last++;
            }
            out.push(read(doc, i, last));
            i = last + 1;
        } else {
            i++;
        }
    }
    return out;
}

// The edit that puts a table (and its formulas, when given) back.
export function replacement(doc: vscode.TextDocument, at: TableAt, table: OrgTable, tblfm?: string[]): vscode.TextEdit | undefined {
    const end = tblfm ? at.last + at.tblfm.length : at.last;
    const old: string[] = [];
    for (let i = at.first; i <= end; i++) {
        old.push(doc.lineAt(i).text);
    }
    const d = diffLines(old, table.format(measure()).concat(tblfm || []));
    if (!d) {
        return undefined;
    }
    return vscode.TextEdit.replace(new vscode.Range(at.first + d.startLine, d.startCh, at.first + d.endLine, d.endCh), d.text);
}

// Write a table back and put the cursor at the start of a cell's text.
export async function write(editor: vscode.TextEditor, at: TableAt, table: OrgTable,
                            cursor?: { row: number, col: number }, tblfm?: string[]): Promise<void> {
    const edit = replacement(editor.document, at, table, tblfm);
    if (edit) {
        await editor.edit(b => b.replace(edit.range, edit.newText));
    }
    if (cursor) {
        place(editor, at.first, cursor.row, cursor.col);
    }
}

export function place(editor: vscode.TextEditor, first: number, row: number, col: number) {
    const line = first + Math.max(0, row);
    if (line >= editor.document.lineCount) {
        return;
    }
    const text = editor.document.lineAt(line).text;
    const ch = isRuleLine(text) ? text.indexOf('|') + 1 : cellTextStart(text, col);
    const pos = new vscode.Position(line, ch);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos));
}
