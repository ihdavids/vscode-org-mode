/* SDOC: Developers
* The outline model
  Headings, subtrees and the edits on them, as plain functions over an
  array of lines: =parseHeading= (keyword, priority, title, tags),
  =headingAt=, =subtreeEnd=, =children=, =moveSubtree=, =sortChildren=,
  =sortList=, =setProperty= / =removeProperty=, =setHeadingParts=,
  =cycleKeyword=, =updateCookies=, =findOlp= / =olpOf=. Each edit returns
  the block of lines it rewrites, which =replaceLines= puts back with a
  minimal edit.

  Keywords are passed in: =fileKeywords= reads a file's own =#+TODO:=
  line, and =COMMON_KEYWORDS= is used where neither the file nor the
  settings are to hand.
EDOC */

// The outline of an org file as plain data: headings, the subtrees under them,
// and the edits that move and sort them. No vscode here, so it can be tested
// on its own; src/outline/commands.ts puts it to work in the editor.

export interface Heading {
    line: number;          // where it is, from 0
    level: number;         // how many stars
    todo: string;          // its keyword, '' for none
    priority: string;      // A, B, C... or ''
    title: string;         // the words, keyword, priority and tags taken off
    tags: string[];
}

const HEADING_RE = /^(\*+)\s+(.*)$/;

// The keywords people use besides TODO and DONE, for reading a heading's title
// when the file's own list is not to hand.
export const COMMON_KEYWORDS = ['TODO', 'NEXT', 'DOING', 'WAITING', 'HOLD', 'BLOCKED', 'DONE', 'CANCELLED', 'CANCELED'];

export function isHeadingLine(line: string): boolean {
    return /^\*+\s/.test(line);
}

export function headingLevel(line: string): number {
    const m = /^(\*+)\s/.exec(line);
    return m ? m[1].length : 0;
}

