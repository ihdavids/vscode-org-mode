import { parse } from 'path';
import * as vscode from 'vscode';
import { Page } from "./page";
import { Signal } from "./signal";
import * as Util from './utils';
import * as CC from './cursor-context';
import { OrgDuration } from './duration';
import './duration';
import * as Datetime from './simple-datetime';
import { Sets } from './sets';
import { ODb } from './db';
import { OrgExtension  } from "./extension";
import { format } from 'date-fns';
import { mainModule } from 'process';

function limitLen(name, len) {
    if (name.length > len) { 
        name = name.slice(0, len);
    } else {
        name = name.padStart(len, ' ');
    }
    return name
}

function limitLenRight(name, len) {
    if (name.length > len) {
        name = name.slice(0, len);
    } else {
        name = name.padEnd(len, ' ');
    }
    return name
}

export class TodoList<RETURNTYPE> implements vscode.TextDocumentContentProvider {
    private page: Page;
	private cursorType: vscode.TextEditorDecorationType;

	private text: string;
    private uri: vscode.Uri;
    private cfg: object;

	private editor: vscode.TextEditor | undefined;

    // Internal event to ask the page contents get regenerated.
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	public get onDidChange() { return this._onDidChange.event; }

    private readonly _onDone    = new Signal<TodoList<RETURNTYPE>, boolean>();
    private readonly _onChanged = new Signal<TodoList<RETURNTYPE>, RETURNTYPE>();

    private showFilename = 15;
    private showHeadline = 25;
    private showStatus   = 10;

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

	    //context.subscriptions.push(vscode.commands.registerCommand('org.calendar.prevDate', () => this.goDate(-1)));
	    //context.subscriptions.push(vscode.commands.registerCommand('org.calendar.nextDate', () => this.goDate(1)));
	    //context.subscriptions.push(vscode.commands.registerCommand('org.calendar.prevWeek', () => this.goDate(-7)));
	    //context.subscriptions.push(vscode.commands.registerCommand('org.calendar.nextWeek', () => this.goDate(7)));
	    //context.subscriptions.push(vscode.commands.registerCommand('org.calendar.setDate', async () => this.onEnterHandler()));

		this.uri = vscode.Uri.parse('TodoList:TodoList.todolist');
        context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('TodoList', this));

		this.cursorType = vscode.window.createTextEditorDecorationType({
			'light': {
				'backgroundColor': 'rgba(255, 0, 0, 1.0)'
			},
			'dark': {
				'backgroundColor': 'rgba(255, 0, 0, 1.0)'
			}
		});
		this.text = '';
		vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'todolist') {
				return;
			}
			if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
				return;
			}
			const position = editor.selection.active;
			const line = position.line;
			if (line < 2) {
				return;
			}
			const column = position.character;
            /*
			this.date.setFullYear(this.baseDate.getFullYear());
			let monthIndex = Math.trunc(column / (2 * 7 + 6 + 5));
			if (monthIndex < 0) {
				monthIndex = 0;
			} else if (monthIndex >= this.numberMonth) {
				monthIndex = this.numberMonth - 1;
			}
			const prevMonth = Math.trunc(this.numberMonth / 2);
			const month = this.baseDate.getMonth() - prevMonth + monthIndex;
			this.date.setMonth(month);
			let dateIndex = Math.trunc(((column % (2 * 7 + 6 + 5)) - 4) / 3);
			if (dateIndex < 0) {
				dateIndex = 0;
			} else if (dateIndex > 6) {
				dateIndex = 6;
			}
			const date = parseInt(this.calendars[monthIndex][line].trim().split(/\s+/g)[dateIndex]);
			this.date.setDate(date);
            */
			this.regenContent();
		});
	}

	dispose() {
		this._onDidChange.dispose();
	}

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        this.regenContent();
		return this.text;
	}

    formatFilename(fn: string): string {
        if (this.showFilename > 0) {
            let r = `${limitLenRight(`${parse(fn).name}: `, this.showFilename)} `;
            if (r.indexOf(":") < 0) {
                r =  limitLenRight(r.trim() + ": ", this.showFilename + 1);
            }
            return r;
        }
        return ""
    }

    formatProperty(name: string, len: number, evt): string {
        if (len > 0) {
            if (name in evt.Props) {
                return `${limitLen(evt.Props[name], len)} `
            } else {
                return `${limitLen("", len)} `
            }
        }
        return ""
    }

    /*
    buildFormatString(): string {
        let formatstr = ""
        //formatstr += this.getF(this.showFilename,"filename");
        return formatstr;
        //formatstr += self.GetF(self.showstatus,"status")
        //formatstr += self.GetF(self.showduration,"duration")
        //formatstr += self.GetF(self.showdate,"date")
        //formatstr += self.GetF(self.showtime,"time")
        //formatstr += self.GetF(self.showeffort,"effort")
        //formatstr += self.GetF(self.showafter,"after")
        //formatstr += self.GetF(self.showid,"id")
        //formatstr += self.GetF(self.showassigned,"assigned")
    }
    */

    formatHeadline(): string {
        let r =    `${limitLenRight('Filename',this.showFilename)}${limitLenRight("Status",this.showStatus)} ${limitLenRight("Heading",this.showHeadline)} ${limitLen("Efrt",5)}\n`
        return r + `${limitLenRight('--------',this.showFilename)}${limitLenRight("------",this.showStatus)} ${limitLenRight("-------",this.showHeadline)} ${limitLen("----",5)}`
    }

    formatContent(evt): string {
        return `${this.formatFilename(evt.Filename)}${limitLenRight(evt.Status,this.showStatus)} ${limitLenRight(evt.Headline, this.showHeadline)} ${this.formatProperty('EFFORT',5,evt)}\n`
    }

	async regenContent() {
        try {
        if (this.page) {
            let query = this.cfg['query'];
            let data = await ODb.query(query);
            if (data !== null) {
                this.text = `QUERY:  ${query}\n\n`;
                this.text += `${this.formatHeadline()}\n`;
                for (var evt of data) {
                    if (evt && evt.Headline) {
                        this.text += this.formatContent(evt)
                    }
                }
            } else {
                this.text = "ERROR: Unable to query data for todolist..."
            }
        } else {
            console.log("NOTHING");
        }
        } catch(eh) {
            console.log("EXCEPTION: ", eh);
        }
	}

    async open(name: string): Promise<boolean> {
        let configs = Sets.todoConfigs;
        this.cfg = null;
        if (name in configs) {
            this.cfg = configs[name];
        } else {
            return false;
        }

        this.page = new Page();
        await this.page.create(this.uri);
        await this.regenContent();
        await this.page.show();
		await this.redraw();

        return Promise.resolve(true);
	}


	async redraw() {
        this._onDidChange.fire(this.uri);
	}
}


async function selectTodoView(): Promise<string | undefined> {
    let configs = Sets.todoConfigs;
    let names = [];
    Object.entries(configs).forEach( ([key,value]) => names.push(key));
    return vscode.window.showQuickPick(names);
}

export async function chooseTodoView(doc: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    await ODb.get();
    let todoName = await selectTodoView();
    if (todoName !== undefined) {
        await OrgExtension.get().showTodoList(todoName);
    }
}