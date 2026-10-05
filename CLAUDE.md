# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IOrg (formerly vscode-org-mode) is a VS Code extension providing Emacs Org mode support. It handles `.org` files with features including headings/outlines, TODO management, timestamps/clocking, tables with formulas, checkboxes, agenda views, Gantt charts, mind maps, and webview-based presentations (Reveal.js, Impress.js).

The extension connects to an optional "orgs" server via WebSocket/RPC for cross-file TODO queries and agenda views.

## Build Commands

```bash
npm run compile        # Compile TypeScript (tsc -p ./)
npm run watch          # Watch mode compilation
npm run lint           # TSLint: tslint 'src/**/*.ts'
npm run test           # Compile + run VS Code extension tests
npm run generate-syntax # Regenerate TextMate grammar from syntaxes/populate-syntax.js
```

Package the extension: `npx vsce package`

## Testing

Tests run as VS Code extension tests (require an Extension Host):
- Test files: `test/*.test.ts`
- Launch config "Launch Tests" in `.vscode/launch.json` runs them in a new VS Code instance
- `npm test` compiles and runs all tests via `node ./node_modules/vscode/bin/test`

## Architecture

### Entry Point

`src/extension.ts` — `OrgExtension` singleton manages the extension lifecycle. It registers all commands (prefixed `org.*`), initializes the parser, decorations, calendar, todolist, and capture systems.

### Parser (`src/parser.ts`)

Custom recursive parser that builds an AST of `Node` types (`OrgTypes` enum: Headline, Scheduled, Deadline, Table, SourceBlock, etc.). Used by decorations, folding, and all feature modules.

### Key Subsystems

- **Tables** (`src/tables/`) — Table editing mode with cell navigation, formula execution (`tttable.ts` for table model, `ttorg.ts` for org-table specifics, `commands.ts` for VS Code commands, `context.ts` for table mode state)
- **Decorations** (`src/decorations/`) — Pretty-printing: bullets, link hiding, heading styles, regex-based highlights (`decorator.ts` orchestrates, `changes.ts` tracks document changes, `types.ts` for decoration config)
- **Calendar** (`src/calendar.ts`) — Virtual document calendar with navigation for date picking
- **Webviews** — `src/web.ts`, `src/gantt.ts`, `src/mindmap.ts`, `src/revealjs.ts`, `src/impressjs.ts` render HTML in VS Code webview panels
- **Clocking** (`src/timestamp-functions.ts`, `src/asciiclock.ts`) — Clock in/out with LOGBOOK drawer entries
- **DB/Server** (`src/db.ts`) — WebSocket RPC client connecting to the orgs server for agenda/TODO queries

### Conventions

- Commands: registered as `org.<camelCase>`, titled as `Org: Title Case Words`
- Filenames: kebab-case (e.g., `header-functions.ts`)
- All keybindings use `ctrl+alt+o` prefix chord for org commands
- TypeScript compiled to `out/` directory, source maps enabled

## Git Workflow

- `develop` is the main integration branch (PRs target here)
- `master` is production
- Feature branches optionally prefixed with `feature/`
