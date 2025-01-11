
import * as utils from "./utils";
import * as checkbox from "./checkbox";
import * as list from "./lists";
import * as vscode from "vscode";
import { Sets } from './sets';
//import { Uri, window, Disposable } from 'vscode';
//import { QuickPickItem } from 'vscode';
//import { workspace } from 'vscode';
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";
//import getCursorContext, { DATE, TODO, LIST, CHECK, NODE, IContextData, INodeData } from './cursor-context';
import * as header from './header-functions'
import { OrgExtension  } from "./extension";
import { Headline, OrgTypes, Link, Roll } from "./parser";
import * as links from "./links";

export function addDoWhatIMean(doc: TextEditor, edit: vscode.TextEditorEdit) 
{
    const node = OrgExtension.get().parser.find();
    if (node !== undefined) {
        switch(node.type) {
            case OrgTypes.Headline:  insertNewNode(<Headline>node, doc, edit);   break;
            case OrgTypes.CheckList: checkbox.insertCheckboxCommand(doc, edit);  break;
            case OrgTypes.NumList:   list.appendNumberedListCommand(doc);        break;
            case OrgTypes.Link:      links.jumpToLink(<Link>node,doc, edit);     break;
            case OrgTypes.Roll:      {
                var roll = <Roll>node;
                //edit.insert(doc.selection[0],roll.numDice)
                let expr = roll.getExpr();
                edit.replace(roll.range, expr);
                vscode.window.showInformationMessage("ROLL: " + expr);
                
            }
        }
    }
}

function insertNewNode(n: Headline, doc: TextEditor, edit: vscode.TextEditorEdit)
{
    let stars: string = "*".repeat(n.level);

    let endPos: vscode.Position =  new vscode.Position(n.range.end.line-1, 0);

    endPos = utils.eatEmptyLines(doc, endPos, n.range.start);
    let lineCtx: string = utils.getLine(utils.getActiveTextEditorEdit(), endPos);
    endPos = new vscode.Position(endPos.line, lineCtx.length);
    if (lineCtx.length > 0) {
        edit.insert(endPos,"\n" + stars + " ");
    } else {
        edit.insert(endPos, stars + " ");
    }
    utils.moveToEndOfLine(doc,endPos);
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
    const node = OrgExtension.get().parser.find();
    if (node !== undefined) {
        switch(node.type) {
            case OrgTypes.Headline:  header.chooseAndChangeTodo(doc, edit, <Headline>node);   break;
            case OrgTypes.CheckList: checkbox.toggleCheckboxCommand(doc, edit);  break;
        }
    }
}
