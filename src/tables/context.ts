import * as vscode from 'vscode';

// This needs to change

export enum ContextType {
    TableMode = 'orgTableMode'
}

const contexts: Map<ContextType, Context> = new Map();
const state: Map<string, ContextType[]> = new Map();

export function registerContext(type: ContextType, title: string, statusItem?: vscode.StatusBarItem) {
    const ctx = new Context(type, title, statusItem);
    contexts.set(type, ctx);
    ctx.setState(false);
}

export function enterContext(editor: vscode.TextEditor, type: ContextType) {
    const ctx = contexts.get(type);
    if (ctx) {
        ctx.setState(true);

        const editorState = state.get(editor.document.fileName) || [];
        state.set(editor.document.fileName, editorState.concat(type));
    }
}

export function exitContext(editor: vscode.TextEditor, type: ContextType) {
    const ctx = contexts.get(type);
    if (ctx) {
        ctx.setState(false);

        const editorState = state.get(editor.document.fileName) || [];
        state.set(editor.document.fileName, editorState.filter(x => x !== type));
    }
}

export function restoreContext(editor: vscode.TextEditor) {
    let toEnter: ContextType[] = [];
    // @ts-ignore
    let toExit: ContextType[] = Object.keys(ContextType).map((x: any) => ContextType[x] as ContextType);

    if (state.has(editor.document.fileName)) {
        toEnter = state.get(editor.document.fileName)!;
        toExit = toExit.filter(x => toEnter.indexOf(x) < 0);
    }

    toEnter.forEach(x => enterContext(editor, x));
    toExit.forEach(x => exitContext(editor, x));
}

export class Context {
    public enabled = false;
    public constructor(private type: ContextType, private title: string, private statusItem?: vscode.StatusBarItem) {
    }

    public setState(isEnabled: boolean) {
        if (this.enabled != isEnabled) {
            vscode.commands.executeCommand('setContext', this.type, isEnabled);
            if (this.statusItem) {
                const stateText = isEnabled ? 'On' : 'Off';
                this.statusItem.text = `${this.title}: ${stateText}`;
            }
            this.enabled = isEnabled;
        }
    }

    public toggle() {
        this.enabled = !this.enabled;
        vscode.commands.executeCommand('setContext', this.type, this.enabled);
        if (this.statusItem) {
            const stateText = this.enabled ? 'On' : 'Off';
            this.statusItem.text = `${this.title}: ${stateText}`;
        }
    }

    public isOn(): boolean {
        return this.enabled;
    }

    public isOff(): boolean {
        return !this.enabled;
    }

    public reset() {
        if (this.enabled) {
            this.setState(false);
        }
    }
}