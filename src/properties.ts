import * as vscode from "vscode"
import * as utils from "./utils"
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";

class OrgDrawer
{
    constructor(start: number, end: number, name: string)
    {
        this.name = name;
        this.region = new Range(new Position(start,0), new Position(end,0));
    }
    region : Range;
    name   : string;
};

let sdcRe = /^\s*(SCHEDULED|DEADLINE|CLOSED)[:]/

function findPropertyDrawer(doc: TextEditor, drawer: string = ":PROPERTIES:", pos: Position = null) : OrgDrawer
{
    if(pos == null)
    {
        pos = doc.selection.active;   
    }
    let start: Position = utils.findBeginningOfSection(doc.document, pos, "*");
    let end: Position   = utils.findEndOfContent(doc.document, start, "*");
    let drawerReStr = `^\\s*${drawer}\\s*$`;
    let drawerRe = new RegExp(drawerReStr);
    let drawerEndRe = /^\s*:END:\s*$/;
    let haveProp = -1;
    for(let i = start.line; i <= end.line; ++i)
    {
        let line = doc.document.lineAt(i).text;
        if(haveProp == -1 && drawerRe.test(line))
        {
            haveProp = i;
        }
        else if(haveProp && drawerEndRe.test(line))
        {
            return new OrgDrawer(haveProp, i, drawer);
        }
    }
    return null;
}

async function insertPropertyDrawerIfNotPresent(doc: TextEditor, drawer: string = ":PROPERTIES:", pos: Position = null)
{
    if(pos == null)
    {
        pos = doc.selection.active;   
    }
    let prop: OrgDrawer = findPropertyDrawer(doc, drawer, pos);
    if(prop)
    {
        return prop;
    }
    let start: Position = utils.findBeginningOfBlock(doc.document, pos);
    let end: Position   = utils.findEndOfBlock(doc.document, start);
    let i = start.line + 1;
    for(; i < end.line; ++i)
    {
        let line = doc.document.lineAt(i).text;
        if(!sdcRe.test(line))
        {
            break;
        }
    }
    if(i >= end.line)
    {
        i = start.line + 1;
    }

    return doc.edit( (edit) => {
        let p = new Position(i, 0);
        edit.insert(p, drawer + "\n:END:\n");
    }).then( () => {
        return new OrgDrawer(i, i+1, drawer);
    });
}

export function insertPropertyDrawerCommand(doc: TextEditor)
{
    return insertPropertyDrawerIfNotPresent(doc);
}