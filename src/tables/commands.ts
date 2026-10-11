'use strict';

// The table commands. Each finds the table under the cursor, changes the model
// and writes it back aligned (one edit, one undo), with the cursor in the cell
// it belongs in. They read the line as it is, so a table typed in by hand -
// `|a|b` then Tab, `|-` then Tab - comes out right.

import * as vscode from 'vscode';
import * as fs from 'fs';
import { OrgTable, SortKind, isTableLine, parseDelimited, tableFromRows, sumValues } from './model';
import { setFormula, formulaFor, fieldRef } from './formulas';
import { TableAt, tableAt, tablesIn, write, place, formulas, measure } from './editor';
import { recalc, recalcAll, recalcEdits } from './calc';
import { plotTable } from './plot';
import { ODb } from '../db';
import { Auth } from '../auth';
import { Sets } from '../sets';

type TableCommand = (editor: vscode.TextEditor, at: TableAt) => Promise<void>;

// A command that only means something in a table. Outside one it does nothing,
// so binding it globally (a vim remap) is harmless.
function inTable(fn: TableCommand): () => Promise<void> {
    return async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const at = tableAt(editor.document, editor.selection.active);
        if (!at || at.row < 0) {
            vscode.window.setStatusBarMessage('Not in a table', 2000);
            return;
        }
        await fn(editor, at);
    };
}

// -- Moving about ------------------------------------------------------------

// The cell after (row, col), reading left to right then down, rules skipped.
function nextCellOf(t: OrgTable, row: number, col: number): { row: number, col: number } | undefined {
    let r = row;
    let c = t.rows[row].rule ? -1 : col;
    for (;;) {
        c++;
        if (c >= t.width) {
            r++;
            c = 0;
        }
        if (r >= t.rows.length) {
            return undefined;
        }
        if (!t.rows[r].rule) {
            return { row: r, col: c };
        }
        c = t.width;
    }
}

function prevCellOf(t: OrgTable, row: number, col: number): { row: number, col: number } | undefined {
    let r = row;
    let c = t.rows[row].rule ? t.width : col;
    for (;;) {
        c--;
        if (c < 0) {
            r--;
            c = t.width - 1;
        }
        if (r < 0) {
            return undefined;
        }
        if (!t.rows[r].rule) {
            return { row: r, col: c };
        }
        c = 0;
    }
}

// A cell left holding `=expr` or `:=expr` becomes a formula, as in org: the
// first for its column, the second for that cell alone.
function takeCellFormula(at: TableAt, t: OrgTable): string[] | undefined {
    if (at.row < 0 || t.rows[at.row].rule) {
        return undefined;
    }
    const text = t.get(at.row, at.col);
    const m = /^(:?)=(.+)$/.exec(text);
    if (!m || /^==/.test(text)) {
        return undefined;
    }
    const lhs = m[1] ? fieldRef(t, at.row, at.col) : '$' + (at.col + 1);
    t.set(at.row, at.col, '');
    return setFormula(at.tblfm, t.indent, lhs, m[2]);
}

// After leaving a row: recalculate if the user asked for it, quietly.
async function autoRecalc(editor: vscode.TextEditor, first: number, leftRow: number, wasMarked: boolean) {
    const mode = Sets.tableAutoRecalc;
    if (mode === 'off') {
        return;
    }
    const at = tableAt(editor.document, new vscode.Position(first, 0));
    if (!at || at.tblfm.length === 0) {
        return;
    }
    if (mode === 'always' || (wasMarked && leftRow !== at.row)) {
        await recalc(editor, at, true);
    }
}

