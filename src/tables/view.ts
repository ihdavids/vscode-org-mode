// What a table shows while you work in it: the table mode the keys depend on,
// the cell's reference and formula in the status bar and on hover, the cells
// a formula writes picked out, <N> columns shown N wide, and the colours
// formulas gave cells. All worked out here from the text, so it is instant and
// needs no server.

import * as vscode from 'vscode';
import { Context } from './context';
import { TableAt, tableAt, formulas, measure } from './editor';
import { OrgTable, isTableLine, cellSpan } from './model';
import { Formula, targets, formulaFor, fieldRef } from './formulas';
import { colorsFor, onColorsChanged } from './calc';
import { Decoration } from '../decorations';

let mode: Context;
let disabled = false;
let status: vscode.StatusBarItem;

const hideType = vscode.window.createTextEditorDecorationType({
    textDecoration: 'none; display: none;',
});
const ellipsisType = vscode.window.createTextEditorDecorationType({
    after: { contentText: '…', color: new vscode.ThemeColor('editorCodeLens.foreground') },
});
const colorTypes = new Map<string, vscode.TextEditorDecorationType>();

// Named colours as washes that read in light and dark themes; anything else
// (#hex, rgb()) is used as it is.
const WASHES: { [name: string]: string } = {
    red: 'rgba(255, 82, 82, 0.28)', green: 'rgba(76, 175, 80, 0.28)', yellow: 'rgba(255, 213, 79, 0.32)',
    blue: 'rgba(66, 133, 244, 0.28)', cyan: 'rgba(0, 188, 212, 0.28)', purple: 'rgba(156, 39, 176, 0.26)',
    orange: 'rgba(255, 152, 0, 0.30)', pink: 'rgba(240, 98, 146, 0.28)', white: 'rgba(255, 255, 255, 0.22)',
    black: 'rgba(0, 0, 0, 0.30)', gray: 'rgba(128, 128, 128, 0.25)', grey: 'rgba(128, 128, 128, 0.25)',
};

function colorType(color: string): vscode.TextEditorDecorationType {
    let t = colorTypes.get(color);
    if (!t) {
        t = vscode.window.createTextEditorDecorationType({ backgroundColor: WASHES[color.toLowerCase()] || color, borderRadius: '2px' });
        colorTypes.set(color, t);
    }
    return t;
}

// The inside of a cell on its line, between the bars.
function cellRange(doc: vscode.TextDocument, at: TableAt, row: number, col: number): vscode.Range | undefined {
    const span = cellSpan(doc.lineAt(at.first + row).text, col);
    return span ? new vscode.Range(at.first + row, span.start, at.first + row, span.end) : undefined;
}

function formulaRange(at: TableAt, f: Formula): vscode.Range {
    return new vscode.Range(at.last + 1 + f.line, f.start, at.last + 1 + f.line, f.end);
}

// -- Table mode and the formula under the cursor -----------------------------

function refresh(editor: vscode.TextEditor | undefined) {
    const isOrg = !!editor && editor.document.languageId === 'org';
    const line = isOrg ? editor.document.lineAt(editor.selection.active.line).text : '';
    mode.setState(isOrg && !disabled && isTableLine(line));
    if (!editor) {
        return;
    }
    const at = isOrg ? tableAt(editor.document, editor.selection.active) : undefined;
    highlight(editor, at);
    shrinkAndColor(editor);
}

