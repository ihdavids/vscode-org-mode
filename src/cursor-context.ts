// import * as vscode from 'vscode';
import {
    Position,
    Range,
    TextEditor,
    TextEditorEdit,
    TextDocument,
    workspace
} from "vscode";
import * as Datetime from './simple-datetime';
import { Sets } from './sets';
import * as Util from './utils';
import { Script } from "vm";

// Any potential data labels should go here
export const DATE  = "DATE";
export const TODO  = "TODO";
export const LIST  = "LIST";
export const CHECK = "CHECKBOX";
export const NODE  = "NODE";
export const SCHEDULED = "SCHEDULED";
export const DEADLINE = "DEADLINE";
export const CLOSED   = "CLOSED";

export enum OrgTypes {
    DATE,
    TODO,
    LIST,
    CHECK,
    NODE,
    SCHEDULED,
    DEADLINE,
    CLOSED,
};

export type Primitive = string | number | boolean
interface Data { }
interface Node {
    type:     OrgTypes;
    range:    Range;
    is<T>():  boolean;
    as<T>():  T | undefined;
};

interface Parent extends Node {
  children: [Node];
  parent?:  Node;
}

interface Literal extends Node {
    //value: any
}

/*
class Headline implements Parent {
    children: [Node];
    parent?:  Node;
    type:     OrgTypes;
    range:    Range;
    is<T>():  boolean {
        return (typeof T == Headline);
    }
    as<T>():  T | undefined {
        if (T is Headline) {
            return <T>this;
        }
        return undefined;
    }
}
*/
class OrgDocument {
    nodes: [Node];
};

export interface IContextData {
    dataLabel: string,
    data: string,
    line: number,
    range: Range
    info: number,
}

export interface INodeData extends IContextData{
    scheduled: IContextData;
    deadline:  IContextData;
    closed:    IContextData;
    timestamp: IContextData;
    todo:      IContextData;
}

export interface ContextOptions {
    includeLists ?: boolean,
    includeTodo  ?: boolean,
}

const chkRegexp       = new RegExp(`^\\s*[+-] \\[[xX -]\\]\\s+.*`);
const listRegexp      = new RegExp(`^\\s*[0-9]+[.)]\\s+.*`);
const timestampRegexp = /\s*[<\[]\s*\d{4}-\d{1,2}-\d{1,2}\s*(?:\w{3})?\s*[>\]]/g;
const scheduleRegexp = /\s*(CLOSED|SCHEDULED|DEADLINE)[:]?\s*([<\[])(\s*\d{4}-\d{1,2}-\d{1,2})(?: \w{3})?\s*[>\]]/g;
export function parseTimestampContext(cursorPos: Position, curLine: string) {
    let match;
    while ((match = timestampRegexp.exec(curLine)) != null) {
        const timestampContext = getTimestampContext(match, cursorPos);
        if (timestampContext) {
            return timestampContext;
        }
    }
}

export function getSubNodeCursorContext(textEditor: TextEditor, edit: TextEditorEdit, { includeTodo = true, includeLists = false} ): IContextData {
    const document = Util.getActiveTextEditorEdit();
    const cursorPos = Util.getCursorPosition();
    const curLine = Util.getLine(document, cursorPos);

    // Match for timestamp
    let match;
    let ctx = parseTimestampContext(cursorPos, curLine);
    if (ctx) {
        return ctx;
    }

    ctx = parseScheduledContext(cursorPos, curLine);
    if (ctx){ return ctx; }

    if (includeTodo) {
        // Match for TODO (or absence)
        const todoKeywords = Sets.keywords.join("|");
        // const todoWords = "TODO|DONE";
        const todoHeaderRegexp = new RegExp(`^(\\s*\\*+\\s+)(${todoKeywords})(?:\\b|\\[|$)`);
        match = todoHeaderRegexp.exec(curLine);
        if (match) {
            // We've found our match
            return getTodoContext(match, cursorPos);
        }
    }

    if (includeLists) {
        match = listRegexp.exec(curLine);
        if (match) {
            return getListContext(match, cursorPos, LIST);
        }

        match = chkRegexp.exec(curLine);
        if (match) {
            return getListContext(match, cursorPos, CHECK);
        }
    }

}

export default function getCursorContext(textEditor: TextEditor, edit: TextEditorEdit, { includeTodo = true, includeLists = false} ): IContextData {
    let ctx = getSubNodeCursorContext(textEditor, edit, {includeTodo: includeTodo, includeLists: includeLists});
    if (!ctx) {
        const document = Util.getActiveTextEditorEdit();
        const cursorPos = Util.getCursorPosition();
        return getNodeContext(cursorPos, document);
    }
    return ctx;
    //return undefined;
}

