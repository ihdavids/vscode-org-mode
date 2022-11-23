
import * as vscode from 'vscode';
import * as assert from 'assert';

interface TestEditorOptions {
    language?: string;
    content?: string;
}

export class Page {
    doc:    vscode.TextDocument;
    editor: vscode.TextEditor;

    public constructor() {
        this.doc    = null;
        this.editor = null;
    }

    async create(options: TestEditorOptions = { language: 'org', content: '' }) {
        this.doc = await vscode.workspace.openTextDocument(options);
    }

    async show() {
        await vscode.window.showTextDocument(this.doc);
        this.editor = vscode.window.activeTextEditor;
    }

    async insert(text: string) {
        await this.editor.edit(async (edit) => {
            let pos = this.editor.selection.active;
            await edit.insert(pos, text);
        });
    }

    moveToLine(line: number, col: number = 0) {
        const pos = new vscode.Position(line, col);
        this.editor.selection = new vscode.Selection(pos, pos);
    }

    moveToPos(pos: vscode.Position) {
        this.editor.selection = new vscode.Selection(pos, pos);
    }

    select(range: vscode.Range) {
        this.editor.selection = new vscode.Selection(range.start, range.end);
    }

    async edit(callback) {
    	return await this.editor.edit( callback );
    }

    setDecorations(decorationType: vscode.TextEditorDecorationType, rangesOrOptions: readonly vscode.Range[] | readonly vscode.DecorationOptions[]) {
        this.editor.setDecorations(decorationType, rangesOrOptions);
    }

    get allContentRange() {
        return new vscode.Range(new vscode.Position(0,0), new vscode.Position(this.doc.lineCount,0));
    }

    get ok() {
        return this.editor;
    }

}