function highlight(editor: vscode.TextEditor, at: TableAt | undefined) {
    const selected: vscode.Range[] = [];
    const cells: vscode.Range[] = [];
    const active: vscode.Range[] = [];
    status.hide();
    if (at) {
        const fs = formulas(at);
        let shown: Formula | undefined;
        if (at.row >= 0 && !at.table.rows[at.row].rule) {
            const r = cellRange(editor.document, at, at.row, at.col);
            if (r) {
                selected.push(r);
            }
            shown = formulaFor(fs, at.table, at.row, at.col);
            status.text = '$(table) ' + fieldRef(at.table, at.row, at.col) + (shown ? `  $(symbol-function) ${shown.lhs}=${shown.rhs}` : '') +
                (disabled ? '  (table keys off - Ctrl+Q Ctrl+Q)' : '');
            status.tooltip = shown ? 'The formula for this cell. Click to edit it.' : 'This cell. Click to give it a formula.';
            status.show();
        } else if (at.row < 0) {
            const pos = editor.selection.active;
            shown = fs.find(f => f.line === pos.line - at.last - 1 && pos.character >= f.start && pos.character <= f.end);
        }
        if (shown) {
            active.push(formulaRange(at, shown));
            targets(shown, at.table).forEach(key => {
                const [row, col] = key.split(',').map(Number);
                const r = cellRange(editor.document, at, row, col);
                if (r) {
                    cells.push(r);
                }
            });
        }
    }
    editor.setDecorations(Decoration.selectedCellType, selected);
    editor.setDecorations(Decoration.targetCellType, cells);
    editor.setDecorations(Decoration.activeFormulaType, active);
}

// -- <N> columns and coloured cells -----------------------------------------

// The tables on screen, give or take a screenful.
function visibleTables(editor: vscode.TextEditor): TableAt[] {
    const doc = editor.document;
    const out: TableAt[] = [];
    const seen = new Set<number>();
    for (const vr of editor.visibleRanges) {
        const from = Math.max(0, vr.start.line - 100);
        const to = Math.min(doc.lineCount - 1, vr.end.line + 100);
        for (let l = from; l <= to; l++) {
            if (isTableLine(doc.lineAt(l).text)) {
                const at = tableAt(doc, new vscode.Position(l, 0));
                if (at && !seen.has(at.first)) {
                    seen.add(at.first);
                    out.push(at);
                }
                l = at ? at.last : l;
            }
        }
    }
    return out;
}

function shrinkAndColor(editor: vscode.TextEditor) {
    const hide: vscode.Range[] = [];
    const ellipsis: vscode.Range[] = [];
    const colored = new Map<string, vscode.Range[]>();
    if (editor.document.languageId === 'org') {
        const cursor = editor.selection.active;
        for (const at of visibleTables(editor)) {
            shrink(editor.document, at, cursor, hide, ellipsis);
            for (const c of colorsFor(editor.document, at)) {
                const r = cellRange(editor.document, at, c.row, c.col);
                if (r) {
                    colored.set(c.color, (colored.get(c.color) || []).concat([r]));
                }
            }
        }
    }
    editor.setDecorations(hideType, hide);
    editor.setDecorations(ellipsisType, ellipsis);
    colorTypes.forEach((type, color) => editor.setDecorations(type, colored.get(color) || []));
    colored.forEach((ranges, color) => editor.setDecorations(colorType(color), ranges));
}

// Show a <N> column N wide, as org does: what does not fit is hidden, a cut
// short cell ends in an ellipsis. The cell under the cursor shows in full.
function shrink(doc: vscode.TextDocument, at: TableAt, cursor: vscode.Position,
                hide: vscode.Range[], ellipsis: vscode.Range[]) {
    const t: OrgTable = at.table;
    const { shrink: widths, aligns } = t.layout(measure());
    widths.forEach((n, col) => {
        if (n === null) {
            return;
        }
        t.rows.forEach((r, row) => {
            const line = at.first + row;
            const text = doc.lineAt(line).text;
            if (r.rule) {
                const seg = ruleSegment(text, col);
                if (seg && seg.end - seg.start > n + 2) {
                    hide.push(new vscode.Range(line, seg.start + n + 2, line, seg.end));
                }
                return;
            }
            const span = cellSpan(text, col);
            if (!span || (line === cursor.line && cursor.character >= span.start && cursor.character <= span.end)) {
                return;
            }
            // The cell's room, less a space each side.
            const inner = { start: span.start + 1, end: Math.max(span.start + 1, span.end - 1) };
            if (inner.end - inner.start <= n) {
                return;
            }
            const body = text.slice(inner.start, inner.end);
            const lead = body.length - body.replace(/^\s+/, '').length;
            const len = body.trim().length;
            const cs = inner.start + lead;
            if (len > n) {
                const keep = Math.max(1, n - 1);
                if (cs > inner.start) {
                    hide.push(new vscode.Range(line, inner.start, line, cs));
                }
                hide.push(new vscode.Range(line, cs + keep, line, inner.end));
                ellipsis.push(new vscode.Range(line, cs + keep - 1, line, cs + keep));
                return;
            }
            // It fits: show the n wide window it sits in, as its column aligns it.
            let ws = aligns[col] === 'r' ? cs + len - n : aligns[col] === 'c' ? cs - Math.floor((n - len) / 2) : inner.start;
            ws = Math.max(inner.start, Math.min(ws, inner.end - n));
            if (ws > inner.start) {
                hide.push(new vscode.Range(line, inner.start, line, ws));
            }
            if (ws + n < inner.end) {
                hide.push(new vscode.Range(line, ws + n, line, inner.end));
            }
        });
    });
}

