import * as vscode from 'vscode';
import {parseTimestampContext} from './cursor-context';
import * as Datetime from './simple-datetime';
import nextTodo from './todo-switch';
import * as Util from './utils';
import { OrgExtension  } from "./extension";
import { Headline, OrgTypes } from "./parser";

export const UP = "UP";
export const DOWN = "DOWN";

// If any new contexts are created (Such as TODO), switch for the dataLabel here
function modifyContext(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, action: string) {

    const node = OrgExtension.get().parser.find();
    if (node !== undefined) {
        switch(node.type) {
            case OrgTypes.Headline:  

                const document = Util.getActiveTextEditorEdit();
                const cursorPos = Util.getCursorPosition();
                const curLine = Util.getLine(document, cursorPos);
                let ctx = parseTimestampContext(cursorPos, curLine);
                if (ctx) {
                    const newDateString = Datetime.modifyDate(ctx.data, action);
                    edit.replace(ctx.range, newDateString);

                } else {
                    let h = <Headline>node;
                    const newTodoString = nextTodo(h, action);
                    let range = h.statusRange;
                    if (newTodoString === "") {
                        // Must remove extra space
                        const oldEnd = range.end
                        const newEnd = oldEnd.with({ character: oldEnd.character + 1 });
                        const oldRange = range;
                        range = oldRange.with({ end: newEnd });
                    }
                    edit.replace(range, newTodoString);
                    break;
                }
                break;
        }
    }
}

export function incrementContext(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    modifyContext(textEditor, edit, UP);
}

export function decrementContext(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    modifyContext(textEditor, edit, DOWN);
}