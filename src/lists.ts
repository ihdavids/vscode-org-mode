
import * as utils from "./utils";
import * as vscode from "vscode";
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";
import { resolve } from "url";

let numlineRe = /^\s*(?<num>[0-9]+)(?<sep>[.)])(?<data>\s+(([^:]+\s+)(::))?.*)/;
enum NumMatches
{
    num  = 1,
    sep  = 2,
    data = 3
}

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

function updateLine(doc: TextEditor, pos: Position = null)
{
    if(!pos)
    {
        pos = doc.selection.active;
    }
    let crow = pos.line;
    let parent : Position = utils.findParentByIndent(doc.document, pos);
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
                let num : number = +m[NumMatches.num];
                if(num != cur)
                {
                    let region = doc.document.lineAt(r).range;
                    edit.replace(region, `${curIndent}${cur}${m[NumMatches.sep]}${m[NumMatches.data]}`);
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
    let lineRe = /^\s*[0-9a-zA-Z]/;
    let parent : Position = utils.findParentByIndentAndLineRe(doc.document, pos, lineRe);
    let prow : number = parent.line;
    let [children, erow] = findChildren(doc.document, pos);
    let cur = 1;

    // Skip empty lines at the start.
    let line = doc.document.lineAt(prow+1).text;
    while(line.trim().length <= 0)
    {
        prow += 1;
        line = doc.document.lineAt(prow+1).text;
    }

    let curIndent : string = utils.getIndent(doc.document.lineAt(prow+1).text);
    let curLen    = curIndent.length;
    let indentStack = [];
    let sep = '.';
    let seenOnce = false;

    doc.edit((edit) => {
    for(let r = prow + 1; r <= erow; ++r)
    {
        if( r >= doc.document.lineCount)
        {
            break;
        }
        // trim empty lines in the mid.
        let line = doc.document.lineAt(r).text;
        if(line.trim().length <= 0)
        {
            continue;
        }
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
                seenOnce = true;
                let num : number = +m[NumMatches.num];
                let sep : string = m[NumMatches.sep];
                if(num != cur)
                {
                    let region = doc.document.lineAt(r).range;
                    edit.replace(region, `${curIndent}${cur}${m[NumMatches.sep]}${m[NumMatches.data]}`);
                }
                cur += 1;
            }
            else
            {
                // We will not append if we haven't see anything yet.
                if(seenOnce)
                {
                    let point  = new Position(r, 0);
                    edit.insert(point,`${curIndent}${cur}${sep} \n`);
                    let npos : Position = new Position(point.line, point.character + (curIndent.length + 3)); 
                    doc.selection = new Selection(npos, npos);
                    return updateLine(doc, point);
                }
            }
        }
        else
        {
            let point  = new Position(r,0);
            edit.insert(point,`${curIndent}${cur}${sep} \n`);
            let npos : Position = new Position(point.line, point.character + (curIndent.length + 3)); 
            doc.selection = new Selection(npos, npos);
            return updateLine(doc, point);
        }
    } // for
    // Okay we didn't insert, have to now
    let lastRow = doc.document.lineCount;
    if(erow >= lastRow)
    {
        let curLineText = doc.document.lineAt(lastRow-1);
        let point       = new Position(lastRow-1, Math.max(curLineText.text.length, 0));
        edit.insert(point, `\n${curIndent}${cur}${sep} `);
        let npos : Position = new Position(point.line+1, (curIndent.length + 3)); 
        doc.selection = new Selection(npos, npos);
        //return updateLine(doc, point);
    }
    else
    {
        let point  = new Position(erow, 0);
        let line   = doc.document.lineAt(erow).text;
        let newLine = '';
        if(line.length > 0)
        {
            newLine = '\n';
        }
        edit.insert(point,`${curIndent}${cur}${sep} ${newLine}`);
        let npos : Position = new Position(point.line, point.character + (curIndent.length + 3)); 
        doc.selection = new Selection(npos, npos);
        return updateLine(doc, point);
    }
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
