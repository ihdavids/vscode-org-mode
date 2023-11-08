import * as vscode from 'vscode';
import * as Utils from './utils';
import * as context from './cursor-context';
import { Sets } from './sets';
import { window, Disposable } from 'vscode';
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";
import { Headline, OrgTypes, Node, Parent } from './parser';
import { OrgExtension  } from "./extension";

export function insertHeadingRespectContent(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
        const document = textEditor.document;
        let cursorPos = Utils.getCursorPosition();
        // Search up for heading, assume we only care about node context.
        const ctx = context.getNodeContext(cursorPos, document);
        if (ctx != undefined) {
            cursorPos = ctx.range.start;
        }
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
        insertPos = Utils.eatEmptyLines(textEditor, insertPos, cursorPos, insertPos.character);

        if(sibling) {
            edit.insert(insertPos, "\n" + sibling + " ");
            Utils.moveToEndOfLine(textEditor, new vscode.Position(insertPos.line, 0));
            textEditor.revealRange(new vscode.Range(new vscode.Position(insertPos.line, 0), insertPos));     // jump screen so cursor is in view
        }
}

    

export async function insertChild(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    let   cursorPos = Utils.getCursorPosition();
    const document  = textEditor.document;

    // Get start and end of node
    const ctx = context.getNodeContext(cursorPos, document);
    if (ctx != undefined) {
        cursorPos = ctx.range.start;
    }

    // Get the node headline so we know how many stars we have.
    const curLine = Utils.getLine(textEditor.document, cursorPos);
    let   endOfLine = curLine.length;
    const headerPrefix = Utils.getHeaderPrefix(curLine);

    // Eat any extra blank lines at the end of the node
    let endPos = cursorPos;    
    let insertPos = new vscode.Position(endPos.line, endOfLine);
    if (ctx != undefined) {
        endPos = ctx.range.end;
        // Lets try to eat any empty space we might have along the way
        insertPos = Utils.eatEmptyLines(textEditor, endPos, cursorPos, endOfLine);
        const curLine = Utils.getLine(textEditor.document, insertPos);
        endOfLine = curLine.length;
    }

    // We have a node
    if(headerPrefix) {
        // jump screen so cursor is in view
        textEditor.revealRange(new vscode.Range(insertPos, insertPos));
        // Snippets and vim mode seem to be a problem. This is hella annoying!
        // If we are appending to a line then we need to add a newline, otherwise we just insert on the line
        if (endOfLine > 0) {
            edit.insert(insertPos, "\n" + headerPrefix.trim() + "* ");
            //await textEditor.insertSnippet(new vscode.SnippetString("\n" + headerPrefix.trim() + "* ${1}"), insertPos);
        } else {
             edit.insert(insertPos, headerPrefix.trim() + "* ");
           //await textEditor.insertSnippet(new vscode.SnippetString(headerPrefix.trim() + "* ${1}"), insertPos);
        }
        Utils.moveToEndOfLine(textEditor, new vscode.Position(insertPos.line, 0));
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

async function selectTodo(keys: string[] = null): Promise<string | undefined> {
    if (!keys) {
        keys = Sets.keywords;
    }
    // Deep copy it. This is ANNOYING that there is no deep copy mechanism.
    keys = JSON.parse(JSON.stringify(keys));
    const idx = keys.indexOf("");
    if (idx !== -1) {
        keys[idx] = "none";
    }
    return window.showQuickPick(keys);
}

// Dynamic TODO Selection from a menu rather than cycling.
export async function chooseAndChangeTodo(doc: TextEditor, edit: vscode.TextEditorEdit, ctx: Headline) {
    if (ctx == null || ctx === undefined) {
       return; 
    }
    let range = ctx.statusRange;
    let todos = ctx.getAllTodos();
    if (todos.indexOf("") < 0) {
        todos.splice(0,0,"");
    }
    let newTodoString = await selectTodo(todos);
    if (newTodoString !== undefined) {
        if (newTodoString === "" || newTodoString === "none") {
            newTodoString = "";
            // Check if I HAD a todo before.
            if (ctx.status.length > 0) {
                // Must remove extra space
                const oldEnd   = range.end
                const newEnd   = oldEnd.with({ character: oldEnd.character + 1 });
                const oldRange = range;
                range = oldRange.with({ end: newEnd });
            }
        }
        await doc.edit(async (editBuilder) => {
            // Append a space if we are inserting FROM none.
            if (!ctx.status || ctx.status.length == 0) {
                newTodoString += " ";
            }
            editBuilder.replace(range, newTodoString);
        });
    }
}

function insertTag(node: Headline, doc: TextEditor, name: string) {
    if (node && !node.tags.some( x => x === name)) {
        node.tags.push(name);
        let headlineText = node.getHeadline();
        return doc.edit( (edit) => {
            edit.replace(node.fullLine, headlineText);
            //vscode.workspace.applyEdit(edit);
        });
    }
}

export async function insertTagCommand(doc: TextEditor, edit: TextEditorEdit, name: string) {
    if (!name) {
        name = await vscode.window.showInputBox({
            value: '',
            placeHolder: 'TAG:',
        });
    }


    // We didn't get anything?!? ABORT!
    if (!name || name.trim() === "") {
        return;
    }

    const node = OrgExtension.get().parser.find();
    if (node !== undefined) {
        switch(node.type) {
            case OrgTypes.Headline:  insertTag(<Headline>node, doc, name);   break;
            default: insertTag(<Headline>(<Parent>node).parent, doc, name ); break;
        }
    } else {
        vscode.window.showErrorMessage("Could not find org node to add tag to?");
    }
}


export async function insertProjectTagCommand(doc: TextEditor, edit: TextEditorEdit) {
    await insertTagCommand(doc, edit, "Project");
}

export async function insertWorkTagCommand(doc: TextEditor, edit: TextEditorEdit) {
    await insertTagCommand(doc, edit, "Work");
}