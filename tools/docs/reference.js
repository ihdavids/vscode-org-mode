#!/usr/bin/env node
// Writes the parts of the manual that come from package.json, so they can
// never drift from what the plugin really does: every key binding (by where
// it works), every command (by subject, with what it does), every setting.
// They come out as docex guides, into the directory given:
//
//   node tools/docs/reference.js build/docs/guides

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const notes = JSON.parse(fs.readFileSync(path.join(__dirname, 'command-notes.json'), 'utf8'));
const out = process.argv[2] || path.join(root, 'build/docs/guides');
fs.mkdirSync(out, { recursive: true });

const commands = {};
for (const c of pkg.contributes.commands) {
    commands[c.command] = (c.category ? c.category + ': ' : '') + c.title;
}
const titleOf = id => commands[id] || id;
const plain = t => t.replace(/^Org( Agenda| Clock)?: /, '');

// ctrl+alt+o shift+k -> Ctrl+Alt+O Shift+K, and the mac's ⌃⌥O ⇧K.
const NAMES = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', cmd: 'Cmd', meta: 'Meta', enter: 'Enter', tab: 'Tab', space: 'Space',
    up: 'Up', down: 'Down', left: 'Left', right: 'Right', escape: 'Esc', backspace: 'Backspace', delete: 'Delete' };
const MAC = { ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘', enter: '↩', tab: '⇥', space: 'Space', up: '↑', down: '↓', left: '←', right: '→', escape: 'Esc' };
const keyName = (k, mac) => k.split(' ').map(chord => chord.split('+').map(p => {
    const lower = p.toLowerCase();
    if (mac && MAC[lower]) {
        return MAC[lower];
    }
    return NAMES[lower] || (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1));
}).join(mac ? '' : '+')).join(' ');
const verbatim = s => '~' + s + '~';

// Where a binding works, read from its when clause.
function context(when) {
    const w = when || '';
    if (/vim\.active && vim\.mode != 'Insert'/.test(w)) {
        return /orgTableMode/.test(w) ? 'In a table, vim normal mode' : 'On a heading, vim normal mode';
    }
    if (/orgTableMode/.test(w) && !/!orgTableMode/.test(w)) {
        return 'In a table';
    }
    if (/orgOnHeading/.test(w)) {
        return 'On a heading';
    }
    if (/editorLangId == 'org'/.test(w)) {
        return 'In an org file';
    }
    if (/hasOrgCalFocus|calendar/.test(w)) {
        return 'In the calendar';
    }
    if (/todolist/.test(w)) {
        return 'In a TODO list';
    }
    if (/hasOrgCapFocus/.test(w)) {
        return 'On a capture page';
    }
    return 'Anywhere in VS Code';
}
const CONTEXTS = ['Anywhere in VS Code', 'In an org file', 'On a heading', 'In a table', 'On a heading, vim normal mode',
    'In a table, vim normal mode', 'In the calendar', 'In a TODO list', 'On a capture page'];
const ABOUT = {
    'Anywhere in VS Code': 'These work in any editor, org file or not.',
    'In an org file': 'These work anywhere in an org file.',
    'On a heading': 'These take over only with the cursor on a heading line; elsewhere the key does what it always does.',
    'In a table': 'These take over only with the cursor on a table line (Ctrl+Q Ctrl+Q turns them off and on).',
    'On a heading, vim normal mode': 'With VSCodeVim, in normal mode, on a heading line. In insert mode the keys above work.',
    'In a table, vim normal mode': 'With VSCodeVim, in normal mode, on a table line. In insert mode the table keys work.',
    'In the calendar': 'In the date picker the timestamp commands open.',
    'In a TODO list': 'In a TODO list opened with Org: Todo View.',
    'On a capture page': 'On the page Org: Capture opens.',
};

const byContext = {};
const keysOf = {};
for (const kb of pkg.contributes.keybindings) {
    const ctx = context(kb.when);
    (byContext[ctx] = byContext[ctx] || []).push(kb);
    (keysOf[kb.command] = keysOf[kb.command] || []).push({ key: kb.key, ctx });
}

// -- Keys ------------------------------------------------------------------------

