/* SDOC: Developers
* The table model
  =OrgTable= is a table as rows of cells (a rule is a row with no cells),
  parsed from lines with =OrgTable.parse= and written back aligned with
  =format(measure)=. Every table command is: find the table
  (=tables/editor.ts= =tableAt=), change the model, =write= it back - which
  goes through =diffLines=, so only what changed is touched and it is one
  undo.

  - Alignment follows org: a column that is more than half numbers
    (=isNumber=, org's number pattern plus currency and thousands
    separators) is right-aligned; a cookie row (=<l>=, =<r>=, =<c>=,
    =<N>=) overrides that, and =<N>= is shown N wide by =tables/view.ts=.
  - =measure= is how wide a cell looks: =measureWith(prettyLinks)= counts a
    link as its description, and wide east asian characters as two.
  - The cursor is placed by =cellTextStart= and found by =cellIndexAt=,
    which read the line as it is - so a table typed by hand, not yet
    aligned, works.
EDOC */

// An org table as plain data: parsed from lines, edited, and written back
// aligned the way org aligns it. Nothing here knows about vscode, so it can be
// tested on its own and used anywhere a table has to be worked on.

// A rule (`|---+---|`) is a row with no cells.
export interface Row { rule: boolean; cells: string[]; }

export type Align = 'l' | 'r' | 'c';

export interface Layout {
    widths: number[];          // display width of each column
    aligns: Align[];           // how each column's cells sit in it
    shrink: (number | null)[]; // a <N> cookie: show the column N wide
}

// How wide a string looks. The plugin hides link markup when links are
// pretty-printed, and org aligns on what is seen, so the caller decides.
export type Measure = (s: string) => number;

// org-table-number-regexp, plus a currency sign and thousands separators, which
// people put in tables far more often than org's hex and base-n numbers.
const NUMBER_RE = /^(?:[<>]?[-+^.0-9]*[0-9][-+^.0-9eEdDx()%:]*|[<>]?[-+]?0[xX][0-9a-fA-F.]+|[<>]?[-+]?[0-9]+#[0-9a-zA-Z.]+|nan|[-+u]?inf|[-+]?[$€£¥][-+]?\d[\d,]*(?:\.\d+)?|[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/;
const COOKIE_RE = /^<([lrc])?(\d*)>$/;
const RULE_RE = /^\s*\|-/;
const LINK_RE = /\[\[([^\]]*)\](?:\[([^\]]*)\])?\]/g;
// Characters in the marker column that say a row is not data: names,
// parameters and recalculation marks. See org's "Advanced features".
const MARKERS = ['!', '^', '_', '$', '/', '#', '*'];

export function isTableLine(line: string): boolean {
    return /^\s*\|/.test(line);
}

export function isRuleLine(line: string): boolean {
    return RULE_RE.test(line);
}

export function isNumber(s: string): boolean {
    return NUMBER_RE.test(s.trim());
}

// Columns a character takes on screen: two for the wide east asian forms and
// most emoji, none for combining marks.
function charWidth(cp: number): number {
    if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x20d0 && cp <= 0x20ff) ||
        (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xfe20 && cp <= 0xfe2f) || cp === 0x200d) {
        return 0;
    }
    if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
        (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
        (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) ||
        (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f64f) ||
        (cp >= 0x1f900 && cp <= 0x1f9ff) || (cp >= 0x20000 && cp <= 0x3fffd)) {
        return 2;
    }
    return 1;
}

export function displayWidth(s: string): number {
    let w = 0;
    for (const ch of s) {
        w += charWidth(ch.codePointAt(0));
    }
    return w;
}

// What a cell shows with link markup hidden: the description, or the target
// when there is none.
export function measureWith(prettyLinks: boolean): Measure {
    if (!prettyLinks) {
        return displayWidth;
    }
    return s => displayWidth(s.indexOf('[[') < 0 ? s : s.replace(LINK_RE, (_m, target, desc) => desc !== undefined ? desc : target));
}

