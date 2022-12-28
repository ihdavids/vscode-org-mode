
import { Headline, Link, OrgTypes } from "./parser";
import * as vscode from "vscode";
import {Range, TextDocument, Position, TextEditor, TextEditorEdit, Selection} from "vscode";

export function jumpToLink(link: Link,doc: TextEditor, edit: vscode.TextEditorEdit) {
    let l = link.getParse();
    let pro = l['protocol'];
    let uri = l['id'];
    switch(pro) {
        case 'vscode':
        case 'file': {
            var openPath = vscode.Uri.file(uri);
            vscode.workspace.openTextDocument(openPath).then(textDoc => {
                vscode.window.showTextDocument(textDoc).then( doc => {
                  let line = 0;
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