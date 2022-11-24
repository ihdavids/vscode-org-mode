
import { parse } from 'path';
import * as vscode from 'vscode';
import { Page } from "./page";
import { Signal } from "./signal";
import * as Util from './utils';
import * as CC from './cursor-context';
import { OrgDuration } from './duration';
import './duration';
import * as Datetime from './simple-datetime';

export enum CalendarMode {
	none = 'none',
    timestamp = "",
	schedule = 'SCHEDULED: ',
	deadline = 'DEADLINE: '
}

export class CalendarEffector {
    public editor: vscode.TextEditor;
    public pos: vscode.Position;
    public document: vscode.TextDocument;
    public line: string;
    public node: CC.INodeData;
    public mode: CalendarMode;

    get ok() {
        return this.editor && this.node;
    }

    constructor(mode: CalendarMode) {
        this.editor = vscode.window.activeTextEditor;
		if (!this.editor) {
			return;
		}
		this.pos      = this.editor.selection.active;

        this.document = Util.getActiveTextEditorEdit();
        this.line     = Util.getLine(this.document, this.pos);
		this.node     = CC.getNodeContext(this.pos, this.document);
		if (!this.node) {
            return;
		}
		this.mode = mode;
    }
}

export class CalendarState {
    public effector:  CalendarEffector;
    public date:      Date;
    public ok:        boolean;
    constructor(cal: Calendar, ok: boolean) {
        this.effector  = cal.effector;
        this.ok        = ok;
        this.date      = cal.getDate();
    }

    public async writeToEditor() {
        // This is annoying, I would rather use the editor we got from the effector
        // but it seems it got closed?
        if (!this.ok) {
            return;
        }
        if (!this.effector.ok) {
            // console.log("EFFECTOR NOT SETUP ABORT!");
            return;
        }
        this.effector.editor = vscode.window.activeTextEditor;
		let line = this.effector.node.line + 1;
		let column = 0;
		let length = 0;
        let didDelete = false;
        let delLine = -1;
        if (this.effector.node.scheduled && this.effector.mode === CalendarMode.schedule) {
            delLine = this.effector.node.scheduled.range.start.line;
			await this.effector.editor.edit((editBuilder) => {
				editBuilder.delete(this.effector.node.scheduled.range);
			});
            didDelete = true;
        }
        if (this.effector.node.timestamp && this.effector.mode === CalendarMode.timestamp) {
            delLine = this.effector.node.timestamp.range.start.line;
			await this.effector.editor.edit((editBuilder) => {
				editBuilder.delete(this.effector.node.timestamp.range);
			});
            didDelete = true;
        }
        if (this.effector.node.deadline && this.effector.mode === CalendarMode.deadline) {
            delLine = this.effector.node.deadline.range.start.line;
			await this.effector.editor.edit((editBuilder) => {
				editBuilder.delete(this.effector.node.deadline.range);
			});
            didDelete = true;
        }
        let idt = 0;
        let numStars = this.effector.node.info;
        idt = numStars + 1;
        let prefix = "";
        // Insert newline if required.
        if (!didDelete) {
			await this.effector.editor.edit((editBuilder) => {
                let indent = " ".repeat(idt);
				editBuilder.insert(new vscode.Position(line, 0), indent + '\n');
			});
        } else {
            prefix = " ".repeat(idt);
            idt = 0;
        }
		// insert new date
		const space = (this.effector.document.lineAt(line).text.length > 0) ? ' ' : '';
        const tlines = this.effector.node.range.end.line - this.effector.node.range.start.line
        const newline = tlines > 2 && (didDelete && delLine != line) ? '\n' : '';

        var tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
        var tdate = (new Date(this.date.getTime() - tzoffset));
		const text = prefix + this.effector.mode + '<' + tdate.toISOString().slice(0, 10) + ' ' + tdate.toLocaleString('en-US', { weekday: 'short' }) + '>' + space + newline;
		await this.effector.editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(line, idt), text);
		});
    }
}

export class Calendar implements vscode.TextDocumentContentProvider {
    private page: Page;
	//private config: Config;
	private numberMonth: number;
	private cursorType: vscode.TextEditorDecorationType;

	private baseDate: Date;
	private date: Date;
	private calendars: string[][];
	private text: string;
    private uri: vscode.Uri;

	private editor: vscode.TextEditor | undefined;
    public effector: CalendarEffector;

	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

	public get onDidChange() {
		return this._onDidChange.event;
    }

    private readonly _onDone    = new Signal<Calendar, CalendarState>();
    private readonly _onChanged = new Signal<Calendar, Date>();

    onEnterHandler() {
        const state = new CalendarState(this, true);
        this._onDone.trigger(this, state);
    }

    onEscapeHandler() {
        const state = new CalendarState(this, false);
        this._onDone.trigger(this, state);
    }

    get onDone() {
        return this._onDone;
    }
    get onChanged() {
        return this._onChanged;
    }

	constructor(context: vscode.ExtensionContext) {

	    context.subscriptions.push(vscode.commands.registerCommand('org.calendar.prevDate', () => this.goDate(-1)));
	    context.subscriptions.push(vscode.commands.registerCommand('org.calendar.nextDate', () => this.goDate(1)));
	    context.subscriptions.push(vscode.commands.registerCommand('org.calendar.prevWeek', () => this.goDate(-7)));
	    context.subscriptions.push(vscode.commands.registerCommand('org.calendar.nextWeek', () => this.goDate(7)));
	    context.subscriptions.push(vscode.commands.registerCommand('org.calendar.setDate', async () => this.onEnterHandler()));

		this.uri = vscode.Uri.parse('Calendar:Calendar.calendar');
        context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('Calendar', this));

