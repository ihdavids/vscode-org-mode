import * as vscode from 'vscode';
import {ODb} from "./db"
import {OrgExtension} from "./extension"
import * as fs from 'fs';

let curDay: Date = new Date();

function addDays(date, days) {
  const result = new Date(date);
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
        const page = await ODb.getdaypage(curDay);
        if (page != null && fileExists(page[0])) {
            const pageName = page[0];
            const openPath = vscode.Uri.file(pageName);
            const textDoc = await vscode.workspace.openTextDocument(openPath);
            if (textDoc) {
                await vscode.window.showTextDocument(textDoc);
                return;
            }
        }
    }
}

export async function prevDayPage(doc: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const inc = await ODb.getdaypageIncrement();
    gotoDayPage(-inc);
}

export async function nextDayPage(doc: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const inc = await ODb.getdaypageIncrement();
    gotoDayPage(inc);
}


export async function showDayPageToday(doc: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const page = await ODb.daypage();
    curDay = new Date();
    if (page != null && fileExists(page[0])) {
        const pageName = page[0];
        var openPath = vscode.Uri.file(pageName);
        vscode.workspace.openTextDocument(openPath).then(textDoc => {
            vscode.window.showTextDocument(textDoc);
        });
    } else {
        const page: any = await ODb.createdaypage();
        if (!Array.isArray(page)) {
            vscode.window.showErrorMessage('Could not make today\'s day page: ' + (page && page.Msg || page || 'the orgs server did not answer'));
            return;
        }
        if (page != null && fileExists(page[0])) {
            const pageName = page[0];
            var openPath = vscode.Uri.file(pageName);
            vscode.workspace.openTextDocument(openPath).then(textDoc => {
                vscode.window.showTextDocument(textDoc);
            });
        }
    }
}
