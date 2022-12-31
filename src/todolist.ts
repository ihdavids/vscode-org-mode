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

	async regenContent() {
        if (this.page.ok) {
            let data = await ODb.query(this.cfg['query']);
            console.log(data);
        }
        /*
		if (this.page.ok) {
			const position = this.getPosition(this.date);
            if (position) {
                this.page.moveToPos(position);
			    const range = new vscode.Range(position.line, position.character, position.line, position.character + 2);
			    this.page.setDecorations(this.cursorType, [range]);
            }
        }
        */
	}

    /*
    regenCalendars(resetBaseDate: boolean = true) {
		if (this.calendars === null || this.calendars.length <= 0 || this.findMonth(this.date) < 0) {
            if (resetBaseDate) {
			    this.baseDate = this.date;
            }
			const year    = this.baseDate.getFullYear();
			const month   = this.date.getMonth();
			this.genCalendars(new Date(year, month, 1), this.numberMonth);
        }
    }
    */

/*
	async openCalendarPage() {
        this.page = new Page();
        await this.page.create(this.uri);
        await this.page.show();
        this.regenCalendars();
		await this.redraw();
		this.showCurrDate();
	}

	async goDate(date: number) {
		this.date = new Date(this.date.getTime() + date * 24 * 60 * 60 * 1000);
        this.regenCalendars(false);
		await this.redraw();
		this.showCurrDate();
        this.onChanged.trigger(this, this.date);
	}

	async setDate(dt: Date) {
        if (dt !== this.date) {
		    this.date = dt;
            this.regenCalendars();
		    await this.redraw();
		    this.showCurrDate();
        }
	}
*/

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
        await this.page.show();
        this.regenContent();
		await this.redraw();


        /*
        //Capture state before opening calendar so we can return it!
        this.effector = new CalendarEffector(mode);
        // Set context so keybindings will work now.
        await vscode.commands.executeCommand('setContext', 'hasOrgCalFocus', true);
        // Open up the page with the calendar on it!
		await this.openCalendarPage();
        //vscode.window.showInputBox();
        let box = vscode.window.createInputBox();
        box.onDidChangeValue((strLine: string) => {
            let dt = OrgDuration.parse(strLine);
            if(dt && dt.mins > 0) {
                let cdate: Date = new Date();
                this.setDate(cdate.addDuration(dt));
            } else {
                let sd = Datetime.parseDateTime(strLine);
                if (sd && sd.year !== undefined) {
                    let d = Datetime.simpleDateTimeToDate(sd);
                    if (d) {
                        this.setDate(d);
                    }
                }
            }
            //console.log(strLine);
        })
        box.ignoreFocusOut = true;
       
        this.onChanged.on((cal,dt) => {
            box.value = Datetime.dateToRawString(dt,Datetime.hasTime(box.value));
        });
        const curDate = this.getDate();
        box.value = curDate.toISOString().slice(0, 10);
        const promise = new Promise<[Date|undefined,boolean]>((resolve, reject) =>{
        let accept = false;
        box.onDidAccept(() => {
            accept = true;
            box.hide();
        })
        box.onDidHide(async () => {
            await vscode.commands.executeCommand('setContext', 'hasOrgCalFocus', false);
            let calVal: Date | undefined = undefined;
            if (accept) {
                calVal = this.date;    
            }
            await this.page.close();
            resolve([calVal, accept]);
        });
        box.show();
        });
        const [calVal, ok] = await promise;

        const state = new CalendarState(this, ok);
        */
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
    let todoName = await selectTodoView();
    if (todoName !== undefined) {
        await OrgExtension.get().showTodoList(todoName);
    }
}