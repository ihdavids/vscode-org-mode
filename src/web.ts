

import * as vscode from 'vscode';
import * as path from 'path';
import {ODb} from "./db"
import {OrgExtension} from "./extension"
import { Sets } from './sets';
import { listenerCount } from 'stream';

async function selectWeb(): Promise<string | undefined> {
    let gantts = Sets.gantts;
    let keys = Object.keys(gantts);
    if (keys !== null && keys !== undefined && keys.length > 0) { 

    }

    // Deep copy it. This is ANNOYING that there is no deep copy mechanism.
    keys = JSON.parse(JSON.stringify(keys));
    let k = await vscode.window.showQuickPick(keys);
    return Sets.gantts[k];
}

export async function showWeb(doc: vscode.TextEditor) {

    //let qry = await selectGantt();
    let qry = vscode.window.activeTextEditor.document.fileName;
      const panel = vscode.window.createWebviewPanel(
        'web',
        'Web: ' + qry,
        vscode.ViewColumn.Two,
        {enableScripts: true}
      );

      let iteration = 0;
      const updateWebview = async () => {
        if (panel.visible) {
            let agd = await ODb.html(qry);
            panel.title = 'Web: ' + qry;
            if (agd["Ok"] === true) {
                panel.webview.html = agd["Msg"];
            }
        }
      };

      // Set initial content
      updateWebview();
    // handle recieving messages from the webview
    panel.webview.onDidReceiveMessage(message => {
      switch(message.command) {
        case 'open': vscode.window.showErrorMessage(message.text);
            var openPath = vscode.Uri.file(message.text);
            console.log(openPath);
            vscode.workspace.openTextDocument(openPath).then(textDoc => {
                vscode.window.showTextDocument(textDoc).then( doc => {
                  let line = message.line;
                  doc.revealRange(new vscode.Range(new vscode.Position(line,0), new vscode.Position(line,0)));
                });
            });
          return;
        case 'close': 
            console.log("CLOSE");
          return;
      }
    }, undefined, undefined); 
  
      // And schedule updates to the content every second
      //const interval = setInterval(updateWebview, 1000*3);

      panel.onDidDispose(
        () => {
          // When the panel is closed, cancel any future updates to the webview content
          //clearInterval(interval);
          console.log("CLOSE WEB");
        },
        null,
        OrgExtension.get().context.subscriptions
      );

    console.log("SHOW WEB SHOWN");
}