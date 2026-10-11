// A focus timer in the status bar: a pomodoro (25 minutes), a long one (50),
// or a time of your own. Started under a heading, it clocks in there and out
// again at the end; then a break, or another round on the same heading. Click
// it to pause, add five minutes, or stop.

import * as vscode from 'vscode';
import { ODb } from './db';
import { Auth } from './auth';
import { Sets } from './sets';
import { refreshClock } from './time';
import { headingAt, olpOf, parseHeading, COMMON_KEYWORDS } from './outline/model';

interface Running { label: string; ends: number; minutes: number; paused?: number; on?: { file: string, olp: string[], title: string }; isBreak: boolean; }

let item: vscode.StatusBarItem;
let run: Running | undefined;
let ticker: NodeJS.Timeout | undefined;

const left = (r: Running) => Math.max(0, (r.paused !== undefined ? r.paused : r.ends - Date.now()));
const mmss = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function show() {
    if (!run) {
        item.hide();
        return;
    }
    const title = run.on ? ' ' + (run.on.title.length > 24 ? run.on.title.slice(0, 23) + '…' : run.on.title) : '';
    item.text = `${run.isBreak ? '$(coffee)' : '$(flame)'} ${mmss(left(run))}${run.paused !== undefined ? ' (paused)' : ''}${title}`;
    item.tooltip = `${run.label}${run.on ? ` on "${run.on.title}"` : ''}. Click to pause, add time or stop.`;
    item.show();
}

async function clock(on: Running['on'], into: boolean) {
    if (!on || !Auth.get().isLoggedIn() || !Sets.getProp<boolean>('pomodoroClocks', true)) {
        return;
    }
    if (into) {
        await ODb.clockIn({ filename: on.file, id: on.olp.join('::'), type: 'file+olp' } as any);
    } else {
        await ODb.clockOut();
    }
    await refreshClock();
}

async function finished() {
    const done = run;
    stop(false);
    if (!done) {
        return;
    }
    if (done.isBreak) {
        const again = await vscode.window.showInformationMessage('The break is over.', 'Another round', 'Done for now');
        if (again === 'Another round') {
            await begin('Pomodoro', 25, done.on, false);
        }
        return;
    }
    await clock(done.on, false);
    const next = await vscode.window.showInformationMessage(
        `${done.label} done${done.on ? ` on "${done.on.title}"` : ''}. Time for a break.`, 'Take 5', 'Take 15', 'Another round');
    if (next === 'Take 5' || next === 'Take 15') {
        await begin('Break', next === 'Take 5' ? 5 : 15, done.on, true);
    } else if (next === 'Another round') {
        await begin(done.label, done.minutes, done.on, false);
    }
}

async function begin(label: string, minutes: number, on: Running['on'], isBreak: boolean) {
    run = { label, minutes, ends: Date.now() + minutes * 60000, on, isBreak };
    if (!isBreak) {
        await clock(on, true);
    }
    if (ticker) {
        clearInterval(ticker);
    }
    ticker = setInterval(() => {
        if (run && run.paused === undefined && left(run) <= 0) {
            finished();
        }
        show();
    }, 1000);
    show();
}

function stop(clockOut: boolean) {
    if (ticker) {
        clearInterval(ticker);
        ticker = undefined;
    }
    const was = run;
    run = undefined;
    show();
    if (clockOut && was && !was.isBreak) {
        clock(was.on, false);
    }
}

export async function startTimer(): Promise<void> {
    const pick = await vscode.window.showQuickPick([
        { label: '$(flame) Pomodoro', description: '25 minutes', minutes: 25 },
        { label: '$(flame) Long focus', description: '50 minutes', minutes: 50 },
        { label: '$(watch) A time of my own…', description: '', minutes: 0 },
    ], { placeHolder: 'Start a timer' });
    if (!pick) {
        return;
    }
    let minutes = pick.minutes;
    if (!minutes) {
        const typed = await vscode.window.showInputBox({ prompt: 'Minutes', value: '15', validateInput: v => /^\d+(\.\d+)?$/.test(v.trim()) && +v > 0 ? undefined : 'A number of minutes' });
        if (!typed) {
            return;
        }
        minutes = parseFloat(typed);
    }
    // Under a heading: the time goes on it.
    let on: Running['on'];
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'org' && editor.document.uri.scheme === 'file') {
        const lines = editor.document.getText().split(/\r?\n/);
        const h = headingAt(lines, editor.selection.active.line);
        if (h >= 0) {
            if (editor.document.isDirty) {
                await editor.document.save();
            }
            on = { file: editor.document.fileName, olp: olpOf(lines, h), title: parseHeading(lines[h], h, COMMON_KEYWORDS).title };
        }
    }
    await begin(pick.label.replace(/^\$\([^)]*\)\s*/, '').replace('…', '') || 'Timer', minutes, on, false);
}

async function timerMenu() {
    if (!run) {
        return startTimer();
    }
    const r = run;
    const pick = await vscode.window.showQuickPick([
        { label: r.paused !== undefined ? '$(debug-continue) Resume' : '$(debug-pause) Pause', id: 'pause' },
        { label: '$(add) Five more minutes', id: 'more' },
        { label: '$(debug-stop) Stop', id: 'stop' },
    ], { placeHolder: `${r.label}: ${mmss(left(r))} left` });
    if (!pick || run !== r) {
        return;
    }
    if (pick.id === 'pause') {
        if (r.paused !== undefined) {
            r.ends = Date.now() + r.paused;
            r.paused = undefined;
        } else {
            r.paused = left(r);
        }
    } else if (pick.id === 'more') {
        if (r.paused !== undefined) {
            r.paused += 5 * 60000;
        } else {
            r.ends += 5 * 60000;
        }
    } else {
        stop(true);
    }
    show();
}

export function activatePomodoro(ctx: vscode.ExtensionContext) {
    item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    item.command = 'org.timerMenu';
    ctx.subscriptions.push(item, { dispose: () => ticker && clearInterval(ticker) },
        vscode.commands.registerCommand('org.startTimer', startTimer),
        vscode.commands.registerCommand('org.timerMenu', timerMenu),
        vscode.commands.registerCommand('org.stopTimer', () => stop(true)),
    );
}
