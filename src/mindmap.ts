

import * as vscode from 'vscode';
import * as path from 'path';
import {ODb} from "./db"
import {OrgExtension} from "./extension"
import { Sets } from './sets';
import { listenerCount } from 'stream';
import * as fs from 'fs';

async function getWebviewContent(name) {

}

async function selectMindMap(): Promise<string | undefined> {
    let gantts = Sets.gantts;
    let keys = Object.keys(gantts);
    if (keys !== null && keys !== undefined && keys.length > 0) { 

    }

    // Deep copy it. This is ANNOYING that there is no deep copy mechanism.
    keys = JSON.parse(JSON.stringify(keys));
    let k = await vscode.window.showQuickPick(keys);
    return Sets.gantts[k];
}

const userBodyScripts = `
  <script>
    window.addEventListener("keydown", function (event) {
      if (event.defaultPrevented) {
        return; // Do nothing if the event was already processed
      }
      const vscode = acquireVsCodeApi();

      switch (event.key) {
        case "ArrowDown":
          // code for "down arrow" key press.
          break;
        case "ArrowUp":
          // code for "up arrow" key press.
          break;
        case "ArrowLeft":
          // code for "left arrow" key press.
          break;
        case "ArrowRight":
          // code for "right arrow" key press.
          break;
        case "s":
          vscode.postMessage({
              command: 'save',
              text: 'save file'
          });
        default:
          return; // Quit when this doesn't handle the key event.
      }

      // Cancel the default action to avoid it being handled twice
      event.preventDefault();
    }, true);
    // the last option dispatches the event to the listener first,
    // then dispatches event to window
  </script>
`

export async function showMindMap(doc: vscode.TextEditor) {

    let qry = await selectMindMap();
      const panel = vscode.window.createWebviewPanel(
        'mindmap',
        'MindMap: ' + qry,
        vscode.ViewColumn.Two,
        {enableScripts: true}
      );

      let iteration = 0;
      const updateWebview = async () => {
        let agd = await ODb.mindmap(qry);
        panel.title = 'MindMap: ' + qry;
        if (agd && agd["Ok"] === true) {
          let htmlOut = agd["Msg"];
          htmlOut = htmlOut.replace("<!--USERBODYSCRIPT-->",userBodyScripts);
        console.log(htmlOut);
          panel.webview.html = htmlOut;
        } else if (agd && agd["Ok"] === false) {
          panel.webview.html = `<html><body>ERROR: Failed query result was: ${agd["Msg"]}</body></html>`;
        } else {
          panel.webview.html = `<html><body>ERROR: Did not manage to query result: ${agd}</body></html>`;
        }
      };

      // Set initial content
      updateWebview();
    // handle recieving messages from the webview
    panel.webview.onDidReceiveMessage(async message => {
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
        case 'save': 
        
            let filename = await vscode.window.showInputBox({
              value: '',
              placeHolder: 'FILENAME.html',
            });
            let htmlOut = panel.webview.html;
            fs.writeFile(filename, htmlOut, err => {
              if (err) {
                console.error(err);
              }
              // file written successfully
            });
        
            return;
        case 'close': 
            console.log("CLOSE");
          return;
      }
    }, undefined, undefined); 
  
      // And schedule updates to the content every second
      const interval = setInterval(updateWebview, 1000*3);

      panel.onDidDispose(
        () => {
          // When the panel is closed, cancel any future updates to the webview content
          clearInterval(interval);
          console.log("CLOSE MINDMAP");
        },
        null,
        OrgExtension.get().context.subscriptions
      );
}