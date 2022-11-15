
import * as utils from "./utils";
import * as checkbox from "./checkbox";
import * as list from "./lists";
import * as vscode from "vscode";
import { Sets } from './sets';
import { Uri, window, Disposable } from 'vscode';
import { QuickPickItem } from 'vscode';
import { workspace } from 'vscode';
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";
import getCursorContext, { DATE, TODO, LIST, CHECK, NODE, IContextData } from './cursor-context';
import * as header from './header-functions'

export function addDoWhatIMean(doc: TextEditor, edit: vscode.TextEditorEdit) 
{
    //let pos : Position = doc.selection.active;
    //let line : string  = doc.document.lineAt(pos).text;
    let ctx = getCursorContext(doc,edit, {includeTodo: false, includeLists: true});
    if (!ctx) {
        vscode.window.showErrorMessage("No context to modify");
        return;
    }

    switch (ctx.dataLabel) {
        case DATE: break; // TODO
        case TODO: break; // TODO
        case NODE: insertNewNode(ctx, doc, edit); break;
        case LIST:  list.appendNumberedListCommand(doc); break;
        case CHECK: checkbox.insertCheckboxCommand(doc); break;
    }
}

function insertNewNode(ctx: IContextData, doc: TextEditor, edit: vscode.TextEditorEdit)
{
    let stars: string = "*".repeat(ctx.info);

    let lineCtx: string = utils.getLine(utils.getActiveTextEditorEdit(), ctx.range.end);
    if (lineCtx.length > 0) {
        edit.insert(ctx.range.end,"\n" + stars + " ");
    } else {
        edit.insert(ctx.range.end, stars + " ");
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
    let ctx = getCursorContext(doc,edit, {includeTodo: false, includeLists: true});
    if (!ctx) {
        vscode.window.showErrorMessage("No context to modify");
        return;
    }

    switch (ctx.dataLabel) {
        case DATE: break; // TODO
        case TODO: header.chooseAndChangeTodo(ctx, doc, edit); break;
        case LIST:  break;
        case CHECK: checkbox.toggleCheckboxCommand(doc);
    }
}
