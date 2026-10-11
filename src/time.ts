// Dates and the clock. One Insert Timestamp menu (today or now, active or
// inactive, or a date picked from the calendar); Created, Custom ID and ID
// properties in one go; every clock total in a file worked out again; and the
// running clock in the status bar - how long, on what - one click from the
// heading it is on.

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ODb } from './db';
import { Auth } from './auth';
import { linesOf, replaceLines } from './edit-lines';
import { headingAt, parseHeading, setProperty, getProperty, findOlp } from './outline/model';
import { findHeading } from './links/model';
import { stamp, recalcClockLine, slug, elapsed } from './dates';
import { openAt, diskLines } from './org-files';

// -- Timestamps --------------------------------------------------------------

interface StampPick extends vscode.QuickPickItem { text?: () => string; command?: string; }

// org's C-c . and C-c !, in one menu.
export async function insertTimestamp(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const now = new Date();
    const items: StampPick[] = [
        { label: '$(calendar) ' + stamp(now, true, false), description: 'today', text: () => stamp(new Date(), true, false) },
        { label: '$(clock) ' + stamp(now, true, true), description: 'now', text: () => stamp(new Date(), true, true) },
        { label: '$(calendar) ' + stamp(now, false, false), description: 'today, inactive - not in the agenda', text: () => stamp(new Date(), false, false) },
        { label: '$(clock) ' + stamp(now, false, true), description: 'now, inactive', text: () => stamp(new Date(), false, true) },
        { label: '$(calendar) Pick a date…', description: 'from the calendar', command: 'org.timestampNode' },
        { label: '$(milestone) Schedule…', description: 'SCHEDULED: on the heading', command: 'org.scheduleNode' },
        { label: '$(flame) Deadline…', description: 'DEADLINE: on the heading', command: 'org.deadlineNode' },
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Insert a timestamp' });
    if (!pick) {
        return;
    }
    if (pick.command) {
        await vscode.commands.executeCommand(pick.command);
        return;
    }
    await editor.edit(b => editor.selections.forEach(s => b.replace(s, pick.text())));
}

// -- Properties --------------------------------------------------------------

async function setOnHeading(name: string, value: (title: string, lines: string[], heading: number) => Promise<string | undefined>) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const lines = linesOf(editor.document);
    const h = headingAt(lines, editor.selection.active.line);
    if (h < 0) {
        vscode.window.setStatusBarMessage('Not under a heading', 2000);
        return;
    }
    const v = await value(parseHeading(lines[h], h, []).title, lines, h);
    if (v === undefined) {
        return;
    }
    const r = setProperty(lines, h, name, v);
    await replaceLines(editor, r.start, r.end, r.lines, editor.selection.active.line);
    vscode.window.setStatusBarMessage(`$(check) :${name}: ${v}`, 3000);
}

export const insertCreated = () => setOnHeading('CREATED', async (_t, lines, h) =>
    getProperty(lines, h, 'CREATED') || stamp(new Date(), false, true));

// A CUSTOM_ID made from the title and unique in the file: what [[#id]] links
// and html anchors use.
export const insertCustomId = () => setOnHeading('CUSTOM_ID', async (title, lines, h) => {
    const taken = new Set(lines.map(l => /^\s*:CUSTOM_ID:\s*(\S+)/i.exec(l)).filter(m => m).map(m => m[1]));
    const current = getProperty(lines, h, 'CUSTOM_ID');
    const base = slug(title);
    let id = base;
    for (let n = 2; taken.has(id) && id !== current; n++) {
        id = `${base}-${n}`;
    }
    return vscode.window.showInputBox({ prompt: 'CUSTOM_ID - links to it read [[#id]]', value: current || id,
        validateInput: v => /^\S+$/.test(v) ? undefined : 'No spaces in an id' });
});

// An ID: a link to it ([[id:…]]) finds the heading wherever it moves to.
export const insertId = () => setOnHeading('ID', async (_t, lines, h) =>
    getProperty(lines, h, 'ID') || uuid());

