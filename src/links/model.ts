// Org links as plain data: found in a line, their targets read, and the place
// in a file a target names found. No vscode here; src/links/providers.ts makes
// links clickable, followable with F12 and completable.

import { isHeadingLine, parseHeading, COMMON_KEYWORDS } from '../outline/model';

export interface LinkAt {
    start: number;     // where [[ starts on the line
    end: number;       // one past the closing ]]
    target: string;    // what is inside the first brackets
    desc?: string;     // the description, if there is one
}

export type TargetKind = 'url' | 'file' | 'id' | 'heading' | 'customId' | 'target' | 'fuzzy';

export interface Target {
    kind: TargetKind;
    path?: string;     // for file links: the file, as written
    search?: Target;   // and where in it: ::*Heading, ::#id, ::42, ::text
    line?: number;     // a ::42 search
    text: string;      // the heading title, id, custom id or text sought
    url?: string;      // for urls
}

const LINK_RE = /\[\[((?:[^\]\\]|\\.)+)\](?:\[([^\]]+)\])?\]/g;
const BARE_URL_RE = /\b(?:https?|ftp):\/\/[^\s<>\]\[)"']+[^\s<>\]\[)"'.,;:!?]/g;
const IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;

// Every link on a line: [[target][desc]], [[target]], and bare urls.
export function findLinks(line: string): LinkAt[] {
    const out: LinkAt[] = [];
    let m: RegExpExecArray | null;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(line)) !== null) {
        out.push({ start: m.index, end: m.index + m[0].length, target: m[1], desc: m[2] });
    }
    BARE_URL_RE.lastIndex = 0;
    while ((m = BARE_URL_RE.exec(line)) !== null) {
        const at = m.index;
        if (!out.some(l => at >= l.start && at < l.end)) {
            out.push({ start: at, end: at + m[0].length, target: m[0] });
        }
    }
    return out.sort((a, b) => a.start - b.start);
}

export function linkAt(line: string, ch: number): LinkAt | undefined {
    return findLinks(line).find(l => ch >= l.start && ch <= l.end);
}

// What a link's target names, read the way org reads it.
export function parseTarget(raw: string): Target {
    const t = raw.trim();
    if (/^(https?|ftp|mailto|news|vscode|obsidian|zotero):/i.test(t)) {
        return { kind: 'url', text: t, url: t };
    }
    if (/^id:/i.test(t)) {
        return { kind: 'id', text: t.slice(3).trim() };
    }
    if (t.startsWith('*')) {
        return { kind: 'heading', text: t.slice(1).trim() };
    }
    if (t.startsWith('#')) {
        return { kind: 'customId', text: t.slice(1).trim() };
    }
    let file: string | undefined;
    let search: string | undefined;
    const fm = /^(?:file(?:\+[\w-]+)?:)(.*)$/i.exec(t);
    const rest = fm ? fm[1] : t;
    const looksLikeFile = !!fm || /^(\.{1,2}\/|\/|~\/|[A-Za-z]:[\\/])/.test(rest) || /\.[A-Za-z0-9]{1,5}(::.*)?$/.test(rest);
    if (looksLikeFile) {
        const sep = rest.indexOf('::');
        file = sep >= 0 ? rest.slice(0, sep) : rest;
        search = sep >= 0 ? rest.slice(sep + 2) : undefined;
        const out: Target = { kind: 'file', path: file, text: file };
        if (search !== undefined && search !== '') {
            if (/^\d+$/.test(search)) {
                out.line = parseInt(search, 10) - 1;
            } else {
                out.search = parseTarget(search);
            }
        }
        return out;
    }
    const tm = /^<<(.+)>>$/.exec(t);
    if (tm) {
        return { kind: 'target', text: tm[1] };
    }
    return { kind: 'fuzzy', text: t };
}

export function isImage(target: Target): boolean {
    return target.kind === 'file' && IMAGE_RE.test(target.path || '') && !target.search && target.line === undefined;
}

