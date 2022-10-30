
import * as vscode from 'vscode';
import * as path from 'path';
import {ODb} from "./db"
import {OrgExtension} from "./extension"


const cats = {
  'Coding Cat': 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
  'Compiling Cat': 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif'
};

function getWebviewContent(webview, cat: keyof typeof cats, agd) {
    console.log(agd);
    //const myStyle = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'my-custom-style.css'));
    const myStyle = webview.asWebviewUri(vscode.Uri.file(path.join(OrgExtension.get().context.extensionPath, 'media', 'day_agenda.css')));
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cat Coding</title>
    <link href="${myStyle}" rel="stylesheet" />  
</head>
<body>
    <img src="${cats[cat]}" width="300" />
    ${agd[0].Headline}
</body>
</html>`;
}


export async function showAgenda(doc: vscode.TextEditor) {

      const panel = vscode.window.createWebviewPanel(
        'catCoding',
        'Cat Coding',
        vscode.ViewColumn.One,
        {}
      );

      let iteration = 0;
      const updateWebview = async () => {
        let agd = await ODb.agenda();
        const cat = iteration++ % 2 ? 'Compiling Cat' : 'Coding Cat';
        panel.title = cat;
        panel.webview.html = getWebviewContent(panel.webview, cat, agd);
      };

      // Set initial content
      updateWebview();

      // And schedule updates to the content every second
      const interval = setInterval(updateWebview, 1000);

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