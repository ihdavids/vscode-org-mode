
import { join, parse } from 'path';
import * as vscode from 'vscode';
import { Page } from "./page";
import { Signal } from "./signal";
import * as Util from './utils';
import * as CC from './cursor-context';
import { OrgDuration } from './duration';
import './duration';
import * as Datetime from './simple-datetime';
import {ODb} from "./db"
import { Sets } from './sets';
import { Parser } from './parser';
import { Log } from './log';

// THESE DO NOT WORK! This is just an idea!

export async function dynamicEvalText(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const selectedCode = editor.document.getText(editor.selection);
        /*
        const code = `
        (async () => {
            const {Log} = await import('./log');
            ${selectedCode}
        })();
        `
        if (selectedCode) {
            const res = await eval(code);
            Log.get().log("RESULT: ", res);
        } else {
            vscode.window.showWarningMessage("No text selected.");
        }
        */
        if (selectedCode) {
            globalThis["Log"] = Log;
            const result = await Object.getPrototypeOf(async function() {}).constructor(`${selectedCode}`)();
            delete globalThis["Log"];
            //const res = await eval(code);
            Log.get().log("RESULT: ", result);
        } else {
            vscode.window.showWarningMessage("No text selected.");
        }
    } else {
        vscode.window.showWarningMessage("No active editor found.");
    }
}

export async function showFunctionNames(): Promise<void> {
    const getMethods = (obj) => Object.getOwnPropertyNames(obj).filter(item => typeof obj[item] === 'function')
    const methods = getMethods(globalThis)
    Log.get().log(methods);
}


export async function execBlock(): Promise<void> {
    const src = await ODb.getHashTarget();
    const row = vscode.window.activeTextEditor.selection.active.line;
    const res: any = await ODb.execBlock(src, row);
    if (!res.Ok) {
        Log.get().error("EXECB: ", src);
        Log.get().error("  > EXECB ERROR: ", JSON.stringify(res))
        vscode.window.showErrorMessage("ERROR failed to exec block", res.Msg )
    } else {
        Log.get().log("EXECB RESULT: ", src);
        vscode.window.showInformationMessage("Execb executed: ", res.Msg )
    }
}


