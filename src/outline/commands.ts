// Working on the outline: Tab and Shift+Tab cycle what is shown, Alt+Up and
// Alt+Down move a subtree past its siblings, and one Sort command sorts
// whatever the cursor is in - table rows, the headings under a heading, or a
// list.

import * as vscode from 'vscode';
import { Sets } from '../sets';
import { linesOf, replaceLines } from '../edit-lines';
import { isTableLine } from '../tables/model';
import {
    isHeadingLine, headingAt, subtreeEnd, children, moveSubtree, drawers,
    sortChildren, sortList, listAt, EntrySort, ListSort, COMMON_KEYWORDS,
} from './model';

// The TODO words in the order they cycle, for sorting by state.
export function keywords(): string[] {
    const todo = Sets.getProp<string[]>('todoKeywords', ['TODO']) || [];
    const done = Sets.getProp<string[]>('doneKeywords', ['DONE']) || [];
    const all = todo.filter(k => k).concat(done.filter(k => k));
    return all.concat(COMMON_KEYWORDS.filter(k => all.indexOf(k) < 0));
}

// -- Moving subtrees -------------------------------------------------------

async function move(dir: -1 | 1) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const lines = linesOf(editor.document);
    const line = headingAt(lines, editor.selection.active.line);
    if (line < 0) {
        return;
    }
    const m = moveSubtree(lines, line, dir);
    if (!m) {
        vscode.window.setStatusBarMessage(dir < 0 ? 'Already the first of its siblings' : 'Already the last of its siblings', 2000);
        return;
    }
    const offset = editor.selection.active.line - line;
    await replaceLines(editor, m.start, m.end, m.lines, m.cursor + offset);
}

export const moveSubtreeUp = () => move(-1);
export const moveSubtreeDown = () => move(1);

// -- Cycling ---------------------------------------------------------------

const fold = (lines: number[], levels = 1) =>
    lines.length ? vscode.commands.executeCommand('editor.fold', { selectionLines: lines, levels, direction: 'down' }) : undefined;
const unfold = (lines: number[], levels = 1) =>
    vscode.commands.executeCommand('editor.unfold', { selectionLines: lines, levels, direction: 'down' });

// Folded lines drop out of the editor's visible ranges: a heading on screen
// whose next line is not, with lines on screen after it, is folded.
function isFolded(editor: vscode.TextEditor, line: number): boolean {
    const shown = (l: number) => editor.visibleRanges.some(r => l >= r.start.line && l <= r.end.line);
    return shown(line) && !shown(line + 1) && editor.visibleRanges.some(r => r.start.line > line + 1);
}

type Visibility = 'folded' | 'children' | 'subtree';
let lastCycle: { uri: string, line: number, state: Visibility } | undefined;

// org's Tab on a heading: folded, then its children, then everything under it,
// then folded again. Drawers stay shut throughout, as org keeps them.
export async function cycle(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const lines = linesOf(editor.document);
    const line = editor.selection.active.line;
    if (!isHeadingLine(lines[line])) {
        return;
    }
    const end = subtreeEnd(lines, line);
    if (end <= line + 1) {
        vscode.window.setStatusBarMessage('Empty entry', 1500);
        return;
    }
    const uri = editor.document.uri.toString();
    const kids = children(lines, line).map(k => k.start);
    // Only what has lines under it can fold: folding a bare heading folds the
    // one around it instead.
    const foldable = children(lines, line).filter(k => k.end > k.start + 1).map(k => k.start);
    const last = lastCycle && lastCycle.uri === uri && lastCycle.line === line ? lastCycle.state : undefined;
    let next: Visibility;
    if (isFolded(editor, line)) {
        next = kids.length ? 'children' : 'subtree';
    } else if (last === 'children') {
        next = 'subtree';
    } else {
        next = 'folded';
    }
    if (next === 'folded') {
        await fold([line]);
    } else if (next === 'children') {
        await unfold([line]);
        await fold(foldable);
        await fold(drawers(lines, line + 1, kids[0]));
    } else {
        await vscode.commands.executeCommand('editor.unfoldRecursively', { selectionLines: [line] });
        await fold(drawers(lines, line + 1, end));
    }
    lastCycle = { uri, line, state: next };
    vscode.window.setStatusBarMessage({ folded: 'Folded', children: 'Children', subtree: 'Subtree' }[next], 1500);
}

type Global = 'overview' | 'contents' | 'all';
let lastGlobal: { uri: string, state: Global } | undefined;

