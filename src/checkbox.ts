import * as utils from "./utils";
import * as vscode from "vscode";
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";
import { resolve } from "url";


let summaryRe         = /(\[\d*[/%]\d*\])/;
let checkboxRe        = /(\[[xX -]\])/;
let checkboxLineRe    = /\s*[+-]?\s*(\[[xX -]\])\s+/;
let headingRe = /^[*]+ /;

function findParent(doc : TextDocument, pos: Position) : Position
{
    return utils.findBeginningOfSection(doc, pos, "*");
}

// Returns a list of child checkbox line numbers (Do I want that to be positions)?
function findChildren(doc : TextDocument, pos: Position) : Position[]
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
        if(checkboxRe.test(content.text))
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
    return children;
}

function findSiblings(doc: TextDocument, child : Position, parent: Position)
{
    let siblings = [];
    let row = parent.line;
    let parentIndent = utils.getIndent(doc.lineAt(row).text);
    let childIndent  = utils.getIndent(doc.lineAt(child).text);
    row += 1;
    while(row <= doc.lineCount)
    {
        let content : string = doc.lineAt(row).text;
        if(content.trim().length)
        {
            let curIndent = utils.getIndent(content);
            if(curIndent.length <= parentIndent.length)
            {
                // Indent same as parent found! exit out.
                break;
            }
            if(curIndent.length == childIndent.length)
            {
                siblings.push([row,content])                
            }
        }
        row += 1;
    }
    return siblings;
}

function getSummary(doc : TextDocument, pos: Position) : Range
{
    let row  = pos.line;
    let content = doc.lineAt(pos).text
    let m = summaryRe.exec(content)
    if(!m)
    {
        return null;
    }
    let start = m.index;
    let end = m.index + m[0].length;
    return new Range(new Position(row, start), new Position(row, end));
}

function getCheckbox(doc: TextDocument, pos: Position) : Range
{
    let row = pos.line;
    let content = doc.lineAt(pos).text;
    let m = checkboxRe.exec(content);
    if(!m)
    {
        return null;
    }
    let start = m.index;
    let end = m.index + m[0].length;
    return new Range(new Position(row, start), new Position(row, end));
}

enum CheckState
{
    Indeterminate,
    Unchecked,
    Checked,
    Error
}

function getCheckState(doc: TextDocument, pos: Position)
{
    let line = doc.lineAt(pos).text;
    if(line.indexOf('[-]') >= 0)
    {
        return CheckState.Indeterminate;
    }
    if(line.indexOf('[ ]') >= 0)
    {
        return CheckState.Unchecked;
    }
    if(line.indexOf('[X]') >= 0 || line.indexOf('[x]') >= 0)
    {
        return CheckState.Checked
    }
    return CheckState.Error
}

function getCheckChar(doc: TextDocument, state: CheckState)
{
    if(state == CheckState.Unchecked)
    {
        return ' ';
    }
    else if(state == CheckState.Checked)
    {
        return 'x';
    }
    else if(state == CheckState.Indeterminate)
    {
        return '-';
    }
    else
    {
        return 'E';
    }
}

function recalcSummary(doc: TextDocument, pos: Position) : number[]
{
    let children = findChildren(doc, pos);
    let numChildren = children.length;
    if(numChildren <= 0)
    {
        return [0,0];
    }
    let checkedChildren = children.filter( (child : Position, index: number, array: Position[]) => {
        return (getCheckState(doc, child) == CheckState.Checked);
    });
    let numChecked = checkedChildren.length;
    return [numChildren, checkedChildren.length];
}

function updateItemInChildren(doc: TextEditor, pos: Position, parentUpdate: boolean, children: Position[], index: number) : Thenable<boolean>
{
    if(index >= children.length)
    {
        return new Promise<boolean>((resolve,reject) => { return resolve(true); });
    }
    let rv : Thenable<boolean> = null;
    let child = children[index];
    let line = doc.document.lineAt(child);
    let summary = getSummary(doc.document, child);
    if(summary)
    {
        rv = updateLine(doc, child, false);
    }
    if(parentUpdate)
    {
        let parent = findParent(doc.document, pos);
        if(parent)
        {
            rv = updateLine(doc, parent, parentUpdate);                
        }
    }
    if(rv)
    {
        rv.then(
            (res) => {
                updateItemInChildren(doc, pos, parentUpdate, children, index + 1);
            }
        );
    }
}

