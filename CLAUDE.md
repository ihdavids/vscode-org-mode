# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IOrg (formerly vscode-org-mode) is a VS Code extension providing Emacs Org mode support. It handles `.org` files with features including headings/outlines, TODO management, timestamps/clocking, tables with formulas, checkboxes, agenda views, Gantt charts, mind maps, and webview-based presentations (Reveal.js, Impress.js).

The extension talks to an optional "orgs" server (~/dev/orgs) over REST for everything that spans files or runs things: the agenda, clocking, refile/archive, running code, exporting, habits, attachments and more.

## Build Commands

```bash
npm run compile        # TypeScript 5 (tsc -p ./) into out/
npm run watch          # Watch mode compilation
npm run lint           # ESLint (eslint.config.mjs): errors fail, unused names only warn
npm run test:unit      # The pure-model tests, in plain node (no VS Code)
npm test               # compile + unit tests + the extension tests in a VS Code
npm run generate-syntax # Regenerate TextMate grammar from syntaxes/populate-syntax.js
```

Package the extension: `npx vsce package`

## Testing

- `test/*.test.ts` (mocha, `tdd` UI). The model tests (`tables.test.ts`,
  `outline.test.ts`) import nothing from vscode and run under `test:unit`.
- `test/runTest.ts` starts a VS Code via `@vscode/test-electron` (set
  `VSCODE_PATH` to use an installed one rather than downloading) and runs
  `test/index.ts`, which runs every `*.test.js` or just those in `TEST_FILES`.
- Suites that need more skip themselves without it:
  - `ORGS_TEST_URL` - an orgs server with `noAuth: true` (table formulas, and the next two)
  - `TEST_ORG_DIR` - that server's org directory, opened as the workspace
    (`features.test.ts`, `workflow.test.ts`; they expect its main.org/notes.org,
    babel on for python, and an "Inbox" capture template into notes.org)
  - `TEST_EXTENSIONS_DIR` - an extensions dir holding VSCodeVim (`tables-vim.test.ts`)
- CI (`.github/workflows/ci.yml`) runs compile, lint, unit tests and the
  extension tests under xvfb.

## Architecture

### Entry Point

`src/extension.ts` — `OrgExtension` singleton manages the extension lifecycle. It registers all commands (prefixed `org.*`), initializes the parser, decorations, calendar, todolist, and capture systems.

### Models and parsing

The newer code is a pure model (no vscode import, unit tested) under a thin
vscode layer: `src/tables/model.ts`, `src/outline/model.ts`,
`src/links/model.ts`, `src/decorations-scan.ts`, `src/columns-model.ts`,
`src/footnotes-model.ts`, `src/lines.ts` (minimal edits). Commands rewrite a
block of lines with `replaceLines` (src/edit-lines.ts) - one undo, only what
changed.

`src/parser.ts` builds a node tree for the few older commands that want one
(TODO picker, tags, capture, DWIM). It parses on demand (`Parser.find()`), never
per keystroke; decorations and folding read lines.

Commands that make the orgs server write a file call `settled()`
(src/org-files.ts) so the editor has reloaded it before anything else runs.

### Key Subsystems

- **Tables** (`src/tables/`) — `model.ts` (parse/align/edit), `formulas.ts` (TBLFM targets), `commands.ts`, `view.ts` (table mode, formula highlight, hover, shrink), `calc.ts` (recalc via orgs `/table/calc`), `plot.ts`. `ttorg.ts`/`tttable.ts` remain only for the old parser
- **Decorations** — `src/decorations.ts` (bullets, link hiding, heading styles, source block shading, from `decorations-scan.ts`, debounced) and `src/decorations/` (the user's regex highlights)
- **Calendar** (`src/calendar.ts`) — Virtual document calendar with navigation for date picking
- **Webviews** — `src/preview.ts` (web/slides/Gantt/mind map from the exporters), `src/columns.ts`, `src/media-panel.ts`, `src/tables/plot.ts`, `src/worg.ts` (worg's views). Side bar trees: `src/agenda-view.ts`, `src/clock-view.ts`
- **Outline, links, the rest** — `src/outline/`, `src/links/`, `src/completion.ts`, `src/blocks.ts`, `src/refile.ts`, `src/time.ts`, `src/export.ts`, `src/orgs-tools.ts`, `src/narrow.ts`, `src/stats.ts`, `src/footnotes.ts`, `src/pomodoro.ts`, `src/menu.ts` (Ctrl+Alt+O M). The manual is in `docs/manual/`
- **Clocking** (`src/timestamp-functions.ts`, `src/asciiclock.ts`) — Clock in/out with LOGBOOK drawer entries
- **DB/Server** (`src/db.ts`) — REST client for the orgs server (`ODb.api`/`apiPost` for anything without a helper); `src/auth.ts` handles login and detects a `noAuth` server

### Conventions

- Commands: registered as `org.<camelCase>`, titled as `Org: Title Case Words`
- Filenames: kebab-case (e.g., `header-functions.ts`)
- All keybindings use `ctrl+alt+o` prefix chord for org commands
- TypeScript compiled to `out/` directory, source maps enabled

## Git Workflow

- `develop` is the main integration branch (PRs target here)
- `master` is production
- Feature branches optionally prefixed with `feature/`
