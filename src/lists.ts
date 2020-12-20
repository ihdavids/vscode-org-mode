
import * as utils from "./utils";
import * as vscode from "vscode";
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";
import { resolve } from "url";

let numlineRe = /^\s*(?<num>[0-9]+)(?<sep>[.)])(?<data>\s+(([^:]+\s+)(::))?.*)/;

// Returns a list of child checkbox line numbers (Do I want that to be positions)?
function findChildren(doc : TextDocument, pos: Position) : any []
{
    let row = pos.line;
    let indent = utils.getIndent(doc.lineAt(row).text).length;
    let lastRow = doc.lineCount;
    let childIndent = null;
    let children = [];
    row += 1;
    while(row < lastRow)
    {
        let content = doc.lineAt(row);
        if(content.text.trim().startsWith("*"))
        {
            break;
        }
        if(numlineRe.test(content.text))
        {
            let curIndent = utils.getIndent(content.text).length;
            if(curIndent <= indent)
            {
                break;
            }
            if(childIndent == null)
            {
                childIndent = curIndent;
            }
            if(curIndent == childIndent)
            {
                children.push(new Position(row,0));            
            }
        }
        row += 1;
    }
    return [children, row];
}

function updateLine(doc: TextEditor)
{
    let pos : Position = doc.selection.active;
    let crow = pos.line;
    let parent : Position = utils.findBeginningOfSection(doc.document, pos, "*");
    let prow : number = parent.line;
    let [children, erow] = findChildren(doc.document, pos);
    let cur = 1;

    let curIndent : string = utils.getIndent(doc.document.lineAt(prow).text);
    let curLen    = curIndent.length;
    let indentStack = [];

    doc.edit((edit) => {
    for(let r = prow + 1; r < erow; ++r)
    {
        let line = doc.document.lineAt(r).text;
        let thisIndent = utils.getIndent(line);
        let thisLen    = thisIndent.length;
        if(thisLen > curLen)
        {
            indentStack.push([curIndent,curLen, cur]);
            curIndent = thisIndent;
            curLen    = thisLen;
            cur       = 1;
        }
        while(thisLen < curLen && indentStack.length > 0)
        {
            [curIndent, curLen, cur] = indentStack.pop();
        }
        if(thisLen == curLen)
        {
            let m = line.match(numlineRe);
            if(m)
            {
                let num : number = +m['num'];
                if(num != cur)
                {
                    let region = doc.document.lineAt(r).range;
                    edit.replace(region, `${curIndent}${cur}${m['sep']}${m['data']}`);
                }
                cur += 1;
            }
        }
    }
    });
}

function appendLine(doc: TextEditor)
{
    let pos : Position = doc.selection.active;
    let crow = pos.line;
    let parent : Position = utils.findBeginningOfSection(doc.document, pos, "*");
    let prow : number = parent.line;
    let [children, erow] = findChildren(doc.document, pos);
    let cur = 1;

    let curIndent : string = utils.getIndent(doc.document.lineAt(prow).text);
    let curLen    = curIndent.length;
    let indentStack = [];
    let sep = '.';

    doc.edit((edit) => {
    for(let r = prow + 1; r <= erow; ++r)
    {
        let line = doc.document.lineAt(r).text;
        let thisIndent = utils.getIndent(line);
        let thisLen    = thisIndent.length;
        if(thisLen > curLen)
        {
            indentStack.push([curIndent,curLen, cur]);
            curIndent = thisIndent;
            curLen    = thisLen;
            cur       = 1;
        }
        while(thisLen < curLen && indentStack.length > 0)
        {
            [curIndent, curLen, cur] = indentStack.pop();
        }
        if(thisLen == curLen)
        {
            let m = line.match(numlineRe);
            if(m)
            {
                let num : number = +m['num'];
                let sep : string = m['sep'];
                if(num != cur)
                {
                    let region = doc.document.lineAt(r).range;
                    edit.replace(region, `${curIndent}${cur}${m['sep']}${m['data']}`);
                }
                cur += 1;
            }
            else
            {
                let point  = doc.document.positionAt(r);
                edit.insert(point,`${curIndent}${cur}${sep} \n`);
                doc.selection.active = new Position(point.line, point.character + (curIndent.length + 3));
                return updateLine(doc);
            }
        }
        else
        {
            let point  = doc.document.positionAt(r);
            edit.insert(point,`${curIndent}${cur}${sep} \n`);
            doc.selection.active = new Position(point.line, point.character + (curIndent.length + 3));
            return updateLine(doc);
        }
    } // for
    // Okay we didn't insert, have to now
    let lastRow = doc.document.lineCount;
    if(erow > lastRow)
    {
        let point  = doc.document.positionAt(lastRow);
        edit.insert(point,'\n');
    }
    let point  = doc.document.positionAt(erow);
    let line   = doc.document.lineAt(erow).text;
    let newLine = '';
    if(line.length > 0)
    {
        newLine = '\n';
    }
    edit.insert(point,`${curIndent}${cur}${sep} ${newLine}`);
    doc.selection.active = new Position(point.line, point.character + (curIndent.length + 3));
    return updateLine(doc);
    }); // edit
}

export function isNumberedLine(doc : TextDocument, pos: Position)
{
    let content = doc.lineAt(pos).text;
    return numlineRe.test(content);
}

export function updateNumberedListCommand(doc: TextEditor)
{
    updateLine(doc);
}

export function appendNumberedListCommand(doc: TextEditor)
{
    appendLine(doc);
}