// Move with Tab, Shift-Tab or Enter: take any formula typed in the cell, align,
// go, and recalculate if leaving the row asks for it.
async function move(editor: vscode.TextEditor, at: TableAt,
                    where: (t: OrgTable) => { row: number, col: number } | undefined) {
    const t = at.table;
    const marked = t.get(at.row, 0) === '#' && t.hasMarkerColumn();
    const tblfm = takeCellFormula(at, t);
    const to = where(t);
    if (!to) {
        await write(editor, at, t, { row: at.row, col: at.col }, tblfm);
        return;
    }
    await write(editor, at, t, to, tblfm);
    if (tblfm) {
        const now = tableAt(editor.document, editor.selection.active);
        if (now) {
            await recalc(editor, now);
        }
        return;
    }
    await autoRecalc(editor, at.first, at.row, marked);
}

export const nextCell = inTable((editor, at) => move(editor, at, t => {
    const to = nextCellOf(t, at.row, at.pastEnd ? t.width - 1 : at.col);
    if (to) {
        return to;
    }
    // Past the last cell: a new row, as in org.
    t.insertRow(t.rows.length);
    return { row: t.rows.length - 1, col: 0 };
}));

export const previousCell = inTable((editor, at) => move(editor, at, t => prevCellOf(t, at.row, at.pastEnd ? t.width : at.col)));

// Enter: down a row in the same column. From the last row, or the row over a
// rule, that is a new row.
export const nextRow = inTable((editor, at) => move(editor, at, t => {
    const below = t.rows[at.row + 1];
    if (!below || below.rule) {
        t.insertRow(at.row + 1);
    }
    return { row: at.row + 1, col: at.col };
}));

export const align = inTable(async (editor, at) => {
    await write(editor, at, at.table, { row: at.row, col: at.col });
});

// -- Rows and columns --------------------------------------------------------

export const moveRowUp = inTable(async (editor, at) => {
    if (at.table.moveRow(at.row, -1)) {
        await write(editor, at, at.table, { row: at.row - 1, col: at.col });
    }
});

export const moveRowDown = inTable(async (editor, at) => {
    if (at.table.moveRow(at.row, 1)) {
        await write(editor, at, at.table, { row: at.row + 1, col: at.col });
    }
});

export const moveColLeft = inTable(async (editor, at) => {
    if (at.table.moveCol(at.col, -1)) {
        await write(editor, at, at.table, { row: at.row, col: at.col - 1 });
    }
});

export const moveColRight = inTable(async (editor, at) => {
    if (at.table.moveCol(at.col, 1)) {
        await write(editor, at, at.table, { row: at.row, col: at.col + 1 });
    }
});

export const insertRowBelow = inTable(async (editor, at) => {
    at.table.insertRow(at.row + 1);
    await write(editor, at, at.table, { row: at.row + 1, col: at.col });
});

export const insertRowAbove = inTable(async (editor, at) => {
    at.table.insertRow(at.row);
    await write(editor, at, at.table, { row: at.row, col: at.col });
});

export const deleteRow = inTable(async (editor, at) => {
    if (at.table.rows.length === 1) {
        // The last row of a table: the table goes, as it would line by line.
        const range = new vscode.Range(at.first, 0, at.first + 1, 0);
        await editor.edit(b => b.delete(editor.document.validateRange(range)));
        return;
    }
    at.table.deleteRow(at.row);
    await write(editor, at, at.table, { row: Math.min(at.row, at.table.rows.length - 1), col: at.col });
});

export const insertColLeft = inTable(async (editor, at) => {
    at.table.insertCol(at.col);
    await write(editor, at, at.table, { row: at.row, col: at.col });
});

export const insertColRight = inTable(async (editor, at) => {
    at.table.insertCol(at.col + 1);
    await write(editor, at, at.table, { row: at.row, col: at.col + 1 });
});

export const deleteCol = inTable(async (editor, at) => {
    at.table.deleteCol(at.col);
    await write(editor, at, at.table, { row: at.row, col: Math.min(at.col, at.table.width - 1) });
});

// A rule under the row, the cursor staying put (org's C-c -).
export const insertRule = inTable(async (editor, at) => {
    at.table.insertRow(at.row + 1, true);
    await write(editor, at, at.table, { row: at.row, col: at.col });
});