// Split a table line into its cells. A line written as `|a|b` (no closing bar,
// as somebody types it) reads the same as `| a | b |`.
export function splitCells(line: string): string[] {
    let s = line.trim();
    if (s.startsWith('|')) {
        s = s.slice(1);
    }
    if (s.endsWith('|')) {
        s = s.slice(0, -1);
    }
    return s.split('|').map(c => c.trim());
}

// Which cell a character of a table line is in: the number of bars before it,
// less one. Reads the line as it is, so it is right before the table has been
// aligned as well as after.
export function cellIndexAt(line: string, ch: number): number {
    const first = line.indexOf('|');
    if (first < 0 || ch <= first) {
        return 0;
    }
    let bars = 0;
    for (let i = first; i < Math.min(ch, line.length); i++) {
        if (line[i] === '|') {
            bars++;
        }
    }
    const cells = splitCells(line).length;
    return Math.max(0, Math.min(bars - 1, cells - 1));
}

// Where the text of a cell starts on a line, for putting the cursor there: on
// its first character, or just inside the bar when the cell is empty.
export function cellTextStart(line: string, col: number): number {
    let bar = line.indexOf('|');
    if (bar < 0) {
        return 0;
    }
    for (let c = 0; c < col; c++) {
        const next = line.indexOf('|', bar + 1);
        if (next < 0) {
            break;
        }
        bar = next;
    }
    let i = bar + 1;
    while (i < line.length && line[i] === ' ') {
        i++;
    }
    if (i >= line.length || line[i] === '|') {
        return Math.min(bar + 2, line.length);
    }
    return i;
}

// The start and end of a cell on a line, bars excluded.
export function cellSpan(line: string, col: number): { start: number, end: number } | undefined {
    let bar = line.indexOf('|');
    for (let c = 0; c < col && bar >= 0; c++) {
        bar = line.indexOf('|', bar + 1);
    }
    if (bar < 0) {
        return undefined;
    }
    let end = line.indexOf('|', bar + 1);
    if (end < 0) {
        end = line.length;
    }
    return { start: bar + 1, end };
}

export class OrgTable {
    constructor(public rows: Row[], public indent: string = '') {
        this.normalize();
    }

    static parse(lines: string[]): OrgTable {
        const first = lines.find(isTableLine) || '';
        const indent = first.slice(0, first.indexOf('|'));
        const rows: Row[] = lines.filter(isTableLine).map(l =>
            ({ rule: isRuleLine(l), cells: isRuleLine(l) ? [] : splitCells(l) }));
        return new OrgTable(rows, indent);
    }

    // Every data row the same number of cells.
    normalize() {
        const n = this.width;
        for (const r of this.rows) {
            if (!r.rule) {
                while (r.cells.length < n) {
                    r.cells.push('');
                }
            }
        }
    }

    get width(): number {
        let n = 0;
        for (const r of this.rows) {
            if (!r.rule) {
                n = Math.max(n, r.cells.length);
            }
        }
        return Math.max(n, 1);
    }

    get(row: number, col: number): string {
        const r = this.rows[row];
        return r && !r.rule ? (r.cells[col] || '') : '';
    }

    set(row: number, col: number, value: string) {
        const r = this.rows[row];
        if (r && !r.rule) {
            while (r.cells.length <= col) {
                r.cells.push('');
            }
            r.cells[col] = value.trim();
        }
        this.normalize();
    }

    // A row of nothing but alignment and width cookies, `| <r> | <10> |`.
    isCookieRow(row: number): boolean {
        const r = this.rows[row];
        if (!r || r.rule) {
            return false;
        }
        const filled = r.cells.filter(c => c !== '');
        return filled.length > 0 && filled.every(c => COOKIE_RE.test(c));
    }

    // A row whose first cell is one of org's markers: `!` names columns, `#`
    // asks for recalculation, and so on. Not data.
    isMarkedRow(row: number): boolean {
        const r = this.rows[row];
        return !!r && !r.rule && this.hasMarkerColumn() && MARKERS.indexOf(r.cells[0]) >= 0;
    }

