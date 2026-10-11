// The outline, links and dates models. None of these touch vscode, so they
// also run outside an extension host: mocha --ui tdd out/test/outline.test.js
import * as assert from 'assert';
import {
    parseHeading, headingAt, subtreeEnd, children, moveSubtree, sortChildren, sortList, listAt,
    setProperty, getProperty, chosenHeadings, drawers, findOlp, cycleKeyword, fileKeywords,
} from '../src/outline/model';
import { scanLines } from '../src/decorations-scan';
import { columnsFor, rowsFor, parseColumns } from '../src/columns-model';
import { setHeadingParts, removeProperty, updateCookies } from '../src/outline/model';
import { findLinks, linkAt, parseTarget, resolveIn, linkToHeading, formatLink, isImage } from '../src/links/model';
import { stamp, recalcClockLine, slug, elapsed } from '../src/dates';

const KW = ['TODO', 'NEXT', 'DONE'];

suite('Outline', () => {
    const doc = [
        '#+TITLE: x',
        '* TODO [#A] Alpha  :work:',
        'body',
        '** Child one',
        '** Child two',
        '* Beta',
        '',
        '* DONE Gamma',
    ];
    test('reads a heading', () => {
        assert.deepEqual(parseHeading(doc[1], 1, KW), { line: 1, level: 1, todo: 'TODO', priority: 'A', title: 'Alpha', tags: ['work'] });
        assert.deepEqual(parseHeading('** NEXTSTEP thing', 0, KW).todo, '');
        assert.deepEqual(parseHeading('* :only:tags:', 0, KW).tags, ['only', 'tags']);
    });
    test('subtrees and children', () => {
        assert.equal(headingAt(doc, 2), 1);
        assert.equal(headingAt(doc, 0), -1);
        assert.equal(subtreeEnd(doc, 1), 5);
        assert.equal(subtreeEnd(doc, 7), 8);
        assert.deepEqual(children(doc, 1), [{ start: 3, end: 4 }, { start: 4, end: 5 }]);
        assert.deepEqual(children(doc, -1).map(c => c.start), [1, 5, 7]);
    });
    test('moves a subtree past its sibling, children and all', () => {
        const m = moveSubtree(doc, 5, -1);
        // The blank line keeps its place in the layout: before Gamma.
        assert.deepEqual(m.lines, ['* Beta', '* TODO [#A] Alpha  :work:', 'body', '** Child one', '** Child two', '']);
        assert.equal(m.cursor, 1);
        assert.equal(moveSubtree(doc, 1, -1), undefined, 'already first');
        const down = moveSubtree(doc, 3, 1);
        assert.deepEqual(down.lines, ['** Child two', '** Child one']);
        assert.equal(down.cursor, 4);
    });
    test('the last subtree moved up keeps a blank line between', () => {
        const m = moveSubtree(doc, 7, -1);
        assert.deepEqual(m.lines, ['* DONE Gamma', '', '* Beta']);
    });
    test('sorts the headings under one', () => {
        const lines = ['* P', '** b', 'text b', '** a', '** C'];
        assert.deepEqual(sortChildren(lines, 0, 'alpha', false, KW).lines, ['** a', '** b', 'text b', '** C']);
        const todo = ['* P', '** DONE x', '** y', '** TODO z'];
        assert.deepEqual(sortChildren(todo, 0, 'todo', false, KW).lines, ['** TODO z', '** DONE x', '** y']);
        const dated = ['* P', '** a', 'SCHEDULED: <2026-10-12 Mon>', '** b', 'DEADLINE: <2026-10-01 Thu>'];
        assert.deepEqual(sortChildren(dated, 0, 'date', false, KW).lines, ['** b', 'DEADLINE: <2026-10-01 Thu>', '** a', 'SCHEDULED: <2026-10-12 Mon>']);
    });
    test('sorts a list and numbers it again', () => {
        const lines = ['text', '1. pear', '   more pear', '2. apple', '3. fig', ''];
        assert.deepEqual(listAt(lines, 3).items, [{ start: 1, end: 3 }, { start: 3, end: 4 }, { start: 4, end: 5 }]);
        assert.deepEqual(sortList(lines, 1, 'alpha', false).lines, ['1. apple', '2. fig', '3. pear', '   more pear']);
        const checks = ['- [X] done', '- [ ] todo'];
        assert.deepEqual(sortList(checks, 0, 'checked', false).lines, ['- [ ] todo', '- [X] done']);
    });
    test('properties, made and changed', () => {
        assert.deepEqual(setProperty(['* H', 'body'], 0, 'ID', 'x').lines, ['* H', '  :PROPERTIES:', '  :ID: x', '  :END:']);
        assert.deepEqual(setProperty(['** H', 'SCHEDULED: <2026-10-11 Sun>'], 0, 'A', '1').lines,
            ['** H', 'SCHEDULED: <2026-10-11 Sun>', '   :PROPERTIES:', '   :A: 1', '   :END:']);
        const has = ['* H', '  :PROPERTIES:', '  :ID: old', '  :END:'];
        assert.deepEqual(setProperty(has, 0, 'id', 'new'), { start: 0, end: 3, lines: ['* H', '  :PROPERTIES:', '  :ID: new'] });
        assert.deepEqual(setProperty(has, 0, 'B', '2'), { start: 0, end: 3, lines: ['* H', '  :PROPERTIES:', '  :ID: old', '  :B: 2'] });
        assert.equal(getProperty(has, 0, 'id'), 'old');
        assert.equal(getProperty(has, 0, 'nope'), undefined);
        assert.deepEqual(drawers(has, 0, 4), [1]);
    });
    test('finds a heading by its outline path', () => {
        assert.equal(findOlp(doc, ['Alpha', 'Child two']), 4);
        assert.equal(findOlp(doc, ['Gamma']), 7);
        assert.equal(findOlp(doc, ['Child two']), -1, 'a path from the top');
    });
    test('the headings a selection takes in', () => {
        assert.deepEqual(chosenHeadings(doc, { start: 2, end: 2 }), [1]);
        assert.deepEqual(chosenHeadings(doc, { start: 1, end: 7 }), [1, 5, 7], 'children ride along with their parent');
        assert.deepEqual(chosenHeadings(doc, { start: 3, end: 4 }), [3, 4]);
    });
});

