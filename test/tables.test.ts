// The table model, formulas and plot data. None of these touch vscode, so they
// also run outside an extension host: mocha --ui tdd out/test/tables.test.js
import * as assert from 'assert';
import { OrgTable, diffLines, measureWith, cellIndexAt, cellTextStart, parseDelimited, tableFromRows, sumValues, guessSeparator } from '../src/tables/model';
import { parseTblfm, targets, formulaFor, fieldRef, setFormula } from '../src/tables/formulas';
import { parsePlotLine, plotData } from '../src/tables/plotdata';

const fmt = (lines: string[]) => OrgTable.parse(lines).format();

suite('Table alignment', () => {
    test('aligns a table typed by hand', () => {
        assert.deepEqual(fmt(['|a|bb', '|-', '|ccc|d|']), [
            '| a   | bb |',
            '|-----+----|',
            '| ccc | d  |',
        ]);
    });
    test('right-aligns a column of numbers, header included', () => {
        assert.deepEqual(fmt(['| Item | Qty |', '|-', '| apple | 3 |', '| pear | 12 |']), [
            '| Item  | Qty |',
            '|-------+-----|',
            '| apple |   3 |',
            '| pear  |  12 |',
        ]);
    });
    test('a column only half numbers stays left', () => {
        assert.deepEqual(fmt(['| 1 |', '| x |']), ['| 1 |', '| x |']);
    });
    test('cookies set alignment', () => {
        assert.deepEqual(fmt(['| <c>  | <l> |', '| a | 10 |', '| bbbbbb | 2 |']), [
            '|  <c>   | <l> |',
            '|   a    | 10  |',
            '| bbbbbb | 2   |',
        ]);
    });
    test('a width cookie is read as a shrink', () => {
        const t = OrgTable.parse(['| <8> | <r5> |', '| a | b |']);
        assert.deepEqual(t.layout().shrink, [8, 5]);
        assert.equal(t.layout().aligns[1], 'r');
    });
    test('keeps the indent', () => {
        assert.deepEqual(fmt(['   |a|', '   |b|']), ['   | a |', '   | b |']);
    });
    test('wide characters count double', () => {
        assert.deepEqual(fmt(['| 日本 |', '| abcd |']), ['| 日本 |', '| abcd |']);
    });
    test('pretty links measure as their description', () => {
        const t = OrgTable.parse(['| [[https://example.com][ex]] |', '| abcd |']);
        assert.deepEqual(t.format(measureWith(true)), ['| [[https://example.com][ex]]   |', '| abcd |']);
        assert.equal(t.format(measureWith(false))[1].length, t.format(measureWith(false))[0].length);
    });
});

suite('Table cursor', () => {
    test('finds the cell on an unaligned line', () => {
        assert.equal(cellIndexAt('|a|bb|c', 0), 0);
        assert.equal(cellIndexAt('|a|bb|c', 1), 0);
        assert.equal(cellIndexAt('|a|bb|c', 3), 1);
        assert.equal(cellIndexAt('|a|bb|c', 7), 2);
    });
    test('puts the cursor on the text of a cell', () => {
        assert.equal(cellTextStart('| a   |  12 |', 0), 2);
        assert.equal(cellTextStart('| a   |  12 |', 1), 9);
        assert.equal(cellTextStart('|     |     |', 1), 8);
    });
});

