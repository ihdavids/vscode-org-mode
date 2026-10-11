import * as vscode from 'vscode';
import { TextDocument } from "vscode";

export async function autoFold(doc: TextDocument)
{
    if(doc.languageId == 'org')
    {
        // For speed use this to make it quick to fold all property block automatically
        await vscode.commands.executeCommand('editor.foldAllBlockComments');
    }
}

export async function tabHandler(doc: vscode.TextEditor)
{
    const line : string = doc.document.lineAt(doc.selection.active).text;
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