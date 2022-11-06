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

// Any potential data labels should go here
export const DATE  = "DATE";
export const TODO  = "TODO";
export const LIST  = "LIST";
export const CHECK = "CHECKBOX";
export const NODE  = "NODE";

export interface IContextData {
    dataLabel: string,
    data: string,
    line: number,
    range: Range
    info: number,
}

export interface ContextOptions {
    includeLists ?: boolean,
    includeTodo  ?: boolean,
}

export default function getCursorContext(textEditor: TextEditor, edit: TextEditorEdit, { includeTodo = true, includeLists = false} ): IContextData {
    const document = Util.getActiveTextEditorEdit();
    const cursorPos = Util.getCursorPosition();
    const curLine = Util.getLine(document, cursorPos);

    // Match for timestamp
    const timestampRegexp = /\[\d{4}-\d{1,2}-\d{1,2}(?: \w{3})?\]/g;
    let match;

    while ((match = timestampRegexp.exec(curLine)) != null) {
        const timestampContext = getTimestampContext(match, cursorPos);
        if (timestampContext) {
            return timestampContext;
        }
    }

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
        const listRegexp = new RegExp(`^\\s*[0-9]+[.)]`);
        match = listRegexp.exec(curLine);
        if (match) {
            return getListContext(match, cursorPos, LIST);
        }

        const chkRegexp = new RegExp(`^\\s*[+-] \\[[xX -]\\]`);
        match = chkRegexp.exec(curLine);
        if (match) {
            return getListContext(match, cursorPos, CHECK);
        }
    }

    return getNodeContext(cursorPos, document);

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


function getNodeContext(cursorPos: Position, document: TextDocument): IContextData {

    const nodeStart = new RegExp(`^\\s*(\\*)+\\s+[a-zA-Z0-9]`);
    let startLine: number = -1;
    let endLine: number = document.lineCount-1;
    let lineNum: number = cursorPos.line;
    let numStars: number = 0;
    let match;
    let startText: string = "";
    for (var i: number = lineNum; i >= 0; --i) {
        const tempLine = Util.getLine(document, new Position(i, 0));
        match = nodeStart.exec(tempLine);
        if (match) {
            startLine = i;
            startText = tempLine;
            numStars  = match[1].length;
            break;
        }
    }
    if (startLine != -1) {
        let endLineTextLen: number = 0;
        for (var i: number = (lineNum + 1); i < document.lineCount; ++i) {
            const tempLine = Util.getLine(document, new Position(i, 0));
            match = nodeStart.exec(tempLine);
            if (match) {
                endLine = i;
                endLineTextLen = tempLine.length;
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
            info: numStars  // number of stars
        }
    }
    return undefined;
}