suite('Table editing', () => {
    test('rows and columns', () => {
        const t = OrgTable.parse(['| a | b |', '| c | d |']);
        t.insertRow(1);
        t.insertCol(1);
        t.set(1, 1, 'x');
        assert.deepEqual(t.format(), ['| a |   | b |', '|   | x |   |', '| c |   | d |']);
        t.moveCol(1, 1);
        t.moveRow(0, 1);
        assert.deepEqual(t.format(), ['|   |   | x |', '| a | b |   |', '| c | d |   |']);
        t.deleteCol(2);
        t.deleteRow(0);
        assert.deepEqual(t.format(), ['| a | b |', '| c | d |']);
    });
    test('sorts the rows between rules, not the header', () => {
        const t = OrgTable.parse(['| n | v |', '|-', '| b | 10 |', '| a | 9 |', '| c | |', '|-', '| z | 1 |']);
        t.sort(3, 1, 'numeric', false);
        assert.deepEqual(t.rows.map(r => r.rule ? '-' : r.cells[0]), ['n', '-', 'a', 'b', 'c', '-', 'z']);
        t.sort(2, 0, 'alpha', true);
        assert.deepEqual(t.rows.map(r => r.rule ? '-' : r.cells[0]), ['n', '-', 'c', 'b', 'a', '-', 'z']);
    });
    test('sorts by date', () => {
        const t = OrgTable.parse(['| <2026-03-01 Sun> |', '| [2025-12-31 Wed] |', '| 2026-01-15 |']);
        t.sort(0, 0, 'time', false);
        assert.deepEqual(t.rows.map(r => r.cells[0]), ['[2025-12-31 Wed]', '2026-01-15', '<2026-03-01 Sun>']);
    });
    test('transposes and drops rules', () => {
        const t = OrgTable.parse(['| a | b |', '|-', '| 1 | 2 |']);
        t.transpose();
        assert.deepEqual(t.format(), ['| a | 1 |', '| b | 2 |']);
    });
    test('sums numbers and times', () => {
        assert.deepEqual(sumValues(['1', '2.5', '', '$1,000']), { text: '1003.5', count: 3 });
        assert.deepEqual(sumValues(['1:30', '0:45']), { text: '2:15', count: 2 });
        assert.deepEqual(sumValues(['0.1', '0.2']), { text: '0.3', count: 2 });
        assert.equal(sumValues(['', 'x']), null);
    });
});

suite('Delimited text', () => {
    test('csv with quotes', () => {
        assert.deepEqual(parseDelimited('a,"b, c",d\n1,"say ""hi""",3\n'), [['a', 'b, c', 'd'], ['1', 'say "hi"', '3']]);
    });
    test('guesses the separator', () => {
        assert.equal(guessSeparator('a\tb'), '\t');
        assert.equal(guessSeparator('a;b;c'), ';');
        assert.equal(guessSeparator('name   size'), '  ');
        assert.deepEqual(parseDelimited('name   size\nfoo bar   12'), [['name', 'size'], ['foo bar', '12']]);
    });
    test('a header of words over numbers gets a rule', () => {
        assert.deepEqual(tableFromRows([['name', 'n'], ['a', '1'], ['b|c', '2']]).format(), [
            '| name      | n |',
            '|-----------+---|',
            '| a         | 1 |',
            '| b\\vert{}c | 2 |',
        ]);
    });
});

suite('Table formulas', () => {
    const t = OrgTable.parse(['| n | a | b |', '|-', '| x | 1 | |', '| y | 2 | |', '|-', '| total | | |']);
    test('reads the TBLFM line', () => {
        const fs = parseTblfm(['  #+TBLFM: $3=$2*2;%.1f::@>$2=vsum(@I..@II)']);
        assert.deepEqual(fs.map(f => [f.lhs, f.rhs]), [['$3', '$2*2;%.1f'], ['@>$2', 'vsum(@I..@II)']]);
        assert.equal('  #+TBLFM: $3=$2*2;%.1f::@>$2=vsum(@I..@II)'.slice(fs[1].start, fs[1].end), '@>$2=vsum(@I..@II)');
    });
    test('a column formula skips the header', () => {
        const [col] = parseTblfm(['#+TBLFM: $3=$2*2']);
        assert.deepEqual(Array.from(targets(col, t)).sort(), ['2,2', '3,2', '5,2']);
    });
    test('field and range targets', () => {
        const fs = parseTblfm(['#+TBLFM: @>$2=vsum(@I..@II)::@2$2..@3$3=0::@I+1$1=q']);
        assert.deepEqual(Array.from(targets(fs[0], t)), ['5,1']);
        assert.deepEqual(Array.from(targets(fs[1], t)).sort(), ['2,1', '2,2', '3,1', '3,2']);
        assert.deepEqual(Array.from(targets(fs[2], t)), ['2,0']);
    });
    test('a field formula beats a column formula', () => {
        const fs = parseTblfm(['#+TBLFM: $2=1::@>$2=vsum(@I..@II)']);
        assert.equal(formulaFor(fs, t, 5, 1).lhs, '@>$2');
        assert.equal(formulaFor(fs, t, 2, 1).lhs, '$2');
        assert.equal(formulaFor(fs, t, 2, 0), undefined);
    });
    test('refers to cells as org does', () => {
        assert.equal(fieldRef(t, 0, 0), '@1$1');
        assert.equal(fieldRef(t, 5, 2), '@4$3');
    });
    test('adds, replaces and removes formulas', () => {
        assert.deepEqual(setFormula([], '  ', '$3', '$2*2'), ['  #+TBLFM: $3=$2*2']);
        assert.deepEqual(setFormula(['#+TBLFM: $3=$2*2::@>$2=1'], '', '$3', '$2*3'), ['#+TBLFM: $3=$2*3::@>$2=1']);
        assert.deepEqual(setFormula(['#+TBLFM: $3=$2*2'], '', '@2$1', 'x'), ['#+TBLFM: $3=$2*2::@2$1=x']);
        assert.deepEqual(setFormula(['#+TBLFM: $3=$2*2::@>$2=1'], '', '$3', ''), ['#+TBLFM: @>$2=1']);
        assert.deepEqual(setFormula(['#+TBLFM: $3=$2*2'], '', '$3', ''), []);
    });
});

