// Exporting to files: the file, or just the subtree the cursor is in, as html,
// pdf, LaTeX, slides or markdown - whichever exporters the orgs server has -
// written next to the org file, with a button to open it.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ODb } from './db';
import { linesOf } from './edit-lines';
import { headingAt, parseHeading } from './outline/model';
import { slug } from './dates';

interface Format { name: string; label: string; detail: string; ext: string; icon: string; }

// The exporters people export with, how to call them, and the file each makes.
const FORMATS: Format[] = [
    { name: 'html', label: 'HTML', detail: 'A web page', ext: '.html', icon: 'globe' },
    { name: 'pdf', label: 'PDF', detail: 'Through LaTeX (needs pdflatex where the server runs)', ext: '.pdf', icon: 'file-pdf' },
    { name: 'latex', label: 'LaTeX', detail: 'A .tex file', ext: '.tex', icon: 'file-code' },
    { name: 'revealjs', label: 'Reveal.js slides', detail: 'Each heading a slide', ext: '-slides.html', icon: 'preview' },
    { name: 'impressjs', label: 'Impress.js slides', detail: 'A zooming presentation', ext: '-impress.html', icon: 'preview' },
    { name: 'webslides', label: 'WebSlides', detail: 'Slides', ext: '-webslides.html', icon: 'preview' },
    { name: 'deckjs', label: 'deck.js slides', detail: 'Slides', ext: '-deck.html', icon: 'preview' },
    { name: 'markdown', label: 'Markdown', detail: 'A .md file', ext: '.md', icon: 'markdown' },
];

interface FormatPick extends vscode.QuickPickItem { format: Format; }

async function exportAs(subtree: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'org') {
        return;
    }
    const doc = editor.document;
    if (doc.isUntitled) {
        vscode.window.showWarningMessage('Save the file first: the orgs server exports files.');
        return;
    }
    let hash: string | undefined;
    let title = path.basename(doc.fileName, '.org');
    if (subtree) {
        const lines = linesOf(doc);
        const h = headingAt(lines, editor.selection.active.line);
        if (h < 0) {
            vscode.window.setStatusBarMessage('Not under a heading', 2000);
            return;
        }
        if (doc.isDirty && !await doc.save()) {
            return;
        }
        hash = await ODb.lookuphash(doc.fileName, h);
        if (!hash || / /.test(hash)) {
            vscode.window.showErrorMessage('The orgs server does not know this heading - is the file in one of its org directories?');
            return;
        }
        title = parseHeading(lines[h], h, []).title;
    } else if (doc.isDirty && !await doc.save()) {
        return;
    }
    const have = await ODb.exporters();
    const items: FormatPick[] = FORMATS.filter(f => have.indexOf(f.name) >= 0)
        .map(f => ({ label: `$(${f.icon}) ${f.label}`, description: f.detail, format: f }));
    if (items.length === 0) {
        vscode.window.showWarningMessage('The orgs server has no exporters set up (server.exporters in its yaml).');
        return;
    }
    const pick = await vscode.window.showQuickPick(items, { placeHolder: subtree ? `Export "${title}" as…` : `Export ${path.basename(doc.fileName)} as…` });
    if (!pick) {
        return;
    }
    const f = pick.format;
    const base = path.join(path.dirname(doc.fileName), path.basename(doc.fileName, '.org') + (subtree ? '-' + slug(title) : ''));
    const out = base + f.ext;
    const ok = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Exporting ${f.label}…` }, async () => {
        if (f.name === 'pdf') {
            if (!subtree) {
                const bytes = await ODb.pdf(doc.fileName);
                if (!bytes) {
                    return false;
                }
                fs.writeFileSync(out, bytes);
                return true;
            }
            // A subtree's pdf is written by the server, so to a path it can see.
            const res = await ODb.exportToFile('pdf', doc.fileName, out, hash);
            if (!res || !res.Ok) {
                vscode.window.showErrorMessage('Export failed: ' + (res && res.Msg || 'no answer from the server'));
                return false;
            }
            return true;
        }
        const res = await ODb.exportText(f.name, doc.fileName, hash);
        if (!res || !res.Ok) {
            vscode.window.showErrorMessage('Export failed: ' + (res && res.Msg || 'no answer from the server'));
            return false;
        }
        fs.writeFileSync(out, res.Msg, 'utf8');
        return true;
    });
    if (!ok) {
        return;
    }
    const opens = /\.(html|pdf)$/.test(out) ? 'Open' : 'Open in Editor';
    const choice = await vscode.window.showInformationMessage(`Exported ${path.basename(out)}`, opens, 'Reveal in Finder');
    if (choice === 'Open') {
        await vscode.env.openExternal(vscode.Uri.file(out));
    } else if (choice === 'Open in Editor') {
        await vscode.window.showTextDocument(vscode.Uri.file(out));
    } else if (choice) {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(out));
    }
}

export function activateExport(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
        vscode.commands.registerCommand('org.export', () => exportAs(false)),
        vscode.commands.registerCommand('org.exportSubtree', () => exportAs(true)),
    );
}