suite('Links', () => {
    test('finds links on a line', () => {
        const line = 'see [[*Alpha][the alpha]] and [[https://x.org]] or https://y.org/a.';
        assert.deepEqual(findLinks(line).map(l => [l.target, l.desc]), [['*Alpha', 'the alpha'], ['https://x.org', undefined], ['https://y.org/a', undefined]]);
        assert.equal(linkAt(line, 8).target, '*Alpha');
        assert.equal(linkAt(line, 2), undefined);
    });
    test('reads targets the way org does', () => {
        assert.equal(parseTarget('https://a.b').kind, 'url');
        assert.deepEqual(parseTarget('id:abc-1'), { kind: 'id', text: 'abc-1' });
        assert.deepEqual(parseTarget('*A heading'), { kind: 'heading', text: 'A heading' });
        assert.deepEqual(parseTarget('#custom'), { kind: 'customId', text: 'custom' });
        assert.deepEqual(parseTarget('file:notes.org::*Top'), { kind: 'file', path: 'notes.org', text: 'notes.org', search: { kind: 'heading', text: 'Top' } });
        assert.deepEqual(parseTarget('./a/b.org::12'), { kind: 'file', path: './a/b.org', text: './a/b.org', line: 11 });
        assert.deepEqual(parseTarget('Some words'), { kind: 'fuzzy', text: 'Some words' });
        assert.ok(isImage(parseTarget('./pics/cat.PNG')));
        assert.ok(!isImage(parseTarget('notes.org')));
    });
    test('finds what a target names', () => {
        const lines = ['* TODO First [1/2]  :x:', '  :PROPERTIES:', '  :CUSTOM_ID: first', '  :ID: 42', '  :END:', 'a <<spot>> here', '* Second'];
        assert.deepEqual(resolveIn(lines, parseTarget('*First')), { line: 0, ch: 0 });
        assert.deepEqual(resolveIn(lines, parseTarget('#first')), { line: 0, ch: 0 });
        assert.deepEqual(resolveIn(lines, parseTarget('id:42')), { line: 0, ch: 0 });
        assert.deepEqual(resolveIn(lines, parseTarget('spot')), { line: 5, ch: 2 });
        assert.deepEqual(resolveIn(lines, parseTarget('second')), { line: 6, ch: 0 });
        assert.equal(resolveIn(lines, parseTarget('*Nowhere')), undefined);
    });
    test('links to a heading by its ID, then CUSTOM_ID, then title', () => {
        assert.deepEqual(linkToHeading(['* A', ':PROPERTIES:', ':ID: u-1', ':END:'], 0), { target: 'id:u-1', desc: 'A' });
        assert.deepEqual(linkToHeading(['* A', ':PROPERTIES:', ':CUSTOM_ID: a', ':END:'], 0, 'x.org'), { target: 'file:x.org::#a', desc: 'A' });
        assert.deepEqual(linkToHeading(['* TODO A thing :t:'], 0), { target: '*A thing', desc: 'A thing' });
        assert.equal(formatLink('*A', 'A'), '[[*A][A]]');
        assert.equal(formatLink('*A', '*A'), '[[*A]]');
    });
});

