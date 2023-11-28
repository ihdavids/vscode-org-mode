'use strict';

import * as vscode from 'vscode';
import * as cmd from './commands';
import { OrgLocator, OrgParser, OrgStringifier } from './ttorg';
import { Locator, Parser, Stringifier, Table } from './tttable';
import { isUndefined } from 'util';
import { registerContext, ContextType, enterContext, exitContext, restoreContext } from './context';
import { RowType, TableNavigator } from './tttable';
import {Sets } from "../sets"

export const tableSizeRe = /^(\d+)x(\d+)$/u;

function loadConfiguration() {
    locator = new OrgLocator();
    parser = new OrgParser();
    stringifier = new OrgStringifier();
}

/**
 * Create new table with specified rows and columns count in position of cursor
 */
export async function createTable(rowsCount: number, colsCount: number, editor: vscode.TextEditor, stringifier: Stringifier) {
    const table = new Table();
    for (let i = 0; i < rowsCount + 1; i++) {
        table.addRow(RowType.Data, new Array(colsCount).fill(''));
    }
    table.rows[1].type = RowType.Separator;

    const currentPosition = editor.selection.start;
    await editor.edit(b => b.insert(currentPosition, stringifier.stringify(table)));
    editor.selection = new vscode.Selection(currentPosition, currentPosition);
}

/**
 * Swap row under cursor with row below
 */
export async function moveRowDown(editor: vscode.TextEditor, _range: vscode.Range, table: Table) {
    const rowNum = editor.selection.end.line - table.startLine;
    if (rowNum >= table.rows.length - 1) {
        vscode.window.showWarningMessage('Cannot move row further');
        return;
    }
    await vscode.commands.executeCommand('editor.action.moveLinesDownAction');
}

/**
 * Swap row under cursor with row above
 */
export async function moveRowUp(editor: vscode.TextEditor, _range: vscode.Range, table: Table) {
    const rowNum = editor.selection.start.line - table.startLine;
    if (rowNum <= 0) {
        vscode.window.showWarningMessage('Cannot move row further');
        return;
    }
    await vscode.commands.executeCommand('editor.action.moveLinesUpAction');
}

/**
 * Move cursor to the next cell of table
 */
export async function gotoNextCell(editor: vscode.TextEditor, range: vscode.Range, table: Table,
    stringifier: Stringifier) {

    const nav = new TableNavigator(table);
    const newPos = nav.nextCell(editor.selection.start);
    if (newPos) {
        await formatUnderCursor(editor, range, table, stringifier);
        editor.selection = new vscode.Selection(newPos, newPos);
    } else {
        table.addRow(RowType.Data, new Array(table.cols.length).fill(''));
        await gotoNextCell(editor, range, table, stringifier);
    }
}

/**
 * Move cursor to the previous cell of table
 */
export async function gotoPreviousCell(editor: vscode.TextEditor, _range: vscode.Range, table: Table) {
    const nav = new TableNavigator(table);
    const newPos = nav.previousCell(editor.selection.start);
    if (newPos) {
        editor.selection = new vscode.Selection(newPos, newPos);
    }
}

/**
 * Format table under cursor
 */
export async function formatUnderCursor(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    const newText = stringifier.stringify(table);
    const prevSel = editor.selection.start;

    await editor.edit(e => e.replace(range, newText));
    editor.selection = new vscode.Selection(prevSel, prevSel);
}

/**
 * Swap column under cursor with column on the right
 */
export async function moveColRight(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    const rowCol = rowColFromPosition(table, editor.selection.start);
    if (rowCol.col < 0) {
        vscode.window.showWarningMessage('Not in table data field');
        return;
    }

    if (rowCol.col >= table.cols.length - 1 ) {
        vscode.window.showWarningMessage('Cannot move column further right');
        return;
    }

    [table.cols[rowCol.col], table.cols[rowCol.col + 1]] = [table.cols[rowCol.col + 1], table.cols[rowCol.col]];

    table.rows.forEach((_, i) => {
        const v1 = table.getAt(i, rowCol.col);
        const v2 = table.getAt(i, rowCol.col + 1);
        table.setAt(i, rowCol.col + 1, v1);
        table.setAt(i, rowCol.col, v2);
    });

    const newText = stringifier.stringify(table);
    await editor.edit(e => e.replace(range, newText));
    await gotoNextCell(editor, range, table, stringifier);
}

/**
 * Swap column under cursor with column on the left
 */
export async function moveColLeft(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    const rowCol = rowColFromPosition(table, editor.selection.start);
    if (rowCol.col < 0) {
        vscode.window.showWarningMessage('Not in table data field');
        return;
    }

    if (rowCol.col === 0) {
        vscode.window.showWarningMessage('Cannot move column further left');
        return;
    }

    [table.cols[rowCol.col], table.cols[rowCol.col - 1]] = [table.cols[rowCol.col - 1], table.cols[rowCol.col]];

    table.rows.forEach((_, i) => {
        const v1 = table.getAt(i, rowCol.col);
        const v2 = table.getAt(i, rowCol.col - 1);
        table.setAt(i, rowCol.col - 1, v1);
        table.setAt(i, rowCol.col, v2);
    });

    const newText = stringifier.stringify(table);
    await editor.edit(e => e.replace(range, newText));
    await gotoPreviousCell(editor, range, table);
}

/**
 * Clear cell under cursor
 */
