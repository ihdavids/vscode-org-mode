// The #+TBLFM: line of a table, read well enough to say which cells each
// formula writes and to change one formula without touching the others. The
// evaluating is the orgs server's; this only needs the left hand sides.

import { OrgTable } from './model';

export interface Formula {
    lhs: string;    // what it writes: $3, @2$4, @>$1, @2$1..@4$3
    rhs: string;    // the expression, with any ;format on the end
    line: number;   // which TBLFM line, counted from the first
    start: number;  // where it sits on that line
    end: number;
}

const TBLFM_RE = /^(\s*#\+TBLFM:\s*)(.*)$/i;

export function isTblfmLine(line: string): boolean {
    return TBLFM_RE.test(line);
}

export function parseTblfm(lines: string[]): Formula[] {
    const out: Formula[] = [];
    lines.forEach((text, line) => {
        const m = TBLFM_RE.exec(text);
        if (!m) {
            return;
        }
        let at = m[1].length;
        for (const part of m[2].split('::')) {
            const eq = part.indexOf('=');
            const lead = part.length - part.replace(/^\s+/, '').length;
            if (eq > 0 && part.trim() !== '') {
                out.push({
                    lhs: part.slice(0, eq).trim(),
                    rhs: part.slice(eq + 1).trim(),
                    line,
                    start: at + lead,
                    end: at + part.replace(/\s+$/, '').length,
                });
            }
            at += part.length + 2;
        }
    });
    return out;
}

// A column formula writes a whole column: just $N, $< or $>.
export function isColumnFormula(f: Formula): boolean {
    return /^\$(\d+|<|>)$/.test(f.lhs);
}

// The rows org numbers: everything that is not a rule, from 1.
function dataRows(t: OrgTable): number[] {
    const out: number[] = [];
    t.rows.forEach((r, i) => {
        if (!r.rule) {
            out.push(i);
        }
    });
    return out;
}

function ruleRows(t: OrgTable): number[] {
    const out: number[] = [];
    t.rows.forEach((r, i) => {
        if (r.rule) {
            out.push(i);
        }
    });
    return out;
}

// @3, @<, @>, @I, @II+1, @>-1: a table row index, or undefined if the table has
// no such row. An hline reference with no offset stands for the hline itself;
// it is resolved to the row after it for a start, before it for an end.
function resolveRow(ref: string, t: OrgTable, isEnd: boolean): number | undefined {
    const m = /^(\d+|<+|>+|I+)([-+]\d+)?$/.exec(ref);
    if (!m) {
        return undefined;
    }
    const data = dataRows(t);
    const off = m[2] ? parseInt(m[2], 10) : 0;
    let idx: number; // into data
    if (/^\d+$/.test(m[1])) {
        idx = parseInt(m[1], 10) - 1;
    } else if (m[1][0] === '<') {
        idx = m[1].length - 1;
    } else if (m[1][0] === '>') {
        idx = data.length - m[1].length;
    } else {
        const rule = ruleRows(t)[m[1].length - 1];
        if (rule === undefined) {
            return undefined;
        }
        // @I+n is the nth row after the rule, @I-n the nth before it.
        let after = data.findIndex(r => r > rule);
        if (after < 0) {
            after = data.length;
        }
        idx = off > 0 ? after + off - 1 : off < 0 ? after + off : isEnd ? after - 1 : after;
        return data[idx];
    }
    return data[idx + off];
}

function resolveCol(ref: string, t: OrgTable): number | undefined {
    const m = /^(\d+|<|>)([-+]\d+)?$/.exec(ref);
    if (!m) {
        return undefined;
    }
    const base = m[1] === '<' ? 0 : m[1] === '>' ? t.width - 1 : parseInt(m[1], 10) - 1;
    const col = base + (m[2] ? parseInt(m[2], 10) : 0);
    return col >= 0 && col < t.width ? col : undefined;
}

// @R$C as a table row and column. Either half may be missing in a range end.
function resolveField(ref: string, t: OrgTable, isEnd: boolean): { row?: number, col?: number } | undefined {
    const m = /^(?:@([^$]+))?(?:\$(.+))?$/.exec(ref);
    if (!m || (!m[1] && !m[2])) {
        return undefined;
    }
    const out: { row?: number, col?: number } = {};
    if (m[1]) {
        out.row = resolveRow(m[1], t, isEnd);
        if (out.row === undefined) {
            return undefined;
        }
    }
    if (m[2]) {
        out.col = resolveCol(m[2], t);
        if (out.col === undefined) {
            return undefined;
        }
    }
    return out;
}

// Every cell a formula writes, as "row,col" in table rows. A column formula
// skips the header, cookie rows and org's marked rows, as org does.
export function targets(f: Formula, t: OrgTable): Set<string> {
    const out = new Set<string>();
    if (isColumnFormula(f)) {
        const col = resolveCol(f.lhs.slice(1), t);
        if (col !== undefined) {
            t.rows.forEach((_r, i) => {
                if (t.isBodyRow(i) && !t.isMarkedRow(i)) {
                    out.add(i + ',' + col);
                }
            });
        }
        return out;
    }
    const [a, b] = f.lhs.split('..');
    const from = resolveField(a, t, false);
    const to = b !== undefined ? resolveField(b, t, true) : from;
    if (!from || !to) {
        return out;
    }
    const r0 = from.row !== undefined ? from.row : 0;
    const r1 = to.row !== undefined ? to.row : t.rows.length - 1;
    const c0 = from.col !== undefined ? from.col : 0;
    const c1 = to.col !== undefined ? to.col : t.width - 1;
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
        if (t.rows[r] && !t.rows[r].rule) {
            for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
                out.add(r + ',' + c);
            }
        }
    }
    return out;
}

// The formula that decides a cell's value: a field or range formula over a
// column formula, as in org, where the more particular one wins.
export function formulaFor(formulas: Formula[], t: OrgTable, row: number, col: number): Formula | undefined {
    const key = row + ',' + col;
    const hits = formulas.filter(f => targets(f, t).has(key));
    return hits.find(f => !isColumnFormula(f)) || hits[0];
}

// How org refers to a cell: @2$3, rows counted without rules.
export function fieldRef(t: OrgTable, row: number, col: number): string {
    return '@' + (dataRows(t).indexOf(row) + 1) + '$' + (col + 1);
}

// The TBLFM lines with one formula put in, replaced, or (an empty right hand
// side) taken out. Only the first #+TBLFM: line is evaluated, so that is the
// one edited; a table with none gets one, indented like the table.
export function setFormula(tblfm: string[], indent: string, lhs: string, rhs: string): string[] {
    const lines = tblfm.slice();
    const first = lines.findIndex(isTblfmLine);
    const norm = (s: string) => s.replace(/\s+/g, '');
    const parts = first < 0 ? [] : parseTblfm([lines[first]]).map(f => f.lhs + '=' + f.rhs);
    const i = parts.findIndex(p => norm(p.slice(0, p.indexOf('='))) === norm(lhs));
    const entry = lhs.trim() + '=' + rhs.trim();
    if (rhs.trim() === '') {
        if (i >= 0) {
            parts.splice(i, 1);
        }
    } else if (i >= 0) {
        parts[i] = entry;
    } else {
        parts.push(entry);
    }
    const head = first < 0 ? indent + '#+TBLFM: ' : TBLFM_RE.exec(lines[first])[1];
    if (parts.length === 0) {
        if (first >= 0) {
            lines.splice(first, 1);
        }
        return lines;
    }
    const text = head + parts.join('::');
    if (first < 0) {
        lines.push(text);
    } else {
        lines[first] = text;
    }
    return lines;
}
