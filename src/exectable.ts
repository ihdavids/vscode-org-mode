
import * as vscode from 'vscode';
import './duration';
import {ODb} from "./db"
import { Sets } from './sets';
import { Parser } from './parser';
import { Log } from './log';
import { locator } from './tables/commands';


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
    const ress: any = await ODb.execAllTable(fname);
    if (ress) {
        ress.forEach(async res => {
    if (!res.Ok) {
        Log.get().error("  > EXECT ERROR: ", JSON.stringify(res))
        vscode.window.showErrorMessage("ERROR failed to exec table\n>> " + res.Msg)
    } else {
        Log.get().log("EXECT SUCCESS: ");
        Log.get().log("EXECT        : ");
        Log.get().log(res.Msg);
        let editor = vscode.window.activeTextEditor;
        vscode.window.showInformationMessage("ExecTable success: ", res.Msg )

        // TODO: Table location needs to happen so we can swap
        //const tableRange = locator.locate(editor.document, editor.selection.start.line);
        const tableRange = new vscode.Range(new vscode.Position(res.Pos.Row,res.Pos.Col), new vscode.Position(res.End.Row, res.End.Col))
        await editor.edit(e => e.replace(tableRange, res.Msg.trimEnd()));
    }
    });
    }
}