// A rule under the row and on to the row after it (org's C-c RET): the quick
// way to finish a header.
export const insertRuleAndMove = inTable(async (editor, at) => {
    const t = at.table;
    t.insertRow(at.row + 1, true);
    const after = t.rows[at.row + 2];
    if (!after || after.rule) {
        t.insertRow(at.row + 2);
    }
    await write(editor, at, t, { row: at.row + 2, col: 0 });
});

export const clearCell = inTable(async (editor, at) => {
    at.table.set(at.row, at.col, '');
    await write(editor, at, at.table, { row: at.row, col: at.col });
});

// org's S-RET. An empty cell takes the value of the nearest one above; a full
// one is copied into the row below and the cursor goes with it. Whole numbers
// count up as they are copied, so 1 S-RET S-RET makes 1 2 3.
export const copyFieldDown = inTable(async (editor, at) => {
    const t = at.table;
    const bump = (s: string) => /^-?\d+$/.test(s) ? String(parseInt(s, 10) + 1) : s;
    const here = t.get(at.row, at.col);
    if (here === '') {
        for (let r = at.row - 1; r >= 0; r--) {
            if (!t.rows[r].rule && t.get(r, at.col) !== '') {
                t.set(at.row, at.col, bump(t.get(r, at.col)));
                break;
            }
        }
        await write(editor, at, t, { row: at.row, col: at.col });
        return;
    }
    const below = t.rows[at.row + 1];
    if (!below || below.rule) {
        t.insertRow(at.row + 1);
    }
    t.set(at.row + 1, at.col, bump(here));
    await write(editor, at, t, { row: at.row + 1, col: at.col });
});

// The text after the cursor goes on to a new row below, in the same column:
// for writing a long cell over several rows.
export const splitCell = inTable(async (editor, at) => {
    const t = at.table;
    const line = editor.document.lineAt(at.first + at.row).text;
    const ch = editor.selection.active.character;
    const end = line.indexOf('|', ch);
    const rest = line.slice(ch, end < 0 ? line.length : end).trim();
    const start = line.lastIndexOf('|', ch - 1);
    t.set(at.row, at.col, line.slice(start + 1, ch).trim());
    t.insertRow(at.row + 1);
    t.set(at.row + 1, at.col, rest);
    await write(editor, at, t, { row: at.row + 1, col: at.col });
});

// The row below joined on to this one, cell by cell: the other half of split.
export const joinRows = inTable(async (editor, at) => {
    const t = at.table;
    const below = t.rows[at.row + 1];
    if (!below || below.rule || t.rows[at.row].rule) {
        return;
    }
    for (let c = 0; c < t.width; c++) {
        t.set(at.row, c, [t.get(at.row, c), t.get(at.row + 1, c)].filter(s => s !== '').join(' '));
    }
    t.deleteRow(at.row + 1);
    await write(editor, at, t, { row: at.row, col: at.col });
});

// -- Formulas ----------------------------------------------------------------

// From a cell or from the #+TBLFM: line under the table.
export async function execTable(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const at = editor && tableAt(editor.document, editor.selection.active);
    if (!at) {
        vscode.window.setStatusBarMessage('Not in a table', 2000);
        return;
    }
    await recalc(editor, at);
}

export async function execAllTables(): Promise<void> {
    if (vscode.window.activeTextEditor) {
        await recalcAll(vscode.window.activeTextEditor);
    }
}