suite('Table plots', () => {
    test('reads a #+PLOT line', () => {
        assert.deepEqual(parsePlotLine('#+PLOT: title:"Sales by month" ind:1 deps:(2 3) with:histograms'),
            { title: 'Sales by month', ind: 1, deps: [2, 3], kind: 'bar' });
    });
    test('words then numbers plot as bars', () => {
        const t = OrgTable.parse(['| fruit | n | m |', '|-', '| a | 1 | 2 |', '| b | 3 | x |']);
        const d = plotData(t, {}, 'T');
        assert.ok(typeof d !== 'string');
        if (typeof d !== 'string') {
            assert.equal(d.kind, 'bar');
            assert.equal(d.xType, 'cat');
            assert.deepEqual(d.x, ['a', 'b']);
            assert.deepEqual(d.series, [{ name: 'n', values: [1, 3] }]);
        }
    });
    test('dates plot as a line and times as hours', () => {
        const t = OrgTable.parse(['| day | spent |', '|-', '| 2026-10-01 | 1:30 |', '| 2026-10-02 | 0:45 |']);
        const d = plotData(t, {}, 'T');
        if (typeof d === 'string') {
            assert.fail(d);
        } else {
            assert.equal(d.kind, 'line');
            assert.equal(d.xType, 'time');
            assert.equal(d.yLabel, 'hours');
            assert.deepEqual(d.series[0].values, [1.5, 0.75]);
        }
    });
    test('a footer of totals is left out', () => {
        const t = OrgTable.parse(['| m | n |', '|-', '| a | 1 |', '| b | 2 |', '|-', '| Total | 3 |']);
        const d = plotData(t, {}, 'T');
        assert.ok(typeof d !== 'string' && d.x.join() === 'a,b');
    });
    test('nothing to plot says so', () => {
        assert.equal(typeof plotData(OrgTable.parse(['| a |', '| b |']), {}, 'T'), 'string');
    });
});

suite('Writing back', () => {
    // Apply an edit to lines the way an editor would.
    function apply(old: string[], next: string[]): string {
        const d = diffLines(old, next);
        const text = old.join('\n');
        if (!d) {
            return text;
        }
        const offset = (line: number, ch: number) => old.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + ch;
        return text.slice(0, offset(d.startLine, d.startCh)) + d.text + text.slice(offset(d.endLine, d.endCh));
    }
    const cases: [string[], string[]][] = [
        [['a', 'b'], ['a', 'b']],
        [['| a | b |'], ['| a | bc |']],
        [['x', '| a |', 'y'], ['x', '| aa |', 'y']],
        [['a', 'c'], ['a', 'b', 'c']],
        [['a', 'b'], ['a', 'b', 'c']],
        [['b', 'c'], ['a', 'b', 'c']],
        [['a', 'b', 'c'], ['a', 'c']],
        [['a', 'b', 'c'], ['a', 'b']],
        [['a', 'b', 'c'], ['b', 'c']],
        [['a', 'b', 'c'], ['x', 'y']],
        [['a', 'a', 'a'], ['a', 'a']],
        [['|a|bb', '|-', '|ccc|d|'], ['| a   | bb |', '|-----+----|', '| ccc | d  |']],
    ];
    cases.forEach(([old, next], i) => test('case ' + i, () => assert.equal(apply(old, next), next.join('\n'))));
    test('only the changed part of a line', () => {
        assert.deepEqual(diffLines(['| a | b |', '| c | d |'], ['| a | b |', '| c | dd |']),
            { startLine: 1, startCh: 7, endLine: 1, endCh: 7, text: 'd' });
    });
});
