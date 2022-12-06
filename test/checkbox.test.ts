import * as vscode from 'vscode';
import * as assert from 'assert';

interface TestEditorOptions {
    language?: string;
    content?: string;
}

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

type TestEditorAction = (editor: vscode.TextEditor, document: vscode.TextDocument) => Promise<void>;

async function inTextEditor(options: TestEditorOptions, action: TestEditorAction) {
    const d = await vscode.workspace.openTextDocument(options);
    await vscode.window.showTextDocument(d).then( async (ed) => {
        move(ed,1,0);
        await action(ed, d);
    });
}

function move(editor: vscode.TextEditor, line: number, col: number) {
    const pos = new vscode.Position(line, col);
    editor.selection = new vscode.Selection(pos, pos);
}

async function insert(editor: vscode.TextEditor, text: string) {
    await editor.edit((edit) => {
        let pos = editor.selection.active;
        edit.insert(pos, text);
    });
}

function select(editor: vscode.TextEditor, range: vscode.Range) {
    editor.selection = new vscode.Selection(range.start, range.end);
}

suite('Checkbox', () => {

    /* This is broken, we are not awaiting properly
    test('InsertSubheading', async () => {
        const initial = 
`* Header
   - [ ] A
   - [ ] B`;
        const expected = 
`* Header [0/2]
   - [ ] A
   - [ ] B`;

        await inTextEditor({ language: 'org', content: initial }, async (ed, document) => {
            await vscode.commands.executeCommand('org.insertCheckboxSummary');
            console.log("OUT: ", document.getText());
            assert.equal(document.getText(), expected);
        });
    });
*/
    test('InsertCheckbox', async () => {
        const initial = 
`   - [ ] A
   - [ ] B`;
        const expected = 
`   - [ ] A
   - [ ] 
   - [ ] 
   - [ ] B`;

        await inTextEditor({ language: 'org', content: initial }, async (ed, document) => {
            await move(ed,0,0);
            await vscode.commands.executeCommand('org.insertCheckbox');
            await vscode.commands.executeCommand('org.insertCheckbox');
            assert.equal(document.getText(), expected);
        });
    });

});
