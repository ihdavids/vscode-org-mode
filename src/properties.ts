import * as vscode from "vscode"
import * as utils from "./utils"
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";

class OrgDrawer
{
    constructor(start: number, end: number, name: string, indent: string)
    {
        this.name = name;
        this.region = new Range(new Position(start,0), new Position(end,0));
        this.indent = indent;
    }
    region : Range;
    name   : string;
    indent : string;
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
    let m = doc.document.lineAt(start).text.match(/^(\s*\*+ )/);
    let indent = "";
    if(m)
    {
        indent = " ".repeat(m[1].length);
    }
    for(let i = start.line; i <= end.line; ++i)
    {
        let line = doc.document.lineAt(i).text;
        if(haveProp == -1 && drawerRe.test(line))
        {
            haveProp = i;
        }
        else if(haveProp && drawerEndRe.test(line))
        {
            return new OrgDrawer(haveProp, i, drawer, indent);
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
    let m = doc.document.lineAt(start).text.match(/^(\s*\*+ )/);
    let indent = "";
    if(m)
    {
        indent = " ".repeat(m[1].length);
    }
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
        edit.insert(p, indent + drawer + "\n" + indent + ":END:\n");
    }).then( () => {
        return new OrgDrawer(i, i+1, drawer, indent);
    });
}

async function findProperty(doc: TextEditor, drawer: string=":PROPERTIES:", key: string) : Promise<[number, string, string]>
{
    let prop: OrgDrawer = findPropertyDrawer(doc, drawer);
    if(prop)
    {
        for(let l = prop.region.start.line + 1; l < prop.region.end.line; ++l)
        {
            let line = doc.document.lineAt(l).text;
            let m = line.match(/^\s*:([^:]):\s*(.*)+/);
            if(m)
            {
                let name = m[1].trim();
                if(name != "END" && name == key)
                {
                    let value = m[2].trim();
                    return [l,name,value];                    
                }
            }
        }
    }
    return null;
}

async function addProperty(doc: TextEditor, key: string, value: string)
{
    let prop : OrgDrawer = await insertPropertyDrawerIfNotPresent(doc);
    if(prop)
    {
        return doc.edit( (edit) => {
            let pos : Position = new Position(prop.region.start.line + 1, 0);
            edit.insert(pos , prop.indent + "  :" + key + ": " + value + "\n");
            return pos;
        });
    }
    return null;
}

async function updateProperty(doc: TextEditor, key: string, value: string)
{
    let prop = await findProperty(doc, ":PROPERTIES:", key);
    if(prop)
    {
        return doc.edit( (edit) => {
            let pos: Position = new Position(prop[0],0);
            edit.replace(new Range(pos, new Position(prop[0],utils.lineLen(doc.document,pos))), ":" + key + ": " + value);
        });
    }
    else
    {
        return await addProperty(doc, key, value);
    }
}

async function removeProperty(doc: TextEditor, key: string, value: string)
{
    let prop = await findProperty(doc, ":PROPERTIES:", key);
    if(prop)
    {
        return doc.edit( (edit) => {
            let pos: Position = new Position(prop[0],0);
            edit.replace(new Range(pos, new Position(prop[0] + 1,0)), "");
        });
    }
    return null;
}


export async function insertPropertyCommand(doc: TextEditor, edit: TextEditorEdit, key: string, value: string)
{
    if(!key)
    {
        key = await vscode.window.showInputBox({
            value: '',
            placeHolder: 'NAME',
        });
    }
    if(!value)
    {
        value = await vscode.window.showInputBox({
            value: '',
            placeHolder: 'VALUE',
        });
    }
    if(!key || key.trim().length <= 0)
    {
        return;
    }
    if(!value || value.trim().length <= 0)
    {
        return;
    }
    return updateProperty(doc, key, value);
}

export function insertPropertyDrawerCommand(doc: TextEditor)
{
    return insertPropertyDrawerIfNotPresent(doc);
}
