
import * as vscode from 'vscode';
import {ODb} from "./db"


export async function showAgenda(doc: vscode.TextEditor) {
    console.log("SHOW AGENDA SHOWN");
    ODb.agenda();
}