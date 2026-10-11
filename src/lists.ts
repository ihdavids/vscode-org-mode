
import * as utils from "./utils";
import { TextDocument, Position, TextEditor, Selection } from "vscode";

const numlineRe = /^\s*(?<num>[0-9]+)(?<sep>[.)])(?<data>\s+(([^:]+\s+)(::))?.*)/;
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
    const indent = utils.getIndent(doc.lineAt(row).text).length;
    const lastRow = doc.lineCount;
    let childIndent = null;
    const children = [];
    row += 1;
    while(row < lastRow)
    {
        const content = doc.lineAt(row);
        if(content.text.trim().startsWith("*"))
        {
            break;
        }
        if(numlineRe.test(content.text))
        {
            const curIndent = utils.getIndent(content.text).length;
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
    const crow = pos.line;
    const lineRe = /^\s*[0-9a-zA-Z]/;
    const parent : Position = utils.findParentByIndentAndLineRe(doc.document, pos, lineRe);
    let prow : number = parent.line;
    const [children, erow] = findChildren(doc.document, pos);
    let cur = 1;
    let seenOnce = false;
    
    // Skip empty lines at the start.
    let line = doc.document.lineAt(prow+1).text;
    while(line.trim().length <= 0)
    {
        prow += 1;
        line = doc.document.lineAt(prow+1).text;
    }

    let curIndent : string = utils.getIndent(doc.document.lineAt(prow+1).text);
    let curLen    = curIndent.length;
    const minLen    = curLen;
    const indentStack = [];

    doc.edit((edit) => {
    for(let r = prow + 1; r <= doc.document.lineCount; ++r)
    {
        if(r >= doc.document.lineCount)
        {
            break;
        }
        const line = doc.document.lineAt(r).text;
        const thisIndent = utils.getIndent(line);
        const thisLen    = thisIndent.length;
        if(thisLen > curLen)
        {
            indentStack.push([curIndent,curLen, cur]);
            curIndent = thisIndent;
            curLen    = thisLen;
            cur       = 1;
        }
        // Break out when we see crap.
        if(seenOnce && (!lineRe.test(line) || thisLen < minLen))
        {
            break;   
        }
        while(thisLen < curLen && indentStack.length > 0)
        {
            [curIndent, curLen, cur] = indentStack.pop();
        }
        if(thisLen == curLen)
        {
            const m = line.match(numlineRe);
            if(m)
            {
                seenOnce = true;
                const num : number = +m[NumMatches.num];
                if(num != cur)
                {
                    const region = doc.document.lineAt(r).range;
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
    const pos : Position = doc.selection.active;
    const crow = pos.line;
    const lineRe = /^\s*[0-9a-zA-Z]/;
    const parent : Position = utils.findParentByIndentAndLineRe(doc.document, pos, lineRe);
    let prow : number = parent.line;
    const [children, erow] = findChildren(doc.document, pos);
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
    const indentStack = [];
    const sep = '.';
    let seenOnce = false;

    doc.edit((edit) => {
    for(let r = prow + 1; r <= erow; ++r)
    {
        if( r >= doc.document.lineCount)
        {
            break;
        }
        // trim empty lines in the mid.
        const line = doc.document.lineAt(r).text;
        if(line.trim().length <= 0)
        {
            continue;
        }
        const thisIndent = utils.getIndent(line);
        const thisLen    = thisIndent.length;
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
            const m = line.match(numlineRe);
            if(m)
            {
                seenOnce = true;
                const num : number = +m[NumMatches.num];
                const sep : string = m[NumMatches.sep];
                if(num != cur)
                {
                    const region = doc.document.lineAt(r).range;
                    edit.replace(region, `${curIndent}${cur}${m[NumMatches.sep]}${m[NumMatches.data]}`);
                }
                cur += 1;
            }
            else
            {
                // We will not append if we haven't see anything yet.
                if(seenOnce)
                {
                    const point  = new Position(r, 0);
                    edit.insert(point,`${curIndent}${cur}${sep} \n`);
                    const npos : Position = new Position(point.line, point.character + (curIndent.length + 3)); 
                    doc.selection = new Selection(npos, npos);
                    return updateLine(doc, point);
                }
            }
        }
        else
        {
            const point  = new Position(r,0);
            edit.insert(point,`${curIndent}${cur}${sep} \n`);
            const npos : Position = new Position(point.line, point.character + (curIndent.length + 3)); 
            doc.selection = new Selection(npos, npos);
            return updateLine(doc, point);
        }
    } // for
    // Okay we didn't insert, have to now
    const lastRow = doc.document.lineCount;
    if(erow >= lastRow)
    {
        const curLineText = doc.document.lineAt(lastRow-1);
        const point       = new Position(lastRow-1, Math.max(curLineText.text.length, 0));
        edit.insert(point, `\n${curIndent}${cur}${sep} `);
        const npos : Position = new Position(point.line+1, (curIndent.length + 3)); 
        doc.selection = new Selection(npos, npos);
        //return updateLine(doc, point);
    }
    else
    {
        const point  = new Position(erow, 0);
        const line   = doc.document.lineAt(erow).text;
        let newLine = '';
        if(line.length > 0)
        {
            newLine = '\n';
        }
        edit.insert(point,`${curIndent}${cur}${sep} ${newLine}`);
        const npos : Position = new Position(point.line, point.character + (curIndent.length + 3)); 
        doc.selection = new Selection(npos, npos);
    }
    }).then(() => {
        updateLine(doc, pos);
    }); // edit
}

export function isNumberedLine(doc : TextDocument, pos: Position)
{
    const content = doc.lineAt(pos).text;
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
