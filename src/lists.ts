
import * as utils from "./utils";
import * as vscode from "vscode";
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";
import { resolve } from "url";

let numlineRe = /^\s*(?P<num>[0-9]+)(?P<sep>[.)])(?P<data>\s+(([^:]+\s+)(::))?.*)/;

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
    let cur = 1

    let curIndent : string = utils.getIndent(doc.document.lineAt(prow).text);
    let curLen    = curIndent.length;
    let indentStack = [];
    for(let r = prow + 1; r < erow; ++r)
    {
        let line = doc.document.lineAt(r).text;
        let thisIndent = utils.getIndent(line);
        let thisLen    = thisIndent.length;
        if(thisLen > curLen)
        {
            indentStack.push([curIndent,curLen, cur])
            curIndent = thisIndent
            curLen    = thisLen
            cur       = 1
        }
        while(thisLen < curLen && indentStack.length > 0)
        {
            [curIndent, curLen, cur] = indentStack.pop();
        }
        // TODO: IAN I AM HERE CONVERTING THIS!
        if(thisLen == curLen):
            print(line)
            m = RE_NUMLINE.search(line)
            if(m):
                num = int(m.group('num'))
                if(num != cur):
                    region = view.lineAt(r)
                    view.replace(edit, region, '{0}{1}{2}{3}'.format(curIndent, cur, m.group('sep'), m.group('data')))
                cur += 1
    }
}

function appendLine(doc: TextDocument)
{
    crow = view.curRow()
    parent = view.findParentByIndent(view.curLine())
    prow, _ = view.rowcol(parent.begin())
    children, erow = findChildrenByIndent(view, view.curLine())
    cur = 1
    curIndent = view.getIndent(view.getLine(prow+1))
    curLen    = len(curIndent)
    indentStack = []
    sep = '.'
    for r in range(prow + 1, erow+1):
        line = view.getLine(r)
        thisIndent = view.getIndent(line)
        thisLen    = len(thisIndent)
        if(thisLen > curLen):
            indentStack.append((curIndent,curLen, cur))
            curIndent = thisIndent
            curLen    = thisLen
            cur       = 1

        while(thisLen < curLen and len(indentStack) > 0):
            curIndent, curLen, cur = indentStack.pop()

        if(thisLen == curLen):
            print(line)
            m = RE_NUMLINE.search(line)
            if(m):
                num = int(m.group('num'))
                sep = m.group('sep')
                if(num != cur):
                    region = view.lineAt(r)
                    view.replace(edit, region, '{0}{1}{2}{3}'.format(curIndent, cur, m.group('sep'), m.group('data')))
                cur += 1
            else:
                point  = view.text_point(r, 0)
                view.insert(edit,point,'{0}{1}{2}{3}\n'.format(curIndent, cur, sep, ' '))
                view.sel().clear()
                view.sel().add(point + len(curIndent) + 3)
                UpdateLine(view,edit)
                return
        else:
            point  = view.text_point(r, 0)
            view.insert(edit,point,'{0}{1}{2}{3}\n'.format(curIndent, cur, sep, ' '))
            view.sel().clear()
            view.sel().add(point + len(curIndent) + 3)
            UpdateLine(view,edit)
            return
    # Okay we didn't insert, have to now
    last_row, _ = view.rowcol(view.size())
    if(erow > last_row):
        point  = view.text_point(last_row, 0)
        view.insert(edit,point,'\n')
    point  = view.text_point(erow, 0)
    line = view.getLine(erow)
    newLine = ''
    if(len(line) > 0):
        newLine = '\n'
    view.insert(edit,point,'{0}{1}{2}{3}{4}'.format(curIndent, cur, sep, ' ', newLine))
    view.sel().clear()
    view.sel().add(point + len(curIndent) + 3)
    UpdateLine(view,edit)
}

export function isNumberedLine(doc : TextDocument, pos: Position)
{
    let content = doc.lineAt(pos).text;
    return numlineRe.test(content);
}

export function updateNumberedListCommand(doc: TextDocument)
{
    updateLine(doc);
}

export function OrgAppendNumberedListCommand(doc: TextDocument)
{
    appendLine(doc);
}