// The formula for the cell under the cursor, to write, change or remove. The
// box starts with the formula that decides the cell now - or $N= for a new
// column formula; write @R$C= on the left for this cell alone.
export async function editFormula(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const pos = editor.selection.active;
    const at = tableAt(editor.document, pos);
    if (!at) {
        vscode.window.setStatusBarMessage('Not in a table', 2000);
        return;
    }
    const all = formulas(at);
    let current = undefined;
    let ref = '';
    if (at.row >= 0) {
        current = formulaFor(all, at.table, at.row, at.col);
        ref = fieldRef(at.table, at.row, at.col);
    } else {
        // On a #+TBLFM: line: the formula the cursor is in.
        const line = pos.line - at.last - 1;
        current = all.find(f => f.line === line && pos.character >= f.start && pos.character <= f.end);
    }
    const lhs = current ? current.lhs : '$' + (at.col + 1);
    const value = lhs + '=' + (current ? current.rhs : '');
    const entered = await vscode.window.showInputBox({
        value,
        valueSelection: [lhs.length + 1, value.length],
        prompt: (ref ? `Formula for ${ref}. ` : '') +
            `$${at.col + 1}=… is the whole column, ${ref || '@2$3'}=… this cell only. An empty right side removes it.`,
        validateInput: v => v.indexOf('=') > 0 ? undefined : 'Write it as target=expression, e.g. $3=$1*$2',
    });
    if (entered === undefined) {
        return;
    }
    const eq = entered.indexOf('=');
    const newLhs = entered.slice(0, eq).trim();
    const rhs = entered.slice(eq + 1).trim();
    const tblfm = setFormula(at.tblfm, at.table.indent, newLhs, rhs);
    await write(editor, at, at.table, undefined, tblfm);
    editor.selection = new vscode.Selection(pos, pos);
    const now = tableAt(editor.document, new vscode.Position(at.first, 0));
    if (now && now.tblfm.length) {
        await recalc(editor, now);
    }
}

// -- Sorting, turning, adding up ---------------------------------------------

const SORTS: { label: string, by: SortKind, desc: boolean }[] = [
    { label: '$(arrow-down) Alphabetical, A to Z', by: 'alpha', desc: false },
    { label: '$(arrow-up) Alphabetical, Z to A', by: 'alpha', desc: true },
    { label: '$(arrow-down) Numeric, smallest first', by: 'numeric', desc: false },
    { label: '$(arrow-up) Numeric, largest first', by: 'numeric', desc: true },
    { label: '$(arrow-down) Date or time, earliest first', by: 'time', desc: false },
    { label: '$(arrow-up) Date or time, latest first', by: 'time', desc: true },
];

// org's C-c ^: the rows between the rules around the cursor, by this column.
export const sortTable = inTable(async (editor, at) => {
    const t = at.table;
    // Guess the likely sort from the column, so Enter is usually enough.
    const values = t.columnValues(at.row, at.col).filter(v => v !== '');
    const numeric = values.length > 0 && t.layout(measure()).aligns[at.col] === 'r';
    const dated = values.length > 0 && values.every(v => /\d{4}-\d{2}-\d{2}/.test(v));
    const items = SORTS.slice();
    const first = dated ? 4 : numeric ? 2 : 0;
    items.unshift(items.splice(first, 1)[0]);
    const pick = await vscode.window.showQuickPick(items, { placeHolder: `Sort rows by column ${at.col + 1}` });
    if (!pick) {
        return;
    }
    t.sort(at.row, at.col, pick.by, pick.desc);
    await write(editor, at, t, { row: at.row, col: at.col });
});

export const transposeTable = inTable(async (editor, at) => {
    const data: number[] = [];
    at.table.rows.forEach((r, i) => { if (!r.rule) { data.push(i); } });
    at.table.transpose();
    await write(editor, at, at.table, { row: at.col, col: Math.max(0, data.indexOf(at.row)) });
    if (at.tblfm.length) {
        vscode.window.showInformationMessage('Transposed. The #+TBLFM: line still refers to the old layout.');
    }
});

