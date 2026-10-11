// Where the time went: a Clock view beside the agenda, today and this week,
// each heading with the time clocked on it, from the orgs server's clock
// report. Click a heading to go to it.

import * as vscode from 'vscode';
import { ODb } from './db';
import { Auth } from './auth';
import { openAt, diskLines } from './org-files';
import { findHeading } from './links/model';
import { formatDuration } from './tables/model';

const hm = (mins: number) => formatDuration(Math.round(mins) * 60);

class Period extends vscode.TreeItem {
    entries: any[] = [];
    constructor(public block: string, label: string, expanded: boolean) {
        super(label, expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon(block === 'today' ? 'watch' : 'calendar');
        this.contextValue = 'clockPeriod';
    }
}

class Entry extends vscode.TreeItem {
    constructor(public entry: any, total: number) {
        super(entry.headline, vscode.TreeItemCollapsibleState.None);
        this.description = hm(entry.mins) + (total > 0 ? `  ·  ${Math.round(entry.mins * 100 / total)}%` : '');
        this.tooltip = `${vscode.workspace.asRelativePath(entry.filename)}\n${hm(entry.mins)} clocked`;
        this.iconPath = new vscode.ThemeIcon('circle-small-filled');
        this.command = { title: 'Go to it', command: 'org.clock.open', arguments: [entry] };
    }
}

class ClockTree implements vscode.TreeDataProvider<vscode.TreeItem> {
    private changed = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this.changed.event;
    periods = [new Period('today', 'Today', true), new Period('thisweek', 'This week', false)];
    message: string | undefined;

    async load() {
        if (!Auth.get().isLoggedIn()) {
            this.message = 'Log in to the orgs server to see where the time went.';
            this.periods.forEach(p => { p.entries = []; p.description = ''; });
            this.changed.fire(undefined);
            return;
        }
        this.message = undefined;
        for (const p of this.periods) {
            const res: any = await ODb.api('/clockreport', { block: p.block });
            p.entries = res && res.entries ? res.entries.slice().sort((a: any, b: any) => b.mins - a.mins) : [];
            p.description = res && res.totalMin ? hm(res.totalMin) : 'nothing clocked';
            (p as any).total = res ? res.totalMin : 0;
        }
        this.changed.fire(undefined);
    }

    getTreeItem(item: vscode.TreeItem) {
        return item;
    }

    getChildren(item?: vscode.TreeItem): vscode.TreeItem[] {
        if (!item) {
            return this.periods;
        }
        if (item instanceof Period) {
            return item.entries.map(e => new Entry(e, (item as any).total || 0));
        }
        return [];
    }
}

export let clockTree: ClockTree | undefined;

export function activateClockView(ctx: vscode.ExtensionContext) {
    const tree = new ClockTree();
    clockTree = tree;
    const view = vscode.window.createTreeView('orgClock', { treeDataProvider: tree });
    tree.onDidChangeTreeData(() => { view.message = tree.message; });
    ctx.subscriptions.push(view,
        vscode.commands.registerCommand('org.clock.refresh', () => tree.load()),
        vscode.commands.registerCommand('org.clock.open', async (e: any) => {
            const line = findHeading(diskLines(e.filename), e.headline);
            await openAt(e.filename, Math.max(0, line));
        }),
        vscode.workspace.onDidSaveTextDocument(d => d.languageId === 'org' && view.visible && tree.load()),
        Auth.get().onTokenChanged(() => view.visible && tree.load()),
        view.onDidChangeVisibility(e => e.visible && tree.load()),
    );
    // The running clock adds up as it goes.
    const timer = setInterval(() => view.visible && tree.load(), 60 * 1000);
    ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
}