		//this.config = Config.getInstance();
		this.numberMonth = 3;//this.config.get('number.of.month');
		this.cursorType = vscode.window.createTextEditorDecorationType({
			'light': {
				'backgroundColor': 'rgba(255, 0, 0, 1.0)'
			},
			'dark': {
				'backgroundColor': 'rgba(255, 0, 0, 1.0)'
			}
		});
		this.baseDate = new Date();
		this.date = new Date();
		this.calendars = [];
		this.text = '';
		vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'calendar') {
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
			this.showCurrDate();
		});
	}

	dispose() {
		this._onDidChange.dispose();
	}

	private static dayName = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	private getDay(day: number): string {
		return Calendar.dayName[day % Calendar.dayName.length];
	}

	private getCalendar(date: Date): string[] {
		const year = date.getFullYear();
		const month = date.getMonth();
		const monthName = date.toLocaleString('en-US', { month: 'long' });
		date.setDate(1);
		const day = date.getDay();
		date.setMonth(month + 1);
		date.setDate(0);
		const lastDate = date.getDate();
		const calendar: string[] = [];
		let i: number;
		let text: string;
		let count: number;

		// title
		const monthWidth = 2 * 7 + 6;
		const titleLength = monthName.length + 5;
		const prevSpace = Math.trunc((monthWidth - titleLength) / 2);
		const nextSpace = monthWidth - titleLength - prevSpace;
		calendar.push(' ' + ' '.repeat(prevSpace) + monthName + ' ' + year.toString() + ' '.repeat(nextSpace));

		// day
		text = ''
		for (i = 0; i < 7; i++) {
			text += (' ' + this.getDay(i));
		}
		calendar.push(text);

		// date
		text = '';
		count = 0;
		for (i = 0; i < day; i++) {
			text += '   ';
			count++;
		}
		for (i = 1; i <= lastDate; i++) {
			text += (' ' + i.toString().padStart(2));
			count++;
			if (count % 7 == 0) {
				calendar.push(text);
				text = '';
			}
		}
		while (count % 7 != 0) {
			text += '   ';
			count++;
		}
		if (text.length > 0) {
			calendar.push(text);
		}

		return calendar;
	}

	private getCalendars(date: Date, count: number): string {
		const year = date.getFullYear();
		const month = date.getMonth();
		let i, l: number;
		let maxLine = 0;
		let text = '';

		const prevMonth = Math.trunc(this.numberMonth / 2);
		for (i = 0; i < this.numberMonth; i++) {
			let cyear = year;
			let cmonth = month - prevMonth + i;
			if (cmonth < 0) {
				cyear = year - 1;
				cmonth = 12 + cmonth;
			}
			if (cmonth >= 12) {
				cyear = year + 1;
				cmonth = cmonth - 12;
			}
			const date = new Date(cyear, cmonth, 1);
			const calendar = this.getCalendar(date);
			if (calendar.length > maxLine) {
				maxLine = calendar.length;
			}
			this.calendars.push(calendar);
		}

		for (l = 0; l < maxLine; l++) {
			for (i = 0; i < this.calendars.length; i++) {
				const currLine = (l >= this.calendars[i].length) ? ' '.repeat(1 + 2 * 7 + 6) : this.calendars[i][l];
				text += (' '.repeat(4) + currLine);
			}
			text += '\n';
		}

		return text;
	}

	private genCalendars(date: Date, count: number) {
		this.baseDate = date;
		this.calendars = [];
		this.text = this.getCalendars(date, count);
	}


    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
	//provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
		if (this.text.length == 0) {
			this.genCalendars(new Date(), this.numberMonth);
		} else {
            this.regenCalendars(false);
        }
		return this.text;
	}

	private findMonth(date: Date): number {
		const year = date.getFullYear();
		let i;
		for (i = 0; i < this.calendars.length; i++) {
			let mname = date.toLocaleString('en-US', { month: 'long' });
			let idx   = mname + ' ' + year.toString();
			if (this.calendars[i][0].includes(idx)) {
				return i;
			}
		}
		return -1;
	}

	private findWeek(date: Date, monthIndex: number): number {
		let i;
        if (this.calendars !== null && this.calendars.length > 0) {
		    for (i = 2; i < this.calendars[monthIndex].length; i++) {
			    if (this.calendars[monthIndex][i].split(' ').includes(date.getDate().toString())) {
				    return i;
			    }
		    }
        }
		return -1;
	}

	private getPosition(date: Date | undefined = undefined): vscode.Position {
		if (date) {
			this.date = date;
		} else {
			date = this.date;
		}
		let monthIndex = this.findMonth(date);
		let weekIndex = this.findWeek(date, monthIndex);
		let dayIndex = date.getDay();
        if (monthIndex < 0 || weekIndex < 0 || dayIndex < 0) {
		    return null;
        } else {
		    return new vscode.Position(weekIndex, (5 + (2 * 7) + 6) * monthIndex + 5 + (3 * dayIndex));
        }
	}

	private showCurrDate() {
		if (this.page.ok) {
			const position = this.getPosition(this.date);
            if (position) {
                this.page.moveToPos(position);
			    const range = new vscode.Range(position.line, position.character, position.line, position.character + 2);
			    this.page.setDecorations(this.cursorType, [range]);
            }
		}
	}

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


    async openCalendarEditor(mode: CalendarMode): Promise<CalendarState> {
        // Capture state before opening calendar so we can return it!
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
        return Promise.resolve(state);
	}


	async redraw() {
        this._onDidChange.fire(this.uri);
	}

	getDate(): Date {
		return this.date;
	}
}

