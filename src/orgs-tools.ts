// The orgs server's features, as editor commands: tick a habit, encrypt or
// decrypt a heading, attach files and open them, see a file's history as a
// diff, start a file from a template, and search the text of every file as
// you type.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ODb } from './db';
import { linesOf } from './edit-lines';
import { headingAt, parseHeading } from './outline/model';
import { openAt, settled } from './org-files';

// The heading the cursor is under, as the server knows it. Saves first: the
// server reads the file from disk.
async function headingHere(): Promise<{ hash: string, title: string, file: string } | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'org') {
        return undefined;
    }
    const doc = editor.document;
    if (doc.isUntitled) {
        vscode.window.showWarningMessage('Save the file first: the orgs server works on files.');
        return undefined;
    }
    if (doc.isDirty && !await doc.save()) {
        return undefined;
    }
    const lines = linesOf(doc);
    const h = headingAt(lines, editor.selection.active.line);
    if (h < 0) {
        vscode.window.setStatusBarMessage('Not under a heading', 2000);
        return undefined;
    }
    const hash = await ODb.lookuphash(doc.fileName, h);
    if (!hash || / /.test(hash)) {
        vscode.window.showErrorMessage('The orgs server does not know this heading - is the file in one of its org directories?');
        return undefined;
    }
    return { hash, title: parseHeading(lines[h], h, []).title, file: doc.fileName };
}

const fail = (what: string, res: any) =>
    vscode.window.showErrorMessage(`${what}: ${res && res.Msg || 'the orgs server did not answer'}`);

// -- Habits --------------------------------------------------------------------

interface HabitPick extends vscode.QuickPickItem { habit: any; }

// The habits due or done today. Picking one ticks it - or, done already,
// takes today's tick back off.
export async function habits(): Promise<void> {
    const res: any = await ODb.api('/habits', { days: '14' });
    if (!res) {
        return;
    }
    if (!res.Ok || !res.Habits || res.Habits.length === 0) {
        vscode.window.showInformationMessage(res.Ok ? 'No habits. A heading with :STYLE: habit and a repeating SCHEDULED is one.' : res.Msg);
        return;
    }
    const strip = (h: any) => (h.Days || []).slice(-7).map((d: any) => d.s === 'done' ? '●' : d.s === 'miss' ? '○' : '·').join('');
    const items: HabitPick[] = res.Habits
        .slice().sort((a: any, b: any) => Number(b.Due && !b.DoneToday) - Number(a.Due && !a.DoneToday))
        .map((h: any) => ({
            label: `${h.DoneToday ? '$(pass-filled)' : h.Due ? '$(circle-large-outline)' : '$(circle-small)'} ${h.Headline}`,
            description: `${strip(h)}  streak ${h.Streak}${h.Best > h.Streak ? ` · best ${h.Best}` : ''}`,
            detail: h.DoneToday ? 'Done today - pick to take it back' : h.Due ? 'Due today - pick to mark it done' : `Next: ${h.Scheduled || 'not due'}`,
            habit: h,
        }));
    const pick = await vscode.window.showQuickPick(items, { placeHolder: `Habits - ${res.DoneToday} of ${res.DueToday} done today`, matchOnDetail: true });
    if (!pick) {
        return;
    }
    const h = pick.habit;
    const r: any = h.DoneToday
        ? await ODb.apiPost('/habits/untick', { Hash: h.Hash })
        : await ODb.apiPost('/status/change', { Hash: h.Hash, Value: h.DoneKeyword || 'DONE' });
    await settled([h.Filename]);
    if (r && r.Ok) {
        vscode.window.setStatusBarMessage(`$(check) ${h.Headline}: ${h.DoneToday ? 'taken back' : 'done'}`, 3000);
    } else {
        fail(h.Headline, r);
    }
}

// -- Encryption ----------------------------------------------------------------

async function cryptPassphrase(forEncrypt: boolean): Promise<string | undefined | null> {
    const cfg: any = await ODb.api('/crypt/config');
    if (!cfg || cfg.Mode === 'off') {
        vscode.window.showWarningMessage('Encryption is off on the orgs server (crypt: in its yaml, and gpg installed).');
        return null;
    }
    if (cfg.Unlocked || (forEncrypt && cfg.Mode === 'key')) {
        return '';
    }
    const p = await vscode.window.showInputBox({ prompt: 'Passphrase', password: true, ignoreFocusOut: true });
    return p === undefined ? null : p;
}