// A heading line read into its parts. `keywords` are the TODO and DONE words
// the file uses.
export function parseHeading(text: string, line: number, keywords: string[]): Heading | undefined {
    const m = HEADING_RE.exec(text);
    if (!m) {
        return undefined;
    }
    let rest = m[2];
    let todo = '';
    const word = /^(\S+)(?:\s+|$)(.*)$/.exec(rest);
    if (word && keywords.indexOf(word[1]) >= 0) {
        todo = word[1];
        rest = word[2];
    }
    let priority = '';
    const pri = /^\[#([A-Z0-9])\]\s*(.*)$/.exec(rest);
    if (pri) {
        priority = pri[1];
        rest = pri[2];
    }
    let tags: string[] = [];
    const tg = /^(.*?)\s+(:(?:[^\s:]+:)+)\s*$/.exec(rest);
    if (tg) {
        rest = tg[1];
        tags = tg[2].split(':').filter(t => t);
    } else if (/^:(?:[^\s:]+:)+$/.test(rest.trim())) {
        tags = rest.trim().split(':').filter(t => t);
        rest = '';
    }
    return { line, level: m[1].length, todo, priority, title: rest.trim(), tags };
}

// The heading a line belongs to: itself, or the nearest one above.
export function headingAt(lines: string[], line: number): number {
    for (let i = Math.min(line, lines.length - 1); i >= 0; i--) {
        if (isHeadingLine(lines[i])) {
            return i;
        }
    }
    return -1;
}

// One past the last line of the subtree a heading starts.
export function subtreeEnd(lines: string[], line: number): number {
    const level = headingLevel(lines[line]);
    let i = line + 1;
    while (i < lines.length && !(isHeadingLine(lines[i]) && headingLevel(lines[i]) <= level)) {
        i++;
    }
    return i;
}

// The headings directly under one (or the top level, for -1), as subtrees.
export function children(lines: string[], parent: number): { start: number, end: number }[] {
    const level = parent < 0 ? 0 : headingLevel(lines[parent]);
    const end = parent < 0 ? lines.length : subtreeEnd(lines, parent);
    const out: { start: number, end: number }[] = [];
    let childLevel = 0;
    for (let i = parent + 1; i < end; i++) {
        const l = headingLevel(lines[i]);
        if (l > level && (childLevel === 0 || l <= childLevel)) {
            childLevel = l;
            const e = subtreeEnd(lines, i);
            out.push({ start: i, end: e });
            i = e - 1;
        }
    }
    return out;
}

// The heading's siblings and where it is among them.
function siblings(lines: string[], line: number): { list: { start: number, end: number }[], index: number } {
    const level = headingLevel(lines[line]);
    let parent = line - 1;
    while (parent >= 0 && !(isHeadingLine(lines[parent]) && headingLevel(lines[parent]) < level)) {
        parent--;
    }
    const list = children(lines, parent);
    return { list, index: list.findIndex(s => s.start === line) };
}

// Swap a subtree with the one before or after it, children and all. Answers
// the lines the two cover, rewritten, and where the moved heading lands.
export function moveSubtree(lines: string[], line: number, dir: -1 | 1):
        { start: number, end: number, lines: string[], cursor: number } | undefined {
    const { list, index } = siblings(lines, line);
    const other = list[index + dir];
    if (index < 0 || !other) {
        return undefined;
    }
    const [a, b] = dir < 0 ? [other, list[index]] : [list[index], other];
    // A subtree that ends the file without a blank line would run into the
    // one moved under it.
    const first = trimTrailingBlank(lines.slice(a.start, a.end));
    const second = trimTrailingBlank(lines.slice(b.start, b.end));
    const gap = lines.slice(a.start + first.length, a.end);
    const tail = lines.slice(b.start + second.length, b.end);
    const swapped = second.concat(gap, first, tail);
    const cursor = dir < 0 ? a.start : a.start + second.length + gap.length;
    return { start: a.start, end: b.end, lines: swapped, cursor };
}

function trimTrailingBlank(block: string[]): string[] {
    let n = block.length;
    while (n > 1 && block[n - 1].trim() === '') {
        n--;
    }
    return block.slice(0, n);
}

// The drawers (:PROPERTIES: ... :END:) in a range of lines, by their first line.
export function drawers(lines: string[], start: number, end: number): number[] {
    const out: number[] = [];
    for (let i = start; i < end; i++) {
        if (/^\s*:[A-Za-z][\w-]*:\s*$/.test(lines[i]) && !/^\s*:END:\s*$/i.test(lines[i])) {
            out.push(i);
        }
    }
    return out;
}

// The headings the command acts on: the one at the cursor, or every heading
// starting in the selection that is not inside another one chosen.
export function chosenHeadings(lines: string[], sel: { start: number, end: number }): number[] {
    if (sel.start === sel.end) {
        const h = headingAt(lines, sel.start);
        return h < 0 ? [] : [h];
    }
    const out: number[] = [];
    let coveredTo = -1;
    for (let i = sel.start; i <= sel.end; i++) {
        if (isHeadingLine(lines[i]) && i >= coveredTo) {
            out.push(i);
            coveredTo = subtreeEnd(lines, i);
        }
    }
    if (out.length === 0) {
        const h = headingAt(lines, sel.start);
        return h < 0 ? [] : [h];
    }
    return out;
}

// -- Sorting ---------------------------------------------------------------

export type EntrySort = 'alpha' | 'todo' | 'priority' | 'date' | 'numeric';

const DATE_RE = /<(\d{4})-(\d{2})-(\d{2})(?:[^>\d]*(\d{1,2}):(\d{2}))?/;

function scheduledOrDeadline(block: string[]): number | null {
    for (const l of block.slice(0, 4)) {
        const m = /(?:SCHEDULED|DEADLINE):\s*<(\d{4})-(\d{2})-(\d{2})(?:[^>\d]*(\d{1,2}):(\d{2}))?/.exec(l) || DATE_RE.exec(l);
        if (m) {
            return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0).getTime();
        }
    }
    return null;
}

// Sort the headings under one by a key, as org's C-c ^ does. The text above
// the first child stays where it is. Keywords give the order TODO sorts in.
export function sortChildren(lines: string[], parent: number, by: EntrySort, descending: boolean,
                             keywords: string[]): { start: number, end: number, lines: string[] } | undefined {
    const kids = children(lines, parent);
    if (kids.length < 2) {
        return undefined;
    }
    const blocks = kids.map((k, i) => {
        const block = trimTrailingBlank(lines.slice(k.start, k.end));
        const blank = lines.slice(k.start + block.length, k.end);
        const h = parseHeading(lines[k.start], k.start, keywords);
        let key: string | number | null;
        switch (by) {
            case 'todo': key = h.todo ? keywords.indexOf(h.todo) : null; break;
            case 'priority': key = h.priority ? h.priority.charCodeAt(0) : null; break;
            case 'date': key = scheduledOrDeadline(block); break;
            case 'numeric': {
                const n = parseFloat(h.title);
                key = isNaN(n) ? null : n;
                break;
            }
            default: key = h.title.toLowerCase();
        }
        return { block, blank, key, i };
    });
    const sorted = blocks.slice().sort((a, b) => {
        if (a.key === null || b.key === null) {
            return a.key === null && b.key === null ? a.i - b.i : a.key === null ? 1 : -1;
        }
        const c = typeof a.key === 'number' ? (a.key as number) - (b.key as number)
            : (a.key as string).localeCompare(b.key as string, undefined, { numeric: true });
        return (descending ? -c : c) || a.i - b.i;
    });
    // Blank lines stay in their places between the entries, not with them.
    const out: string[] = [];
    sorted.forEach((s, i) => {
        out.push(...s.block);
        out.push(...blocks[i].blank);
    });
    return { start: kids[0].start, end: kids[kids.length - 1].end, lines: out };
}

