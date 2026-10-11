// Completion as you type: tags after a heading's colon, TODO keywords after its
// stars, property names and values in a drawer, #+ keywords (blocks come with
// their #+END), source block languages, and link targets after [[. What this
// file and the workspace use comes first; the orgs server, when you are
// logged in, adds every tag and property it knows.

import * as vscode from 'vscode';
import { URL } from 'url';
import { Auth } from './auth';
import { ODb } from './db';
import { Sets } from './sets';
import { orgFiles, relativeLink } from './org-files';
import { isHeadingLine, parseHeading } from './outline/model';

// Server answers, kept a minute: completion has to be instant.
const cached = new Map<string, { at: number, value: any }>();
async function fromServer<T>(key: string, get: () => Promise<T>): Promise<T | undefined> {
    if (!Auth.get().isLoggedIn()) {
        return undefined;
    }
    const hit = cached.get(key);
    if (hit && Date.now() - hit.at < 60000) {
        return hit.value;
    }
    try {
        const value = await get();
        cached.set(key, { at: Date.now(), value });
        return value;
    } catch (e) {
        return undefined;
    }
}

function allKeywords(doc: vscode.TextDocument): string[] {
    const words = new Set<string>();
    (Sets.getProp<string[]>('todoKeywords', ['TODO']) || []).forEach(k => k && words.add(k));
    (Sets.getProp<string[]>('doneKeywords', ['DONE']) || []).forEach(k => k && words.add(k));
    // A file's own #+TODO: line, as org reads it: words, a bar, done words.
    for (let i = 0; i < Math.min(doc.lineCount, 200); i++) {
        const m = /^#\+(?:TODO|SEQ_TODO|TYP_TODO):\s*(.*)$/i.exec(doc.lineAt(i).text);
        if (m) {
            m[1].split(/\s+/).filter(w => w && w !== '|').forEach(w => words.add(w.replace(/\(.*\)$/, '')));
        }
    }
    return Array.from(words);
}

function localTags(doc: vscode.TextDocument): Map<string, number> {
    const counts = new Map<string, number>();
    const words = allKeywords(doc);
    for (let i = 0; i < doc.lineCount; i++) {
        const text = doc.lineAt(i).text;
        if (isHeadingLine(text)) {
            parseHeading(text, i, words).tags.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
        }
        const ft = /^#\+FILETAGS:\s*(.*)$/i.exec(text);
        if (ft) {
            ft[1].split(/[:\s]+/).filter(t => t).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
        }
    }
    return counts;
}

function localProperties(doc: vscode.TextDocument): Map<string, Set<string>> {
    const props = new Map<string, Set<string>>();
    let inDrawer = false;
    for (let i = 0; i < doc.lineCount; i++) {
        const text = doc.lineAt(i).text;
        if (/^\s*:PROPERTIES:\s*$/i.test(text)) {
            inDrawer = true;
        } else if (/^\s*:END:\s*$/i.test(text)) {
            inDrawer = false;
        } else if (inDrawer) {
            const m = /^\s*:([\w-]+):\s*(.*)$/.exec(text);
            if (m) {
                const set = props.get(m[1].toUpperCase()) || new Set<string>();
                if (m[2].trim()) {
                    set.add(m[2].trim());
                }
                props.set(m[1].toUpperCase(), set);
            }
        }
    }
    return props;
}

function inPropertyDrawer(doc: vscode.TextDocument, line: number): boolean {
    for (let i = line - 1; i >= 0; i--) {
        const text = doc.lineAt(i).text;
        if (/^\s*:PROPERTIES:\s*$/i.test(text)) {
            return true;
        }
        if (/^\s*:END:\s*$/i.test(text) || isHeadingLine(text)) {
            return false;
        }
    }
    return false;
}