// org's C-c +: the column added up over the rows between rules (or the rows
// selected), into the clipboard.
export const sumColumn = inTable(async (editor, at) => {
    const t = at.table;
    let values: string[];
    const sel = editor.selection;
    if (!sel.isEmpty && sel.start.line !== sel.end.line) {
        values = [];
        for (let l = Math.max(sel.start.line, at.first); l <= Math.min(sel.end.line, at.last); l++) {
            values.push(t.get(l - at.first, at.col));
        }
    } else {
        values = t.columnValues(at.row, at.col);
    }
    const sum = sumValues(values);
    if (!sum) {
        vscode.window.showInformationMessage('Nothing to add up in this column.');
        return;
    }
    await vscode.env.clipboard.writeText(sum.text);
    vscode.window.setStatusBarMessage(`$(symbol-operator) Sum of $${at.col + 1}: ${sum.text} (${sum.count} values) - copied`, 6000);
});

// -- Making tables ------------------------------------------------------------

// Put a table at the cursor: on its line if that is empty, under it if not.
async function insertTable(editor: vscode.TextEditor, table: OrgTable, replace?: vscode.Range) {
    const doc = editor.document;
    let line = editor.selection.active.line;
    let range: vscode.Range;
    let prefix = '';
    if (replace) {
        range = replace;
        line = replace.start.line;
    } else if (doc.lineAt(line).isEmptyOrWhitespace) {
        range = doc.lineAt(line).range;
    } else {
        range = new vscode.Range(doc.lineAt(line).range.end, doc.lineAt(line).range.end);
        prefix = '\n';
        line++;
    }
    const text = table.format(measure()).join('\n');
    await editor.edit(b => b.replace(range, prefix + text));
    place(editor, line, 0, 0);
}

// Text written the way a heading's body is indented, so a table fits in.
function indentHere(editor: vscode.TextEditor): string {
    const doc = editor.document;
    for (let l = editor.selection.active.line; l >= 0; l--) {
        const text = doc.lineAt(l).text;
        if (/^\*+\s/.test(text)) {
            return '';
        }
        if (text.trim() !== '') {
            return /^\s*/.exec(text)[0];
        }
    }
    return '';
}

export async function createTable(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const size = await vscode.window.showInputBox({
        value: '3x2',
        prompt: 'Columns x rows under the header (3x2)',
        validateInput: v => /^\s*\d+\s*x\s*\d+\s*$/.test(v) ? undefined : 'Columns x rows, like 3x2',
    });
    if (!size) {
        return;
    }
    const [cols, rows] = size.split('x').map(s => Math.max(1, parseInt(s, 10)));
    const t = new OrgTable([{ rule: false, cells: new Array(cols).fill('') }], indentHere(editor));
    t.insertRow(1, true);
    for (let i = 0; i < rows; i++) {
        t.insertRow(t.rows.length);
    }
    await insertTable(editor, t);
}

// The selection, or the paragraph the cursor is in, as a table: tabs, commas,
// semicolons or runs of spaces between the cells.
export async function convertToTable(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const doc = editor.document;
    let from = editor.selection.start.line;
    let to = editor.selection.end.line;
    if (editor.selection.isEmpty) {
        while (from > 0 && !doc.lineAt(from - 1).isEmptyOrWhitespace) {
            from--;
        }
        while (to + 1 < doc.lineCount && !doc.lineAt(to + 1).isEmptyOrWhitespace) {
            to++;
        }
    } else if (editor.selection.end.character === 0 && to > from) {
        to--;
    }
    const range = new vscode.Range(from, 0, to, doc.lineAt(to).text.length);
    const text = doc.getText(range);
    if (text.trim() === '' || isTableLine(doc.lineAt(from).text)) {
        return;
    }
    const indent = /^\s*/.exec(doc.lineAt(from).text)[0];
    await insertTable(editor, tableFromRows(parseDelimited(text), indent), range);
}

export async function pasteAsTable(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const text = await vscode.env.clipboard.readText();
    if (!editor || text.trim() === '') {
        vscode.window.showInformationMessage('The clipboard has no text to make a table of.');
        return;
    }
    await insertTable(editor, tableFromRows(parseDelimited(text), indentHere(editor)));
}

