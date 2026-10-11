
import { Link } from "./parser";
import * as vscode from "vscode";
import { TextEditor } from "vscode";

export function jumpToLink(link: Link,doc: TextEditor, edit: vscode.TextEditorEdit) {
    const l = link.getParse();
    const pro = l['protocol'];
    const uri = l['id'];
    switch(pro) {
        case 'vscode':
        case 'file': {
            const openPath = vscode.Uri.file(uri);
            vscode.workspace.openTextDocument(openPath).then(textDoc => {
                vscode.window.showTextDocument(textDoc).then( doc => {
                  const line = 0;
                  doc.revealRange(new vscode.Range(new vscode.Position(line,0), new vscode.Position(line,0)));
                });
            });
            break;
        }
        case 'mailto':
        case 'http':
        case 'https': {
            vscode.env.openExternal(vscode.Uri.parse(link.href));
            break;
        }
    }
}