
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
	    //context.subscriptions.push(vscode.commands.registerCommand('org.calendar.today',    () => this.setDate(new Date())));
	    // context.subscriptions.push(vscode.commands.registerCommand('org.calendar.toggleTime',  () => this.toggleTime()));
	    // context.subscriptions.push(vscode.commands.registerCommand('org.calendar.prevDate', () => this.goDate(-1)));
	    // context.subscriptions.push(vscode.commands.registerCommand('org.calendar.nextDate', () => this.goDate(1)));
	    // context.subscriptions.push(vscode.commands.registerCommand('org.calendar.prevWeek', () => this.goDate(-7)));
	    // context.subscriptions.push(vscode.commands.registerCommand('org.calendar.nextWeek', () => this.goDate(7)));
	    // context.subscriptions.push(vscode.commands.registerCommand('org.calendar.setDate', async () => this.onEnterHandler()));

		//this.showTime = false;
		this.uri = vscode.Uri.parse('Capture:Capture.capture');
        //context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('Capture', this));

		//this.config = Config.getInstance();
		//this.numberMonth = 3;//this.config.get('number.of.month');
		this.cursorType = vscode.window.createTextEditorDecorationType({
			'light': {
				'backgroundColor': 'rgba(255, 0, 0, 1.0)'
			},
			'dark': {
				'backgroundColor': 'rgba(255, 0, 0, 1.0)'
			}
		});
        /*
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
        */
	}

	dispose() {
		this._onDidChange.dispose();
	}

	//private static dayName = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    /*
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
		this.text += "\n\n==================================\nt - jump to today\nc - toggle clock\n. - next day\n, - prev day\n==================================\n";
	}

*/

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        /*
		if (this.text.length == 0) {
			this.genCalendars(new Date(), this.numberMonth);
		} else {
            this.regenCalendars(false);
        }
		return this.text;
        */
       return "";
	}
/*
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



	async goDate(date: number) {
		this.date = new Date(this.date.getTime() + date * 24 * 60 * 60 * 1000);
        this.regenCalendars(false);
		await this.redraw();
		this.showCurrDate();
        this.onChanged.trigger(this, this.date);
	}

	async setDate(dt: Date, updateTextBox:boolean = true) {
        if (dt !== this.date) {
		    this.date = dt;
            this.regenCalendars();
		    await this.redraw();
		    this.showCurrDate();
			if (updateTextBox) {
        		this.onChanged.trigger(this, this.date);
			}
        }
	}

	async toggleTime() {
		this.box.value = "";
		this.showTime = !this.showTime;
        this.regenCalendars();
		await this.redraw();
		this.showCurrDate();
        this.onChanged.trigger(this, this.date);
	}
*/

    regenCapture(key: string) {
        const temp = Sets.captureTemplates[key];
        this.page.edit((edit) => this.page.editor.insertSnippet(new vscode.SnippetString(temp['snippet'])) );
    }
	async openCapturePage() {
        this.page = new Page();
        await this.page.create();
        await this.page.show();
		await this.redraw();
		//this.showCurrDate();
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

    async rebuildCaptureTemplates(): Promise<any> {
        this.templates = await ODb.captureTemplates();
        let knownTemplates = Sets.captureTemplates;
        let didUpdate = false;
        this.templates.forEach((item) => {
            if (!(item.Name in knownTemplates)) {
                didUpdate = true;
                knownTemplates[item.Name] = {
                    "type":    item.Type,
                    "target":  item.Target,
                    "snippet": this.getCaptureSnippetDefault(item.Type)
                }
            }
        });
        if (didUpdate) {
            Sets.captureTemplates = knownTemplates;
        }
        return this.templates;
    }

    async openCaptureEditor(): Promise<CaptureState> {
        // Capture state before opening calendar so we can return it!
        //this.effector = new CalendarEffector(mode);
        // Set context so keybindings will work now.
        await vscode.commands.executeCommand('setContext', 'hasOrgCapFocus', true);
        // Open up the page with the calendar on it!
		await this.openCapturePage();


        this.templates = await this.rebuildCaptureTemplates();
        let temps: string[] = [];
        this.templates.forEach((item) => { temps.push(item.Name); });
        const templateName = await vscode.window.showQuickPick(temps)
        console.log("RESULTS", templateName);
        this.regenCapture(templateName);
        this.templates.forEach((item) => { if (templateName === item['Name']) { this.template = item; }})
        console.log("Chosen Template", this.template);
        this.page.onWindowsChanged(this.context, (content) => {
			let parser: Parser = new Parser();
			parser.parseFromText(content);
			if (parser.doc && parser.doc.children) {
				const h = parser.doc.children[0];
				const headline = h.getRawHeadline();
				const body = h.data.trim();
				const props = h.properties;
				const tags = h.tags;
				const priority = "";
				ODb.capture(templateName, headline, body, tags, props, priority);
			}
        });

        const state = new CaptureState(this);
        return Promise.resolve(state);
	}

	async closeWindow() {
		this.page.closeEvenIfDirty();
	}

	async redraw() {
        this._onDidChange.fire(this.uri);
	}
/*
	getDate(): Date {
		return this.date;
	}
    */
}