export async function encryptHeading(): Promise<void> {
    const h = await headingHere();
    const pass = h && await cryptPassphrase(true);
    if (!h || pass === null) {
        return;
    }
    const res: any = await ODb.apiPost('/crypt/encrypt', { hash: h.hash, passphrase: pass });
    if (res && res.Ok) {
        vscode.window.setStatusBarMessage(`$(lock) "${h.title}" ${res.Msg}`, 3000);
    } else {
        fail('Encrypt', res);
    }
}

export async function decryptHeading(): Promise<void> {
    const h = await headingHere();
    if (!h) {
        return;
    }
    const how = await vscode.window.showQuickPick([
        { label: '$(eye) Show it', description: 'the file stays encrypted', write: false },
        { label: '$(unlock) Decrypt it in the file', description: 'the text is written back as plain text', write: true },
    ], { placeHolder: `Decrypt "${h.title}"` });
    const pass = how && await cryptPassphrase(false);
    if (!how || pass === null) {
        return;
    }
    const res: any = await ODb.apiPost('/crypt/decrypt', { hash: h.hash, passphrase: pass, write: how.write });
    if (!res || !res.Ok) {
        fail('Decrypt', res);
        return;
    }
    if (!how.write) {
        const doc = await vscode.workspace.openTextDocument({ language: 'org', content: res.Text });
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
    }
}

// -- Attachments -----------------------------------------------------------------

export async function attachFile(): Promise<void> {
    const h = await headingHere();
    if (!h) {
        return;
    }
    const files = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Attach' });
    if (!files || files.length === 0) {
        return;
    }
    for (const f of files) {
        const res: any = await ODb.upload('/attach', { hash: h.hash }, 'file', path.basename(f.fsPath), fs.readFileSync(f.fsPath));
        if (!res || !res.Ok) {
            fail('Attach ' + path.basename(f.fsPath), res);
            return;
        }
    }
    vscode.window.setStatusBarMessage(`$(paperclip) Attached ${files.length} file${files.length === 1 ? '' : 's'} to "${h.title}"`, 4000);
}

export async function openAttachment(): Promise<void> {
    const h = await headingHere();
    if (!h) {
        return;
    }
    const res: any = await ODb.api('/attachments', { hash: h.hash });
    if (!res || !res.Ok) {
        fail('Attachments', res);
        return;
    }
    const list: any[] = res.Attachments || [];
    if (list.length === 0) {
        vscode.window.showInformationMessage(`"${h.title}" has no attachments. Attach File adds one.`);
        return;
    }
    const pick = await vscode.window.showQuickPick(list.map(a => ({
        label: '$(file) ' + a.Name, description: `${Math.max(1, Math.round(a.Size / 1024))} KB · ${a.Modified}`, a,
    })), { placeHolder: `Attachments of "${h.title}"` });
    if (!pick) {
        return;
    }
    // On this machine the file is right there; otherwise it comes over the wire.
    let file = res.Dir ? path.join(res.Dir, pick.a.Name) : '';
    if (!file || !fs.existsSync(file)) {
        const bytes = await ODb.doGetBytes(`/attachment/${ODb.pathHash(h.hash)}/${encodeURIComponent(pick.a.Name)}`);
        if (!bytes) {
            return;
        }
        file = path.join(os.tmpdir(), 'orgs-attachments', pick.a.Name);
        if (!fs.existsSync(path.dirname(file))) {
            fs.mkdirSync(path.dirname(file));
        }
        fs.writeFileSync(file, bytes);
    }
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
}

// -- History ---------------------------------------------------------------------

// An earlier version of a file, for the diff view: orgs-history:/path?rev.
class HistoryContent implements vscode.TextDocumentContentProvider {
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const res: any = await ODb.api('/history/text', { file: uri.path, rev: uri.query });
        return res && res.Ok ? (res.Missing ? '' : res.Text) : `Could not read this version: ${res && res.Msg}`;
    }
}

export async function fileHistory(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.isUntitled) {
        return;
    }
    const file = editor.document.fileName;
    const res: any = await ODb.api('/history', { file, limit: '200' });
    if (!res || !res.Ok) {
        fail('History', res);
        return;
    }
    if (!res.InRepo || !res.Commits || res.Commits.length === 0) {
        vscode.window.showInformationMessage(`${path.basename(file)} has no history: it is not in a git repository the server can see.`);
        return;
    }
    const ago = (s: number) => {
        const d = (Date.now() / 1000 - s) / 86400;
        return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 60 ? `${Math.floor(d)} days ago` : new Date(s * 1000).toLocaleDateString();
    };
    const pick = await vscode.window.showQuickPick(res.Commits.map((c: any) => ({
        label: '$(git-commit) ' + c.Subject,
        description: `${c.Author} · ${ago(c.When)}`,
        detail: `${c.Short}  +${c.Added} −${c.Removed}`,
        c,
    })), { placeHolder: `${path.basename(file)} - pick a version to compare with now`, matchOnDescription: true });
    if (!pick) {
        return;
    }
    const c = (pick as any).c;
    const left = vscode.Uri.parse('orgs-history:' + file).with({ query: c.Hash });
    await vscode.commands.executeCommand('vscode.diff', left, editor.document.uri, `${path.basename(file)} (${c.Short} ↔ now)`);
}

