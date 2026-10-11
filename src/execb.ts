
import * as vscode from 'vscode';
import './duration';
import {ODb} from "./db"
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
    const doc = vscode.window.activeTextEditor.document;
    const row = vscode.window.activeTextEditor.selection.active.line;
    // The server runs what is on disk, so the line has to mean the same there.
    if (doc.isDirty) {
        await doc.save();
    }
    // Source blocks, #+CALL: and inline code go through babel. /execb is what
    // is left for dynamic blocks, which babel finds nothing to run in.
    let src: any = doc.fileName;
    let res: any = await ODb.babelExec(doc.fileName, row);
    if (res && (!res.Ran || res.Ran.length === 0)) {
        src = await ODb.getHashTarget();
        const dyn: any = await ODb.execBlock(src, row);
        // Not a dynamic block either: babel says why better than /execb does.
        if (dyn && dyn.Ok) {
            res = dyn;
        }
    }
    if (!res) {
        return;
    }
    if (!res.Ok) {
        Log.get().error("EXECB: ", src);
        Log.get().error("  > EXECB ERROR: ", JSON.stringify(res))
        vscode.window.showErrorMessage('Could not run the block: ' + (res.Msg || 'the orgs server did not say why'));
    } else {
        Log.get().log("EXECB RESULT: ", src);
        vscode.window.setStatusBarMessage('$(check) Ran' + (res.Msg ? ': ' + res.Msg : ''), 4000);
    }
}