suite('Dates', () => {
    const d = new Date(2026, 9, 11, 9, 5);
    test('timestamps', () => {
        assert.equal(stamp(d, true, false), '<2026-10-11 Sun>');
        assert.equal(stamp(d, false, true), '[2026-10-11 Sun 09:05]');
    });
    test('clock totals', () => {
        assert.equal(recalcClockLine('  CLOCK: [2026-10-11 Sun 09:00]--[2026-10-11 Sun 10:35] =>  0:00'),
            '  CLOCK: [2026-10-11 Sun 09:00]--[2026-10-11 Sun 10:35] =>  1:35');
        assert.equal(recalcClockLine('CLOCK: [2026-10-10 Sat 23:00]--[2026-10-11 Sun 12:30]'), 'CLOCK: [2026-10-10 Sat 23:00]--[2026-10-11 Sun 12:30] => 13:30');
        assert.equal(recalcClockLine('CLOCK: [2026-10-11 Sun 09:00]'), 'CLOCK: [2026-10-11 Sun 09:00]', 'a running clock is left alone');
    });
    test('slugs and elapsed time', () => {
        assert.equal(slug('Plans for 2027 [1/3]'), 'plans-for-2027');
        assert.equal(slug('Café crème'), 'café-crème');
        assert.equal(elapsed(new Date(2026, 9, 11, 8, 0), d), '1:05');
    });
});

suite('Keywords and decorations', () => {
    test('cycles a heading\'s keyword', () => {
        const kw = ['TODO', 'NEXT', 'DONE'];
        assert.equal(cycleKeyword('** Write it', kw, 1), '** TODO Write it');
        assert.equal(cycleKeyword('** TODO Write it', kw, 1), '** NEXT Write it');
        assert.equal(cycleKeyword('** DONE Write it', kw, 1), '** Write it');
        assert.equal(cycleKeyword('** Write it', kw, -1), '** DONE Write it');
        assert.equal(cycleKeyword('* TODO', kw, 1), '* NEXT');
        assert.equal(cycleKeyword('* TODOS list', kw, 1), '* TODO TODOS list', 'only a whole word is a keyword');
    });
    test('reads a file\'s own keywords', () => {
        assert.deepEqual(fileKeywords(['#+TODO: TODO(t) WAIT | DONE(d) CANCELLED']), { todo: ['TODO', 'WAIT'], done: ['DONE', 'CANCELLED'] });
        assert.deepEqual(fileKeywords(['#+SEQ_TODO: OPEN CLOSED']), { todo: ['OPEN'], done: ['CLOSED'] });
        assert.equal(fileKeywords(['* nothing']), undefined);
    });
    test('finds what to pretty-print in one pass', () => {
        const f = scanLines(['** A heading  :x:y:', 'see [[https://a.b][here]] and [[*A heading]]', '#+BEGIN_SRC sh', '* not a heading here', '#+END_SRC', '* B']);
        assert.deepEqual(f.headings.map(h => [h.line, h.level, h.title.start, h.title.end, h.tags && [h.tags.start, h.tags.end]]),
            [[0, 2, 3, 12, [14, 19]], [5, 1, 2, 3, undefined]]);
        assert.deepEqual(f.links.map(l => [l.text.start, l.text.end, l.hide.map(h => [h.start, h.end])]),
            [[19, 23, [[4, 19], [23, 25]]], [32, 42, [[30, 32], [42, 44]]]]);
        assert.deepEqual(f.blocks, [{ start: 2, end: 4 }]);
    });
});