export async function importTable(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Delimited text': ['csv', 'tsv', 'txt'], 'All files': ['*'] },
        openLabel: 'Import as table',
    });
    if (!picked || picked.length === 0) {
        return;
    }
    const text = fs.readFileSync(picked[0].fsPath, 'utf8');
    const sep = /\.tsv$/i.test(picked[0].fsPath) ? '\t' : undefined;
    await insertTable(editor, tableFromRows(parseDelimited(text, sep), indentHere(editor)));
}

// -- Finding tables ------------------------------------------------------------

// The #+NAME:s of this file's tables, and every table the server knows when
// there is one to ask: for remote(name, @2$3).
export async function insertTableName(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const names = new Set<string>(tablesIn(editor.document).filter(t => t.name).map(t => t.name));
    if (Auth.get().isLoggedIn()) {
        const res = await ODb.tableNames();
        if (res && res.Ok && res.NamedTables) {
            res.NamedTables.forEach((n: string) => names.add(n));
        }
    }
    if (names.size === 0) {
        vscode.window.showInformationMessage('No named tables. A #+NAME: line above a table names it.');
        return;
    }
    const pick = await vscode.window.showQuickPick(Array.from(names).sort(), { placeHolder: 'Insert a table name' });
    if (pick) {
        await editor.edit(b => b.replace(editor.selection, pick));
    }
}

// Jump to any table: every one the server knows, or this file's when it cannot
// be asked.
export async function gotoTable(): Promise<void> {
    interface Item extends vscode.QuickPickItem { file: string; line: number; }
    let items: Item[] = [];
    const res = await ODb.tables();
    if (res && res.Ok && res.Tables) {
        items = res.Tables.map((t: any) => ({
            label: t.Name ? '$(table) ' + t.Name : '$(table) ' + (t.Heading || 'table'),
            description: t.Name ? t.Heading : '',
            detail: `${vscode.workspace.asRelativePath(t.Filename)}:${t.Line + 1}  ·  ${t.Rows}×${t.Cols}` +
                (t.Formulas ? `  ·  ${t.Formulas} formula${t.Formulas === 1 ? '' : 's'}` : ''),
            file: t.Filename,
            line: t.Line,
        }));
    } else if (vscode.window.activeTextEditor) {
        const here = vscode.window.activeTextEditor.document;
        items = tablesIn(here).map(t => ({
            label: '$(table) ' + (t.name || t.table.get(0, 0) || 'table'),
            description: `line ${t.first + 1}`,
            detail: `${t.table.rows.length}×${t.table.width}`,
            file: here.fileName,
            line: t.first,
        }));
    }
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Go to a table', matchOnDescription: true, matchOnDetail: true });
    if (!pick) {
        return;
    }
    const doc = await vscode.workspace.openTextDocument(pick.file);
    const editor = await vscode.window.showTextDocument(doc);
    const at = tableAt(doc, new vscode.Position(pick.line, 0));
    place(editor, at ? at.first : pick.line, 0, 0);
}

// -- Vim -------------------------------------------------------------------------

const VIM_KEYS: { before: string[], commands: string[] }[] = [
    { before: ['<leader>', 't', 't'], commands: ['org.tableMenu'] },
    { before: ['<leader>', 't', 'r'], commands: ['org.execTable'] },
    { before: ['<leader>', 't', '='], commands: ['org.editTableFormula'] },
    { before: ['<leader>', 't', 's'], commands: ['org.sortTable'] },
    { before: ['<leader>', 't', '-'], commands: ['org.insertSeparator'] },
    { before: ['<leader>', 't', 'o'], commands: ['org.addRowDown'] },
    { before: ['<leader>', 't', 'O'], commands: ['org.addRowUp'] },
    { before: ['<leader>', 't', 'd'], commands: ['org.deleteRow'] },
    { before: ['<leader>', 't', 'i'], commands: ['org.addColRight'] },
    { before: ['<leader>', 't', 'x'], commands: ['org.deleteCol'] },
    { before: ['<leader>', 't', 'p'], commands: ['org.plotTable'] },
    { before: ['<leader>', 't', 'c'], commands: ['org.convertToTable'] },
];

