// The agenda in the side bar: today - with anything overdue carried in, as org
// does - and the days after it, from the orgs server's /agenda. Click an entry
// to go to it; the buttons on it mark it done or clock in, and its menu
// changes its state, priority, effort or date. Everything is done by the
// server, so the agenda and the files never disagree.

import * as vscode from 'vscode';
import { ODb } from './db';
import { Auth } from './auth';
import { Sets } from './sets';
import { refreshClock } from './time';
import { openAt, settled } from './org-files';
import { stamp } from './dates';
import { parseDuration, formatDuration } from './tables/model';

interface Entry { Node: number; Kind: string; Start: string; End: string; HasTime: boolean; Late: number; DueIn: number; Done: boolean; }
interface Day { Date: string; Entries: Entry[]; }

class DayItem extends vscode.TreeItem {
    constructor(public day: Day, today: string, public nodes: any[]) {
        super(dayLabel(day.Date, today), vscode.TreeItemCollapsibleState.Expanded);
        const open = day.Entries.filter(e => !e.Done);
        // The effort still to do that day, from the EFFORT of what is not done.
        const effort = open.reduce((t, e) => {
            const v = nodes[e.Node] && nodes[e.Node].Props && nodes[e.Node].Props.EFFORT;
            const s = v ? parseDuration(String(v).trim()) : null;
            return t + (s || 0);
        }, 0);
        this.description = day.Entries.length
            ? `${open.length} to do${effort ? ` · ${formatDuration(effort)} effort` : ''}${day.Entries.length > open.length ? ` · ${day.Entries.length - open.length} done` : ''}`
            : 'nothing';
        this.iconPath = new vscode.ThemeIcon(day.Date === today ? 'calendar' : 'circle-small');
        this.contextValue = 'agendaDay';
        if (day.Entries.length === 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
    }
}

class EntryItem extends vscode.TreeItem {
    constructor(public entry: Entry, public node: any) {
        super('', vscode.TreeItemCollapsibleState.None);
        const time = entry.HasTime && entry.Start.length > 10 ? entry.Start.slice(11, 16) + '  ' : '';
        const pri = node.Priority ? `[#${node.Priority}] ` : '';
        this.label = `${time}${node.Status ? node.Status + ' ' : ''}${pri}${node.Headline}`;
        const bits: string[] = [];
        if (entry.Kind === 'deadline') {
            bits.push(entry.Late > 0 ? `deadline ${entry.Late}d ago` : entry.DueIn > 0 ? `due in ${entry.DueIn}d` : 'due today');
        } else if (entry.Kind === 'scheduled' && entry.Late > 0) {
            bits.push(`scheduled ${entry.Late}d ago`);
        }
        if (node.Props && node.Props.EFFORT) {
            bits.push(node.Props.EFFORT);
        }
        if (node.Tags && node.Tags.length) {
            bits.push(':' + node.Tags.join(':') + ':');
        }
        this.description = bits.join(' · ');
        const late = entry.Late > 0 || (entry.Kind === 'deadline' && entry.DueIn === 0);
        this.iconPath = entry.Done ? new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'))
            : entry.Kind === 'deadline' ? new vscode.ThemeIcon('flame', new vscode.ThemeColor(late ? 'errorForeground' : 'editorWarning.foreground'))
            : late ? new vscode.ThemeIcon('history', new vscode.ThemeColor('editorWarning.foreground'))
            : node.IsHabit ? new vscode.ThemeIcon('sync')
            : new vscode.ThemeIcon(node.IsTodo ? 'circle-large-outline' : 'calendar');
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${node.Headline}**\n\n`);
        if (node.Olp && node.Olp.length > 1) {
            md.appendMarkdown(node.Olp.slice(0, -1).join(' › ') + '\n\n');
        }
        md.appendMarkdown(`${vscode.workspace.asRelativePath(node.Filename)}:${node.LineNum + 1}`);
        this.tooltip = md;
        this.contextValue = entry.Done ? 'agendaEntryDone' : node.IsTodo ? 'agendaEntryTodo' : 'agendaEntry';
        this.command = { title: 'Go to it', command: 'org.agenda.open', arguments: [this] };
    }
}

function dayLabel(date: string, today: string): string {
    const d = new Date(date + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
    const name = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
    return diff === 0 ? `Today, ${name}` : diff === 1 ? `Tomorrow, ${name}` : name;
}

function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

class AgendaTree implements vscode.TreeDataProvider<vscode.TreeItem> {
    private changed = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this.changed.event;
    private days: Day[] = [];
    private nodes: any[] = [];
    private today = ymd(new Date());
    message: string | undefined;

    async load(): Promise<void> {
        if (!Auth.get().isLoggedIn()) {
            this.days = [];
            this.message = 'Log in to the orgs server to see the agenda.';
            this.changed.fire(undefined);
            return;
        }
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + Math.max(1, Sets.getProp<number>('agendaDays', 7)) - 1);
        const res: any = await ODb.api('/agenda', { from: ymd(from), to: ymd(to) });
        if (!res || !res.Ok) {
            this.days = [];
            this.message = res ? res.Msg : 'The orgs server did not answer.';
        } else {
            this.days = res.Days || [];
            this.nodes = res.Nodes || [];
            this.today = res.Today || ymd(new Date());
            this.message = undefined;
        }
        this.changed.fire(undefined);
    }

    getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
        return item;
    }

    getChildren(item?: vscode.TreeItem): vscode.TreeItem[] {
        if (!item) {
            // Past today only the days with something on them.
            return this.days.filter(d => d.Date === this.today || d.Entries.length)
                .map(d => new DayItem(d, this.today, this.nodes));
        }
        if (item instanceof DayItem) {
            // Late and timed first, the way org's day agenda reads.
            const order = (e: Entry) => (e.Done ? 2 : 0) + (e.HasTime ? 0 : 1);
            return item.day.Entries.slice().sort((a, b) => order(a) - order(b) || a.Start.localeCompare(b.Start))
                .map(e => new EntryItem(e, this.nodes[e.Node]));
        }
        return [];
    }
}

// -- Actions -----------------------------------------------------------------

// The server rewrites the file: an unsaved copy open in the editor goes first.
async function saveFile(file: string) {
    const doc = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'file' && d.uri.fsPath === file);
    if (doc && doc.isDirty) {
        await doc.save();
    }
}

async function act(item: EntryItem, what: string, call: () => Promise<any>, tree: AgendaTree) {
    await saveFile(item.node.Filename);
    const res = await call();
    await settled([item.node.Filename]);
    if (res && res.Ok) {
        vscode.window.setStatusBarMessage(`$(check) ${item.node.Headline}: ${what}${res.Msg ? ' - ' + res.Msg : ''}`, 3000);
    } else {
        vscode.window.showErrorMessage(`${what} failed: ${res && res.Msg || 'the orgs server did not answer'}`);
    }
    await tree.load();
}

function keywordsOf(node: any): { todo: string[], done: string[] } {
    const todo = node.TodoKeys && node.TodoKeys.length ? node.TodoKeys : (Sets.getProp<string[]>('todoKeywords', ['TODO']) || []);
    const done = node.DoneKeys && node.DoneKeys.length ? node.DoneKeys : (Sets.getProp<string[]>('doneKeywords', ['DONE']) || []);
    return { todo: todo.filter((k: string) => k), done: done.filter((k: string) => k) };
}

// The tree, for the tests to read what it shows.
export let agendaTree: AgendaTree | undefined;

export function activateAgendaView(ctx: vscode.ExtensionContext) {
    const tree = new AgendaTree();
    agendaTree = tree;
    const view = vscode.window.createTreeView('orgAgenda', { treeDataProvider: tree, showCollapseAll: true });
    const setMessage = () => { view.message = tree.message; };
    tree.onDidChangeTreeData(setMessage);

    const status = (item: EntryItem, value: string) =>
        act(item, value || 'no state', () => ODb.apiPost('/status/change', { Hash: item.node.Hash, Value: value }), tree);

    ctx.subscriptions.push(view,
        vscode.commands.registerCommand('org.agenda.refresh', () => tree.load()),
        vscode.commands.registerCommand('org.agenda.open', (item: EntryItem) => openAt(item.node.Filename, item.node.LineNum)),
        vscode.commands.registerCommand('org.agenda.done', (item: EntryItem) => status(item, keywordsOf(item.node).done[0] || 'DONE')),
        vscode.commands.registerCommand('org.agenda.state', async (item: EntryItem) => {
            const k = keywordsOf(item.node);
            const pick = await vscode.window.showQuickPick(
                k.todo.map(w => ({ label: '$(circle-large-outline) ' + w, w })).concat(k.done.map(w => ({ label: '$(pass-filled) ' + w, w })), [{ label: '$(close) No keyword', w: '' }]),
                { placeHolder: `${item.node.Headline} - now ${item.node.Status || 'no keyword'}` });
            if (pick) {
                await status(item, pick.w);
            }
        }),
        vscode.commands.registerCommand('org.agenda.priority', async (item: EntryItem) => {
            const pick = await vscode.window.showQuickPick(['A', 'B', 'C', ''].map(p => ({ label: p ? `$(flame) [#${p}]` : '$(close) No priority', p })),
                { placeHolder: `${item.node.Headline} - priority now ${item.node.Priority || 'none'}` });
            if (pick) {
                await act(item, pick.p ? `priority ${pick.p}` : 'priority taken off', () => ODb.apiPost('/heading/parts', { Hash: item.node.Hash, Priority: pick.p }), tree);
            }
        }),
        vscode.commands.registerCommand('org.agenda.effort', async (item: EntryItem) => {
            const effort = await vscode.window.showInputBox({ prompt: `Effort for "${item.node.Headline}"`, value: (item.node.Props || {}).EFFORT || '', placeHolder: '1:30' });
            if (effort !== undefined) {
                await act(item, `effort ${effort || 'taken off'}`, () => ODb.apiPost('/property', { Hash: item.node.Hash, Name: 'EFFORT', Value: effort }), tree);
            }
        }),
        vscode.commands.registerCommand('org.agenda.reschedule', async (item: EntryItem) => {
            const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
            const monday = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; })();
            const picks = [
                { label: 'Today', d: day(0) }, { label: 'Tomorrow', d: day(1) }, { label: 'Next Monday', d: monday },
                { label: 'In a week', d: day(7) }, { label: 'Pick a date…', d: undefined as Date },
            ].map(p => ({ label: '$(calendar) ' + p.label, description: p.d ? stamp(p.d, true, false) : '', d: p.d }));
            const pick = await vscode.window.showQuickPick(picks, { placeHolder: `Schedule "${item.node.Headline}" for…` });
            if (!pick) {
                return;
            }
            let value = pick.d ? stamp(pick.d, true, false) : undefined;
            if (!value) {
                const typed = await vscode.window.showInputBox({ prompt: 'Date', placeHolder: 'YYYY-MM-DD', validateInput: v => /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? undefined : 'YYYY-MM-DD' });
                if (!typed) {
                    return;
                }
                value = stamp(new Date(typed.trim() + 'T00:00:00'), true, false);
            }
            await act(item, 'scheduled ' + value, () => ODb.apiPost('/date/change', { Hash: item.node.Hash, Name: 'SCHEDULED', Value: value }), tree);
        }),
        vscode.commands.registerCommand('org.agenda.clockIn', async (item: EntryItem) => {
            await act(item, 'clocked in', () => ODb.apiPost('/clockin', { Type: 'hash', Id: item.node.Hash }), tree);
            await refreshClock();
        }),
        // Fresh whenever an org file is saved, the login changes, or the view is shown.
        vscode.workspace.onDidSaveTextDocument(d => d.languageId === 'org' && view.visible && tree.load()),
        Auth.get().onTokenChanged(() => tree.load()),
        view.onDidChangeVisibility(e => e.visible && tree.load()),
    );
    // And as the day goes by.
    const timer = setInterval(() => view.visible && tree.load(), 5 * 60 * 1000);
    ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
    if (view.visible) {
        tree.load();
    }
}