// org's Shift+Tab: the top level headings, then every heading, then everything.
export async function globalCycle(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const uri = editor.document.uri.toString();
    const lines = linesOf(editor.document);
    const order: Global[] = ['overview', 'contents', 'all'];
    const next = lastGlobal && lastGlobal.uri === uri ? order[(order.indexOf(lastGlobal.state) + 1) % 3] : 'overview';
    const headings: number[] = [];
    lines.forEach((l, i) => { if (isHeadingLine(l)) { headings.push(i); } });
    if (next === 'overview') {
        await vscode.commands.executeCommand('editor.foldAll');
    } else {
        await vscode.commands.executeCommand('editor.unfoldAll');
        if (next === 'contents') {
            // Every heading showing: fold those with nothing but text under them.
            await fold(headings.filter(h => children(lines, h).length === 0 && subtreeEnd(lines, h) > h + 1));
        }
        await fold(drawers(lines, 0, lines.length));
    }
    lastGlobal = { uri, state: next };
    vscode.window.setStatusBarMessage({ overview: 'Overview', contents: 'Contents', all: 'Show all' }[next], 1500);
}

// -- Sorting ---------------------------------------------------------------

const ENTRY_SORTS: { label: string, by: EntrySort, desc: boolean }[] = [
    { label: '$(arrow-down) Alphabetical, A to Z', by: 'alpha', desc: false },
    { label: '$(arrow-up) Alphabetical, Z to A', by: 'alpha', desc: true },
    { label: '$(checklist) By TODO state', by: 'todo', desc: false },
    { label: '$(flame) By priority, highest first', by: 'priority', desc: false },
    { label: '$(calendar) By scheduled or deadline date, earliest first', by: 'date', desc: false },
    { label: '$(calendar) By scheduled or deadline date, latest first', by: 'date', desc: true },
    { label: '$(symbol-number) Numeric, smallest first', by: 'numeric', desc: false },
];

const LIST_SORTS: { label: string, by: ListSort, desc: boolean }[] = [
    { label: '$(arrow-down) Alphabetical, A to Z', by: 'alpha', desc: false },
    { label: '$(arrow-up) Alphabetical, Z to A', by: 'alpha', desc: true },
    { label: '$(symbol-number) Numeric, smallest first', by: 'numeric', desc: false },
    { label: '$(check) Unchecked first', by: 'checked', desc: false },
    { label: '$(pass-filled) Checked first', by: 'checked', desc: true },
];

// Sort what the cursor is in: table rows, a list, or the headings under the
// heading at (or above) the cursor.
export async function sort(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const line = editor.selection.active.line;
    const lines = linesOf(editor.document);
    if (isTableLine(lines[line])) {
        await vscode.commands.executeCommand('org.sortTable');
        return;
    }
    if (listAt(lines, line)) {
        const pick = await vscode.window.showQuickPick(LIST_SORTS, { placeHolder: 'Sort the list' });
        const r = pick && sortList(lines, line, pick.by, pick.desc);
        if (r) {
            await replaceLines(editor, r.start, r.end, r.lines, line);
        }
        return;
    }
    const parent = headingAt(lines, line);
    if (parent < 0 || children(lines, parent).length < 2) {
        vscode.window.setStatusBarMessage('Nothing to sort here: a heading with two or more headings under it, a list or a table', 3000);
        return;
    }
    const pick = await vscode.window.showQuickPick(ENTRY_SORTS, { placeHolder: 'Sort the headings under this one' });
    const r = pick && sortChildren(lines, parent, pick.by, pick.desc, keywords());
    if (r) {
        await replaceLines(editor, r.start, r.end, r.lines, parent);
    }
}

// -- Wiring ------------------------------------------------------------------

export function activateOutline(ctx: vscode.ExtensionContext) {
    const reg = (id: string, fn: () => Promise<void>) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
    reg('org.moveSubtreeUp', moveSubtreeUp);
    reg('org.moveSubtreeDown', moveSubtreeDown);
    reg('org.cycle', cycle);
    reg('org.globalCycle', globalCycle);
    reg('org.sort', sort);

    // orgOnHeading: the keys that act on a heading (Tab, Alt+Up...) only take
    // over on a heading line.
    let on = false;
    const update = (editor: vscode.TextEditor | undefined) => {
        const now = !!editor && editor.document.languageId === 'org' &&
            isHeadingLine(editor.document.lineAt(editor.selection.active.line).text);
        if (now !== on) {
            on = now;
            vscode.commands.executeCommand('setContext', 'orgOnHeading', now);
        }
    };
    ctx.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(e => update(e.textEditor)),
        vscode.window.onDidChangeActiveTextEditor(update),
        vscode.workspace.onDidChangeTextDocument(e => {
            const editor = vscode.window.activeTextEditor;
            if (editor && e.document === editor.document) {
                update(editor);
            }
        }),
    );
    update(vscode.window.activeTextEditor);
}