// Add <leader>t… mappings for the table commands to VSCodeVim's normal mode
// keys. Nothing already mapped to the same keys is touched.
export async function setupVimKeys(): Promise<void> {
    const vim = vscode.workspace.getConfiguration('vim');
    const current: any[] = vim.get('normalModeKeyBindingsNonRecursive') || [];
    const taken = new Set(current.map(b => JSON.stringify(b.before)));
    const add = VIM_KEYS.filter(k => !taken.has(JSON.stringify(k.before)));
    if (add.length === 0) {
        vscode.window.showInformationMessage('The vim table keys are already set up.');
        return;
    }
    const list = add.map(k => k.before.join('').replace('<leader>', '␣') + ' ' + k.commands[0].replace('org.', '')).join(', ');
    const ok = await vscode.window.showInformationMessage(
        `Add ${add.length} normal mode mappings to your vim settings? (${list}; ␣ is your leader)`, { modal: true }, 'Add');
    if (ok !== 'Add') {
        return;
    }
    await vim.update('normalModeKeyBindingsNonRecursive', current.concat(add), vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('Added. <leader>tt opens the table menu.');
}

// -- Registration ----------------------------------------------------------------

export function activateTableExtension(ctx: vscode.ExtensionContext) {
    const reg = (id: string, fn: () => Promise<void>) =>
        ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
    reg('org.gotoNextCell', nextCell);
    reg('org.gotoPreviousCell', previousCell);
    reg('org.nextRow', nextRow);
    reg('org.formatUnderCursor', align);
    reg('org.moveRowUp', moveRowUp);
    reg('org.moveRowDown', moveRowDown);
    reg('org.moveColLeft', moveColLeft);
    reg('org.moveColRight', moveColRight);
    reg('org.addRowDown', insertRowBelow);
    reg('org.addRowUp', insertRowAbove);
    reg('org.deleteRow', deleteRow);
    reg('org.addColLeft', insertColLeft);
    reg('org.addColRight', insertColRight);
    reg('org.deleteCol', deleteCol);
    reg('org.insertSeparator', insertRule);
    reg('org.insertSeparatorAndMove', insertRuleAndMove);
    reg('org.clearCell', clearCell);
    reg('org.copyFieldDown', copyFieldDown);
    reg('org.splitCell', splitCell);
    reg('org.joinRows', joinRows);
    reg('org.createTable', createTable);
    reg('org.execTable', execTable);
    reg('org.execAllTables', execAllTables);
    reg('org.editTableFormula', editFormula);
    reg('org.sortTable', sortTable);
    reg('org.transposeTable', transposeTable);
    reg('org.sumTableColumn', sumColumn);
    reg('org.convertToTable', convertToTable);
    reg('org.pasteAsTable', pasteAsTable);
    reg('org.importTable', importTable);
    reg('org.insertTableName', insertTableName);
    reg('org.gotoTable', gotoTable);
    reg('org.setupVimTableKeys', setupVimKeys);
    reg('org.plotTable', () => plotTable(ctx));

    // Recalculating on save, when asked for: the edits go in with the save.
    ctx.subscriptions.push(vscode.workspace.onWillSaveTextDocument(e => {
        if (Sets.tableRecalcOnSave && e.document.languageId === 'org' && Auth.get().isLoggedIn() &&
            tablesIn(e.document).some(t => t.tblfm.length > 0)) {
            e.waitUntil(recalcEdits(e.document, true));
        }
    }));
}