function updateSummaryForLine(doc: TextEditor, pos: Position, parentUpdate: boolean) : Thenable<boolean>
{
    let [numChildren, numChecked] = recalcSummary(doc.document, pos);
    return updateSummary(doc, pos, numChecked, numChildren).then( (res2) => {
        let rv : Thenable<boolean> = new Promise<boolean>((resolve,reject) => { return resolve(true); });
        let children = findChildren(doc.document, pos);
        if(children.length > 0)
        {
            return updateItemInChildren(doc, pos, parentUpdate, children, 0);
        }
        return rv;
    });
}

function updateLine(doc: TextEditor, pos: Position, parentUpdate: boolean) : Thenable<boolean>
{
    if(!isCheckbox(doc.document, pos) && !isCheckboxSummary(doc.document, pos))
    {
        return new Promise( (resolve, reject) => { resolve(false); });
    }

    let [numChildren, numChecked] = recalcSummary(doc.document, pos);
    // No children to update
    if(numChildren <= 0)
    {
        return new Promise( (resolve, reject) => { resolve(false); });
    }
    // Update region checkbox
    let newState = CheckState.Unchecked;
    if(numChildren == numChecked)
    {
        newState = CheckState.Checked;
    }
    else
    {
        if(numChecked != 0)
        {
            newState = CheckState.Indeterminate;
        }        
        else
        {
            newState = CheckState.Unchecked;
        }
    }
    let oldState = getCheckState(doc.document, pos);
    if(oldState != newState)
    {
        return toggleCheckbox(doc, pos, newState).then( 
        (res) => 
        {
            return updateSummaryForLine(doc, pos, parentUpdate);
        });
    }
    else
    {
        return updateSummaryForLine(doc, pos, parentUpdate);
    }
}

function updateSummary(doc: TextEditor, pos: Position, numChecked: number, numChildren: number ) : Thenable<boolean>
{
    let summary = getSummary(doc.document, pos);
    if(!summary)
    {
        return new Promise( (resolve, reject) => { resolve(false); });
    }
    let line = doc.document.lineAt(pos).text;
   
    if(line.indexOf("%") >= 0)
    {
        return doc.edit( (edit) => {
            let percent = Math.floor(numChecked/numChildren*100)
            edit.replace(summary, `[${percent}%]`);
            //vscode.workspace.applyEdit(edit);
        });
    }
    else
    {
        return doc.edit( (edit) => {
            edit.replace(summary, `[${numChecked}/${numChildren}]`);
        });      
    }
}

function processChildren(doc: TextEditor, pos: Position, children: Position[], checked: CheckState, index: number ) : Thenable<boolean>
{
    if(index >= children.length)
    {
        return new Promise( (resolve, refuse) => { return resolve(true); });
    }
    let child = children[index];
    let rv = toggleCheckbox(doc, child, checked, false, true);
    rv.then(
        (res) =>
        {
            processChildren(doc, pos, children, checked, index + 1);
        }
    );
    return rv;
}

function toggleCheckbox(doc: TextEditor, pos: Position, checked : CheckState, recurseUp : boolean = false, recurseDown: boolean = false) : Thenable<boolean>
{
    let checkbox = getCheckbox(doc.document, pos);
    if(!checkbox)
    {
        return new Promise( (resolve, reject ) => {
            resolve(false);
        });
    }
    if(checked == null)
    {
        checked = getCheckState(doc.document, pos);
        if(checked == CheckState.Unchecked || checked == CheckState.Indeterminate)
        {
            checked = CheckState.Checked;
        }
        else if(checked == CheckState.Checked)
        {
            checked = CheckState.Unchecked;
        }
    }
    let future = doc.edit( (edit) => {
        let checkedChar = getCheckChar(doc.document, checked);
        edit.replace(checkbox, `[${checkedChar}]`);

        let rv : Thenable<boolean> = new Promise((okay,refuse) => { okay(true); });
        if(recurseDown)
        {
            let children = findChildren(doc.document, pos);
            rv = processChildren(doc, pos, children, checked, 0);
        }
        rv.then( (res) => {
        if(recurseUp)
        {
            let parent = findParent(doc.document, pos);
            if(parent)
            {
               return updateLine(doc, pos, true);
            }
        }});
        return rv;
    });
    return future;
}