    // Org reads the first column as markers only when every cell in it is a
    // marker or empty.
    hasMarkerColumn(): boolean {
        const firsts = this.rows.filter(r => !r.rule).map(r => r.cells[0]);
        return firsts.some(c => c !== '') && firsts.every(c => c === '' || MARKERS.indexOf(c) >= 0);
    }

    // The rows above the first rule, when there is a rule with rows under it.
    headerRows(): number {
        const rule = this.rows.findIndex(r => r.rule);
        if (rule <= 0) {
            return 0;
        }
        return this.rows.slice(rule + 1).some(r => !r.rule) ? rule : 0;
    }

    // Rows that hold values: not a rule, not the header, not cookies.
    isBodyRow(row: number): boolean {
        return !this.rows[row].rule && row >= this.headerRows() && !this.isCookieRow(row);
    }

    layout(measure: Measure = displayWidth): Layout {
        const n = this.width;
        const widths = new Array(n).fill(1);
        const aligns: Align[] = new Array(n).fill('l');
        const shrink: (number | null)[] = new Array(n).fill(null);
        const numbers = new Array(n).fill(0);
        const filled = new Array(n).fill(0);
        const cookies: (Align | undefined)[] = new Array(n).fill(undefined);
        const header = this.headerRows();
        const markers = this.hasMarkerColumn();
        this.rows.forEach((r, i) => {
            if (r.rule) {
                return;
            }
            const cookieRow = this.isCookieRow(i);
            r.cells.forEach((c, col) => {
                widths[col] = Math.max(widths[col], measure(c));
                if (cookieRow) {
                    const m = COOKIE_RE.exec(c);
                    if (m) {
                        if (m[1]) {
                            cookies[col] = m[1] as Align;
                        }
                        if (m[2]) {
                            shrink[col] = Math.max(1, parseInt(m[2], 10));
                        }
                    }
                } else if (c !== '' && i >= header && !(col === 0 && markers)) {
                    filled[col]++;
                    if (isNumber(c)) {
                        numbers[col]++;
                    }
                }
            });
        });
        for (let col = 0; col < n; col++) {
            // org-table-number-fraction: mostly numbers reads as a number column.
            aligns[col] = cookies[col] || (filled[col] > 0 && numbers[col] / filled[col] > 0.5 ? 'r' : 'l');
        }
        return { widths, aligns, shrink };
    }

    format(measure: Measure = displayWidth): string[] {
        const { widths, aligns } = this.layout(measure);
        return this.rows.map(r => {
            if (r.rule) {
                return this.indent + '|' + widths.map(w => '-'.repeat(w + 2)).join('+') + '|';
            }
            const cells = r.cells.map((c, col) => {
                const pad = widths[col] - measure(c);
                if (aligns[col] === 'r') {
                    return ' '.repeat(pad) + c;
                }
                if (aligns[col] === 'c') {
                    const left = Math.floor(pad / 2);
                    return ' '.repeat(left) + c + ' '.repeat(pad - left);
                }
                return c + ' '.repeat(pad);
            });
            return this.indent + '| ' + cells.join(' | ') + ' |';
        });
    }

    // -- Structure ---------------------------------------------------------

    insertRow(at: number, rule: boolean = false) {
        this.rows.splice(at, 0, { rule, cells: rule ? [] : new Array(this.width).fill('') });
    }

    deleteRow(row: number) {
        this.rows.splice(row, 1);
        if (this.rows.length === 0) {
            this.insertRow(0);
        }
    }

    moveRow(row: number, delta: number): boolean {
        const to = row + delta;
        if (to < 0 || to >= this.rows.length) {
            return false;
        }
        [this.rows[row], this.rows[to]] = [this.rows[to], this.rows[row]];
        return true;
    }

    insertCol(at: number) {
        for (const r of this.rows) {
            if (!r.rule) {
                r.cells.splice(at, 0, '');
            }
        }
    }

