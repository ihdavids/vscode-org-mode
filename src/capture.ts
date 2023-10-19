
import { parse } from 'path';
import * as vscode from 'vscode';
import { Page } from "./page";
import { Signal } from "./signal";
import * as Util from './utils';
import * as CC from './cursor-context';
import { OrgDuration } from './duration';
import './duration';
import * as Datetime from './simple-datetime';
import {ODb} from "./db"
import { Sets } from './sets';
import { Parser } from './parser';

export class CaptureState {
    public capPage: CapturePage;

    constructor(cap: CapturePage) {
        this.capPage  = cap;
    }
}

export class CapturePage implements vscode.TextDocumentContentProvider {
    private page: Page;
	private cursorType: vscode.TextEditorDecorationType;
    private uri: vscode.Uri;
    private templates: any;
    private template: any;
    private context: vscode.ExtensionContext
	private doNotSave: boolean;

	private editor: vscode.TextEditor | undefined;
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

	public get onDidChange() {
		return this._onDidChange.event;
    }

    private readonly _onDone    = new Signal<CapturePage, CaptureState>();
    private readonly _onChanged = new Signal<CapturePage, Date>();

    onEnterHandler() {
        //const state = new CalendarState(this, true);
        //this._onDone.trigger(this, state);
    }

    onEscapeHandler() {
        //const state = new CalendarState(this, false);
        //this._onDone.trigger(this, state);
    }

    get onDone() {
        return this._onDone;
    }
    get onChanged() {
        return this._onChanged;
    }

	constructor(context: vscode.ExtensionContext) {
        this.context = context;
	    context.subscriptions.push(vscode.commands.registerCommand('org.capture.close',    () => this.closeWindow()));
	    context.subscriptions.push(vscode.commands.registerCommand('org.capture.escape',    () => this.escapeOut()));
		this.uri = vscode.Uri.parse('Capture:Capture.capture');
		this.cursorType = vscode.window.createTextEditorDecorationType({
			'light': {
				'backgroundColor': 'rgba(255, 0, 0, 1.0)'
			},
			'dark': {
				'backgroundColor': 'rgba(255, 0, 0, 1.0)'
			}
		});
	}

	dispose() {
		this._onDidChange.dispose();
	}

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
       return "";
	}

    regenCapture(key: string) {
        const temp = Sets.captureTemplates[key];
        this.page.edit((edit) => this.page.editor.insertSnippet(new vscode.SnippetString(temp['snippet'])) );
    }
	async openCapturePage() {
        this.page = new Page();
        await this.page.create();
        await this.page.show();
		await this.redraw();
	}

    getCaptureSnippetDefault(type: string) {
        if (type === "entry") {
            return "* ${1:HEADING}\n   ${2:BODY}";
        } else if (type === "item") {
            return "${1:ITEM}";
        } else if (type === "checkitem") {
            return "${1:ITEM}";
        } else if (type === "table-line") {
            return "${1:ITEM}";
        } else if (type == "plain") {
			return "${1:TXT}"
		}
        return "* ${1:HEADING}\n   ${2:BODY}";
    }

	haveInKnownTemplates(item, knownTemplates) {
		for (const [key, value] of Object.entries(knownTemplates)) {
			if (item.Name === value['selector']) {
				return true;
			}
		}
		return false;
	}

    async rebuildCaptureTemplates(): Promise<any> {
        this.templates = await ODb.captureTemplates();
        let knownTemplates = Sets.captureTemplates;
        let didUpdate = false;
		// TODO: I want to be able to map multiple capture templates to a single target definition
		// TODO: I want to have vscode side target definitions that do not exist on the server side
		// TODO: I want to automatically add server side definitions if they do not exist on the vscode side?
		//
		
		let notInTemplates = [];
		for (const [key, value] of Object.entries(knownTemplates)) {
			const selector = value['selector'];
			let have = false;
			for (const item of this.templates) {
				if (item.Name === selector) {
					have = true;
					break;
				}
			}
			if(!have) {
				notInTemplates.push(key);
			}
		}
		
        this.templates.forEach((item) => {
            if (!this.haveInKnownTemplates(item.Name, knownTemplates)) {
                didUpdate = true;
                knownTemplates[item.Name] = {
					"selector": item.Name,
                    "type":    item.Type,
                    "target":  item.Target,
                    "snippet": this.getCaptureSnippetDefault(item.Type)
                }
            }
        });
        if (didUpdate) {
            Sets.captureTemplates = knownTemplates;
        }
        return [knownTemplates, notInTemplates];
    }

    async openCaptureEditor(): Promise<CaptureState> {
		this.doNotSave = false;
        // Set context so keybindings will work now.
        await vscode.commands.executeCommand('setContext', 'hasOrgCapFocus', true);
        // Open up the page with the calendar on it!
		await this.openCapturePage();


        const [knownTemplates, notInTemplates] = await this.rebuildCaptureTemplates();
        let temps: string[] = [];
        Object.entries(knownTemplates).forEach(([name, item]) => { temps.push(name); });
		console.log("TEMPS: ", temps);
        const templateName = await vscode.window.showQuickPick(temps)
        console.log("RESULTS", templateName);
        this.regenCapture(templateName);
		this.template = knownTemplates[templateName];
		const selector = this.template['selector'];
        console.log("Chosen Template", this.template);
        this.page.onWindowsChanged(this.context, (content) => {
			if (!this.doNotSave) {
				let parser: Parser = new Parser();
				parser.parseFromText(content);
				if (parser.doc && parser.doc.children) {
					const h = parser.doc.children[0];
					const headline = h.getRawHeadline();
					const body = h.data.trim();
					const props = h.properties;
					const tags = h.tags;
					const priority = "";
					ODb.capture(selector, headline, body, tags, props, priority);
				}
			}
        });

        const state = new CaptureState(this);
        return Promise.resolve(state);
	}

	async closeWindow() {
		this.page.closeEvenIfDirty();
	}

	async escapeOut() {
		this.doNotSave = true;
		this.page.closeEvenIfDirty();
	}

	async redraw() {
        this._onDidChange.fire(this.uri);
	}
}
