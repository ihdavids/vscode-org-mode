
import * as utils from "./utils";
import * as checkbox from "./checkbox";
import * as list from "./lists";
import * as vscode from "vscode";
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";

export function addDoWhatIMean(doc: TextEditor) 
{
    let pos : Position = doc.selection.active;
    let line : string  = doc.document.lineAt(pos).text;
    // Checkbox list
    if(/^\s*[+-] \[[xX -]\]/.test(line))
    {
        checkbox.insertCheckboxCommand(doc);
    }
    // Numbered list
    else if(/^\s*[0-9]+[.)]/.test(line))
    {
        list.appendNumberedListCommand(doc);
    }
}