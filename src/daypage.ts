import * as vscode from 'vscode';
import * as path from 'path';
import {ODb} from "./db"
import {OrgExtension} from "./extension"
import * as fs from 'fs';

let curDay: Date = new Date();

function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function fileExists(filename): boolean {
    return fs.existsSync(filename);
}

export async function gotoDayPage(increment: number) {
    let maxTests = 60;
    while(maxTests) {
        maxTests -= 1;
        curDay = addDays(curDay, increment);
        let page = await ODb.getdaypage(curDay);
        console.log("DP", page);
        if (page != null && fileExists(page[0])) {
            let pageName = page[0];
            var openPath = vscode.Uri.file(pageName);
            console.log(openPath);
            vscode.workspace.openTextDocument(openPath).then(textDoc => {
                vscode.window.showTextDocument(textDoc);
            });
        }
    }
}

export async function prevDayPage(doc: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    gotoDayPage(-1);
}

export async function nextDayPage(doc: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    gotoDayPage(1);
}


export async function showDayPageToday(doc: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    let page = await ODb.daypage();
    curDay = new Date();
    console.log("DP", page);
    if (page != null) {
        let pageName = page[0];
        var openPath = vscode.Uri.file(pageName);
        console.log(openPath);
        vscode.workspace.openTextDocument(openPath).then(textDoc => {
            vscode.window.showTextDocument(textDoc);
        });
    }
}
