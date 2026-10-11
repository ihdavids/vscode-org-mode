// Recalculating a table: the orgs server works the formulas out from the text
// in the buffer (/table/calc) and the answer is put back here, so it is one
// undo and needs no save. Colours formulas give cells are kept beside the
// table they belong to until the table changes.

/* SDOC: Developers
* Recalculating tables
  Formulas are worked out by the orgs server, but from the editor's text:
  =calculate= sends the table and its =#+TBLFM:= lines to =POST /table/calc=,
  which writes nothing and answers with the table as it reads afterwards
  (and any colours =highlight()= and friends gave cells). The answer is put
  back as one edit, so a recalculation is one undo and needs no save; if
  the document changed while the server was thinking, the answer is
  dropped.

  Colours are kept per document against the formatted text of the table
  they belong to; a table that no longer reads that way has lost them.
EDOC */

import * as vscode from 'vscode';
import { ODb } from '../db';
import { Auth } from '../auth';
import { OrgTable } from './model';
import { TableAt, tablesIn, replacement, measure } from './editor';

export interface CellColor { row: number; col: number; color: string; }

// Per document: the text each coloured table had when it was worked out. A
// table that no longer reads that way has lost its colours.
const colorsByDoc = new Map<string, { text: string, cells: CellColor[] }[]>();
const changed = new vscode.EventEmitter<vscode.Uri>();
export const onColorsChanged = changed.event;

export function colorsFor(doc: vscode.TextDocument, at: TableAt): CellColor[] {
    const text = at.table.format(measure()).join('\n');
    const entry = (colorsByDoc.get(doc.uri.toString()) || []).find(e => e.text === text);
    return entry ? entry.cells : [];
}

function keepColors(doc: vscode.TextDocument, table: OrgTable, cells: CellColor[]) {
    const key = doc.uri.toString();
    const text = table.format(measure()).join('\n');
    const list = (colorsByDoc.get(key) || []).filter(e => e.text !== text);
    if (cells.length) {
        list.push({ text, cells });
    }
    colorsByDoc.set(key, list.slice(-50));
    changed.fire(doc.uri);
}

export interface Calculated { table: OrgTable; colors: CellColor[]; }

// What a table reads as once its formulas have run. Throws with the server's
// message when they cannot.
export async function calculate(doc: vscode.TextDocument, at: TableAt): Promise<Calculated | undefined> {
    const text = at.table.format(measure()).concat(at.tblfm).join('\n');
    const res = await ODb.tableCalc(doc.fileName, at.first, text);
    if (!res) {
        return undefined;
    }
    if (!res.Ok) {
        throw new Error(res.Msg || 'the table could not be calculated');
    }
    const table = OrgTable.parse(String(res.Msg).split('\n'));
    table.indent = at.table.indent;
    // The server counts rows as formulas do, @1 being the first that is not a rule.
    const data: number[] = [];
    table.rows.forEach((r, i) => { if (!r.rule) { data.push(i); } });
    const colors = (res.Colors || [])
        .filter((c: any) => data[c.Row - 1] !== undefined)
        .map((c: any) => ({ row: data[c.Row - 1], col: c.Col - 1, color: c.Color }));
    return { table, colors };
}

// Recalculate one table in place. Quiet is for recalculation nobody asked for
// in so many words (a Tab out of a marked row): no login prompt, and a failure
// goes to the status bar rather than a popup.
export async function recalc(editor: vscode.TextEditor, at: TableAt, quiet: boolean = false): Promise<boolean> {
    if (at.tblfm.length === 0) {
        if (!quiet) {
            vscode.window.showInformationMessage('This table has no #+TBLFM: line. Org: Edit Table Formula adds one.');
        }
        return false;
    }
    if (quiet && !Auth.get().isLoggedIn()) {
        return false;
    }
    const doc = editor.document;
    const version = doc.version;
    const cursor = editor.selection.active;
    let result: Calculated | undefined;
    try {
        result = await calculate(doc, at);
    } catch (e) {
        if (quiet) {
            vscode.window.setStatusBarMessage('$(warning) ' + e.message, 5000);
        } else {
            vscode.window.showErrorMessage('Table: ' + e.message);
        }
        return false;
    }
    // Somebody kept typing while the server thought: their text wins.
    if (!result || doc.version !== version) {
        return false;
    }
    const edit = replacement(doc, at, result.table);
    if (edit) {
        await editor.edit(b => b.replace(edit.range, edit.newText), { undoStopBefore: true, undoStopAfter: true });
        editor.selection = new vscode.Selection(cursor, cursor);
    }
    keepColors(doc, result.table, result.colors);
    return true;
}

// The edits that recalculate every table with formulas in a document, worked
// out first and made together.
export async function recalcEdits(doc: vscode.TextDocument, quiet: boolean): Promise<vscode.TextEdit[]> {
    const edits: vscode.TextEdit[] = [];
    const errors: string[] = [];
    for (const at of tablesIn(doc).filter(t => t.tblfm.length > 0)) {
        try {
            const r = await calculate(doc, at);
            if (r) {
                const e = replacement(doc, at, r.table);
                if (e) {
                    edits.push(e);
                }
                keepColors(doc, r.table, r.colors);
            }
        } catch (e) {
            errors.push(`line ${at.first + 1}: ${e.message}`);
        }
    }
    if (errors.length) {
        const msg = 'Tables: ' + errors.join('; ');
        if (quiet) {
            vscode.window.setStatusBarMessage('$(warning) ' + msg, 8000);
        } else {
            vscode.window.showErrorMessage(msg);
        }
    }
    return edits;
}

export async function recalcAll(editor: vscode.TextEditor): Promise<void> {
    const version = editor.document.version;
    const edits = await recalcEdits(editor.document, false);
    if (edits.length && editor.document.version === version) {
        await editor.edit(b => edits.forEach(e => b.replace(e.range, e.newText)));
    }
    vscode.window.setStatusBarMessage(`$(check) ${edits.length} table${edits.length === 1 ? '' : 's'} recalculated`, 3000);
}
