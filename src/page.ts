
import * as vscode from 'vscode';
import * as assert from 'assert';

interface TestEditorOptions {
    language?: string;
    content?: string;
    scheme?: string;
}

type ReadonlyPath = { [path: string]: boolean | null | 'toggle' } | undefined;
const key = 'files.readonlyPath';

function setReadOnly(doc: vscode.TextDocument, value: boolean | null | 'toggle' = 'toggle') {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const noGlobs = { '/settings/folder': true, '**/settings.json': true };
    if (anyGlobMatches(noGlobs, doc)) { return; } // IGNORE WHEN EDITING settings.json
    const path = doc.fileName;
    const pathValue: ReadonlyPath = {}; 
    pathValue[path] = value;
    vscode.workspace.getConfiguration().update(key, pathValue, true); // false: WORKSPACE, true: GLOBAL
    const basename = path.split(/\/|\\/).reverse()[0];
    //vscode.window.showInformationMessage(`readonlyPath: { "${basename}": ${value} }`);
}

function anyGlobMatches(globs: ReadonlyPath, document: vscode.TextDocument) {
    return !!(globs && Object.keys(globs).find(glob => (globs[glob] === true) && (vscode.languages.match({ pattern: glob }, document) !== 0)));
}

export class Page {
    doc:    vscode.TextDocument;
    editor: vscode.TextEditor;
    uri:    vscode.Uri | undefined;

    public constructor() {
        this.doc    = null;
        this.editor = null;
    }

    async create(options: TestEditorOptions | vscode.Uri = { language: 'org', content: '' }) {
        if (options instanceof vscode.Uri) {
            this.uri = options;
            this.doc = await vscode.workspace.openTextDocument(this.uri);
        } else {
            this.uri = undefined;
            this.doc = await vscode.workspace.openTextDocument(options);
        }
    }

    onDidClose(context: vscode.ExtensionContext, callback) {
        context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors((ed) => {
            ed.forEach( (e) => {
                if (this.editor.document === e.document) {
                    callback(e);
                }
            });
        }));
    }

    onWindowsChanged(context: vscode.ExtensionContext, callback) {
        context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors((ed) => {
            callback(this.doc.getText());
        }));
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

    async close() {
        await vscode.window.showTextDocument(this.doc.uri, {preview: true, preserveFocus: false});
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }

    async closeEvenIfDirty() {
        await vscode.window.showTextDocument(this.doc.uri, {preview: true, preserveFocus: false});
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }

    setReadonly(val: boolean) {
        setReadOnly(this.doc, val);
    }

    get allContentRange() {
        if (this.doc.lineCount > 0) {
            return new vscode.Range(new vscode.Position(0,0), new vscode.Position(this.doc.lineCount,0));
        } else {
            return new vscode.Range(new vscode.Position(0,0), new vscode.Position(0,0));
        }
    }

    get contentMinusFirstLine() {
        if (this.doc.lineCount > 0) {
            return new vscode.Range(new vscode.Position(1,0), new vscode.Position(this.doc.lineCount,0));
        } else {
            return this.allContentRange;
        }
    }

    get ok() {
        return this.editor;
    }

    save() {
        this.doc.save();
    }

}


