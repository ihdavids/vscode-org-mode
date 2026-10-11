// What the pretty-printing needs from a file - headings, their tags, links and
// source blocks - found in one pass over its lines. It replaces a full parse of
// the document on every keystroke. No vscode here.

import { findLinks } from './links/model';

export interface Span { line: number; start: number; end: number; }

export interface Found {
    headings: { line: number, level: number, title: Span, tags?: Span }[];
    links: { hide: Span[], text: Span }[];
    blocks: { start: number, end: number }[];   // source block lines, BEGIN to END inclusive
}

const HEADING_RE = /^(\*+)(\s+)(.*?)(\s+:(?:[^\s:]+:)+)?\s*$/;

export function scanLines(lines: string[]): Found {
    const found: Found = { headings: [], links: [], blocks: [] };
    let blockStart = -1;
    lines.forEach((text, line) => {
        if (blockStart >= 0) {
            if (/^\s*#\+END_SRC/i.test(text)) {
                found.blocks.push({ start: blockStart, end: line });
                blockStart = -1;
            }
            return;
        }
        if (/^\s*#\+BEGIN_SRC\b/i.test(text)) {
            blockStart = line;
            return;
        }
        const h = HEADING_RE.exec(text);
        if (h) {
            const level = h[1].length;
            const titleStart = level + h[2].length;
            const titleEnd = titleStart + h[3].length;
            const heading: Found['headings'][0] = { line, level, title: { line, start: titleStart, end: titleEnd } };
            if (h[4]) {
                const tagStart = titleEnd + h[4].length - h[4].replace(/^\s+/, '').length;
                heading.tags = { line, start: tagStart, end: titleEnd + h[4].length };
            }
            found.headings.push(heading);
        }
        if (text.indexOf('[[') >= 0) {
            for (const l of findLinks(text)) {
                if (!text.startsWith('[[', l.start)) {
                    continue;   // a bare url: nothing to hide
                }
                const open = l.desc !== undefined ? l.start + 2 + l.target.length + 2 : l.start + 2;
                found.links.push({
                    hide: [{ line, start: l.start, end: open }, { line, start: l.end - 2, end: l.end }],
                    text: { line, start: open, end: l.end - 2 },
                });
            }
        }
    });
    // A block left open runs to the end of the file, as org reads it.
    if (blockStart >= 0) {
        found.blocks.push({ start: blockStart, end: lines.length - 1 });
    }
    return found;
}
