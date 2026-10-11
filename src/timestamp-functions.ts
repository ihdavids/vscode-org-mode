import * as vscode from 'vscode';
import * as Datetime from './simple-datetime';
import * as Utils from './utils';
import { Sets } from './sets';
import {ODb} from "./db"
import { Log } from './log';
import { refreshClock } from './time';
import { settled } from './org-files';

export function insertTimestamp(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const document = Utils.getActiveTextEditorEdit();
    const cursorPos = Utils.getCursorPosition();
    
    const dateObject = Datetime.currentDate();
    const dateString = Datetime.buildDateString(dateObject);

    edit.insert(cursorPos, dateString);
}

// The server writes the LOGBOOK, so the file is saved first; the status bar
// clock (time.ts) shows what is running.
export async function clockIn(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const doc = textEditor.document;
    if (doc.isDirty && !await doc.save()) {
        return;
    }
    const src = await ODb.getHashTarget();
    const res = await ODb.clockIn(src);
    if (!res || !res.Ok) {
        Log.get().error("CLOCK IN: ", src);
        Log.get().error("  > CLOCK IN ERROR: ", JSON.stringify(res));
        vscode.window.showErrorMessage('Clock in failed: ' + (res && res.Msg || 'the orgs server did not answer'));
    }
    await settled([doc.fileName]);
    await refreshClock();
}

export async function clockOut(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const doc = textEditor && textEditor.document;
    if (doc && doc.isDirty && !await doc.save()) {
        return;
    }
    const res = await ODb.clockOut();
    if (!res || !res.Ok) {
        Log.get().error("CLOCK OUT: ");
        Log.get().error("  > CLOCK OUT ERROR: ", JSON.stringify(res));
        vscode.window.showErrorMessage('Clock out failed: ' + (res && res.Msg || 'the orgs server did not answer'));
    }
    await settled(vscode.workspace.textDocuments.filter(d => d.languageId === 'org').map(d => d.uri.fsPath));
    await refreshClock();
}

// Whether the clock is running, and since when.
export async function clockActive(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const res: any = await ODb.clockActive();
    if (!res) {
        return;
    }
    if (res.Active) {
        const since = new Date(res.Time.Start);
        vscode.window.showInformationMessage(`The clock is running on "${String(res.Target.Id).split('::').pop()}" since ${since.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`, 'Go there')
            .then(go => go && vscode.commands.executeCommand('org.jumpToClock'));
    } else {
        vscode.window.showInformationMessage('The clock is not running.');
    }
}

export function updateClock(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const document = Utils.getActiveTextEditorEdit();
    const cursorPos = Utils.getCursorPosition();
    const line = Utils.getLine(document, cursorPos);
    
    const clockTotal = Datetime.getClockTotal(line);
    if (!clockTotal) {
        vscode.window.showErrorMessage('You need two timestamps to update the clock total.');
        return;
    }
    
    const separator = Sets.clockTotalSeparator;
    const separatorIndex = line.indexOf(separator);
    if (separatorIndex !== -1) {
        const initPos = new vscode.Position(cursorPos.line, separatorIndex);
        const endPos = new vscode.Position(cursorPos.line, line.length);
        const range = new vscode.Range(initPos, endPos);
        edit.replace(range, '');
    }
    edit.insert(cursorPos, separator)
    edit.insert(cursorPos, clockTotal);
}

function insertDateTime(edit: vscode.TextEditorEdit, cursorPos: vscode.Position) {
    const dateTimeObject = Datetime.currentDateTime();
    const dateTimeString = Datetime.buildDateTimeString(dateTimeObject);

    edit.insert(cursorPos, dateTimeString);
}
