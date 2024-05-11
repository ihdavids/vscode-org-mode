
// Org: Export Latex
// Perhaps this should be convert latex
// This uses the latex module to convert
// the current org file to a latex file.

import { parse } from 'path';
import * as vscode from 'vscode';
import { Page } from "./page";
import { Signal } from "./signal";
import { OrgDuration } from './duration';
import './duration';
import { Sets } from './sets';
import { ODb } from './db';
import { OrgExtension  } from "./extension";

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

        var page = new Page();
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
    await ODb.get();
    let qry = vscode.window.activeTextEditor.document.fileName;
    let res = await ODb.latex(qry);
    if (res) {
        latexFile("Latex", res.Msg);
    }
    //let todoName = await selectTodoView();
    //if (todoName !== undefined) {
    //await OrgExtension.get().showTodoList(todoName);
    //}
}