let keys = `#+TITLE: Every key binding
#+DOC_SECTION: Keys

Every key the plugin binds, by where it works. The macOS column is the same
key written the Mac's way: =Ctrl= is ⌃, =Alt= is ⌥ (Option), =Shift= is ⇧.
Search for a key (=ctrl+alt+o=, =tab=) or for what you want to do.

`;
for (const ctx of CONTEXTS.filter(c => byContext[c])) {
    keys += `* ${ctx}\n${ABOUT[ctx]}\n\n| Key | macOS | Does | Command |\n|-----+-------+------+---------|\n`;
    const rows = byContext[ctx].slice().sort((a, b) => a.key.localeCompare(b.key));
    for (const kb of rows) {
        keys += `| ${verbatim(keyName(kb.key, false))} | ${verbatim(keyName(kb.key, true))} | ${plain(titleOf(kb.command)).replace(/\|/g, '\\vert{}')} | ${verbatim(kb.command)} |\n`;
    }
    keys += '\n';
}
fs.writeFileSync(path.join(out, 'reference-keys.org'), keys);

// -- Commands ----------------------------------------------------------------------

let cmds = `#+TITLE: Commands
#+DOC_SECTION: Reference
#+DOC_ORDER: 1

Every command, by subject. Run any of them from the Command Palette
(Ctrl+Shift+P, ⇧⌘P) by its name, or from the org menu (Ctrl+Alt+O M).

`;
const missing = [];
const byCat = {};
for (const id of Object.keys(commands)) {
    const n = notes.commands[id];
    if (!n) {
        missing.push(id);
    }
    const cat = n ? n[0] : 'Other';
    (byCat[cat] = byCat[cat] || []).push(id);
}
for (const cat of notes.categories.concat(byCat.Other ? ['Other'] : []).filter(c => byCat[c])) {
    cmds += `* ${cat}\n`;
    for (const id of byCat[cat].sort((a, b) => plain(titleOf(a)).localeCompare(plain(titleOf(b))))) {
        const n = notes.commands[id];
        cmds += `** ${plain(titleOf(id))}\n${n ? n[1] : ''}\n\n`;
        cmds += `- Palette :: ${titleOf(id)}\n- Id :: ${verbatim(id)}\n`;
        for (const k of keysOf[id] || []) {
            cmds += `- Key :: ${verbatim(keyName(k.key, false))} (${verbatim(keyName(k.key, true))} on macOS) - ${k.ctx.toLowerCase()}\n`;
        }
        cmds += '\n';
    }
}
fs.writeFileSync(path.join(out, 'reference-commands.org'), cmds);

// -- Settings ------------------------------------------------------------------------

const conf = Array.isArray(pkg.contributes.configuration) ? pkg.contributes.configuration[0] : pkg.contributes.configuration;
let sets = `#+TITLE: Settings
#+DOC_SECTION: Reference
#+DOC_ORDER: 2

Every setting, in Settings (Ctrl+, / ⌘,) under /Org/, or in settings.json by
the name given.

`;
for (const name of Object.keys(conf.properties).sort()) {
    const p = conf.properties[name];
    const def = p.default === undefined ? '' : JSON.stringify(p.default);
    sets += `* ${name.replace(/^org\./, '')}\n${(p.description || p.markdownDescription || '').replace(/\n/g, ' ')}\n\n`;
    sets += `- Setting :: ${verbatim(name)}\n- Type :: ${Array.isArray(p.type) ? p.type.join(' or ') : p.type || 'any'}\n`;
    if (def && def.length < 120) {
        sets += `- Default :: ${verbatim(def)}\n`;
    } else if (def) {
        sets += `- Default ::\n#+BEGIN_SRC json\n${JSON.stringify(p.default, null, 2)}\n#+END_SRC\n`;
    }
    if (p.enum) {
        sets += `- Values :: ${p.enum.map((v, i) => verbatim(v) + (p.enumDescriptions ? ' - ' + p.enumDescriptions[i] : '')).join('; ')}\n`;
    }
    sets += '\n';
}
fs.writeFileSync(path.join(out, 'reference-settings.org'), sets);

if (missing.length) {
    console.warn(`reference.js: no note for ${missing.length} command(s): ${missing.join(', ')} (tools/docs/command-notes.json)`);
}
console.log(`wrote the key, command and setting references into ${out}`);
