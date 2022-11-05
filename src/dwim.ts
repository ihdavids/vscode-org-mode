
import * as utils from "./utils";
import * as checkbox from "./checkbox";
import * as list from "./lists";
import * as vscode from "vscode";
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";
import getCursorContext, { DATE, TODO, LIST, CHECK } from './cursor-context';

export function addDoWhatIMean(doc: TextEditor, edit: vscode.TextEditorEdit) 
{
    //let pos : Position = doc.selection.active;
    //let line : string  = doc.document.lineAt(pos).text;
    let ctx = getCursorContext(doc,edit, true);
    if (!ctx) {
        vscode.window.showErrorMessage("No context to modify");
        return;
    }

    switch (ctx.dataLabel) {
        case DATE: break; // TODO
        case TODO: break; // TODO
        case LIST:  list.appendNumberedListCommand(doc);
        case CHECK: checkbox.insertCheckboxCommand(doc);
    }
}

export function toggleDoWhatIMean(doc: TextEditor, edit: vscode.TextEditorEdit)
{
    /*
    let pos : Position = doc.selection.active;
    let line : string  = doc.document.lineAt(pos).text;
    // Checkbox list
    if(/^\s*[+-] \[[xX -]\]/.test(line))
    {
        checkbox.toggleCheckboxCommand(doc);
    }
    */
    let ctx = getCursorContext(doc,edit, true);
    if (!ctx) {
        vscode.window.showErrorMessage("No context to modify");
        return;
    }

    switch (ctx.dataLabel) {
        case DATE: break; // TODO
        case TODO: break; // TODO
        case LIST:  break;
        case CHECK: checkbox.toggleCheckboxCommand(doc);
    }
}