// #+ keywords, what they are for, and the snippet a block expands to.
const KEYWORDS: [string, string, string?][] = [
    ['TITLE', 'The document title', 'TITLE: $0'],
    ['AUTHOR', 'Who wrote it', 'AUTHOR: $0'],
    ['DATE', 'When it was written', 'DATE: $0'],
    ['EMAIL', 'The author\'s address', 'EMAIL: $0'],
    ['FILETAGS', 'Tags every heading in the file has', 'FILETAGS: :$0:'],
    ['TODO', 'The keywords this file uses: TODO NEXT | DONE', 'TODO: ${1:TODO NEXT} | ${2:DONE}'],
    ['STARTUP', 'How the file opens: overview, content, showall...', 'STARTUP: ${1|overview,content,showall,showeverything,indent|}'],
    ['OPTIONS', 'Export options', 'OPTIONS: ${1:toc:nil num:nil}'],
    ['NAME', 'Names the next table or block, for remote() and links', 'NAME: $0'],
    ['CAPTION', 'A caption for the next table or figure', 'CAPTION: $0'],
    ['TBLFM', 'Formulas for the table above', 'TBLFM: $0'],
    ['PLOT', 'How Plot Table draws the table below', 'PLOT: title:"${1:Title}" ind:${2:1} deps:(${3:2})'],
    ['COLUMNS', 'The column view\'s columns', 'COLUMNS: %${1:ITEM} %${2:TODO}'],
    ['CONSTANTS', 'Constants for table formulas', 'CONSTANTS: ${1:name}=${2:value}'],
    ['INCLUDE', 'Include another file when exporting', 'INCLUDE: "${1:file.org}"'],
    ['SETUPFILE', 'Read settings from another file', 'SETUPFILE: ${1:setup.org}'],
    ['CALL', 'Run a named source block here', 'CALL: ${1:name}()'],
    ['RESULTS', 'The results of the block above', 'RESULTS:'],
    ['ARCHIVE', 'Where archived subtrees go', 'ARCHIVE: ${1:%s_archive::}'],
    ['BEGIN_SRC', 'A source block', 'BEGIN_SRC ${1:python}\n$0\n#+END_SRC'],
    ['BEGIN_EXAMPLE', 'Text shown as it is', 'BEGIN_EXAMPLE\n$0\n#+END_EXAMPLE'],
    ['BEGIN_QUOTE', 'A quotation', 'BEGIN_QUOTE\n$0\n#+END_QUOTE'],
    ['BEGIN_VERSE', 'Text with its line breaks kept', 'BEGIN_VERSE\n$0\n#+END_VERSE'],
    ['BEGIN_CENTER', 'Centred text', 'BEGIN_CENTER\n$0\n#+END_CENTER'],
    ['BEGIN_COMMENT', 'Not exported', 'BEGIN_COMMENT\n$0\n#+END_COMMENT'],
    ['BEGIN_EXPORT', 'Raw output for one exporter', 'BEGIN_EXPORT ${1|html,latex|}\n$0\n#+END_EXPORT'],
    ['BEGIN', 'A dynamic block', 'BEGIN: ${1|clocktable,columnview,query|} $2\n#+END:'],
];

const LANGUAGES = ['python', 'sh', 'bash', 'emacs-lisp', 'js', 'javascript', 'typescript', 'go', 'rust', 'c', 'cpp', 'java',
    'sql', 'json', 'yaml', 'html', 'css', 'latex', 'ruby', 'lua', 'r', 'dot', 'plantuml', 'mermaid', 'org', 'text'];

class OrgCompletion implements vscode.CompletionItemProvider {
    async provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
        const line = doc.lineAt(pos.line).text;
        const before = line.slice(0, pos.character);
        let m: RegExpExecArray | null;

