import * as utils from "./utils";
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";


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

function updateLine(doc: TextEditor, pos: Position, parentUpdate: boolean)
{
    let [numChildren, numChecked] = recalcSummary(doc.document, pos);
    // No children to update
    if(numChildren <= 0)
    {
        return false;
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
    toggleCheckbox(doc, pos, newState);
    updateSummary(doc, pos, numChecked, numChildren);
    let children = findChildren(doc.document, pos);
    for(let child of children)
    {
        let line = doc.document.lineAt(child);
        let summary = getSummary(doc.document, child);
        if(summary)
        {
            return updateLine(doc, child, false);
        }
        if(parentUpdate)
        {
            let parent = findParent(doc.document, pos);
            if(parent)
            {
                updateLine(doc, parent, parentUpdate);                
            }
        }
    }
    return true;
}

function updateSummary(doc: TextEditor, pos: Position, numChecked: number, numChildren: number ) : boolean
{
    let summary = getSummary(doc.document, pos);
    if(!summary)
    {
        return false;
    }
    let line = doc.document.lineAt(pos).text;
    if(line.indexOf("%") >= 0)
    {
        doc.edit( (edit) => {
            let percent = Math.floor(numChecked/numChildren*100)
            edit.replace(summary, `[${percent}%]`);
        });
    }
    else
    {
        doc.edit( (edit) => {
            edit.replace(summary, `[${numChecked}/${numChildren}]`);
        });      
    }
    return true;
}

function toggleCheckbox(doc: TextEditor, pos: Position, checked : CheckState, recurseUp : boolean = false, recurseDown: boolean = false)
{
    let checkbox = getCheckbox(doc.document, pos);
    if(!checkbox)
    {
        return false;
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
    doc.edit( (edit) => {
        let checkedChar = getCheckChar(doc.document, checked);
        edit.replace(checkbox, `[${checkedChar}]`);
    });
    if(recurseDown)
    {
        let children = findChildren(doc.document, pos);
        for(let child of children) {
            toggleCheckbox(doc, child, checked, false, true);
        }
    }
    if(recurseUp)
    {
        let parent = findParent(doc.document, pos);
        if(parent)
        {
           updateLine(doc, pos, true);
        }
    }
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

function recalculateCheckboxSummary(doc: TextEditor, pos: Position)
{
    updateLine(doc, pos, true);
}

function recalculateAllCheckboxSummaries(doc: TextEditor, pos: Position)
{
    let sums = findAllSummaries(doc.document);
    for(let sum of sums)
    {
        recalculateCheckboxSummary(doc, sum);
    }
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
        });
        recalculateAllCheckboxSummaries(doc, new Position(row, 0));
    }
}

export function toggleCheckboxCommand(doc: TextEditor)
{
    console.log("SOMETHING");
    console.error("WHAT IN THE WORLD");
    for(let sel of doc.selections)
    {
        if(!isCheckbox(doc.document, sel.start))
        {
            continue;            
        }
        let pos = sel.end;
        toggleCheckbox(doc, pos, null, true, true);
    }
    recalculateAllCheckboxSummaries(doc, doc.selection.start);
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