// -- Lists -------------------------------------------------------------------

const ITEM_RE = /^(\s*)([-+]|\d+[.)])\s+(\[[ xX-]\]\s+)?(.*)$/;

export function isListItem(line: string): boolean {
    return ITEM_RE.test(line) && !/^\*/.test(line);
}

// The list a line is in: the run of items at the cursor's item's indent, each
// with the lines under it.
export function listAt(lines: string[], line: number): { indent: number, items: { start: number, end: number }[] } | undefined {
    let i = line;
    while (i >= 0 && !isListItem(lines[i])) {
        if (lines[i].trim() === '' || isHeadingLine(lines[i])) {
            return undefined;
        }
        i--;
    }
    if (i < 0) {
        return undefined;
    }
    const indent = ITEM_RE.exec(lines[i])[1].length;
    const indentOf = (l: string) => l.length - l.replace(/^\s+/, '').length;
    const belongs = (l: string) => l.trim() !== '' && (indentOf(l) > indent || (isListItem(l) && indentOf(l) === indent));
    let start = i;
    while (start > 0 && belongs(lines[start - 1]) && !isHeadingLine(lines[start - 1])) {
        start--;
    }
    while (!(isListItem(lines[start]) && indentOf(lines[start]) === indent)) {
        start++;
    }
    let end = i + 1;
    while (end < lines.length && belongs(lines[end]) && !isHeadingLine(lines[end])) {
        end++;
    }
    const items: { start: number, end: number }[] = [];
    for (let k = start; k < end; k++) {
        if (isListItem(lines[k]) && indentOf(lines[k]) === indent) {
            if (items.length) {
                items[items.length - 1].end = k;
            }
            items.push({ start: k, end });
        }
    }
    return { indent, items };
}

export type ListSort = 'alpha' | 'numeric' | 'checked';

// Sort the items of a list, carrying the lines under each with it. A numbered
// list is numbered again from where it started.
export function sortList(lines: string[], line: number, by: ListSort, descending: boolean):
        { start: number, end: number, lines: string[] } | undefined {
    const list = listAt(lines, line);
    if (!list || list.items.length < 2) {
        return undefined;
    }
    const items = list.items.map((it, i) => {
        const m = ITEM_RE.exec(lines[it.start]);
        const text = m[4];
        let key: string | number | null = text.toLowerCase();
        if (by === 'numeric') {
            const n = parseFloat(text);
            key = isNaN(n) ? null : n;
        } else if (by === 'checked') {
            key = m[3] ? (/\[[xX]\]/.test(m[3]) ? 1 : 0) : null;
        }
        return { body: lines.slice(it.start, it.end), key, i };
    });
    const sorted = items.slice().sort((a, b) => {
        if (a.key === null || b.key === null) {
            return a.key === null && b.key === null ? a.i - b.i : a.key === null ? 1 : -1;
        }
        const c = typeof a.key === 'number' ? (a.key as number) - (b.key as number)
            : (a.key as string).localeCompare(b.key as string, undefined, { numeric: true });
        return (descending ? -c : c) || a.i - b.i;
    });
    const firstNum = /^\s*(\d+)([.)])/.exec(lines[list.items[0].start]);
    const out: string[] = [];
    sorted.forEach((s, n) => {
        const body = s.body.slice();
        if (firstNum) {
            body[0] = body[0].replace(/^(\s*)\d+([.)])/, `$1${parseInt(firstNum[1], 10) + n}$2`);
        }
        out.push(...body);
    });
    return { start: list.items[0].start, end: list.items[list.items.length - 1].end, lines: out };
}

// -- Properties --------------------------------------------------------------

// The value of a property in a heading's drawer, or undefined.
export function getProperty(lines: string[], heading: number, name: string): string | undefined {
    const end = subtreeEnd(lines, heading);
    let inDrawer = false;
    for (let i = heading + 1; i < end && !isHeadingLine(lines[i]); i++) {
        if (/^\s*:PROPERTIES:\s*$/i.test(lines[i])) {
            inDrawer = true;
        } else if (/^\s*:END:\s*$/i.test(lines[i])) {
            if (inDrawer) {
                return undefined;
            }
        } else if (inDrawer) {
            const m = /^\s*:([\w-]+):\s*(.*?)\s*$/.exec(lines[i]);
            if (m && m[1].toUpperCase() === name.toUpperCase()) {
                return m[2];
            }
        } else if (!/^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[i])) {
            return undefined;
        }
    }
    return undefined;
}