// -- New files -------------------------------------------------------------------

export async function newFile(): Promise<void> {
    const templates: string[] = (await ODb.api<string[]>('/newtemplates')) || [];
    const items = [{ label: '$(new-file) Empty file', template: '' }]
        .concat((Array.isArray(templates) ? templates : []).map(t => ({ label: '$(file-code) ' + path.basename(t).replace(/\.tpl$/, ''), template: t })));
    const pick = items.length > 1 ? await vscode.window.showQuickPick(items, { placeHolder: 'Start the file from…' }) : items[0];
    if (!pick) {
        return;
    }
    const name = await vscode.window.showInputBox({
        prompt: 'File name - in the server\'s first org directory unless you give a path',
        placeHolder: 'notes/ideas.org',
        validateInput: v => v.trim() === '' ? 'A name, please' : undefined,
    });
    if (!name) {
        return;
    }
    const filename = /\.org$/.test(name) ? name.trim() : name.trim() + '.org';
    const title = path.basename(filename, '.org').replace(/[-_]+/g, ' ');
    const res: any = await ODb.apiPost('/file', { filename, title, template: pick.template, mustBeNew: true });
    if (Array.isArray(res) && res[0]) {
        await openAt(res[0], 0);
    } else {
        fail('New file', res);
    }
}

// -- Search ------------------------------------------------------------------------

interface Hit extends vscode.QuickPickItem { file: string; line: number; ch: number; }

// Every file's text, searched as you type (a regular expression, case
// ignored). With `here`, just the current file.
async function search(here: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const file = here && editor ? editor.document.fileName : '';
    const qp = vscode.window.createQuickPick<Hit>();
    qp.placeholder = here ? `Search ${path.basename(file)}` : 'Search the text of every org file';
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    let timer: NodeJS.Timeout | undefined;
    let asked = 0;
    qp.onDidChangeValue(q => {
        if (timer) {
            clearTimeout(timer);
        }
        if (q.trim().length < 2) {
            qp.items = [];
            return;
        }
        timer = setTimeout(async () => {
            const mine = ++asked;
            qp.busy = true;
            const params: {[k: string]: string} = { q, ignoreCase: 't', max: '200' };
            if (file) {
                params.file = file;
            }
            const res: any = await ODb.api('/files/search', params);
            if (mine !== asked) {
                return;
            }
            qp.busy = false;
            if (!res || !res.Ok) {
                qp.items = [{ label: '$(warning) ' + (res && res.Msg || 'no answer'), file: '', line: 0, ch: 0, alwaysShow: true }];
                return;
            }
            const hits: Hit[] = [];
            for (const f of res.Files || []) {
                for (const m of f.Matches || []) {
                    hits.push({
                        label: m.Text.trim(),
                        description: `${vscode.workspace.asRelativePath(f.Filename)}:${m.Line + 1}`,
                        file: f.Filename, line: m.Line, ch: Buffer.from(m.Text, 'utf8').slice(0, m.Start).toString('utf8').length,
                        alwaysShow: true,
                    });
                }
            }
            qp.items = hits;
            qp.title = `${res.Total} match${res.Total === 1 ? '' : 'es'} in ${res.FileCount} file${res.FileCount === 1 ? '' : 's'}`;
        }, 200);
    });
    qp.onDidAccept(async () => {
        const hit = qp.selectedItems[0];
        qp.hide();
        if (hit && hit.file) {
            await openAt(hit.file, hit.line, hit.ch);
        }
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
}

export function activateOrgsTools(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('orgs-history', new HistoryContent()),
        vscode.commands.registerCommand('org.habits', habits),
        vscode.commands.registerCommand('org.encryptHeading', encryptHeading),
        vscode.commands.registerCommand('org.decryptHeading', decryptHeading),
        vscode.commands.registerCommand('org.attachFile', attachFile),
        vscode.commands.registerCommand('org.openAttachment', openAttachment),
        vscode.commands.registerCommand('org.fileHistory', fileHistory),
        vscode.commands.registerCommand('org.newFile', newFile),
        vscode.commands.registerCommand('org.searchFiles', () => search(false)),
        vscode.commands.registerCommand('org.searchThisFile', () => search(true)),
    );
}
