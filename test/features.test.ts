// Outline, links, completion, blocks, refile, dates, export, the orgs tools and
// the agenda, in a real editor against a real orgs server. Needs
// ORGS_TEST_URL (a server with noAuth: true and babel on for python) and
// TEST_ORG_DIR (the server's org directory, opened as the workspace, holding
// the main.org and notes.org this suite was written against).
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Auth } from '../src/auth';
import { ODb } from '../src/db';
import * as agendaView from '../src/agenda-view';

const dir = process.env.TEST_ORG_DIR || '';
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const run = (id: string, ...args: any[]): Promise<any> => vscode.commands.executeCommand(id, ...args) as any;
const win: any = vscode.window;

// Answer the next quick pick (or input box) the way a person would.
function answerPick(choose: (items: any[]) => any) {
    const orig = win.showQuickPick;
    win.showQuickPick = async (items: any) => { win.showQuickPick = orig; return choose(await items); };
}
function answerInput(value: string | undefined) {
    const orig = win.showInputBox;
    win.showInputBox = async () => { win.showInputBox = orig; return value; };
}
const labelled = (re: RegExp) => (items: any[]) => items.find(i => re.test(i.label));

async function open(file: string, line = 0, ch = 0): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument(path.join(dir, file));
    const editor = await vscode.window.showTextDocument(doc);
    const p = new vscode.Position(line, ch);
    editor.selection = new vscode.Selection(p, p);
    await pause(100);
    return editor;
}
const lineOf = (e: vscode.TextEditor, re: RegExp) => e.document.getText().split('\n').findIndex(l => re.test(l));
const disk = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');

// A file of its own for each test that only edits text, so nothing it leaves
// unsaved can reach the files the server tests work on.
let scratchN = 0;
async function scratch(text: string, line = 0, ch = 0): Promise<vscode.TextEditor> {
    const name = `scratch-${process.pid}-${scratchN++}.org`;
    fs.writeFileSync(path.join(dir, name), text);
    return open(name, line, ch);
}

async function until(test: () => boolean, ms = 4000) {
    for (let t = 0; t < ms && !test(); t += 100) {
        await pause(100);
    }
}