    deleteCol(col: number) {
        if (this.width <= 1) {
            this.rows.forEach((_r, i) => this.set(i, 0, ''));
            return;
        }
        for (const r of this.rows) {
            if (!r.rule) {
                r.cells.splice(col, 1);
            }
        }
    }

    moveCol(col: number, delta: number): boolean {
        const to = col + delta;
        if (to < 0 || to >= this.width) {
            return false;
        }
        for (const r of this.rows) {
            if (!r.rule) {
                [r.cells[col], r.cells[to]] = [r.cells[to], r.cells[col]];
            }
        }
        return true;
    }

    // The data rows around `row` with no rule between them: what sorting and
    // summing work on, as in org. From the header the body below is meant.
    region(row: number): { from: number, to: number } {
        const header = this.headerRows();
        if (row < header) {
            row = header + 1;
        }
        let from = row;
        let to = row;
        while (from > 0 && !this.rows[from - 1].rule && from - 1 >= header) {
            from--;
        }
        while (to < this.rows.length - 1 && !this.rows[to + 1].rule) {
            to++;
        }
        while (from <= to && (this.rows[from].rule || this.isCookieRow(from))) {
            from++;
        }
        return { from, to };
    }

    sort(row: number, col: number, kind: SortKind, descending: boolean) {
        const { from, to } = this.region(row);
        if (to <= from) {
            return;
        }
        const key = sortKey(kind);
        const rows = this.rows.slice(from, to + 1).map((r, i) => ({ r, i, k: key(this.get(from + i, col)) }));
        rows.sort((a, b) => {
            // Empty cells go last whichever way the sort runs, as org has it.
            if (a.k === null || b.k === null) {
                return a.k === null && b.k === null ? a.i - b.i : a.k === null ? 1 : -1;
            }
            const c = typeof a.k === 'number'
                ? (a.k as number) - (b.k as number)
                : (a.k as string).localeCompare(b.k as string, undefined, { numeric: true, sensitivity: 'base' });
            return (descending ? -c : c) || a.i - b.i;
        });
        this.rows.splice(from, rows.length, ...rows.map(x => x.r));
    }

    // Rows become columns. Rules have no place in the result and go, as in org.
    transpose() {
        const data = this.rows.filter(r => !r.rule);
        const n = this.width;
        const rows: Row[] = [];
        for (let c = 0; c < n; c++) {
            rows.push({ rule: false, cells: data.map(r => r.cells[c] || '') });
        }
        this.rows = rows.length ? rows : [{ rule: false, cells: [''] }];
        this.normalize();
    }

    // The values of a column over the region a row is in, for summing.
    columnValues(row: number, col: number): string[] {
        const { from, to } = this.region(row);
        const out: string[] = [];
        const markers = this.hasMarkerColumn();
        for (let i = from; i <= to; i++) {
            if (!this.rows[i].rule && !(markers && col === 0)) {
                out.push(this.get(i, col));
            }
        }
        return out;
    }
}

export type SortKind = 'alpha' | 'numeric' | 'time';

function sortKey(kind: SortKind): (s: string) => string | number | null {
    return (s: string) => {
        const t = s.trim();
        if (t === '') {
            return null;
        }
        if (kind === 'alpha') {
            return t;
        }
        if (kind === 'numeric') {
            const v = parseNumber(t);
            return isNaN(v) ? Number.NEGATIVE_INFINITY : v;
        }
        const v = parseTime(t);
        return isNaN(v) ? Number.NEGATIVE_INFINITY : v;
    };
}

export function parseNumber(s: string): number {
    return parseFloat(s.replace(/[$€£¥,\s]/g, ''));
}