// Set a property on a heading: in its drawer, which is made (under any
// SCHEDULED/DEADLINE line, as org has it) when there is none. Answers the
// lines from the heading to the drawer's end, rewritten.
export function setProperty(lines: string[], heading: number, name: string, value: string):
        { start: number, end: number, lines: string[] } {
    const indent = ' '.repeat(headingLevel(lines[heading]) + 1);
    let i = heading + 1;
    while (i < lines.length && /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[i])) {
        i++;
    }
    const entry = (ind: string) => `${ind}:${name}: ${value}`;
    if (i < lines.length && /^\s*:PROPERTIES:\s*$/i.test(lines[i])) {
        const drawerIndent = /^\s*/.exec(lines[i])[0];
        let j = i + 1;
        while (j < lines.length && !/^\s*:END:\s*$/i.test(lines[j]) && !isHeadingLine(lines[j])) {
            const m = /^(\s*):([\w-]+):/.exec(lines[j]);
            if (m && m[2].toUpperCase() === name.toUpperCase()) {
                // The name stays as the file spells it.
                const out = lines.slice(heading, j + 1);
                out[out.length - 1] = `${m[1]}:${m[2]}: ${value}`;
                return { start: heading, end: j + 1, lines: out };
            }
            j++;
        }
        const out = lines.slice(heading, j);
        out.push(entry(drawerIndent));
        return { start: heading, end: j, lines: out };
    }
    const out = lines.slice(heading, i);
    out.push(indent + ':PROPERTIES:', entry(indent), indent + ':END:');
    return { start: heading, end: i, lines: out };
}

// A heading by its outline path - its title and the titles above it - as the
// orgs server names headings in file+olp targets. -1 when there is none.
export function findOlp(lines: string[], olp: string[], keywords: string[] = COMMON_KEYWORDS): number {
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const want = olp.map(norm);
    const stack: { level: number, title: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (!isHeadingLine(lines[i])) {
            continue;
        }
        const h = parseHeading(lines[i], i, keywords);
        while (stack.length && stack[stack.length - 1].level >= h.level) {
            stack.pop();
        }
        stack.push({ level: h.level, title: norm(h.title) });
        if (stack.length === want.length && stack.every((s, k) => s.title === want[k])) {
            return i;
        }
    }
    return -1;
}

// -- TODO keywords -------------------------------------------------------------

// The keywords a file's own #+TODO: lines (and their SEQ_/TYP_ forms) set:
// words before the bar are not done, words after it are. Without a bar, the
// last word is the done one, as org has it.
export function fileKeywords(lines: string[]): { todo: string[], done: string[] } | undefined {
    const todo: string[] = [];
    const done: string[] = [];
    let any = false;
    for (const l of lines.slice(0, 400)) {
        const m = /^#\+(?:TODO|SEQ_TODO|TYP_TODO):\s*(.*)$/i.exec(l);
        if (!m) {
            continue;
        }
        any = true;
        const words = m[1].split(/\s+/).filter(w => w).map(w => w.replace(/\(.*\)$/, ''));
        const bar = words.indexOf('|');
        if (bar >= 0) {
            todo.push(...words.slice(0, bar));
            done.push(...words.slice(bar + 1));
        } else if (words.length) {
            todo.push(...words.slice(0, -1));
            done.push(words[words.length - 1]);
        }
    }
    return any ? { todo, done } : undefined;
}

// A heading line with its keyword moved one along the cycle - none, then each
// TODO word, then each DONE word, then none again - or back one.
export function cycleKeyword(line: string, keywords: string[], dir: 1 | -1): string {
    const m = /^(\*+\s+)(\S+)?(\s*)(.*)$/.exec(line);
    if (!m) {
        return line;
    }
    const cycle = [''].concat(keywords.filter(k => k));
    const current = m[2] && keywords.indexOf(m[2]) >= 0 ? m[2] : '';
    const rest = current ? m[4] : ((m[2] || '') + m[3] + m[4]);
    const next = cycle[(cycle.indexOf(current) + dir + cycle.length) % cycle.length];
    return m[1] + (next ? next + (rest ? ' ' : '') : '') + rest;
}

// -- Statistics cookies --------------------------------------------------------

