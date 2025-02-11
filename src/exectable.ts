
import * as vscode from 'vscode';
import './duration';
import {ODb} from "./db"
import { Sets } from './sets';
import { Parser } from './parser';
import { Log } from './log';
import { locator } from './tables/commands';


// Execute an entire table and replace it in the editor
export async function execTable(): Promise<void> {
    const src = await ODb.getHashTarget();
    const row = vscode.window.activeTextEditor.selection.active.line;
    const res: any = await ODb.execTable(src, row);
    if (!res.Ok) {
        Log.get().error("EXECT: ", src);
        Log.get().error("  > EXECT ERROR: ", JSON.stringify(res))
        vscode.window.showErrorMessage("ERROR failed to exec table\n>> " + res.Msg)
    } else {
        Log.get().log("EXECT SUCCESS: ", src);
        Log.get().log("EXECT        : ");
        Log.get().log(res.Msg);
        let editor = vscode.window.activeTextEditor;
        vscode.window.showInformationMessage("ExecTable success: ", res.Msg )
        const tableRange = locator.locate(editor.document, editor.selection.start.line);
        await editor.edit(e => e.replace(tableRange, res.Msg.trimEnd()));
    }
}


export async function execAllTables(): Promise<void> {
    //const src = await ODb.getHashTarget();
    const fname = vscode.window.activeTextEditor.document.fileName;
    let output = ""
    let total = 0
    let passed = 0
    const ress: any = await ODb.execAllTable(fname);
    if (ress) {
        ress.forEach(async res => {
    if (!res.Ok) {
        Log.get().error("  > EXECT ERROR: ", JSON.stringify(res))
        vscode.window.showErrorMessage("ERROR failed to exec table\n>> " + res.Msg)
        total += 1
    } else {
        output += "EXECT SUCCESS: \n";
        output += res.Msg;
        output += " [ === ]\n";
        passed += 1
        total += 1
        let editor = vscode.window.activeTextEditor;

        // TODO: Table location needs to happen so we can swap
        //const tableRange = locator.locate(editor.document, editor.selection.start.line);
        const tableRange = new vscode.Range(new vscode.Position(res.Pos.Row,res.Pos.Col), new vscode.Position(res.End.Row, res.End.Col))
        await editor.edit(e => e.replace(tableRange, res.Msg.trimEnd()));
    }
    });
    }
    if (output != "") {
        Log.get().log(output);
        vscode.window.showInformationMessage("Exec All Tables: [" + passed + " pass /" + total + " tot]")
    }
}

export async function getRandomTableRow(): Promise<void> {
    const names = await ODb.tableNames();
    let tableName = "";
    Log.get().log("HELLO WORLD");
    if (names && names.Ok) {
        Log.get().log(names);
        tableName = await vscode.window.showQuickPick(names.NamedTables)
    }
    const output = await ODb.tableRandomRow(tableName);
    if (output && output.Ok) {
        let editor = vscode.window.activeTextEditor;
        const pos = editor.selection.active;
        await editor.edit(e => e.insert(pos, output.Msg.trimEnd()));
    }
}

export async function getTableNames(): Promise<void> {
    const output = await ODb.tableNames();
    if (output && output.Ok) {
        let editor = vscode.window.activeTextEditor;
        const pos = editor.selection.active;
        await editor.edit(e => e.insert(pos, output.NamedTables.trimEnd()));
    }
}