// An org timestamp, an iso date, or a duration like 1:30 - whichever it is, as
// a number that sorts the right way.
export function parseTime(s: string): number {
    const ts = /[<\[]?(\d{4})-(\d{2})-(\d{2})(?:\s+\w+)?(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
    if (ts) {
        return new Date(+ts[1], +ts[2] - 1, +ts[3], ts[4] ? +ts[4] : 0, ts[5] ? +ts[5] : 0).getTime();
    }
    const d = parseDuration(s);
    return d === null ? NaN : d;
}

// h:mm or h:mm:ss as seconds.
export function parseDuration(s: string): number | null {
    const m = /^(-)?(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(s.trim());
    if (!m) {
        return null;
    }
    const v = +m[2] * 3600 + +m[3] * 60 + (m[4] ? +m[4] : 0);
    return m[1] ? -v : v;
}

export function formatDuration(seconds: number): string {
    const neg = seconds < 0;
    let s = Math.abs(Math.round(seconds));
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    s -= m * 60;
    return (neg ? '-' : '') + h + ':' + String(m).padStart(2, '0') + (s ? ':' + String(s).padStart(2, '0') : '');
}

// The total of a column, as org's C-c + has it: times add up as times when
// every value is one, numbers otherwise. Null when there is nothing to add.
export function sumValues(values: string[]): { text: string, count: number } | null {
    const filled = values.map(v => v.trim()).filter(v => v !== '');
    if (filled.length === 0) {
        return null;
    }
    const durations = filled.map(parseDuration);
    if (durations.every(d => d !== null)) {
        return { text: formatDuration(durations.reduce((a, b) => a + b, 0)), count: filled.length };
    }
    const nums = filled.map(parseNumber).filter(v => !isNaN(v));
    if (nums.length === 0) {
        return null;
    }
    const total = nums.reduce((a, b) => a + b, 0);
    // Floating point leaves 0.1+0.2 as 0.30000000000000004; nobody wants that.
    return { text: String(parseFloat(total.toPrecision(12))), count: nums.length };
}

// -- Delimited text --------------------------------------------------------

// Guess the separator from the text itself: tabs, then commas or semicolons
// outside quotes, then runs of spaces (text copied out of a terminal).
export function guessSeparator(text: string): string {
    const first = text.split(/\r?\n/).find(l => l.trim() !== '') || '';
    if (first.indexOf('\t') >= 0) {
        return '\t';
    }
    const outside = first.replace(/"[^"]*"/g, '');
    const commas = (outside.match(/,/g) || []).length;
    const semis = (outside.match(/;/g) || []).length;
    if (commas || semis) {
        return semis > commas ? ';' : ',';
    }
    return /\S {2,}\S/.test(first) ? '  ' : ' ';
}

// csv as rfc 4180 reads it - quoted fields, doubled quotes, newlines inside
// quotes - or text split on whitespace.
export function parseDelimited(text: string, sep: string = guessSeparator(text)): string[][] {
    text = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (sep === ' ' || sep === '  ') {
        const re = sep === ' ' ? /\s+/ : /\s{2,}|\t/;
        return text.split('\n').filter(l => l.trim() !== '').map(l => l.trim().split(re));
    }
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (ch === '"') {
                quoted = false;
            } else {
                cell += ch === '\n' ? ' ' : ch;
            }
        } else if (ch === '"' && cell.trim() === '') {
            quoted = true;
            cell = '';
        } else if (ch === sep) {
            row.push(cell);
            cell = '';
        } else if (ch === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += ch;
        }
    }
    row.push(cell);
    rows.push(row);
    return rows.filter(r => r.some(c => c.trim() !== ''));
}

// A table from rows of text. A first row of words over rows with numbers in
// them reads as a header and gets a rule under it. A bar in a cell would split
// it, so it is written the way org writes one, \vert.
export function tableFromRows(rows: string[][], indent: string = ''): OrgTable {
    const clean = rows.map(r => r.map(c => c.trim().replace(/\|/g, '\\vert{}')));
    const table = new OrgTable(clean.map(cells => ({ rule: false, cells })), indent);
    if (clean.length > 1) {
        const head = clean[0];
        const rest = clean.slice(1);
        const headWords = head.every(c => c === '' || !isNumber(c));
        const restNumbers = rest.some(r => r.some(c => isNumber(c)));
        if (headWords && restNumbers) {
            table.insertRow(1, true);
        }
    }
    return table;
}

export { LineEdit, diffLines } from '../lines';