const COOKIE_RE = /\[(\d*)\/(\d*)\]|\[(\d*)%\]/g;

// Every heading's [n/m] and [n%] worked out again, as org does: from the
// keywords of the headings directly under it, or - with none of those - from
// the checkboxes in its own entry. Answers the lines, changed where a cookie
// was wrong (or empty, as [/] is when first typed).
export function updateCookies(lines: string[], todo: string[], done: string[]): string[] {
    const out = lines.slice();
    const keywords = todo.concat(done);
    for (let i = 0; i < lines.length; i++) {
        if (!isHeadingLine(lines[i]) || lines[i].search(COOKIE_RE) < 0) {
            continue;
        }
        let total = 0;
        let finished = 0;
        const kids = children(lines, i);
        for (const k of kids) {
            const kw = parseHeading(lines[k.start], k.start, keywords).todo;
            if (kw) {
                total++;
                if (done.indexOf(kw) >= 0) {
                    finished++;
                }
            }
        }
        if (total === 0) {
            const bodyEnd = kids.length ? kids[0].start : subtreeEnd(lines, i);
            for (let j = i + 1; j < bodyEnd; j++) {
                const m = /^\s*(?:[-+*]|\d+[.)])\s+\[([ xX-])\]/.exec(lines[j]);
                if (m) {
                    total++;
                    if (m[1] !== ' ' && m[1] !== '-') {
                        finished++;
                    }
                }
            }
        }
        if (total === 0) {
            continue;
        }
        out[i] = lines[i].replace(COOKIE_RE, (_m, a, b, p) =>
            p !== undefined ? `[${Math.round(finished * 100 / total)}%]` : `[${finished}/${total}]`);
    }
    return out;
}

// -- Heading parts -------------------------------------------------------------

// A heading line with some of its parts replaced: keyword, priority, title or
// tags. Tags keep to the column they were right-aligned to, when they had one.
export function setHeadingParts(line: string, parts: { todo?: string, priority?: string, title?: string, tags?: string[] },
                                keywords: string[]): string {
    const h = parseHeading(line, 0, keywords);
    if (!h) {
        return line;
    }
    const todo = parts.todo !== undefined ? parts.todo : h.todo;
    const priority = parts.priority !== undefined ? parts.priority : h.priority;
    const title = parts.title !== undefined ? parts.title.trim() : h.title;
    const tags = parts.tags !== undefined ? parts.tags.filter(t => t) : h.tags;
    let out = '*'.repeat(h.level) + ' ' + [todo, priority ? `[#${priority}]` : '', title].filter(x => x).join(' ');
    if (tags.length) {
        const tagText = ':' + tags.join(':') + ':';
        const was = / (:(?:[^\s:]+:)+)\s*$/.exec(line);
        const endCol = was ? line.replace(/\s+$/, '').length : 0;
        const pad = endCol ? Math.max(1, endCol - out.length - tagText.length) : 1;
        out += ' '.repeat(pad) + tagText;
    }
    return out;
}

// The lines from a heading to the end of its drawer, with one property taken
// out (and the drawer, if that leaves it empty). Undefined if it is not there.
export function removeProperty(lines: string[], heading: number, name: string): { start: number, end: number, lines: string[] } | undefined {
    let open = -1;
    for (let i = heading + 1; i < lines.length && !isHeadingLine(lines[i]); i++) {
        if (/^\s*:PROPERTIES:\s*$/i.test(lines[i])) {
            open = i;
        } else if (open >= 0 && /^\s*:END:\s*$/i.test(lines[i])) {
            const inner = lines.slice(open + 1, i);
            const keep = inner.filter(l => { const m = /^\s*:([\w-]+):/.exec(l); return !(m && m[1].toUpperCase() === name.toUpperCase()); });
            if (keep.length === inner.length) {
                return undefined;
            }
            const out = lines.slice(heading, open);
            if (keep.length) {
                out.push(lines[open], ...keep, lines[i]);
            }
            return { start: heading, end: i + 1, lines: out };
        } else if (open < 0 && !/^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[i])) {
            return undefined;
        }
    }
    return undefined;
}

// The titles from the top of the outline down to a heading: its outline path,
// as the orgs server names headings in file+olp targets.
export function olpOf(lines: string[], heading: number, keywords: string[] = COMMON_KEYWORDS): string[] {
    const out: string[] = [];
    let level = headingLevel(lines[heading]) + 1;
    for (let i = heading; i >= 0 && level > 1; i--) {
        const l = headingLevel(lines[i]);
        if (l > 0 && l < level) {
            out.unshift(parseHeading(lines[i], i, keywords).title);
            level = l;
        }
    }
    return out;
}