// A random (version 4) uuid, as org-id makes them.
function uuid(): string {
    const b = crypto.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Every CLOCK: line's total in the file, worked out again.
export async function updateAllClocks(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const lines = linesOf(editor.document);
    const next = lines.map(recalcClockLine);
    const changed = next.filter((l, i) => l !== lines[i]).length;
    await replaceLines(editor, 0, lines.length, next, editor.selection.active.line);
    vscode.window.setStatusBarMessage(`$(check) ${changed} clock total${changed === 1 ? '' : 's'} corrected`, 3000);
}

// -- The running clock ---------------------------------------------------------

let item: vscode.StatusBarItem;
let running: { since: Date, title: string, file: string, line: number } | undefined;
let ticker: NodeJS.Timeout | undefined;

function show() {
    if (!running) {
        item.hide();
        return;
    }
    item.text = `$(clock) ${elapsed(running.since)} ${running.title.length > 32 ? running.title.slice(0, 31) + '…' : running.title}`;
    item.tooltip = `Clocked in on "${running.title}" since ${running.since.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Click to go there.`;
    item.show();
}

// Ask the server what the clock is on. Quiet when nobody is logged in.
export async function refreshClock(): Promise<void> {
    if (!item || !Auth.get().isLoggedIn()) {
        running = undefined;
        if (item) {
            show();
        }
        return;
    }
    try {
        const c: any = await ODb.clockActive();
        if (c && c.Active && c.Target) {
            const h = await clockedHeading(c.Target);
            running = {
                since: new Date(c.Time.Start),
                title: h ? h.title : String(c.Target.Id || 'a heading'),
                file: h ? h.file : c.Target.Filename,
                line: h ? h.line : 0,
            };
        } else {
            running = undefined;
        }
    } catch (e) {
        running = undefined;
    }
    show();
}

// Where the clock's heading is. The server names it by outline path
// (file+olp) - its hash would change the moment the clock line is written.
async function clockedHeading(t: any): Promise<{ title: string, file: string, line: number } | undefined> {
    if (t.Type === 'hash') {
        const todo = await ODb.byHash(t.Id);
        return todo ? { title: todo.Headline, file: todo.Filename, line: todo.LineNum } : undefined;
    }
    if (t.Type === 'file+olp' || t.Type === 'file+headline') {
        const olp = t.Type === 'file+olp' ? String(t.Id).split('::') : [String(t.Id)];
        const lines = diskLines(t.Filename);
        let line = findOlp(lines, olp);
        if (line < 0 && t.Type === 'file+headline') {
            line = findHeading(lines, String(t.Id));
        }
        return { title: olp[olp.length - 1], file: t.Filename, line: Math.max(0, line) };
    }
    if (t.Type === 'id' || t.Type === 'customid') {
        const todo = await ODb.byId(t.Id);
        return todo ? { title: todo.Headline, file: todo.Filename, line: todo.LineNum } : undefined;
    }
    return undefined;
}

export async function jumpToClock(): Promise<void> {
    await refreshClock();
    if (!running) {
        vscode.window.setStatusBarMessage('The clock is not running', 2500);
        return;
    }
    await openAt(running.file, running.line);
}

export function activateTime(ctx: vscode.ExtensionContext) {
    item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.command = 'org.jumpToClock';
    // The minutes tick here; the server is asked again now and then in case
    // the clock was started or stopped somewhere else (worg, the command line).
    let polls = 0;
    ticker = setInterval(() => {
        if (++polls % 4 === 0) {
            refreshClock();
        } else {
            show();
        }
    }, 30000);
    ctx.subscriptions.push(item, { dispose: () => ticker && clearInterval(ticker) },
        Auth.get().onTokenChanged(() => refreshClock()),
        vscode.commands.registerCommand('org.insertTimestamp', insertTimestamp),
        vscode.commands.registerCommand('org.insertCreated', insertCreated),
        vscode.commands.registerCommand('org.insertCustomId', insertCustomId),
        vscode.commands.registerCommand('org.insertId', insertId),
        vscode.commands.registerCommand('org.updateAllClocks', updateAllClocks),
        vscode.commands.registerCommand('org.jumpToClock', jumpToClock),
    );
    refreshClock();
}
