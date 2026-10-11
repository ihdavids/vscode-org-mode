import * as vscode from 'vscode';
import { parseTimestampContext } from './cursor-context';
import * as Datetime from './simple-datetime';
import { isHeadingLine, cycleKeyword, fileKeywords } from './outline/model';
import { Sets } from './sets';

export const UP = "UP";
export const DOWN = "DOWN";

// The keywords a file cycles through: its own #+TODO: line, or the settings'.
export function keywordsOf(doc: vscode.TextDocument): string[] {
    const lines: string[] = [];
    for (let i = 0; i < Math.min(doc.lineCount, 400); i++) {
        lines.push(doc.lineAt(i).text);
    }
    const own = fileKeywords(lines);
    if (own) {
        return own.todo.concat(own.done);
    }
    const todo = Sets.getProp<string[]>('todoKeywords', ['TODO']) || [];
    const done = Sets.getProp<string[]>('doneKeywords', ['DONE']) || [];
    return todo.concat(done).filter(k => k);
}

// Alt+Left / Alt+Right: a date under the cursor steps a day; otherwise, on a
// heading, the keyword moves along its cycle.
function modifyContext(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, action: string) {
    const pos = textEditor.selection.active;
    const line = textEditor.document.lineAt(pos.line);
    const ctx = parseTimestampContext(pos, line.text);
    if (ctx) {
        edit.replace(ctx.range, Datetime.modifyDate(ctx.data, action));
        return;
    }
    if (isHeadingLine(line.text)) {
        const next = cycleKeyword(line.text, keywordsOf(textEditor.document), action === UP ? 1 : -1);
        if (next !== line.text) {
            edit.replace(line.range, next);
        }
    }
}

export function incrementContext(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    modifyContext(textEditor, edit, UP);
}

export function decrementContext(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    modifyContext(textEditor, edit, DOWN);
}
