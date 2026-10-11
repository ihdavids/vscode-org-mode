// Footnotes as plain data: [fn:label] references, [fn:label] definitions at
// the start of a line, inline [fn:label:text] and anonymous [fn::text]. No vscode.

export interface FnRef { line: number; start: number; end: number; label: string; inline?: string; }

const REF_RE = /\[fn:([\w-]*)(?::([^\]]*))?\]/g;

// Every footnote mention on a line. One at the start of the line, with text
// after it, is a definition rather than a reference.
export function footnotesOn(line: string, n: number): { refs: FnRef[], def?: FnRef } {
    const refs: FnRef[] = [];
    let def: FnRef | undefined;
    let m: RegExpExecArray | null;
    REF_RE.lastIndex = 0;
    while ((m = REF_RE.exec(line)) !== null) {
        const f: FnRef = { line: n, start: m.index, end: m.index + m[0].length, label: m[1], inline: m[2] };
        if (m.index === 0 && m[2] === undefined && m[1]) {
            def = f;
        } else {
            refs.push(f);
        }
    }
    return { refs, def };
}

export function definitionOf(lines: string[], label: string): number {
    return lines.findIndex(l => l.startsWith(`[fn:${label}]`));
}

export function referencesTo(lines: string[], label: string): FnRef[] {
    const out: FnRef[] = [];
    lines.forEach((l, i) => footnotesOn(l, i).refs.filter(r => r.label === label).forEach(r => out.push(r)));
    return out;
}

// A definition's text: its line and the lines after, up to a blank line, a
// heading or the next definition.
export function definitionText(lines: string[], at: number): string {
    const out = [lines[at].replace(/^\[fn:[\w-]+\]\s*/, '')];
    for (let i = at + 1; i < lines.length && lines[i].trim() !== '' && !/^\*+\s/.test(lines[i]) && !/^\[fn:/.test(lines[i]); i++) {
        out.push(lines[i].trim());
    }
    return out.join(' ');
}

export function labels(lines: string[]): string[] {
    const set = new Set<string>();
    lines.forEach((l, i) => {
        const f = footnotesOn(l, i);
        f.refs.forEach(r => r.label && set.add(r.label));
        if (f.def) {
            set.add(f.def.label);
        }
    });
    return Array.from(set);
}

// The next free numbered label.
export function nextLabel(lines: string[]): string {
    const nums = labels(lines).map(l => parseInt(l, 10)).filter(n => !isNaN(n));
    return String(nums.length ? Math.max(...nums) + 1 : 1);
}

// Where a new definition goes: at the end of the Footnotes section, or, with
// none, in a new one at the end of the file. `line` undefined means append
// `text` to the end of the file.
export function placeDefinition(lines: string[], label: string): { line?: number, text: string } {
    const head = lines.findIndex(l => /^\*+\s+Footnotes\s*$/i.test(l));
    if (head >= 0) {
        let end = head + 1;
        while (end < lines.length && !/^\*+\s/.test(lines[end])) {
            end++;
        }
        while (end > head + 1 && lines[end - 1].trim() === '') {
            end--;
        }
        return { line: end, text: `[fn:${label}] ` };
    }
    const last = lines.length ? lines[lines.length - 1] : '';
    const lead = last.trim() === '' ? (lines.length > 1 && lines[lines.length - 2].trim() !== '' ? '\n' : '') : '\n\n';
    return { text: `${lead}* Footnotes\n[fn:${label}] ` };
}
