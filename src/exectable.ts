
import * as vscode from 'vscode';
import './duration';
import {ODb} from "./db"
import { Sets } from './sets';
import { Parser } from './parser';
import { Log } from './log';


export async function execTable(): Promise<void> {
    const src = await ODb.getHashTarget();
    const row = vscode.window.activeTextEditor.selection.active.line;
    const res: any = await ODb.execTable(src, row);
    if (!res.Ok) {
        Log.get().error("EXECT: ", src);
        Log.get().error("  > EXECT ERROR: ", JSON.stringify(res))
        vscode.window.showErrorMessage("ERROR failed to exec table", res.Msg )
    } else {
        Log.get().log("EXECT SUCCESS: ", src);
        Log.get().log("EXECT        : ");
        Log.get().log(res.Msg);
        vscode.window.showInformationMessage("ExecTable success: ", res.Msg )
    }
}


