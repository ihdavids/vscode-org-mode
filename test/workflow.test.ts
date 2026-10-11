// The everyday features of the third round: no login against a noAuth server,
// TODO cycling, statistics cookies, narrowing, footnotes, quick capture, the
// timer, and the panels. Needs ORGS_TEST_URL and TEST_ORG_DIR, as the
// features suite does (with an "Inbox" capture template filing into
// notes.org's Inbox).
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Auth } from '../src/auth';
import { ODb } from '../src/db';
import * as clockView from '../src/clock-view';

const dir = process.env.TEST_ORG_DIR || '';
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const run = (id: string, ...args: any[]): Promise<any> => vscode.commands.executeCommand(id, ...args) as any;
const win: any = vscode.window;
const disk = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');

function answerPick(choose: (items: any[]) => any) {
    const orig = win.showQuickPick;
    win.showQuickPick = async (items: any) => { win.showQuickPick = orig; return choose(await items); };
}
function answerInput(value: string | undefined) {
    const orig = win.showInputBox;
    win.showInputBox = async () => { win.showInputBox = orig; return value; };
}
async function until(test: () => boolean, ms = 4000) {
    for (let t = 0; t < ms && !test(); t += 100) {
        await pause(100);
    }
}
let n = 0;
async function scratch(text: string, line = 0, ch = 0): Promise<vscode.TextEditor> {
    const file = path.join(dir, `scratch-w${process.pid}-${n++}.org`);
    fs.writeFileSync(file, text);
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
    editor.selection = new vscode.Selection(line, ch, line, ch);
    await pause(100);
    return editor;
}
async function open(file: string, re: RegExp): Promise<vscode.TextEditor> {
    const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(path.join(dir, file)));
    const line = editor.document.getText().split('\n').findIndex(l => re.test(l));
    editor.selection = new vscode.Selection(line, 0, line, 0);
    await pause(100);
    return editor;
}

suite('Workflow', function () {
    this.timeout(30000);
    suiteSetup(async function () {
        if (!dir || !process.env.ORGS_TEST_URL) {
            this.skip();
        }
        await vscode.extensions.getExtension('iorg.iorg').activate();
        await vscode.workspace.getConfiguration('org').update('orgsConnection', process.env.ORGS_TEST_URL, vscode.ConfigurationTarget.Global);
    });
    teardown(() => run('workbench.action.closeAllEditors'));
    suiteTeardown(() => dir && fs.readdirSync(dir).filter(f => /^scratch-w/.test(f)).forEach(f => fs.unlinkSync(path.join(dir, f))));

    test('a noAuth server needs no login', async () => {
        await Auth.get().logout();
        assert.equal(await Auth.get().probe(), 'open');
        assert.ok(Auth.get().isLoggedIn());
        assert.ok(await Auth.get().ensureLoggedIn(), 'no login page');
    });

    test('Alt+Right cycles the keyword', async () => {
        const e = await scratch('* Ideas\n');
        await run('org.incrementContext');
        assert.equal(e.document.lineAt(0).text, '* TODO Ideas');
        await run('org.incrementContext');
        assert.equal(e.document.lineAt(0).text, '* DONE Ideas');
        await run('org.decrementContext');
        assert.equal(e.document.lineAt(0).text, '* TODO Ideas');
    });

    test('statistics cookies follow their children', async () => {
        const e = await scratch('* Plan [/]\n** TODO a\n** b\n');
        await e.edit(b => b.insert(new vscode.Position(2, 3), 'DONE '));
        await until(() => e.document.lineAt(0).text === '* Plan [1/2]');
        assert.equal(e.document.lineAt(0).text, '* Plan [1/2]');
    });

    test('narrow to a subtree, edit it, save it back', async () => {
        await open('main.org', /^\* Ideas/);
        await run('org.narrowToSubtree');
        const narrow = vscode.window.activeTextEditor;
        assert.equal(narrow.document.uri.scheme, 'org-narrow');
        assert.ok(/^\* Ideas/.test(narrow.document.getText()));
        assert.ok(!/Write the report/.test(narrow.document.getText()), 'just the subtree');
        await narrow.edit(b => b.insert(new vscode.Position(1, 0), '  - kiwi\n'));
        await narrow.document.save();
        await until(() => /\* Ideas\n  - kiwi\n/.test(disk('main.org')));
        assert.ok(/\* Ideas\n  - kiwi\n/.test(disk('main.org')), disk('main.org'));
    });

    test('footnotes: follow, hover, insert', async () => {
        const e = await scratch('Some text[fn:1] here.\n\n* Footnotes\n[fn:1] The note.\n', 0, 11);
        const defs: any[] = await run('vscode.executeDefinitionProvider', e.document.uri, new vscode.Position(0, 11));
        assert.equal(defs[0].range.start.line, 3);
        const hovers: vscode.Hover[] = await run('vscode.executeHoverProvider', e.document.uri, new vscode.Position(0, 11));
        assert.ok(hovers.some(h => h.contents.some((c: any) => /The note\./.test(c.value || c))));
        e.selection = new vscode.Selection(0, 21, 0, 21);
        await run('org.insertFootnote');
        assert.equal(e.document.lineAt(0).text, 'Some text[fn:1] here.[fn:2]');
        assert.equal(e.document.lineAt(4).text, '[fn:2] ');
        assert.equal(e.selection.active.line, 4, 'on to the definition');
    });

    test('quick capture files a line into the Inbox', async () => {
        answerPick(items => items.find((i: any) => i.name === 'Inbox'));
        answerInput('a quick thought');
        await run('org.quickCapture');
        await until(() => /a quick thought/.test(disk('notes.org')));
        assert.ok(/\* Inbox[\s\S]*\*\* a quick thought/.test(disk('notes.org')), disk('notes.org'));
    });

    test('a pomodoro under a heading clocks in, and stopping clocks out', async () => {
        await open('main.org', /^\* Code/);
        answerPick(items => items[0]);
        await run('org.startTimer');
        let c: any = await ODb.clockActive();
        assert.ok(c.Active, 'clocked in');
        assert.equal(String(c.Target.Id), 'Code');
        await run('org.stopTimer');
        await until(() => false, 500);
        c = await ODb.clockActive();
        assert.ok(!c.Active, 'clocked out');
    });

    test('the clock view lists today and this week', async () => {
        await clockView.clockTree.load();
        const periods = clockView.clockTree.getChildren();
        assert.deepEqual(periods.map(p => String(p.label)), ['Today', 'This week']);
    });

    test('the panels open', async () => {
        await open('main.org', /^\* Ideas/);
        await run('org.columnView');
        await run('org.showMediaPanel');
        await run('org.showWeb');
        await pause(500);
        const tabs = vscode.window.tabGroups.all.reduce((a, g) => a.concat(g.tabs.map(t => t.label)), [] as string[]);
        assert.ok(tabs.some(t => /^Columns/.test(t)), tabs.join());
        assert.ok(tabs.some(t => /Pictures/.test(t)), tabs.join());
        assert.ok(tabs.some(t => /^Web/.test(t)), tabs.join());
    });
});
