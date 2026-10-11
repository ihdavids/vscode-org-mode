// What a table plots as: org-plot's #+PLOT: options read, and the table turned
// into an x axis and series. No vscode here, so it can be tested on its own.

import { OrgTable, isNumber, parseNumber, parseDuration, parseTime } from './model';

export type PlotKind = 'line' | 'bar' | 'scatter';

export interface PlotSpec {
    title?: string;
    ind?: number;      // the x column, from 1
    deps?: number[];   // the y columns, from 1
    kind?: PlotKind;
}

export interface Series { name: string; values: (number | null)[]; }

export interface PlotData {
    title: string;
    kind: PlotKind;
    xType: 'cat' | 'num' | 'time';
    xLabel: string;
    yLabel: string;     // "hours" when the values were times like 1:30
    x: string[];        // as written, for labels and the table view
    xv: (number | null)[];  // as numbers, for a num or time axis
    series: Series[];
    dropped: number;    // series past the eighth, which are not drawn
}

// The most series a chart can tell apart by colour; past this they are listed
// as left out rather than given colours nobody can separate.
export const MAX_SERIES = 8;

// #+PLOT: title:"Sales" ind:1 deps:(2 3) type:2d with:histograms
export function parsePlotLine(line: string): PlotSpec {
    const spec: PlotSpec = {};
    const body = line.replace(/^\s*#\+PLOT:\s*/i, '');
    const re = /(\w+):("[^"]*"|\([^)]*\)|\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        const key = m[1].toLowerCase();
        const val = m[2].replace(/^"|"$/g, '');
        if (key === 'title') {
            spec.title = val;
        } else if (key === 'ind') {
            spec.ind = parseInt(val, 10);
        } else if (key === 'deps') {
            spec.deps = val.replace(/[()]/g, '').split(/[\s,]+/).filter(s => s).map(s => parseInt(s, 10));
        } else if (key === 'with') {
            spec.kind = /hist|box/.test(val) ? 'bar' : val === 'points' ? 'scatter' : 'line';
        } else if (key === 'type' && /^(bar|line|scatter)$/.test(val)) {
            spec.kind = val as PlotKind;
        }
    }
    return spec;
}

const DATE_RE = /\d{4}-\d{2}-\d{2}/;

export function plotData(t: OrgTable, spec: PlotSpec, fallbackTitle: string): PlotData | string {
    // Rows under the last rule of a table that has rules above and below its
    // body are a footer - totals - and would dwarf everything else drawn.
    const rules = t.rows.map((r, i) => r.rule ? i : -1).filter(i => i >= 0);
    const footer = rules.length >= 2 ? rules[rules.length - 1] : t.rows.length;
    const rows: number[] = [];
    t.rows.forEach((r, i) => {
        if (i < footer && t.isBodyRow(i) && !t.isMarkedRow(i)) {
            rows.push(i);
        }
    });
    if (rows.length === 0) {
        return 'The table has no rows to plot.';
    }
    const first = t.hasMarkerColumn() ? 1 : 0;
    const header = t.headerRows() > 0 ? t.headerRows() - 1 : -1;
    const name = (c: number) => (header >= 0 && t.get(header, c)) || '$' + (c + 1);
    const values = (c: number) => rows.map(r => t.get(r, c));
    // Org's number pattern takes 2026-10-01 for a number; here a date is a date.
    const numeric = (c: number) => {
        const v = values(c).filter(s => s !== '');
        return v.length > 0 && v.filter(s => isNumber(s) && !DATE_RE.test(s)).length / v.length > 0.5;
    };

    let ind = spec.ind ? spec.ind - 1 : -1;
    if (!spec.ind) {
        for (let c = first; c < t.width; c++) {
            if (!numeric(c)) {
                ind = c;
                break;
            }
        }
    }
    let deps = spec.deps ? spec.deps.map(d => d - 1) : [];
    if (!spec.deps) {
        for (let c = first; c < t.width; c++) {
            if (c !== ind && numeric(c)) {
                deps.push(c);
            }
        }
    }
    deps = deps.filter(c => c >= 0 && c < t.width);
    if (deps.length === 0) {
        return 'No column of numbers to plot. A #+PLOT: line with deps:(2 3) says which columns to use.';
    }

    let xType: 'cat' | 'num' | 'time' = 'num';
    let x: string[];
    let xv: (number | null)[];
    if (ind >= 0 && ind < t.width) {
        x = values(ind);
        if (x.every(s => s === '' || DATE_RE.test(s))) {
            xType = 'time';
            xv = x.map(s => s === '' ? null : parseTime(s));
        } else if (numeric(ind)) {
            xv = x.map(s => isNumber(s) ? parseNumber(s) : null);
        } else {
            xType = 'cat';
            xv = x.map((_s, i) => i);
        }
    } else {
        x = rows.map((_r, i) => String(i + 1));
        xv = rows.map((_r, i) => i + 1);
    }

    // Times like 1:30 plot as hours, which is what anybody reading them means.
    const durations = deps.every(c => values(c).every(s => s === '' || parseDuration(s) !== null));
    const series: Series[] = deps.map(c => ({
        name: name(c),
        values: values(c).map(s => {
            if (s === '') {
                return null;
            }
            if (durations) {
                return parseDuration(s) / 3600;
            }
            const v = parseNumber(s);
            return isNaN(v) ? null : v;
        }),
    }));

    return {
        title: spec.title || fallbackTitle,
        kind: spec.kind || (xType === 'cat' ? 'bar' : 'line'),
        xType,
        xLabel: ind >= 0 ? name(ind) : 'row',
        yLabel: durations ? 'hours' : (series.length === 1 ? series[0].name : ''),
        x,
        xv,
        series: series.slice(0, MAX_SERIES),
        dropped: Math.max(0, series.length - MAX_SERIES),
    };
}