suite('Features', function () {
    this.timeout(30000);
    suiteSetup(async function () {
        if (!dir || !process.env.ORGS_TEST_URL) {
            this.skip();
        }
        await vscode.extensions.getExtension('iorg.iorg').activate();
        await vscode.workspace.getConfiguration('org').update('orgsConnection', process.env.ORGS_TEST_URL, vscode.ConfigurationTarget.Global);
        await Auth.get().adopt('test', Date.now() + 3600 * 1000);
    });
    teardown(() => run('workbench.action.closeAllEditors'));
    suiteTeardown(() => dir && fs.readdirSync(dir).filter(f => /^scratch-/.test(f)).forEach(f => fs.unlinkSync(path.join(dir, f))));

    // -- Outline -------------------------------------------------------------

    test('Alt+Down moves a subtree past its sibling', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^\*\* NEXT Second idea/);
        e.selection = new vscode.Selection(line, 3, line, 3);
        await run('org.moveSubtreeDown');
        assert.ok(lineOf(e, /^\*\* First idea/) < lineOf(e, /^\*\* NEXT Second idea/));
        assert.equal(e.selection.active.line, lineOf(e, /^\*\* NEXT Second idea/), 'the cursor goes with it');
        await run('undo');
        assert.ok(!e.document.isDirty, 'undo puts it back');
    });

    test('Tab folds a heading, then shows it again', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^\* Ideas/);
        e.selection = new vscode.Selection(line, 0, line, 0);
        const shown = (l: number) => e.visibleRanges.some(r => l >= r.start.line && l <= r.end.line);
        await run('org.cycle');
        await until(() => !shown(line + 1));
        assert.ok(!shown(line + 1), 'folded');
        await run('org.cycle');
        await until(() => shown(line + 1));
        assert.ok(shown(line + 1), 'children shown');
        await run('editor.unfoldAll');
    });

    test('Sort orders a list', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^\s+- zebra/);
        e.selection = new vscode.Selection(line, 4, line, 4);
        answerPick(labelled(/A to Z/));
        await run('org.sort');
        const at = lineOf(e, /^\s+- apple/);
        assert.deepEqual([0, 1, 2].map(i => e.document.lineAt(at + i).text.trim()), ['- apple', '- mango', '- zebra']);
        await run('undo');
        assert.ok(!e.document.isDirty, 'undo puts it back');
    });

    // -- Links -----------------------------------------------------------------

    test('F12 follows a link into another file', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /the sources/);
        const ch = e.document.lineAt(line).text.indexOf('[[file:') + 3;
        const defs: any[] = await run('vscode.executeDefinitionProvider', e.document.uri, new vscode.Position(line, ch));
        assert.equal(defs.length, 1);
        assert.equal(path.basename(defs[0].uri.fsPath), 'notes.org');
        assert.equal(defs[0].range.start.line, 1);
    });

    test('Shift+F12 on a heading finds the links to it, from every file', async () => {
        const e = await open('main.org');
        const refs: any[] = await run('vscode.executeReferenceProvider', e.document.uri, new vscode.Position(1, 5));
        assert.deepEqual(refs.map(r => path.basename(r.uri.fsPath)), ['notes.org']);
        const ideas = lineOf(e, /^\* Ideas/);
        const toIdeas: any[] = await run('vscode.executeReferenceProvider', e.document.uri, new vscode.Position(ideas, 3));
        assert.equal(toIdeas.length, 1);
    });

    test('an image link shows the picture on hover', async () => {
        const e = await open('notes.org');
        const hovers: vscode.Hover[] = await run('vscode.executeHoverProvider', e.document.uri, new vscode.Position(2, 20));
        const md = hovers.map(h => h.contents.map((c: any) => c.value || c).join('')).join('');
        assert.ok(/!\[cat\.png\]\(file:.*cat\.png/.test(md), md);
    });

    test('Insert Link offers headings from other files', async () => {
        const e = await scratch('* Here\n\n', 1, 0);
        answerPick(labelled(/Second idea/));
        answerInput('second');
        await run('org.insertLink');
        assert.equal(e.document.lineAt(1).text, '[[file:./main.org::*Second idea][second]]');
    });

    // -- Completion -----------------------------------------------------------

    test('completes tags, keywords, #+ keywords and link targets', async () => {
        const e = await scratch('* Sources\n* Inbox :\n#+BEG\n[[*\n');
        const labels = async (line: number, ch: number) => {
            const list: vscode.CompletionList = await run('vscode.executeCompletionItemProvider', e.document.uri, new vscode.Position(line, ch));
            return list.items.map(i => typeof i.label === 'string' ? i.label : (i.label as any).label);
        };
        assert.ok((await labels(1, 9)).indexOf('work') >= 0, 'a tag used in another file, via the server');
        assert.ok((await labels(2, 5)).indexOf('BEGIN_SRC') >= 0);
        assert.ok((await labels(3, 3)).indexOf('*Sources') >= 0);
    });

    // -- Blocks ----------------------------------------------------------------

    test('Run runs the source block under the cursor', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^print/);
        e.selection = new vscode.Selection(line, 0, line, 0);
        await run('org.run');
        await until(() => /#\+RESULTS:\s*\n: 42/.test(disk('main.org')));
        assert.ok(/#\+RESULTS:\s*\n: 42/.test(disk('main.org')), disk('main.org'));
    });

    test('Run updates the dynamic block under the cursor', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^#\+BEGIN: clocktable/);
        e.selection = new vscode.Selection(line, 0, line, 0);
        await run('org.run');
        await until(() => /#\+BEGIN: clocktable[^\n]*\n.+\n/.test(disk('main.org')) && !/#\+BEGIN: clocktable[^\n]*\n#\+END:/.test(disk('main.org')));
        assert.ok(!/#\+BEGIN: clocktable[^\n]*\n#\+END:/.test(disk('main.org')), 'the block has content');
    });

    test('Run and Update links sit above blocks', async () => {
        const e = await open('main.org');
        const lenses: vscode.CodeLens[] = await run('vscode.executeCodeLensProvider', e.document.uri);
        const titles = lenses.map(l => l.command && l.command.title);
        assert.ok(titles.indexOf('$(play) Run') >= 0 && titles.indexOf('$(refresh) Update') >= 0, titles.join());
    });

    // -- Dates and the clock ---------------------------------------------------

    test('Insert ID and Insert Created fill in the drawer', async () => {
        const e = await scratch('* Ideas\n  - zebra\n', 0, 0);
        await run('org.insertId');
        await run('org.insertCreated');
        assert.ok(/^\s+:ID: [0-9a-f]{8}-[0-9a-f]{4}-4/.test(e.document.lineAt(2).text), e.document.lineAt(2).text);
        assert.ok(/^\s+:CREATED: \[\d{4}-\d{2}-\d{2} \w{3} \d{2}:\d{2}\]/.test(e.document.lineAt(3).text));
    });

    test('Insert Timestamp offers today and now', async () => {
        const e = await scratch('* Inbox\n', 0, 7);
        answerPick(items => items[1]);
        await run('org.insertTimestamp');
        assert.ok(/^\* Inbox<\d{4}-\d{2}-\d{2} \w{3} \d{2}:\d{2}>$/.test(e.document.lineAt(0).text), e.document.lineAt(0).text);
    });

    test('clocking in shows in the status bar, and Go To Running Clock finds it', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^\* Code/);
        e.selection = new vscode.Selection(line, 0, line, 0);
        await run('org.clockin');
        const c: any = await ODb.clockActive();
        assert.ok(c.Active);
        await run('workbench.action.closeAllEditors');
        await run('org.jumpToClock');
        const now = vscode.window.activeTextEditor;
        assert.equal(path.basename(now.document.fileName), 'main.org');
        assert.equal(now.selection.active.line, lineOf(now, /^\* Code/));
        await run('org.clockout');
        assert.ok(!(await ODb.clockActive() as any).Active);
    });

    // -- Export ------------------------------------------------------------------

    test('Export Subtree writes just that subtree', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^\* Ideas/);
        e.selection = new vscode.Selection(line, 0, line, 0);
        answerPick(labelled(/HTML/));
        const msg = win.showInformationMessage;
        win.showInformationMessage = async () => undefined;
        try {
            await run('org.exportSubtree');
        } finally {
            win.showInformationMessage = msg;
        }
        const out = path.join(dir, 'main-ideas.html');
        assert.ok(fs.existsSync(out));
        const html = fs.readFileSync(out, 'utf8');
        assert.ok(/zebra/.test(html) && !/Write the report/.test(html), 'only the subtree');
        fs.unlinkSync(out);
    });

    // -- The orgs tools ------------------------------------------------------------

    test('Habits marks a habit done, and again takes it back', async () => {
        answerPick(labelled(/Walk/));
        await run('org.habits');
        let h: any = await ODb.api('/habits');
        assert.ok(h.Habits[0].DoneToday, 'ticked');
        answerPick(labelled(/Walk/));
        await run('org.habits');
        h = await ODb.api('/habits');
        assert.ok(!h.Habits[0].DoneToday, 'taken back');
    });

    test('Attach File uploads, Open Attachment lists it', async () => {
        const e = await open('notes.org', 4, 0);
        e.selection = new vscode.Selection(lineOf(e, /^\* Inbox/), 0, lineOf(e, /^\* Inbox/), 0);
        const dialog = win.showOpenDialog;
        win.showOpenDialog = async () => [vscode.Uri.file(path.join(dir, 'pics', 'cat.png'))];
        try {
            await run('org.attachFile');
        } finally {
            win.showOpenDialog = dialog;
        }
        let listed: string[] = [];
        answerPick(items => { listed = items.map((i: any) => i.label); return undefined; });
        e.selection = new vscode.Selection(lineOf(e, /^\* Inbox/), 0, lineOf(e, /^\* Inbox/), 0);
        await run('org.openAttachment');
        assert.ok(listed.some(l => /cat\.png/.test(l)), listed.join());
    });

    test('File History compares an earlier version with now', async () => {
        await open('notes.org');
        answerPick(items => items[0]);
        await run('org.fileHistory');
        await until(() => !!vscode.window.activeTextEditor && vscode.window.visibleTextEditors.some(t => t.document.uri.scheme === 'orgs-history'));
        const old = vscode.window.visibleTextEditors.find(t => t.document.uri.scheme === 'orgs-history');
        assert.ok(old, 'a diff with the old version');
        assert.ok(!/a change/.test(old.document.getText()), 'the committed text, without the later change');
    });

    // -- Refile and archive ---------------------------------------------------------

    test('Refile moves a subtree under a heading in another file', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^\*\* First idea/);
        e.selection = new vscode.Selection(line, 0, line, 0);
        answerPick(labelled(/Inbox/));
        await run('org.refile');
        await until(() => /\* Inbox[^*]*\*\* First idea/.test(disk('notes.org')));
        assert.ok(/\* Inbox[^*]*\*\* First idea/.test(disk('notes.org')), disk('notes.org'));
        assert.ok(!/First idea/.test(disk('main.org')));
    });

    test('Archive sends a subtree to the archive file', async () => {
        const e = await open('main.org');
        const line = lineOf(e, /^\* DONE Old task/);
        e.selection = new vscode.Selection(line, 0, line, 0);
        await run('org.archive');
        await until(() => !/Old task/.test(disk('main.org')));
        assert.ok(!/Old task/.test(disk('main.org')));
        assert.ok(fs.readdirSync(dir).some(f => /archive/.test(f)));
    });

    // -- Agenda --------------------------------------------------------------------

    test('the agenda shows today with its entries', async () => {
        const tree = agendaView.agendaTree;
        await tree.load();
        const days = tree.getChildren();
        assert.ok(/^Today, /.test(String(days[0].label)), String(days[0].label));
        const entries = tree.getChildren(days[0]);
        const show = entries.map(e => `${e.label} | ${e.description} | ${(e.iconPath as vscode.ThemeIcon).id} | ${e.contextValue}`);
        assert.ok(show.indexOf('TODO [#B] Write the report | :work: | circle-large-outline | agendaEntryTodo') >= 0, show.join('\n'));
        assert.ok(show.some(l => /^TODO Walk \| :health: \| sync/.test(l)), 'the habit, with its own icon: ' + show.join('\n'));
    });

    test('the agenda marks an entry done', async () => {
        const res: any = await ODb.api('/agenda');
        const node = res.Nodes.find((n: any) => n.Headline === 'Write the report');
        assert.ok(node, 'on today\'s agenda');
        await run('org.agenda.done', { node, entry: {} });
        await until(() => /\* DONE \[#B\] Write the report/.test(disk('main.org')));
        assert.ok(/\* DONE \[#B\] Write the report/.test(disk('main.org')), disk('main.org').split('\n')[1]);
    });
});
