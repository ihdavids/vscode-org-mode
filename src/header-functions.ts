import * as vscode from 'vscode';
import * as Utils from './utils';
import * as context from './cursor-context';
import { Sets } from './sets';
import { window, Disposable } from 'vscode';
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";

export function insertHeadingRespectContent(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
        const document = textEditor.document;
        const cursorPos = Utils.getCursorPosition();
        const curLine = Utils.getLine(document, cursorPos);
        const endOfLine = curLine.length;
        let insertPos = new vscode.Position(cursorPos.line, endOfLine);

        let sibling;
        const headerPrefix = Utils.getHeaderPrefix(curLine);

        if(headerPrefix) {
            sibling = headerPrefix;
            insertPos = Utils.findEndOfContent(document, cursorPos, sibling);
        } else {
            const parentHeader = Utils.findParentPrefix(document, cursorPos) || "*";
            sibling = parentHeader;
            insertPos = Utils.findEndOfContent(document, cursorPos, Utils.getPrefix(curLine));
        }

        if(sibling) {
            edit.insert(insertPos, "\n" + sibling + " ");
            Utils.moveToEndOfLine(textEditor, new vscode.Position(insertPos.line, 0));
            textEditor.revealRange(new vscode.Range(new vscode.Position(insertPos.line, 0), insertPos));     // jump screen so cursor is in view
        }
}

export function insertChild(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    let   cursorPos = Utils.getCursorPosition();
    const document  = textEditor.document;
    const ctx = context.getNodeContext(cursorPos, document);
    if (ctx != undefined) {
        cursorPos = ctx.range.start;
    }
    const curLine = Utils.getLine(textEditor.document, cursorPos);
    let   endOfLine = curLine.length;
    const headerPrefix = Utils.getHeaderPrefix(curLine);

    let endPos = cursorPos;    
    let insertPos = new vscode.Position(endPos.line, endOfLine);
    if (ctx != undefined) {
        endPos = ctx.range.end;
        const tempLine = Utils.getLine(textEditor.document, endPos);
        endOfLine = tempLine.length;
        insertPos = new vscode.Position(endPos.line, endOfLine);
    }

    if(headerPrefix) {
        edit.insert(insertPos, "\n" + headerPrefix.trim() + "* ");
        Utils.moveToEndOfLine(textEditor, new vscode.Position(insertPos.line, 0));
        textEditor.revealRange(new vscode.Range(insertPos, insertPos));     // jump screen so cursor is in view
    }
}

export function demoteLine(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const document = textEditor.document;
    const cursorPos = Utils.getCursorPosition();
    const curLine = Utils.getLine(textEditor.document, cursorPos);
    const headerPrefix = Utils.getHeaderPrefix(curLine);
    const insertPos = new vscode.Position(cursorPos.line, 0);
    if(headerPrefix) {
        edit.insert(insertPos, "*");
    }
}

export function promoteLine(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const document = textEditor.document;
    const cursorPos = Utils.getCursorPosition();
    const curLine = Utils.getLine(textEditor.document, cursorPos);
    const headerPrefix = Utils.getHeaderPrefix(curLine);
    const insertPos = new vscode.Position(cursorPos.line, 0);

    if(headerPrefix && headerPrefix !== "* ") {
        const deleteRange = new vscode.Range(insertPos, new vscode.Position(insertPos.line, 1));
        edit.delete(deleteRange);
    }
}

async function selectTodo(): Promise<string | undefined> {
    return window.showQuickPick(Sets.keywords);;
}

export async function chooseAndChangeTodo(ctx , doc: TextEditor, edit: vscode.TextEditorEdit) {
    let newTodoString = await selectTodo();
    if (newTodoString !== undefined) {
        if (newTodoString === "") {
            // Must remove extra space
            const oldEnd   = ctx.range.end
            const newEnd   = oldEnd.with({ character: oldEnd.character + 1 });
            const oldRange = ctx.range;
            ctx.range = oldRange.with({ end: newEnd });
        }
        doc.edit((editBuilder) => {
            editBuilder.replace(ctx.range, newTodoString);
            //editBuilder.insert(textEditor.selection.active, item.fsPath);
        });

    }
}