function isCheckbox(doc: TextDocument, pos: Position)
{
    let content = doc.lineAt(pos).text;
    return checkboxLineRe.test(content);
}

function isCheckboxSummary(doc: TextDocument, pos: Position)
{
    let content = doc.lineAt(pos).text;
    return summaryRe.test(content);
}

function findAllSummaries(doc: TextDocument)
{
    let sums = [];
    var m;
    let re = /\[\d*[/%]\d*\]/;
    for(let row = 0; row < doc.lineCount; ++row)
    {
        let t = doc.lineAt(row).text;
        let m = re.exec(t);
        if(m)
        {
            sums.push(new Position(row, m.index));
        }
    }
    return sums;
}

function recalculateCheckboxSummary(doc: TextEditor, pos: Position, parentUpdate: boolean = true)
{
    return updateLine(doc, pos, parentUpdate);
}

function recurseAndCheckSummaries(doc: TextEditor, pos: Position, i : number, sums: Position[])
{
    if( i < sums.length )
    {
        recalculateCheckboxSummary(doc, sums[i], false).then(
            () => {
                if( (i+1) < sums.length )
                {
                    recurseAndCheckSummaries(doc, pos, i+1, sums );
                }
            }
        );
    }
}

function recalculateAllCheckboxSummaries(doc: TextEditor, pos: Position)
{
    let sums = findAllSummaries(doc.document);
    sums = sums.reverse();
    recurseAndCheckSummaries(doc, pos, 0, sums);
}

let clineInfoRe = /^(\s*)([-+0-9](\.)?)?.*$/;
export function insertCheckboxCommand(doc: TextEditor)
{
    let row = doc.selection.start.line;
    let line = doc.document.lineAt(row).text;
    let m = clineInfoRe.exec(line);
    let indent = m[1];
    let start  = m[2];
    if(start)
    {
        indent = indent + start + " [ ] ";
    }
    doc.edit((edit) => {
        let pos = new Position(row,line.length);
        edit.insert(pos, "\n" + indent);
    });
    row = row + 1;
    let pos = new Position(row, 0);
    doc.selection = new Selection(pos, pos);
}

let cbslineInfoRe = /^(\s*)(.*)\[\s*[0-9]*\/[0-9]\s*\]\s*$/;
export function insertCheckboxSummaryCommand(doc: TextEditor)
{
    let row = doc.selection.start.line;
    let line = doc.document.lineAt(row).text;
    let m = cbslineInfoRe.exec(line);
    if(!m)
    {
        doc.edit((edit) => {
            let pos = new Position(row,line.length);
            edit.insert(pos, " [/] ");
        }).then( () => { 
            recalculateAllCheckboxSummaries(doc, new Position(row, 0))
        });
    }
}

export function toggleCheckboxCommand(doc: TextEditor)
{
    let rv = null;
    for(let sel of doc.selections)
    {
        if(!isCheckbox(doc.document, sel.start))
        {
            continue;            
        }
        let pos = sel.end;
        rv = toggleCheckbox(doc, pos, null, true, true);
    }
    if(rv)
    {
        rv.then( () => {
            recalculateAllCheckboxSummaries(doc, doc.selection.start);
        });
    }
    else
    {
        recalculateAllCheckboxSummaries(doc, doc.selection.start);
    }
}

export function recalcCheckboxSummaryCommand(doc: TextEditor)
{
    for(let sel of doc.selections)
    {
        if(!isCheckboxSummary(doc.document, sel.end))
        {
            updateLine(doc,sel.end, true);
        }
    }
}

export function recalcAllCheckboxSummariesCommand(doc: TextEditor)
{
    recalculateAllCheckboxSummaries(doc, new Position(0,0));
}