        // [[ : a link target.
        if ((m = /\[\[([^\]\[]*)$/.exec(before))) {
            return this.linkTargets(doc, pos, m[1], line.slice(pos.character));
        }
        if (isHeadingLine(line)) {
            // Tags: after a colon that starts or continues the heading's tags.
            if ((m = /\s:((?:[^\s:]+:)*)([^\s:]*)$/.exec(before))) {
                return this.tags(doc, pos, m[2], m[1].split(':').filter(t => t));
            }
            // The keyword, right after the stars.
            if ((m = /^\*+\s+(\S*)$/.exec(before))) {
                const range = new vscode.Range(pos.line, pos.character - m[1].length, pos.line, pos.character);
                return allKeywords(doc).map((k, i) => {
                    const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.EnumMember);
                    item.insertText = k + ' ';
                    item.range = range;
                    item.sortText = String(i).padStart(3, '0');
                    item.detail = 'TODO keyword';
                    return item;
                });
            }
            return undefined;
        }
        // #+ keywords and block snippets.
        if ((m = /^(\s*)#\+(\w*)$/.exec(before))) {
            const range = new vscode.Range(pos.line, pos.character - m[2].length, pos.line, pos.character);
            const lower = m[2] !== '' && m[2] === m[2].toLowerCase();
            return KEYWORDS.map(([word, doc_, snippet], i) => {
                const item = new vscode.CompletionItem(lower ? word.toLowerCase() : word, vscode.CompletionItemKind.Keyword);
                let text = snippet || word + ': ';
                text = text.replace(/\n#\+END/g, '\n' + m[1] + '#+END').replace(/\n\$0/g, '\n' + m[1] + '$0');
                item.insertText = new vscode.SnippetString(lower ? text.replace(/^[A-Z_]+|#\+END[_:A-Z]*/g, w => w.toLowerCase()) : text);
                item.range = range;
                item.detail = doc_;
                item.sortText = String(i).padStart(3, '0');
                return item;
            });
        }
        // The language of a source block.
        if ((m = /^\s*#\+BEGIN_SRC\s+(\S*)$/i.exec(before))) {
            const range = new vscode.Range(pos.line, pos.character - m[1].length, pos.line, pos.character);
            const used = new Map<string, number>();
            for (let i = 0; i < doc.lineCount; i++) {
                const l = /^\s*#\+BEGIN_SRC\s+(\S+)/i.exec(doc.lineAt(i).text);
                if (l) {
                    used.set(l[1], (used.get(l[1]) || 0) + 1);
                }
            }
            const langs = Array.from(new Set(Array.from(used.keys()).concat(LANGUAGES)));
            return langs.map(l => {
                const item = new vscode.CompletionItem(l, vscode.CompletionItemKind.Value);
                item.range = range;
                item.sortText = (used.has(l) ? '0' : '1') + l;
                item.detail = used.has(l) ? 'used in this file' : undefined;
                return item;
            });
        }
        if (inPropertyDrawer(doc, pos.line)) {
            // A property's value.
            if ((m = /^\s*:([\w-]+):\s+(.*)$/.exec(before))) {
                return this.propertyValues(doc, pos, m[1].toUpperCase(), m[2]);
            }
            // A property's name.
            if ((m = /^\s*:([\w-]*)$/.exec(before))) {
                return this.propertyNames(doc, pos, m[1]);
            }
        }
        return undefined;
    }

    private async tags(doc: vscode.TextDocument, pos: vscode.Position, typed: string, have: string[]): Promise<vscode.CompletionItem[]> {
        const counts = localTags(doc);
        const server = await fromServer<string[]>('tags', () => ODb.doGet<string[]>(new URL(Sets.orgsConnection + '/alltags')));
        const all = new Set<string>(Array.from(counts.keys()).concat(Array.isArray(server) ? server : []));
        const range = new vscode.Range(pos.line, pos.character - typed.length, pos.line, pos.character);
        return Array.from(all).filter(t => have.indexOf(t) < 0).map(t => {
            const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.Constant);
            item.insertText = t + ':';
            item.range = range;
            item.detail = counts.has(t) ? `${counts.get(t)} in this file` : 'used elsewhere';
            item.sortText = (counts.has(t) ? '0' + String(9999 - counts.get(t)).padStart(4, '0') : '1') + t;
            // Straight on to the next tag.
            item.command = { title: 'More tags', command: 'editor.action.triggerSuggest' };
            return item;
        });
    }

    private async propertyNames(doc: vscode.TextDocument, pos: vscode.Position, typed: string): Promise<vscode.CompletionItem[]> {
        const local = localProperties(doc);
        const server = await fromServer<any[]>('props', () => ODb.doGet<any[]>(new URL(Sets.orgsConnection + '/properties')));
        const names = new Map<string, string>();
        ['ID', 'CUSTOM_ID', 'CREATED', 'EFFORT', 'CATEGORY', 'ARCHIVE', 'STYLE', 'ORDERED'].forEach(n => names.set(n, 'org'));
        local.forEach((_v, n) => names.set(n, 'in this file'));
        (Array.isArray(server) ? server : []).forEach(p => p && p.Name && !names.has(p.Name.toUpperCase()) && names.set(p.Name.toUpperCase(), `${p.Count} uses`));
        const range = new vscode.Range(pos.line, pos.character - typed.length, pos.line, pos.character);
        return Array.from(names.entries()).map(([n, d]) => {
            const item = new vscode.CompletionItem(n, vscode.CompletionItemKind.Property);
            item.insertText = n + ': ';
            item.range = range;
            item.detail = d;
            item.sortText = (d === 'in this file' ? '0' : d === 'org' ? '1' : '2') + n;
            item.command = { title: 'Values', command: 'editor.action.triggerSuggest' };
            return item;
        });
    }

    private async propertyValues(doc: vscode.TextDocument, pos: vscode.Position, name: string, typed: string): Promise<vscode.CompletionItem[]> {
        const values = new Set<string>(Array.from(localProperties(doc).get(name) || []));
        const server = await fromServer<any[]>('props:' + name, () => ODb.doGet<any[]>(new URL(Sets.orgsConnection + '/properties?all=' + encodeURIComponent(name))));
        (Array.isArray(server) ? server : []).filter(p => p && p.Name && p.Name.toUpperCase() === name).forEach(p => (p.Values || []).forEach((v: string) => values.add(v)));
        if (name === 'STYLE') {
            values.add('habit');
        }
        const range = new vscode.Range(pos.line, pos.character - typed.length, pos.line, pos.character);
        return Array.from(values).map(v => {
            const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Value);
            item.range = range;
            return item;
        });
    }

    private async linkTargets(doc: vscode.TextDocument, pos: vscode.Position, typed: string, after: string): Promise<vscode.CompletionItem[]> {
        const range = new vscode.Range(pos.line, pos.character - typed.length, pos.line, pos.character);
        const close = after.startsWith(']') ? '' : ']]';
        const out: vscode.CompletionItem[] = [];
        const add = (label: string, kind: vscode.CompletionItemKind, detail: string, sort: string) => {
            const item = new vscode.CompletionItem(label, kind);
            item.insertText = label + close;
            item.range = range;
            item.detail = detail;
            item.sortText = sort + label;
            out.push(item);
        };
        const words = allKeywords(doc);
        for (let i = 0; i < doc.lineCount; i++) {
            const text = doc.lineAt(i).text;
            if (isHeadingLine(text)) {
                add('*' + parseHeading(text, i, words).title, vscode.CompletionItemKind.Reference, 'heading in this file', '0');
            }
            let m = /^\s*:CUSTOM_ID:\s*(\S+)/i.exec(text);
            if (m) {
                add('#' + m[1], vscode.CompletionItemKind.Reference, 'custom id in this file', '1');
            }
            const re = /<<([^<>]+)>>/g;
            while ((m = re.exec(text)) !== null) {
                add(m[1], vscode.CompletionItemKind.Reference, 'target in this file', '1');
            }
        }
        if (doc.uri.scheme === 'file') {
            for (const f of await orgFiles()) {
                if (f !== doc.fileName) {
                    add('file:' + relativeLink(doc.fileName, f), vscode.CompletionItemKind.File, 'org file', '2');
                }
            }
        }
        return out;
    }
}

export function activateCompletion(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.languages.registerCompletionItemProvider('org', new OrgCompletion(), ':', '+', '[', ' ', '*', '#'));
}