function getTimestampContext(match: RegExpExecArray, cursorPos: Position): IContextData {
    const line = cursorPos.line;

    const startPos = new Position(line, match.index);
    const endPos = new Position(line, match.index + match[0].length);
    const range = new Range(startPos, endPos);
    if (range.contains(cursorPos)) {
        // We've found our match
        return {
            data: match[0],
            dataLabel: DATE,
            line,
            range,
            info: 0,
        }
    }

    // Should return undefined if no match contains the cursor
}

export function parseScheduledContext(cursorPos: Position, curLine: string) {
    let match;
    while ((match = scheduleRegexp.exec(curLine)) != null) {

        const line = cursorPos.line;

        const startPos = new Position(line, match.index);
        const endPos = new Position(line, match.index + match[0].length);
        const range = new Range(startPos, endPos);
        if (range.contains(cursorPos)) {
            const lbl = match[1];
            // We've found our match
            return {
                data: match[3] + match[4],
                dataLabel: lbl,
                line,
                range,
                info: match[2],
            }
        }
    }
    return null;
}

function getTodoContext(match: RegExpExecArray, cursorPos: Position): IContextData {
    const line = cursorPos.line;

    const prefix = match[1];
    const todoWord = match[2];

    const start = match.index + match[1].length;
    const startPos = new Position(line, start);
    const end = start + todoWord.length;
    const endPos = new Position(line, end);
    const range = new Range(startPos, endPos);

    return {
        data: todoWord,
        dataLabel: TODO,
        line,
        range,
        info: 0,
    }
}

function getListContext(match: RegExpExecArray, cursorPos: Position, CTX: string): IContextData {
    const line = cursorPos.line;

    const startPos = new Position(line, match.index);
    const endPos   = new Position(line, match.index + match[0].length);
    const range    = new Range(startPos, endPos);
    if (range.contains(cursorPos)) {
        // We've found our match
        return {
            data: match[0],
            dataLabel: CTX,
            line,
            range,
            info: 0
        }
    }
}

export function getNodeContext(cursorPos: Position, document: TextDocument): INodeData {

    let scheduled = null;
    let deadline  = null;
    let closed    = null;
    let timestamp = null;
    let todo      = null;
    const nodeStart        = new RegExp(`^\\s*(?<stars>\\*+)\\s+[a-zA-Z0-9]`);
    const todoKeywords = Sets.keywords.join("|");
    const todoHeaderRegexp = new RegExp(`^(\\s*\\*+\\s+)(${todoKeywords})(?:\\b|\\[|$)`);
    let startLine: number = -1;
    let endLine: number = document.lineCount-1;
    let lineNum: number = cursorPos.line;
    let numStars: number = 0;
    let match;
    let startText: string = "";
    for (var i: number = lineNum; i >= 0; --i) {
        const tpos = new Position(i, 0);
        const tempLine = Util.getLine(document, tpos);
        if (!timestamp){
            timestamp = parseTimestampContext(tpos, tempLine);
        }
        if (!scheduled || !deadline){
            let ctx = parseScheduledContext(tpos, tempLine);
            if (ctx && ctx.dataLabel === SCHEDULED) {
                scheduled = ctx;
            } else if (ctx && ctx.dataLabel === DEADLINE) {
                deadline = ctx;
            } else if(ctx && ctx.dataLabel === CLOSED) {
                closed = ctx;
            }
        }
        match = nodeStart.exec(tempLine);
        if (match) {
            startLine = i;
            startText = tempLine;
            numStars  = match.groups.stars.length;
            // Extract todo line for todo context.
            const tdmatch = todoHeaderRegexp.exec(tempLine);
            if (tdmatch) {
                // We've found our match
                todo = getTodoContext(tdmatch, tpos);
            }
            break;
        }
    }
    if (startLine != -1) {
        let endLineTextLen: number = 0;
        for (var i: number = (lineNum + 1); i < document.lineCount; ++i) {
            const tpos = new Position(i, 0);
            const tempLine = Util.getLine(document, tpos);
            if (!timestamp){
                timestamp = parseTimestampContext(tpos, tempLine);
            } 
            if (!scheduled || !deadline){
                let ctx = parseScheduledContext(tpos, tempLine);
                if (ctx && ctx.dataLabel === SCHEDULED) {
                    scheduled = ctx;
                } else if (ctx && ctx.dataLabel === DEADLINE) {
                    deadline = ctx;
                } else if(ctx && ctx.dataLabel === CLOSED) {
                    closed = ctx;
                }
            }
            match = nodeStart.exec(tempLine);
            if (match) {
                endLine = i-1;
                const tempLine2 = Util.getLine(document, new Position(i-1, 0));
                endLineTextLen = tempLine2.length;
                break;
            }
        }

        const startPos = new Position(startLine, 0);
        const endPos   = new Position(endLine, endLineTextLen);
        const range    = new Range(startPos, endPos);
        return {
            data: startText,
            dataLabel: NODE,
            line: startLine,
            range,
            info: numStars,  // number of stars
            scheduled,
            deadline,
            timestamp,
            closed,
            todo
        }
    }
    return undefined;
}