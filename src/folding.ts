import * as vscode from 'vscode';
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";

export async function autoFold(doc: TextDocument)
{
    if(doc.languageId == 'org')
    {
        let e = vscode.window.activeTextEditor;
        let sel = e.selection;
        let inDrawer = false;
        let last : number = 0;
        let m = null;
        for(let i = 0; i < doc.lineCount; ++i)
        {
            let text : string = doc.lineAt(i).text;
            if(inDrawer && /^\s*:END:\s*$/.test(text))
            {
                e.selection = new Selection(new Position(last,0), new Position(i,0));
                await vscode.commands.executeCommand('editor.fold');
                e.selection = sel;
            }
            else if (m = text.match(/^\s*:([a-zA-Z0-9]+):\s*$/)) 
            {
                last = i;
                inDrawer = true;
            }
        }
    }
}

export async function tabHandler(doc: vscode.TextEditor)
{
    let line : string = doc.document.lineAt(doc.selection.active).text;
    if (/^\s*:([a-zA-Z0-9]+):\s*$/.test(line))
    {
        await vscode.commands.executeCommand('editor.toggleFold');
    }
    else if(/^\s*[*]+ /.test(line))
    {
        await vscode.commands.executeCommand('editor.toggleFold');
    }

}

export async function autoFoldChanged(doc: vscode.TextDocumentChangeEvent)
{
    if(doc.document.languageId == 'org' && doc.document.isDirty)
    {
        autoFold(doc.document);
    }
}