// The dashes of a rule under a column: between its bars and crosses.
function ruleSegment(line: string, col: number): { start: number, end: number } | undefined {
    let at = line.indexOf('|');
    for (let c = 0; c < col && at >= 0; c++) {
        const next = line.slice(at + 1).search(/[+|]/);
        at = next < 0 ? -1 : at + 1 + next;
    }
    if (at < 0) {
        return undefined;
    }
    const rest = line.slice(at + 1).search(/[+|]/);
    return { start: at + 1, end: rest < 0 ? line.length : at + 1 + rest };
}

// -- Hover ---------------------------------------------------------------------

class FormulaHover implements vscode.HoverProvider {
    provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
        if (!isTableLine(doc.lineAt(pos.line).text)) {
            return undefined;
        }
        const at = tableAt(doc, pos);
        if (!at || at.row < 0 || at.table.rows[at.row].rule) {
            return undefined;
        }
        const f = formulaFor(formulas(at), at.table, at.row, at.col);
        if (!f) {
            return undefined;
        }
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${fieldRef(at.table, at.row, at.col)}** is worked out by\n\n`);
        md.appendCodeblock(`${f.lhs}=${f.rhs}`, 'org');
        md.appendMarkdown('\n[Edit formula](command:org.editTableFormula) · [Recalculate](command:org.execTable)');
        md.isTrusted = true;
        return new vscode.Hover(md, cellRange(doc, at, at.row, at.col));
    }
}

// -- Wiring ----------------------------------------------------------------------

export function activateTableView(ctx: vscode.ExtensionContext, tableMode: Context) {
    mode = tableMode;
    status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    status.command = 'org.editTableFormula';
    ctx.subscriptions.push(status);

    // Selections arrive in bursts while typing; the last one is what counts.
    let pending: NodeJS.Timeout | undefined;
    const soon = (editor: vscode.TextEditor | undefined, delay: number = 30) => {
        if (pending) {
            clearTimeout(pending);
        }
        pending = setTimeout(() => { pending = undefined; refresh(editor); }, delay);
    };
    ctx.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(e => {
            // The keys have to be right before the next keystroke, so no waiting here.
            const line = e.textEditor.document.lineAt(e.selections[0].active.line).text;
            mode.setState(e.textEditor.document.languageId === 'org' && !disabled && isTableLine(line));
            soon(e.textEditor);
        }),
        vscode.window.onDidChangeActiveTextEditor(e => soon(e, 0)),
        vscode.window.onDidChangeTextEditorVisibleRanges(e => soon(e.textEditor, 100)),
        vscode.workspace.onDidChangeTextDocument(e => {
            const editor = vscode.window.activeTextEditor;
            if (editor && e.document === editor.document) {
                soon(editor);
            }
        }),
        onColorsChanged(() => soon(vscode.window.activeTextEditor, 0)),
        vscode.languages.registerHoverProvider('org', new FormulaHover()),
        vscode.commands.registerCommand('org.tableModeOn', () => { disabled = false; refresh(vscode.window.activeTextEditor); }),
        vscode.commands.registerCommand('org.tableModeOff', () => { disabled = true; refresh(vscode.window.activeTextEditor); }),
    );
    refresh(vscode.window.activeTextEditor);
}
