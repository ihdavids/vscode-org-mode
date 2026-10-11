// The getting started walkthrough's practice file: something to try Tab,
// tables and links on without touching your own files.

import * as vscode from 'vscode';

const PRACTICE = `#+TITLE: Practice
Press Tab on a heading below. Try Alt+Up and Alt+Down on one, too.

* TODO Plan the week                                           :work:
  SCHEDULED: <${new Date().toISOString().slice(0, 10)}>
** Write the report [/]
*** TODO Draft
*** TODO Send it round
** Groceries
   - [ ] bread
   - [ ] coffee
* Notes
  A link to [[*Groceries][the shopping]] - F12 follows it.

  |Item|Qty
  |-
  |apples|3
  Put the cursor in the table above and press Tab.
`;

export function activateWalkthrough(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand('org.openPractice', async () => {
        const doc = await vscode.workspace.openTextDocument({ language: 'org', content: PRACTICE });
        await vscode.window.showTextDocument(doc);
    }));
}
