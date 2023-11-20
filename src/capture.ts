
import { join, parse } from 'path';
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
import { Log } from './log';

export class CaptureState {
    public capPage: CapturePage;

    constructor(cap: CapturePage) {
        this.capPage  = cap;
    }
}

export class NodeTarget {
    public filename: string;
    public id:       string;
    public type:     string;

    public toString = () : string => {
        return `Tgt (id: ${this.id}, type: ${this.type}, fn: ${this.filename})`;
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

    regenCapture(key: string): boolean {
        const temp = Sets.captureTemplates[key];
        if (!temp || !temp['snippet']) {
            vscode.window.showErrorMessage("Capture template seems to be missing a snippet field. Cannot continue!");
            return false;
        }
        this.page.edit((edit) => this.page.editor.insertSnippet(new vscode.SnippetString(temp['snippet'])) );
        return true;
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
        } else if (type === "plain") {
			return "${1:TXT}"
		}
        return "* ${1:HEADING}\n   ${2:BODY}";
    }

	haveInKnownTemplates(item, knownTemplates) {
		for (const [key, value] of Object.entries(knownTemplates)) {
            //console.log("KNOWN: ", item.Name, value)
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
		if (!this.templates) {
            return [knownTemplates, notInTemplates];
        }
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
            if (!this.haveInKnownTemplates(item, knownTemplates)) {
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
        console.log("knownTemplates", knownTemplates);
        let temps: string[] = [];
        Object.entries(knownTemplates).forEach(([name, item]) => { if (!item['hide']) { temps.push(name); }});
        const templateName = await vscode.window.showQuickPick(temps)
        console.log("RESULTS", templateName);
        if (!templateName) {
            return Promise.resolve(undefined);
        }
        if (!this.regenCapture(templateName)) {
            return Promise.resolve(undefined);
        }
		this.template = knownTemplates[templateName];
		const selector = this.template['selector'];
        if (!selector) {
            vscode.window.showErrorMessage("Capture definition is missing a selector field. PLEASE add one! ABORT!");
            return Promise.resolve(undefined);
        }
        console.log("Chosen Template", this.template);
        let haveCaptured = false;
        this.page.onWindowsChanged(this.context, (content) => {
			if (!this.doNotSave && !haveCaptured) {
                if (this.template['type'] === 'entry') {
				    let parser: Parser = new Parser();
				    parser.parseFromText(content);
				    if (parser.doc && parser.doc.children) {
				    	const h = parser.doc.children[0];
				    	const headline = h.getRawHeadline();
				    	const body = h.data.trim();
				    	const props = h.properties;
				    	const tags = h.tags;
				    	const priority = "";
                        haveCaptured = true;
				    	ODb.capture(selector, headline, body, tags, props, priority);
				    }
                }
                else {
                    haveCaptured = true;
				    ODb.capture(selector, "", content, [], {}, "");
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

// Do we ever want to expose this?
async function deleteHeading(): Promise<void> {
    const src = await ODb.getHashTarget();
    await ODb.delete(src);
}

export async function refileHeading(): Promise<void> {
    const src = await ODb.getHashTarget();
    const tgts = await ODb.refiletargets();
    const r = await vscode.window.showQuickPick(tgts);
    if (r) {
        let to = new NodeTarget();
        const rs = r.split("|");
        to.filename = rs[0]; 
        to.type = "file+olp"
        to.id = rs.slice(1).join("::");
        const res: any = await ODb.refile(src, to);
        if (!res.Ok) {
            Log.get().error("REFILE: ", r, " <- ", src);
            Log.get().error("  > REFILE ERROR: ", JSON.stringify(res))
        } else {
            Log.get().log("RESULT: ", r, " <- ", src);
        }
    }
}

export async function archiveHeading(): Promise<void> {
    const src = await ODb.getHashTarget();
    const res: any = await ODb.archive(src);
    if (!res.Ok) {
        Log.get().error("ARCHIVE: ", src);
        Log.get().error("  > ARCHIVE ERROR: ", JSON.stringify(res))
    } else {
        Log.get().log("RESULT: ", src);
    }
}