import * as vscode from 'vscode';
import * as Datetime from './simple-datetime';
import * as Utils from './utils';
import { Sets } from './sets';
import {ODb} from "./db"
import { Log } from './log';

export function insertTimestamp(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const document = Utils.getActiveTextEditorEdit();
    const cursorPos = Utils.getCursorPosition();
    
    const dateObject = Datetime.currentDate();
    const dateString = Datetime.buildDateString(dateObject);

    edit.insert(cursorPos, dateString);
}

class TimerIcon {
    // https://code.visualstudio.com/api/references/icons-in-labels
    public colors: string[];
    private statusVar: vscode.StatusBarItem;
    private nextColor: number;
    private timer: NodeJS.Timer;

    constructor() {
        this.colors = ["red","black"];
    }

    public start() {
        this.statusVar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,100);
        this.statusVar.color = this.colors[0];
        this.nextColor = 0;
        this.statusVar.text = "$(clock~spin)";
        this.statusVar.tooltip = "Org Mode Clock Running...";
        let colorChange = () => {
            this.nextColor = 1 - this.nextColor; 
            this.statusVar.color=this.colors[this.nextColor];
        }
        this.timer = setInterval(colorChange, 1000);
        this.statusVar.show();
    }

    public stop() {
        if (this.statusVar) {
            clearInterval(this.timer);
            this.statusVar.hide();
        }
    }
}
let clockIcon: TimerIcon = new TimerIcon();

export async function clockIn(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const src = await ODb.getHashTarget();
    const res = await ODb.clockIn(src);
    if (!res.Ok) {
        Log.get().error("CLOCK IN: ", src);
        Log.get().error("  > CLOCK IN ERROR: ", JSON.stringify(res))
    } else {
        Log.get().log("CLOCK IN RESULT: ", res, src);
        clockIcon.start();
    }
    /*
    const document = Utils.getActiveTextEditorEdit();
    const cursorPos = Utils.getCursorPosition();
    const line = Utils.getLine(document, cursorPos);

    if (line.indexOf('CLOCK:') === -1) {
        edit.insert(cursorPos, 'CLOCK: ');
    }
    
    insertDateTime(edit, cursorPos);
    */
}

export async function clockOut(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const res = await ODb.clockOut();
    if (!res.Ok) {
        Log.get().error("CLOCK OUT: ");
        Log.get().error("  > CLOCK OUT ERROR: ", JSON.stringify(res))
    } else {
        Log.get().log("CLOCK OUT RESULT: ", res);
        clockIcon.stop();
    }
    /*
    const document = Utils.getActiveTextEditorEdit();
    const cursorPos = Utils.getCursorPosition();
    const line = Utils.getLine(document, cursorPos);

    const separator = Sets.clockInOutSeparator;
    const separatorIndex = line.indexOf(separator);
    if (separatorIndex !== -1) {
        const initPos = new vscode.Position(cursorPos.line, separatorIndex);
        const endPos = new vscode.Position(cursorPos.line, line.length);
        const range = new vscode.Range(initPos, endPos);
        edit.replace(range, '');
    }
    edit.insert(cursorPos, separator)
    insertDateTime(edit, cursorPos);
    */
}

export async function clockActive(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const res = await ODb.clockActive();
    if (!res.Ok) {
        Log.get().error("CLOCK ACTIVE: ");
        Log.get().error("  > CLOCK ACTIVE ERROR: ", JSON.stringify(res))
    } else {
        Log.get().log("CLOCK ACTIVE RESULT: ", res);
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
