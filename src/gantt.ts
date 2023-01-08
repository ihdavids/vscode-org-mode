
import * as vscode from 'vscode';
import * as path from 'path';
import {ODb} from "./db"
import {OrgExtension} from "./extension"

async function getWebviewContent(name) {

}

export async function showGantt(doc: vscode.TextEditor) {

    let name = "default";
      const panel = vscode.window.createWebviewPanel(
        'gantt',
        'Gantt',
        vscode.ViewColumn.Two,
        {enableScripts: true}
      );

      let iteration = 0;
      const updateWebview = async () => {
        let agd = await ODb.gantt("HasProperty(\"EFFORT\")");
        panel.title = 'Gantt: ' + "EFFORT";
        if (agd["Ok"] === true) {
          panel.webview.html = agd["Msg"];
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
      }
    }, undefined, undefined); 
  
      // And schedule updates to the content every second
      const interval = setInterval(updateWebview, 1000*30);

      panel.onDidDispose(
        () => {
          // When the panel is closed, cancel any future updates to the webview content
          clearInterval(interval);
        },
        null,
        OrgExtension.get().context.subscriptions
      );

    console.log("SHOW AGENDA SHOWN");
}