// -- Finding what a target names in a file ----------------------------------

const norm = (s: string) => s.replace(/\[\d*\/\d*\]|\[\d*%\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// A heading by its title, keyword, priority, tags and statistics cookies aside.
export function findHeading(lines: string[], title: string): number {
    const want = norm(title);
    const words = COMMON_KEYWORDS;
    for (let i = 0; i < lines.length; i++) {
        if (isHeadingLine(lines[i])) {
            const h = parseHeading(lines[i], i, words);
            if (h && norm(h.title) === want) {
                return i;
            }
        }
    }
    return -1;
}

// The heading whose property drawer holds `name: value`.
export function findProperty(lines: string[], name: string, value: string): number {
    const re = new RegExp('^\\s*:' + name + ':\\s*' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
    for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
            for (let h = i; h >= 0; h--) {
                if (isHeadingLine(lines[h])) {
                    return h;
                }
            }
            return 0;
        }
    }
    return -1;
}

// A dedicated target, <<text>>.
export function findDedicated(lines: string[], text: string): { line: number, ch: number } | undefined {
    const want = '<<' + text + '>>';
    for (let i = 0; i < lines.length; i++) {
        const ch = lines[i].toLowerCase().indexOf(want.toLowerCase());
        if (ch >= 0) {
            return { line: i, ch };
        }
    }
    return undefined;
}

// Where in these lines a target (other than a file or url) points.
export function resolveIn(lines: string[], t: Target): { line: number, ch: number } | undefined {
    if (t.line !== undefined) {
        return { line: Math.max(0, Math.min(t.line, lines.length - 1)), ch: 0 };
    }
    let line = -1;
    switch (t.kind) {
        case 'heading': line = findHeading(lines, t.text); break;
        case 'customId': line = findProperty(lines, 'CUSTOM_ID', t.text); break;
        case 'id': line = findProperty(lines, 'ID', t.text); break;
        case 'target': return findDedicated(lines, t.text);
        case 'fuzzy': {
            // org: a dedicated target, then a heading of that name, then the text.
            const d = findDedicated(lines, t.text);
            if (d) {
                return d;
            }
            line = findHeading(lines, t.text);
            if (line < 0) {
                const want = t.text.toLowerCase();
                for (let i = 0; i < lines.length && line < 0; i++) {
                    const ch = lines[i].toLowerCase().indexOf(want);
                    if (ch >= 0 && !/\[\[/.test(lines[i].slice(Math.max(0, ch - 2), ch))) {
                        return { line: i, ch };
                    }
                }
            }
            break;
        }
    }
    return line >= 0 ? { line, ch: 0 } : undefined;
}

// -- Making links -----------------------------------------------------------

// How to link to a heading from elsewhere: by its ID or CUSTOM_ID when it has
// one (they survive renames), by title otherwise.
export function linkToHeading(lines: string[], line: number, fileRef?: string, keywords: string[] = COMMON_KEYWORDS): { target: string, desc: string } {
    const h = parseHeading(lines[line], line, keywords);
    const title = h ? h.title : lines[line].replace(/^\*+\s*/, '');
    let id: string | undefined;
    let custom: string | undefined;
    for (let i = line + 1; i < lines.length && !isHeadingLine(lines[i]); i++) {
        const m = /^\s*:(ID|CUSTOM_ID):\s*(\S+)\s*$/i.exec(lines[i]);
        if (m) {
            if (m[1].toUpperCase() === 'ID') {
                id = m[2];
            } else {
                custom = m[2];
            }
        }
        if (/^\s*:END:\s*$/i.test(lines[i])) {
            break;
        }
    }
    if (id) {
        return { target: 'id:' + id, desc: title };
    }
    const search = custom ? '#' + custom : '*' + title;
    return { target: fileRef ? `file:${fileRef}::${search}` : search, desc: title };
}

export function formatLink(target: string, desc?: string): string {
    return desc && desc !== target ? `[[${target}][${desc}]]` : `[[${target}]]`;
}