export function clearCell(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, parser: Parser) {
    const document = editor.document;
    const currentLineNumber = editor.selection.start.line;
    const currentLine = document.lineAt(currentLineNumber);

    if (parser.isSeparatorRow(currentLine.text)) {
        vscode.window.showInformationMessage('Not in table data field');
        return;
    }

    const leftSepPosition = currentLine.text.lastIndexOf('|', editor.selection.start.character - 1);
    let rightSepPosition = currentLine.text.indexOf('|', editor.selection.start.character);
    if (rightSepPosition < 0) {
        rightSepPosition = currentLine.range.end.character;
    }

    if (leftSepPosition === rightSepPosition) {
        vscode.window.showInformationMessage('Not in table data field');
        return;
    }

    const r = new vscode.Range(currentLineNumber, leftSepPosition + 1, currentLineNumber, rightSepPosition);
    edit.replace(r, ' '.repeat(rightSepPosition - leftSepPosition - 1));
    const newPos = new vscode.Position(currentLineNumber, leftSepPosition + 2);
    editor.selection = new vscode.Selection(newPos, newPos);
}

/**
 * Moves cursor to the next row. If cursor is in the last row of table, create new row
 */
export async function nextRow(editor: vscode.TextEditor, range: vscode.Range, table: Table, stringifier: Stringifier) {
    const inLastRow = range.end.line === editor.selection.start.line;

    if (inLastRow) {
        table.addRow(RowType.Data, new Array(table.cols.length).fill(''));
    }

    await editor.edit(b => b.replace(range, stringifier.stringify(table)));

    const nav = new TableNavigator(table);
    const nextRowPos = nav.nextRow(editor.selection.start);
    if (nextRowPos) {
        editor.selection = new vscode.Selection(nextRowPos, nextRowPos);
    }
}

function rowColFromPosition(table: Table, position: vscode.Position): { row: number, col: number } {
    const result = { row: -1, col: -1 };

    result.row = position.line - table.startLine;
    let counter = 1;
    for (let i = 0; i < table.cols.length; ++i) {
        const col = table.cols[i];
        if (position.character >= counter && position.character < counter + col.width + 3) {
            result.col = i;
            break;
        }

        counter += col.width + 3;
    }

    return result;
}

let locator: Locator;
let parser: Parser;
let stringifier: Stringifier;

export function activateTableExtension(ctx: vscode.ExtensionContext) {
    loadConfiguration();
    //registerContext(ContextType.TableMode, '$(book) Table Mode', statusItem);


    vscode.window.onDidChangeActiveTextEditor(e => {
        if (e) {
            restoreContext(e);
        }
    });

    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('org.tableModeOn',
        (e) => enterContext(e, ContextType.TableMode)));
    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('org.tableModeOff',
        (e) => exitContext(e, ContextType.TableMode)));

    ctx.subscriptions.push(registerTableCommand('org.moveRowDown', cmd.moveRowDown, {format: true}));
    ctx.subscriptions.push(registerTableCommand('org.moveRowUp', cmd.moveRowUp, {format: true}));
    ctx.subscriptions.push(registerTableCommand('org.moveColRight', async (editor, range, table) => {
        await cmd.moveColRight(editor, range, table, stringifier);
    }));
    ctx.subscriptions.push(registerTableCommand('org.moveColLeft', async (editor, range, table) => {
        await cmd.moveColLeft(editor, range, table, stringifier);
    }));

    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('org.clearCell',
        (e, ed) => cmd.clearCell(e, ed, parser)));

    ctx.subscriptions.push(registerTableCommand('org.gotoNextCell', async (editor, range, table) => {
        await cmd.gotoNextCell(editor, range, table, stringifier);
    }));

    ctx.subscriptions.push(registerTableCommand('org.gotoPreviousCell', cmd.gotoPreviousCell, {format: true}));
    ctx.subscriptions.push(registerTableCommand('org.nextRow', async (editor, range, table) => {
        await cmd.nextRow(editor, range, table, stringifier);
    }));

    // Format table under cursor
    ctx.subscriptions.push(registerTableCommand('org.formatUnderCursor',
        (editor, range, table) => cmd.formatUnderCursor(editor, range, table, stringifier)));

    ctx.subscriptions.push(vscode.commands.registerTextEditorCommand('org.createTable', async editor => {
        const opts: vscode.InputBoxOptions = {
            value: '5x2',
            prompt: 'Table size Columns x Rows (e.g. 5x2)',
            validateInput: (value: string) => {
                if (!tableSizeRe.test(value)) {
                    return 'Provided value is invalid. Please provide the value in format Columns x Rows (e.g. 5x2)';
                }
                return;
            }
        };

        const size = await vscode.window.showInputBox(opts);
        if (size) {
            const match = size.match(tableSizeRe);
            if (match) {
                const cols = +match[1] || 1;
                const rows = +match[2] || 2;
                cmd.createTable(rows, cols, editor, stringifier);
            }
        }
    }));
}

export function deactivate() {
}

type TableCommandCallback = (editor: vscode.TextEditor, tableLocation: vscode.Range, table: Table) => Thenable<void>;

function registerTableCommand(command: string, callback: TableCommandCallback, options?: {format: boolean}) {
    return vscode.commands.registerCommand(command, async () => {
        const editor = vscode.window.activeTextEditor;

        if (isUndefined(editor)) {
            return;
        }

        const tableRange = locator.locate(editor.document, editor.selection.start.line);
        if (isUndefined(tableRange)) {
            return;
        }
        const selectedText = editor.document.getText(tableRange);
        const table = parser.parse(selectedText);

        if (isUndefined(table)) {
            return;
        }

        table.startLine = tableRange.start.line;

        if (options && options.format) {
            await cmd.formatUnderCursor(editor, tableRange, table, stringifier);
        }

        await callback(editor, tableRange, table);
    });
}