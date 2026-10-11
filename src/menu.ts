// One menu for everything: Ctrl+Alt+O M. What fits where the cursor is comes
// first - the table commands in a table, the heading commands on a heading -
// and every item shows its key, so the menu teaches the keys as it goes.

import * as vscode from 'vscode';
import { isTableLine } from './tables/model';
import { isTblfmLine } from './tables/formulas';
import { isHeadingLine } from './outline/model';

type Where = 'table' | 'heading' | 'any';
interface Item { label: string; key?: string; command: string; where: Where; group: string; }

const ITEMS: Item[] = [
    // Tables
    { group: 'Table', where: 'table', label: '$(symbol-operator) Recalculate table', key: 'ctrl+alt+o r', command: 'org.execTable' },
    { group: 'Table', where: 'table', label: '$(symbol-function) Edit formula for this cell', key: 'ctrl+alt+o =', command: 'org.editTableFormula' },
    { group: 'Table', where: 'table', label: '$(list-ordered) Sort rows by this column', key: 'ctrl+alt+o o', command: 'org.sortTable' },
    { group: 'Table', where: 'table', label: '$(graph-line) Plot table', key: 'ctrl+alt+o g', command: 'org.plotTable' },
    { group: 'Table', where: 'table', label: '$(add) Sum this column into the clipboard', command: 'org.sumTableColumn' },
    { group: 'Table', where: 'table', label: '$(arrow-down) Insert row below', key: 'alt+shift+down', command: 'org.addRowDown' },
    { group: 'Table', where: 'table', label: '$(arrow-up) Insert row above', command: 'org.addRowUp' },
    { group: 'Table', where: 'table', label: '$(trash) Delete row', key: 'alt+shift+up', command: 'org.deleteRow' },
    { group: 'Table', where: 'table', label: '$(arrow-right) Insert column right', key: 'alt+shift+right', command: 'org.addColRight' },
    { group: 'Table', where: 'table', label: '$(arrow-left) Insert column left', command: 'org.addColLeft' },
    { group: 'Table', where: 'table', label: '$(trash) Delete column', key: 'alt+shift+left', command: 'org.deleteCol' },
    { group: 'Table', where: 'table', label: '$(dash) Insert rule below', key: 'ctrl+-', command: 'org.insertSeparator' },
    { group: 'Table', where: 'table', label: '$(dash) Insert rule and go below it', key: 'ctrl+alt+o enter', command: 'org.insertSeparatorAndMove' },
    { group: 'Table', where: 'table', label: '$(arrow-small-down) Copy field down', key: 'shift+enter', command: 'org.copyFieldDown' },
    { group: 'Table', where: 'table', label: '$(split-vertical) Split cell at cursor onto a new row', command: 'org.splitCell' },
    { group: 'Table', where: 'table', label: '$(merge) Join the row below onto this one', command: 'org.joinRows' },
    { group: 'Table', where: 'table', label: '$(clear-all) Clear cell', key: 'ctrl+q space', command: 'org.clearCell' },
    { group: 'Table', where: 'table', label: '$(sync) Transpose table', command: 'org.transposeTable' },
    // Headings
    { group: 'Heading', where: 'heading', label: '$(fold) Cycle what is shown', key: 'tab', command: 'org.cycle' },
    { group: 'Heading', where: 'heading', label: '$(arrow-up) Move subtree up', key: 'alt+up', command: 'org.moveSubtreeUp' },
    { group: 'Heading', where: 'heading', label: '$(arrow-down) Move subtree down', key: 'alt+down', command: 'org.moveSubtreeDown' },
    { group: 'Heading', where: 'heading', label: '$(arrow-left) Promote subtree', key: 'alt+shift+left', command: 'org.promoteSubtree' },
    { group: 'Heading', where: 'heading', label: '$(arrow-right) Demote subtree', key: 'alt+shift+right', command: 'org.demoteSubtree' },
    { group: 'Heading', where: 'heading', label: '$(references) Show backlinks', key: 'shift+f12', command: 'org.showBacklinks' },
    { group: 'Heading', where: 'heading', label: '$(export) Refile subtree to…', key: 'ctrl+alt+o w', command: 'org.refile' },
    { group: 'Heading', where: 'heading', label: '$(copy) Copy subtree to…', key: 'ctrl+alt+o shift+w', command: 'org.copySubtree' },
    { group: 'Heading', where: 'heading', label: '$(archive) Archive subtree', key: 'ctrl+alt+o a', command: 'org.archive' },
    { group: 'Heading', where: 'heading', label: '$(play) Clock in', key: 'ctrl+alt+o ctrl+i', command: 'org.clockin' },
    { group: 'Heading', where: 'heading', label: '$(clock) Insert created property', command: 'org.insertCreated' },
    { group: 'Heading', where: 'heading', label: '$(symbol-key) Insert custom ID', command: 'org.insertCustomId' },
    { group: 'Heading', where: 'heading', label: '$(key) Insert ID', command: 'org.insertId' },
    { group: 'Heading', where: 'heading', label: '$(lock) Encrypt heading', command: 'org.encryptHeading' },
    { group: 'Heading', where: 'heading', label: '$(unlock) Decrypt heading', command: 'org.decryptHeading' },
    { group: 'Heading', where: 'heading', label: '$(paperclip) Attach file', key: 'ctrl+alt+o shift+a', command: 'org.attachFile' },
    { group: 'Heading', where: 'heading', label: '$(file-symlink-file) Open attachment', command: 'org.openAttachment' },
    { group: 'Heading', where: 'heading', label: '$(export) Export this subtree…', key: 'ctrl+alt+o shift+e', command: 'org.exportSubtree' },
    { group: 'Heading', where: 'heading', label: '$(screen-normal) Narrow to this subtree', key: 'ctrl+alt+o shift+n', command: 'org.narrowToSubtree' },
    { group: 'Heading', where: 'heading', label: '$(flame) Start a timer (clocks in here)', key: 'ctrl+alt+o shift+t', command: 'org.startTimer' },
    // Everywhere
    { group: 'Run', where: 'any', label: '$(play) Run what is at the cursor', key: 'ctrl+alt+o r', command: 'org.run' },
    { group: 'Run', where: 'any', label: '$(run-all) Run every block in the file', command: 'org.runAllBlocks' },
    { group: 'Run', where: 'any', label: '$(refresh) Update every dynamic block', command: 'org.updateAllDynamicBlocks' },
    { group: 'Run', where: 'any', label: '$(symbol-operator) Recalculate every table', key: 'ctrl+alt+o shift+r', command: 'org.execAllTables' },
    { group: 'Run', where: 'any', label: '$(file-symlink-file) Tangle file', command: 'org.tangle' },
    { group: 'Link', where: 'any', label: '$(link) Insert link…', key: 'ctrl+alt+o k', command: 'org.insertLink' },
    { group: 'Link', where: 'any', label: '$(pinned) Store link to here', key: 'ctrl+alt+o shift+k', command: 'org.storeLink' },
    { group: 'Link', where: 'any', label: '$(link-external) Open link', key: 'f12', command: 'org.openLink' },
    { group: 'Edit', where: 'any', label: '$(list-ordered) Sort…', key: 'ctrl+alt+o o', command: 'org.sort' },
    { group: 'Edit', where: 'any', label: '$(calendar) Insert timestamp…', key: 'ctrl+alt+o .', command: 'org.insertTimestamp' },
    { group: 'Edit', where: 'any', label: '$(fold-up) Cycle the whole file', key: 'shift+tab', command: 'org.globalCycle' },
    { group: 'Edit', where: 'any', label: '$(table) Create table', command: 'org.createTable' },
    { group: 'Edit', where: 'any', label: '$(table) Convert selection or paragraph to table', command: 'org.convertToTable' },
    { group: 'Edit', where: 'any', label: '$(clippy) Paste clipboard as table', command: 'org.pasteAsTable' },
    { group: 'Edit', where: 'any', label: '$(file) Import csv or tsv as table', command: 'org.importTable' },
    { group: 'Edit', where: 'any', label: '$(watch) Update every clock total', command: 'org.updateAllClocks' },
    { group: 'Edit', where: 'any', label: '$(archive) Archive everything done', command: 'org.archiveAllDone' },
    { group: 'Edit', where: 'any', label: '$(note) Insert footnote', key: 'ctrl+alt+o ctrl+f', command: 'org.insertFootnote' },
    { group: 'Edit', where: 'any', label: '$(pie-chart) Update statistics cookies', command: 'org.updateStatistics' },
    { group: 'Edit', where: 'any', label: '$(inbox) Quick capture', key: 'ctrl+alt+o q', command: 'org.quickCapture' },
    { group: 'Find', where: 'any', label: '$(search) Search every file', key: 'ctrl+alt+o f', command: 'org.searchFiles' },
    { group: 'Find', where: 'any', label: '$(search) Search this file', key: 'ctrl+alt+o shift+f', command: 'org.searchThisFile' },
    { group: 'Find', where: 'any', label: '$(table) Go to table', command: 'org.gotoTable' },
    { group: 'Find', where: 'any', label: '$(clock) Go to the running clock', key: 'ctrl+alt+o j', command: 'org.jumpToClock' },
    { group: 'Find', where: 'any', label: '$(symbol-reference) Insert table name', command: 'org.insertTableName' },
    { group: 'File', where: 'any', label: '$(export) Export file…', key: 'ctrl+alt+o e', command: 'org.export' },
    { group: 'File', where: 'any', label: '$(new-file) New file…', key: 'ctrl+alt+o n', command: 'org.newFile' },
    { group: 'File', where: 'any', label: '$(history) File history', command: 'org.fileHistory' },
    { group: 'File', where: 'any', label: '$(pass) Habits', command: 'org.habits' },
    { group: 'File', where: 'any', label: '$(calendar) Agenda', command: 'orgAgenda.focus' },
    { group: 'View', where: 'any', label: '$(table) Column view', key: 'ctrl+alt+o shift+c', command: 'org.columnView' },
    { group: 'View', where: 'any', label: '$(file-media) Pictures and maths', command: 'org.showMediaPanel' },
    { group: 'View', where: 'any', label: '$(globe) Preview as a web page', command: 'org.showWeb' },
    { group: 'View', where: 'any', label: '$(preview) Preview as slides', command: 'org.showReveal' },
    { group: 'View', where: 'any', label: '$(watch) Where the time went', command: 'orgClock.focus' },
    { group: 'View', where: 'any', label: '$(cloud) Server connection', command: 'org.connectionMenu' },
];

export async function menu(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const line = editor ? editor.document.lineAt(editor.selection.active.line).text : '';
    const here: Where = isTableLine(line) || isTblfmLine(line) ? 'table' : isHeadingLine(line) ? 'heading' : 'any';
    const items = ITEMS.filter(i => i.where === 'any' || i.where === here)
        .map(i => ({ label: i.label, description: [i.group, i.key].filter(x => x).join(' · '), command: i.command }));
    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: here === 'table' ? 'Table, then everything else' : here === 'heading' ? 'Heading, then everything else' : 'Org',
        matchOnDescription: true,
    });
    if (pick) {
        await vscode.commands.executeCommand(pick.command);
    }
}

export function activateMenu(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
        vscode.commands.registerCommand('org.menu', menu),
        vscode.commands.registerCommand('org.tableMenu', menu),
        vscode.commands.registerCommand('org.execBlock', () => vscode.commands.executeCommand('org.run')),
    );
}
