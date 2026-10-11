import * as vscode from 'vscode';
import {ODb} from "./db"

// A random row of a named table, inserted at the cursor: for drawing from a
// table of names, prompts, encounters...
export async function getRandomTableRow(): Promise<void> {
    const names = await ODb.tableNames();
    if (!names || !names.Ok) {
        return;
    }
    const tableName = await vscode.window.showQuickPick(names.NamedTables, { placeHolder: 'A random row from which table?' });
    if (!tableName) {
        return;
    }
    const output = await ODb.tableRandomRow(tableName);
    const editor = vscode.window.activeTextEditor;
    if (editor && output && output.Ok) {
        const pos = editor.selection.active;
        await editor.edit(e => e.insert(pos, output.Msg.trimEnd()));
    }
}
