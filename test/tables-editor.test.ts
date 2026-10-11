// The table commands in a real editor: what Tab, Enter and the rest do to the
// text and where they leave the cursor. Recalculation needs an orgs server;
// set ORGS_TEST_URL (a server started with noAuth: true) to include it.
import * as assert from 'assert';
import * as vscode from 'vscode';
import { Auth } from '../src/auth';

async function open(text: string, line: number, ch: number): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument({ language: 'org', content: text });
    const editor = await vscode.window.showTextDocument(doc);
    at(editor, line, ch);
    return editor;
}

function at(editor: vscode.TextEditor, line: number, ch: number) {
    const p = new vscode.Position(line, ch);
    editor.selection = new vscode.Selection(p, p);
}

const run = (id: string) => vscode.commands.executeCommand(id);
const text = (e: vscode.TextEditor) => e.document.getText();
const cursor = (e: vscode.TextEditor) => [e.selection.active.line, e.selection.active.character];

suite('Table commands', () => {
    teardown(() => vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'));

    test('Tab aligns a table typed by hand and moves to the next cell', async () => {
        const e = await open('|a|bb\n|-\n|ccc|d|', 0, 2);
        await run('org.gotoNextCell');
        assert.equal(text(e), '| a   | bb |\n|-----+----|\n| ccc | d  |');
        assert.deepEqual(cursor(e), [0, 8]);
        await run('org.gotoNextCell');
        assert.deepEqual(cursor(e), [2, 2], 'skips the rule');
    });

    test('Tab past the last cell makes a new row', async () => {
        const e = await open('| a | b |', 0, 6);
        await run('org.gotoNextCell');
        assert.equal(text(e), '| a | b |\n|   |   |');
        assert.deepEqual(cursor(e), [1, 2]);
    });

    test('Shift-Tab goes back, over rules', async () => {
        const e = await open('| a | b |\n|---+---|\n| c | d |', 2, 2);
        await run('org.gotoPreviousCell');
        assert.deepEqual(cursor(e), [0, 6]);
    });

    test('Enter goes down a column, making a row over a rule', async () => {
        const e = await open('| a | b |\n|---+---|\n| c | d |', 0, 6);
        await run('org.nextRow');
        assert.equal(text(e), '| a | b |\n|   |   |\n|---+---|\n| c | d |');
        assert.deepEqual(cursor(e), [1, 6]);
    });

    test('numbers line up on the right', async () => {
        const e = await open('| Item | Qty |\n|-\n| apple | 3 |\n| pear | 12 |', 2, 2);
        await run('org.formatUnderCursor');
        assert.equal(text(e), '| Item  | Qty |\n|-------+-----|\n| apple |   3 |\n| pear  |  12 |');
    });

    test('rows and columns move with the cursor', async () => {
        const e = await open('| a | b |\n| c | d |', 0, 2);
        await run('org.moveRowDown');
        assert.equal(text(e), '| c | d |\n| a | b |');
        assert.deepEqual(cursor(e), [1, 2]);
        await run('org.moveColRight');
        assert.equal(text(e), '| d | c |\n| b | a |');
        assert.deepEqual(cursor(e), [1, 6]);
    });

    test('insert and delete rows and columns', async () => {
        const e = await open('| a | b |', 0, 2);
        await run('org.addRowDown');
        assert.equal(text(e), '| a | b |\n|   |   |');
        assert.deepEqual(cursor(e), [1, 2]);
        await run('org.addColRight');
        assert.equal(text(e), '| a |   | b |\n|   |   |   |');
        assert.deepEqual(cursor(e), [1, 6]);
        await run('org.deleteCol');
        await run('org.deleteRow');
        assert.equal(text(e), '| a | b |');
    });

    test('a rule and on to the row below it', async () => {
        const e = await open('| Name | Age |', 0, 2);
        await run('org.insertSeparatorAndMove');
        assert.equal(text(e), '| Name | Age |\n|------+-----|\n|      |     |');
        assert.deepEqual(cursor(e), [2, 2]);
    });

    test('copy down counts up', async () => {
        const e = await open('| 1 |', 0, 2);
        await run('org.copyFieldDown');
        await run('org.copyFieldDown');
        assert.equal(text(e), '| 1 |\n| 2 |\n| 3 |');
        assert.deepEqual(cursor(e), [2, 2]);
    });

    test('split a cell, then join it back', async () => {
        const e = await open('| hello world | x |', 0, 8);
        await run('org.splitCell');
        assert.equal(text(e), '| hello | x |\n| world |   |');
        await run('org.gotoPreviousCell');
        await run('org.gotoPreviousCell');
        await run('org.joinRows');
        assert.equal(text(e), '| hello world | x |');
    });

    test('a table under a heading keeps its indent', async () => {
        const e = await open('* H\n  |a|b|\n  |c|d|', 1, 3);
        await run('org.gotoNextCell');
        assert.equal(text(e), '* H\n  | a | b |\n  | c | d |');
        assert.deepEqual(cursor(e), [1, 8]);
    });

    test('convert a paragraph of csv', async () => {
        const e = await open('name,n\nalpha,1\nbeta,22', 1, 0);
        await run('org.convertToTable');
        assert.equal(text(e), '| name  |  n |\n|-------+----|\n| alpha |  1 |\n| beta  | 22 |');
    });

    test('commands do nothing outside a table', async () => {
        const e = await open('just text', 0, 0);
        await run('org.gotoNextCell');
        await run('org.deleteRow');
        assert.equal(text(e), 'just text');
    });
});

suite('Table formulas', function () {
    const url = process.env.ORGS_TEST_URL;
    teardown(() => vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'));
    suiteSetup(async function () {
        if (!url) {
            this.skip();
        }
        await vscode.workspace.getConfiguration('org').update('orgsConnection', url, vscode.ConfigurationTarget.Global);
        // A server with noAuth takes any token; this only stops the login page.
        await Auth.get().adopt('test', Date.now() + 3600 * 1000);
    });

    test('recalculates unsaved text, keeping the cursor', async () => {
        const e = await open('| a | b |\n|---+---|\n| 1 |   |\n| 3 |   |\n#+TBLFM: $2=$1*2', 2, 2);
        await run('org.execTable');
        assert.equal(text(e), '| a | b |\n|---+---|\n| 1 | 2 |\n| 3 | 6 |\n#+TBLFM: $2=$1*2');
        assert.deepEqual(cursor(e), [2, 2]);
    });

    test('=expr typed in a cell becomes a column formula', async () => {
        const e = await open('| a | b |\n|---+---|\n| 2 | =$1*10 |\n| 5 |   |', 2, 8);
        await run('org.gotoNextCell');
        assert.equal(text(e), '| a |  b |\n|---+----|\n| 2 | 20 |\n| 5 | 50 |\n#+TBLFM: $2=$1*10');
    });

    test('recalculate every table in the file at once', async () => {
        const e = await open('| 1 | |\n#+TBLFM: $2=$1+1\n\n| 5 | |\n#+TBLFM: $2=$1*$1', 0, 0);
        await run('org.execAllTables');
        assert.equal(text(e), '| 1 | 2 |\n#+TBLFM: $2=$1+1\n\n| 5 | 25 |\n#+TBLFM: $2=$1*$1');
    });

    test('a broken formula leaves the table alone', async () => {
        const e = await open('| 1 | |\n#+TBLFM: $2=nosuch((', 0, 2);
        await run('org.execTable');
        assert.equal(text(e), '| 1 | |\n#+TBLFM: $2=nosuch((');
    });
});