suite('Column view and cookies', () => {
    test('reads #+COLUMNS', () => {
        assert.deepEqual(parseColumns('%25ITEM %TODO %Effort(Estimate){:} %COST{+}'), [
            { key: 'ITEM', label: 'Heading', sum: undefined }, { key: 'TODO', label: 'Todo', sum: undefined },
            { key: 'EFFORT', label: 'Estimate', sum: ':' }, { key: 'COST', label: 'Cost', sum: '+' }]);
    });
    test('sums a column up the outline, counting each value once', () => {
        const lines = ['#+COLUMNS: %ITEM %EFFORT{:}', '* P', '** a', ':PROPERTIES:', ':EFFORT: 1:30', ':END:', '** b', ':PROPERTIES:', ':EFFORT: 0:45', ':END:', '*** c', ':PROPERTIES:', ':EFFORT: 0:15', ':END:'];
        const rows = rowsFor(lines, columnsFor(lines), ['TODO', 'DONE']);
        assert.deepEqual(rows.map(r => [r.values.ITEM, r.sums.EFFORT]), [['P', '1:45'], ['a', undefined], ['b', '0:15'], ['c', undefined]]);
    });
    test('without #+COLUMNS, the properties the file uses', () => {
        const cols = columnsFor(['* a', ':PROPERTIES:', ':OWNER: me', ':ID: x', ':END:']).map(c => c.key);
        assert.deepEqual(cols, ['ITEM', 'TODO', 'PRIORITY', 'EFFORT', 'OWNER', 'TAGS']);
    });
    test('sets parts of a heading', () => {
        const kw = ['TODO', 'DONE'];
        assert.equal(setHeadingParts('** TODO [#A] Old title    :x:', { title: 'New' }, kw), '** TODO [#A] New          :x:');
        assert.equal(setHeadingParts('* Thing', { todo: 'DONE', priority: 'B', tags: ['a', 'b'] }, kw), '* DONE [#B] Thing :a:b:');
        assert.equal(setHeadingParts('* TODO Thing :a:', { todo: '', tags: [] }, kw), '* Thing');
    });
    test('takes a property out, and an emptied drawer with it', () => {
        assert.deepEqual(removeProperty(['* H', ':PROPERTIES:', ':A: 1', ':B: 2', ':END:'], 0, 'a').lines, ['* H', ':PROPERTIES:', ':B: 2', ':END:']);
        assert.deepEqual(removeProperty(['* H', ':PROPERTIES:', ':A: 1', ':END:', 'body'], 0, 'A'), { start: 0, end: 4, lines: ['* H'] });
        assert.equal(removeProperty(['* H', 'body'], 0, 'A'), undefined);
    });
    test('statistics cookies count children, or checkboxes', () => {
        assert.deepEqual(updateCookies(['* P [/]', '** TODO a', '** DONE b', '** c'], ['TODO'], ['DONE']), ['* P [1/2]', '** TODO a', '** DONE b', '** c']);
        assert.deepEqual(updateCookies(['* P [0%]', '- [X] a', '- [ ] b', '  - [X] c'], ['TODO'], ['DONE'])[0], '* P [67%]');
        assert.deepEqual(updateCookies(['* P [1/9]', 'text'], ['TODO'], ['DONE'])[0], '* P [1/9]', 'nothing to count: left alone');
    });
});
