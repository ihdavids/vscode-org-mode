// The screenshots in the manual, as scenes. This runs inside VS Code (as its
// extension tests do): each scene sets the window up - a file, the cursor, a
// panel, a hover, a picker - and asks tools/docs/screenshots.js, listening on
// SHOT_PORT, to capture it. Run by that script, not by hand.

const vscode = require('vscode');
const path = require('path');

const port = process.env.SHOT_PORT;
const demo = process.env.DEMO_DIR;
const pause = ms => new Promise(r => setTimeout(r, ms));
const cmd = (id, ...args) => vscode.commands.executeCommand(id, ...args);
// A command that waits for an answer (a picker): started, not waited for.
const start = (id, ...args) => { vscode.commands.executeCommand(id, ...args).then(() => undefined, () => undefined); };

async function shot(name, settle = 700) {
    await cmd('notifications.clearAll');
    await pause(settle);
    const res = await fetch(`http://127.0.0.1:${port}/shot?name=${encodeURIComponent(name)}`);
    if (!res.ok) {
        throw new Error(`screenshot ${name}: ${await res.text()}`);
    }
}

async function open(file, re, ch = 0, column = vscode.ViewColumn.One) {
    const doc = await vscode.workspace.openTextDocument(path.join(demo, file));
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: column, preview: false });
    const line = re ? Math.max(0, doc.getText().split('\n').findIndex(l => re.test(l))) : 0;
    const pos = new vscode.Position(line, typeof ch === 'function' ? ch(doc.lineAt(line).text) : ch);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    await pause(300);
    return editor;
}

async function reset(sidebar = 'workbench.view.explorer') {
    await cmd('workbench.action.closeQuickOpen');
    await cmd('workbench.action.revertAndCloseActiveEditor').then(() => undefined, () => undefined);
    await cmd('workbench.action.closeAllEditors');
    await cmd('workbench.action.closePanel');
    if (sidebar) {
        await cmd(sidebar);
    } else {
        await cmd('workbench.action.closeSidebar');
    }
    await pause(300);
}

const SCENES = [
    ['hero', async () => {
        await reset('workbench.view.extension.org');
        await cmd('org.agenda.refresh');
        await open('plan.org', /NEXT \[#A\] Write the launch post/, 6);
        await pause(1500);
        await shot('hero');
    }],
    ['outline', async () => {
        await reset('workbench.view.explorer');
        await open('plan.org', /^\* Website relaunch/);
        await cmd('org.globalCycle');   // overview
        await cmd('org.globalCycle');   // contents
        await shot('outline');
        await cmd('editor.unfoldAll');
    }],
    ['table', async () => {
        await reset(null);
        await open('budget.org', /^\| Total/, l => l.lastIndexOf('|', l.length - 2) + 2);
        await pause(500);
        await cmd('editor.action.showHover');
        await shot('table', 1200);
    }],
    ['plot', async () => {
        await reset(null);
        await open('budget.org', /^\| Aug/, 3);
        await cmd('org.plotTable');
        await shot('plot', 2500);
    }],
    ['links', async () => {
        await reset('workbench.view.explorer');
        await open('notes.org', /logo\.png/, 6);
        await cmd('editor.action.showHover');
        await shot('links', 1500);
    }],
    ['backlinks', async () => {
        await reset('workbench.view.explorer');
        await open('plan.org', /Agree the sitemap/, 20);
        await cmd('editor.action.referenceSearch.trigger');
        await shot('backlinks', 2000);
    }],
    ['completion', async () => {
        await reset('workbench.view.explorer');
        const e = await open('plan.org', /^\*\* TODO Weekly review/, l => l.length);
        await e.edit(b => b.insert(e.selection.active, '  :'));
        await cmd('editor.action.triggerSuggest');
        await shot('completion', 1200);
        await cmd('hideSuggestWidget');
        await cmd('undo');
    }],
    ['agenda', async () => {
        await reset('workbench.view.extension.org');
        await cmd('org.agenda.refresh');
        await cmd('orgClock.focus');
        await cmd('org.clock.refresh');
        await open('plan.org', /^\* Website relaunch/);
        await shot('agenda', 2000);
    }],
    ['menu', async () => {
        await reset(null);
        await open('plan.org', /NEXT \[#A\] Write the launch post/, 6);
        start('org.menu');
        await shot('menu', 1200);
        await cmd('workbench.action.closeQuickOpen');
    }],
    ['refile', async () => {
        await reset(null);
        await open('plan.org', /WAITING Sign-off/, 6);
        start('org.refile');
        await shot('refile', 2000);
        await cmd('workbench.action.closeQuickOpen');
    }],
    ['insert-link', async () => {
        await reset(null);
        await open('notes.org', /^\* Checking the numbers/, 0);
        start('org.insertLink');
        await shot('insert-link', 1500);
        await cmd('workbench.action.closeQuickOpen');
    }],
    ['timestamp', async () => {
        await reset(null);
        await open('plan.org', /^\*\* TODO Weekly review/, 0);
        start('org.insertTimestamp');
        await shot('timestamp', 1000);
        await cmd('workbench.action.closeQuickOpen');
    }],
    ['columns', async () => {
        await reset(null);
        await open('plan.org', /^\* Website relaunch/);
        await cmd('org.columnView');
        await shot('columns', 2000);
    }],
    ['maths', async () => {
        await reset(null);
        await open('notes.org', /Pages should load/, 4);
        await cmd('org.showMediaPanel');
        await shot('maths', 3500);
    }],
    ['code', async () => {
        await reset('workbench.view.explorer');
        await open('notes.org', /^print/);
        await cmd('org.run');
        await pause(1500);
        await open('notes.org', /^\* Checking the numbers/);
        await shot('code', 1500);
    }],
    ['footnote', async () => {
        await reset('workbench.view.explorer');
        await open('notes.org', /\[fn:1\];/, l => l.indexOf('[fn:1]') + 2);
        await cmd('editor.action.showHover');
        await shot('footnote', 1200);
    }],
    ['narrow', async () => {
        await reset('workbench.view.explorer');
        await open('plan.org', /NEXT \[#A\] Write the launch post/, 6);
        await cmd('org.narrowToSubtree');
        await shot('narrow', 1200);
    }],
    ['preview', async () => {
        await reset(null);
        await open('plan.org', /^\* Website relaunch/);
        await cmd('org.showWeb');
        await shot('preview', 3000);
    }],
    ['timer', async () => {
        await reset('workbench.view.extension.org');
        await open('plan.org', /NEXT \[#A\] Write the launch post/, 6);
        start('org.startTimer');
        await pause(800);
        await cmd('workbench.action.acceptSelectedQuickOpenItem');
        await shot('timer', 2500);
        await cmd('org.stopTimer');
    }],
    ['walkthrough', async () => {
        await reset(null);
        await cmd('workbench.action.openWalkthrough', 'iorg.iorg#gettingStarted', false);
        await shot('walkthrough', 2500);
    }],
];

exports.run = async function () {
    await vscode.extensions.getExtension('iorg.iorg').activate();
    await pause(2500);   // the agenda and the connection settle
    const only = (process.env.SCENES || '').split(',').filter(s => s);
    for (const [name, scene] of SCENES) {
        if (only.length && only.indexOf(name) < 0) {
            continue;
        }
        try {
            await scene();
        } catch (e) {
            console.error(`scene ${name} failed: ${e.message}`);
        }
    }
    await reset('workbench.view.explorer');
};
