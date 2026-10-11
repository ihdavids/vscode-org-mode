// The column view as data: which columns a file asks for, and its headings as
// rows with each parent's totals. No vscode here; src/columns.ts shows it.

import { isHeadingLine, parseHeading, getProperty, subtreeEnd } from './outline/model';
import { parseDuration, formatDuration } from './tables/model';

export interface Column { key: string; label: string; sum?: ':' | '+'; }

export const BUILT_IN = ['ITEM', 'TODO', 'PRIORITY', 'TAGS'];

// %25ITEM %TODO %3PRIORITY %TAGS %Effort(Estimate){:}
export function parseColumns(spec: string): Column[] {
    const out: Column[] = [];
    const re = /%(\d+)?([\w-]+)(?:\(([^)]*)\))?(?:\{([^}]*)\})?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(spec)) !== null) {
        const key = m[2].toUpperCase();
        const sum = m[4] === ':' || m[4] === '+' ? m[4] as ':' | '+' : undefined;
        out.push({ key, label: m[3] || (key === 'ITEM' ? 'Heading' : key.charAt(0) + key.slice(1).toLowerCase()), sum });
    }
    return out;
}

export function columnsFor(lines: string[]): Column[] {
    const spec = lines.slice(0, 400).find(l => /^#\+COLUMNS:/i.test(l));
    if (spec) {
        const cols = parseColumns(spec.replace(/^#\+COLUMNS:/i, ''));
        if (cols.length) {
            return cols;
        }
    }
    // The properties the file uses most, after the built in columns.
    const counts = new Map<string, number>();
    let inDrawer = false;
    for (const l of lines) {
        if (/^\s*:PROPERTIES:\s*$/i.test(l)) {
            inDrawer = true;
        } else if (/^\s*:END:\s*$/i.test(l)) {
            inDrawer = false;
        } else if (inDrawer) {
            const m = /^\s*:([\w-]+):/.exec(l);
            if (m && ['ID', 'CUSTOM_ID', 'CREATED', 'STYLE', 'LAST_REPEAT', 'ARCHIVE_TIME', 'ARCHIVE_FILE', 'ARCHIVE_OLPATH'].indexOf(m[1].toUpperCase()) < 0) {
                counts.set(m[1].toUpperCase(), (counts.get(m[1].toUpperCase()) || 0) + 1);
            }
        }
    }
    const props = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    if (props.indexOf('EFFORT') < 0) {
        props.unshift('EFFORT');
    } else {
        props.splice(props.indexOf('EFFORT'), 1);
        props.unshift('EFFORT');
    }
    return [{ key: 'ITEM', label: 'Heading' }, { key: 'TODO', label: 'State' }, { key: 'PRIORITY', label: 'Pri' }]
        .concat(props.slice(0, 4).map(p => ({ key: p, label: p === 'EFFORT' ? 'Effort' : p.charAt(0) + p.slice(1).toLowerCase(), sum: p === 'EFFORT' ? ':' as const : undefined })))
        .concat([{ key: 'TAGS', label: 'Tags' }]);
}

export interface Row { line: number; level: number; text: string; values: { [key: string]: string }; sums: { [key: string]: string }; }

export function rowsFor(lines: string[], cols: Column[], kw: string[]): Row[] {
    const rows: Row[] = [];
    lines.forEach((text, line) => {
        if (!isHeadingLine(text)) {
            return;
        }
        const h = parseHeading(text, line, kw);
        const values: { [key: string]: string } = {};
        for (const c of cols) {
            values[c.key] = c.key === 'ITEM' ? h.title : c.key === 'TODO' ? h.todo : c.key === 'PRIORITY' ? h.priority
                : c.key === 'TAGS' ? (h.tags.length ? ':' + h.tags.join(':') + ':' : '') : (getProperty(lines, line, c.key) || '');
        }
        rows.push({ line, level: h.level, text, values, sums: {} });
    });
    // Summed columns: each heading shows the total of the headings under it.
    // A value counts once, at the deepest heading that has one, so a parent
    // that wrote its own estimate is not added on top of its children's.
    const ends = rows.map(r => subtreeEnd(lines, r.line));
    const under = (i: number) => rows.map((_r, j) => j).filter(j => j > i && rows[j].line < ends[i]);
    for (const c of cols.filter(c => c.sum)) {
        const num = (v: string): number | null => {
            if (!v) {
                return null;
            }
            const n = c.sum === ':' ? parseDuration(v.trim()) : parseFloat(v);
            return n === null || isNaN(n) ? null : n;
        };
        rows.forEach((r, i) => {
            const counted = under(i).filter(j => num(rows[j].values[c.key]) !== null &&
                !under(j).some(k => num(rows[k].values[c.key]) !== null));
            if (counted.length) {
                const total = counted.reduce((t, j) => t + num(rows[j].values[c.key]), 0);
                r.sums[c.key] = c.sum === ':' ? formatDuration(total) : String(parseFloat(total.toPrecision(12)));
            }
        });
    }
    return rows;
}

