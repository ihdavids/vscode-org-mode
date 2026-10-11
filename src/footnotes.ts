// Footnotes: F12 (gd in vim) on a [fn:label] goes to its definition, Shift+F12
// finds every reference, hovering shows the note, [fn: completes the labels
// in use, and Insert Footnote adds the next one and takes you to write it.

import * as vscode from 'vscode';
import { footnotesOn, definitionOf, referencesTo, definitionText, labels, nextLabel, placeDefinition } from './footnotes-model';

const linesOf = (doc: vscode.TextDocument) => doc.getText().split(/\r?\n/);

function at(doc: vscode.TextDocument, pos: vscode.Position) {
    const f = footnotesOn(doc.lineAt(pos.line).text, pos.line);
    const hit = f.refs.concat(f.def ? [f.def] : []).find(r => pos.character >= r.start && pos.character <= r.end);
    return hit ? { ref: hit, isDef: hit === f.def } : undefined;
}

class Footnotes implements vscode.DefinitionProvider, vscode.ReferenceProvider, vscode.HoverProvider, vscode.CompletionItemProvider {
    provideDefinition(doc: vscode.TextDocument, pos: vscode.Position) {
        const a = at(doc, pos);
        if (!a || a.isDef || a.ref.inline !== undefined) {
            return undefined;
        }
        const line = definitionOf(linesOf(doc), a.ref.label);
        return line < 0 ? undefined : new vscode.Location(doc.uri, new vscode.Position(line, 0));
    }

    provideReferences(doc: vscode.TextDocument, pos: vscode.Position) {
        const a = at(doc, pos);
        if (!a || !a.ref.label) {
            return undefined;
        }
        return referencesTo(linesOf(doc), a.ref.label).map(r => new vscode.Location(doc.uri, new vscode.Range(r.line, r.start, r.line, r.end)));
    }

    provideHover(doc: vscode.TextDocument, pos: vscode.Position) {
        const a = at(doc, pos);
        if (!a || a.isDef) {
            return undefined;
        }
        const lines = linesOf(doc);
        const text = a.ref.inline !== undefined ? a.ref.inline : (() => {
            const d = definitionOf(lines, a.ref.label);
            return d < 0 ? undefined : definitionText(lines, d);
        })();
        const md = new vscode.MarkdownString(text === undefined ? `$(warning) No definition for \`[fn:${a.ref.label}]\`` : text, true);
        return new vscode.Hover(md, new vscode.Range(pos.line, a.ref.start, pos.line, a.ref.end));
    }

    provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position) {
        const before = doc.lineAt(pos.line).text.slice(0, pos.character);
        const m = /\[fn:([\w-]*)$/.exec(before);
        if (!m) {
            return undefined;
        }
        const lines = linesOf(doc);
        const range = new vscode.Range(pos.line, pos.character - m[1].length, pos.line, pos.character);
        const close = doc.lineAt(pos.line).text.slice(pos.character).startsWith(']') ? '' : ']';
        return labels(lines).map(l => {
            const item = new vscode.CompletionItem(l, vscode.CompletionItemKind.Reference);
            const d = definitionOf(lines, l);
            item.detail = d >= 0 ? definitionText(lines, d).slice(0, 80) : 'no definition yet';
            item.insertText = l + close;
            item.range = range;
            return item;
        });
    }
}

// org's C-c C-x f: a new numbered footnote here, its definition under
// Footnotes, and the cursor there to write it. On a footnote: go between it
// and its definition.
export async function insertFootnote(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'org') {
        return;
    }
    const doc = editor.document;
    const pos = editor.selection.active;
    const a = at(doc, pos);
    const lines = linesOf(doc);
    if (a && a.ref.label) {
        const target = a.isDef ? referencesTo(lines, a.ref.label)[0] : undefined;
        const line = a.isDef ? (target ? target.line : -1) : definitionOf(lines, a.ref.label);
        if (line >= 0) {
            const p = new vscode.Position(line, a.isDef && target ? target.end : lines[line].length);
            editor.selection = new vscode.Selection(p, p);
            editor.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            return;
        }
    }
    const label = nextLabel(lines);
    const place = placeDefinition(lines, label);
    await editor.edit(b => {
        b.insert(pos, `[fn:${label}]`);
        if (place.line !== undefined && place.line < doc.lineCount) {
            b.insert(new vscode.Position(place.line, 0), place.text + '\n');
        } else {
            b.insert(doc.lineAt(doc.lineCount - 1).range.end, place.text);
        }
    });
    const line = definitionOf(linesOf(editor.document), label);
    const end = new vscode.Position(line, editor.document.lineAt(line).text.length);
    editor.selection = new vscode.Selection(end, end);
    editor.revealRange(new vscode.Range(end, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

export function activateFootnotes(ctx: vscode.ExtensionContext) {
    const f = new Footnotes();
    ctx.subscriptions.push(
        vscode.languages.registerDefinitionProvider('org', f),
        vscode.languages.registerReferenceProvider('org', f),
        vscode.languages.registerHoverProvider('org', f),
        vscode.languages.registerCompletionItemProvider('org', f, ':'),
        vscode.commands.registerCommand('org.insertFootnote', insertFootnote),
    );
}
