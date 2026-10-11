
// Org: Export Latex
// Perhaps this should be convert latex
// This uses the latex module to convert
// the current org file to a latex file.

import * as vscode from 'vscode';
import { Page } from "./page";
import './duration';
import { ODb } from './db';

/*
async function selectTodoView(): Promise<string | undefined> {
    let configs = Sets.todoConfigs;
    let names = [];
    Object.entries(configs).forEach( ([key,value]) => names.push(key));
    return vscode.window.showQuickPick(names);
}
*/
async function latexFile(name: string, content: string): Promise<boolean> {
        //let configs = Sets.todoConfigs;
        //this.cfg = null;
        //if (name in configs) {
        //    this.cfg = configs[name];
        //} else {
        //    return false;
        //}

        const page = new Page();
        await page.create({ language: 'latex', content: content });
        await page.show();
		//await redraw();

        /*
		let clearSelection = setTimeout(function (self) {
            // Change the selection: start and end position of the new
            // selection is same, so it is not to select replaced text;
            var postion = self.page.editor.selection.end; 
            self.page.editor.selection = new vscode.Selection(postion, postion);
            //self.page.editor.selection.active = self.editor.selection.anchor;
        }, 100, this);
        */
        return Promise.resolve(true);
}


export async function convertToLatex(doc: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    const qry = vscode.window.activeTextEditor.document.fileName;
    const res = await ODb.latex(qry);
    if (res && res.Ok) {
        latexFile("Latex", res.Msg);
    } else if (res) {
        vscode.window.showErrorMessage('LaTeX export failed: ' + (res.Msg || 'the orgs server did not say why'));
    }
    //let todoName = await selectTodoView();
    //if (todoName !== undefined) {
    //await OrgExtension.get().showTodoList(todoName);
    //}
}

