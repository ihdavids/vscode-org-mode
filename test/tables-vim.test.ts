// The table commands with VSCodeVim driving the editor: vim has to see the
// cursor where a command leaves it, in normal mode and in insert mode. Skipped
// unless VSCodeVim is installed in the test instance.
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Each test its own file: untitled documents all get the same uri, and vim
// keeps its state per uri, so a new one can briefly get the last one's.
let serial = 0;
async function openFile(content: string, ext: string): Promise<vscode.TextDocument> {
    const file = path.join(process.env.TEST_TMP || os.tmpdir(), `t${process.pid}-${serial++}.${ext}`);
    fs.writeFileSync(file, content);
    return vscode.workspace.openTextDocument(file);
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
// Vim works through a queue of keys; a person is slower than this anyway.
const run = async (id: string, args?: any) => { await vscode.commands.executeCommand(id, args); await pause(80); };
const type = (text: string) => run('type', { text });

// Vim's queue may still be working: wait for the text rather than guess how long.
async function settles(get: () => string, want: string) {
    for (let i = 0; i < 40 && get() !== want; i++) {
        await pause(50);
    }
    assert.equal(get(), want);
}

async function open(text: string, line: number, ch: number): Promise<vscode.TextEditor> {
    const doc = await openFile(text, 'org');
    const editor = await vscode.window.showTextDocument(doc);
    const p = new vscode.Position(line, ch);
    editor.selection = new vscode.Selection(p, p);
    await pause(400);
    return editor;
}

suite('Table commands with vim', function () {
    suiteSetup(async function () {
        const vim = vscode.extensions.getExtension('vscodevim.vim');
        if (!vim) {
            this.skip();
        }
        await vim.activate();
    });
    teardown(() => vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'));

    test('normal mode: vim acts where Tab left the cursor', async () => {
        const e = await open('| a | bc |\n| d | e  |', 0, 2);
        await run('org.gotoNextCell');
        assert.deepEqual([e.selection.active.line, e.selection.active.character], [0, 6]);
        await type('x');   // vim's x: delete the character under the cursor
        await settles(() => e.document.lineAt(0).text, '| a | c |');
    });

    test('insert mode: type into a cell, Tab aligns and moves on', async () => {
        const e = await open('| a | b |\n| c | d |', 0, 2);
        await type('A');   // append at the end of the line...
        await run('extension.vim_escape');
        await run('org.gotoPreviousCell');
        await type('i');   // ...then insert in the cell Shift-Tab went to
        await type('long ');
        await run('org.gotoNextCell');
        await settles(() => e.document.getText(), '| a | long b |\n| c | d      |');
        assert.deepEqual([e.selection.active.line, e.selection.active.character], [1, 2]);
        await type('Z');   // still inserting: the text goes in the new cell
        await settles(() => e.document.lineAt(1).text, '| Zc | d      |');
        await run('extension.vim_escape');
    });

    test('normal mode: rows move and vim follows', async () => {
        const e = await open('| a |\n| b |\n| c |', 0, 2);
        await run('org.moveRowDown');
        await run('org.moveRowDown');
        assert.equal(e.document.getText(), '| b |\n| c |\n| a |');
        await type('x');
        await settles(() => e.document.lineAt(2).text, '|  |');
    });

    test('insert mode at typing speed: words and Tabs land in the right cells', async () => {
        const e = await open('| a | b | c |', 0, 2);
        await type('i');
        const words = ['one', 'two', 'six', 'ten', 'red', 'fox'];
        for (const w of words) {
            for (const ch of w) {
                await vscode.commands.executeCommand('type', { text: ch });
                await pause(25);
            }
            await vscode.commands.executeCommand('org.gotoNextCell');
        }
        await run('extension.vim_escape');
        await settles(() => e.document.getText(),
            '| onea | twob | sixc |\n| ten  | red  | fox  |\n|      |      |      |');
    });
});
