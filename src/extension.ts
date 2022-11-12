'use strict';
import * as vscode from 'vscode';
import * as HeaderFunctions from './header-functions';
import * as MarkupFunctions from './markup-functions';
import {
    decrementContext,
    incrementContext
} from './modify-context';
import { OrgFoldingAndOutlineProvider } from './org-folding-and-outline-provider';
import * as PascuaneseFunctions from './pascuanese-functions';
import * as SubtreeFunctions from './subtree-functions';
import * as TimestampFunctions from './timestamp-functions';
import * as checkbox from './checkbox';
import * as list from './lists';
import * as dwim from './dwim';
import * as props from './properties';
import * as folding from './folding';
import * as agenda from './agenda';
import * as daypage from './daypage';
import * as odb from './db';
import * as Util from './utils';
import * as CC from './cursor-context';
import { Calendar } from './calendar';
enum CalendarMode {
	none = 'none',
    timestamp = "",
	schedule = 'SCHEDULED: ',
	deadline = 'DEADLINE: '
}
export class OrgExtension {
    private static instance: OrgExtension;

    context: vscode.ExtensionContext;    
    calendar: Calendar;

    private calendarMode: CalendarMode;
    private calendarEditor;
    private calendarHead: CC.INodeData;
    constructor()
    {
    }

    public static get(): OrgExtension
    {
        if (!OrgExtension.instance) {
            OrgExtension.instance = new OrgExtension();
        }
        return OrgExtension.instance;
    } 

    public activate(context: vscode.ExtensionContext) {
        this.context = context;
		this.calendar = new Calendar(context);
	    context.subscriptions.push(vscode.commands.registerCommand('org.calendar.setDate', async () => OrgExtension.get().setDate()));
		this.calendarMode = CalendarMode.none;
    }

    async openCalendar(mode: CalendarMode): Promise<void> {
		this.calendarEditor = vscode.window.activeTextEditor;
		if (!this.calendarEditor) {
			return Promise.resolve();
		}
		const position = this.calendarEditor.selection.active;

        const document = Util.getActiveTextEditorEdit();
        const cursorPos = Util.getCursorPosition();
        const curLine = Util.getLine(document, cursorPos);
		this.calendarHead = CC.getNodeContext(position, document);
		if (!this.calendarHead) {
			return Promise.resolve();
		}
		this.calendarMode = mode;
		await this.calendar.openCalendar();
		return Promise.resolve();
	}

	async setDate(): Promise<void> {
		const date = this.calendar.getDate();
        console.log("GET DATE: ", date);
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		if (!this.calendarEditor || !this.calendarHead || this.calendarMode == CalendarMode.none) {
			return Promise.resolve();
		}
		const editor = vscode.window.activeTextEditor;
		let line = this.calendarHead.line + 1;

		let column = 0;
		let length = 0;
        let didDelete = false;
        if (this.calendarHead.scheduled && this.calendarMode === CalendarMode.schedule) {
			await editor.edit((editBuilder) => {
				editBuilder.delete(this.calendarHead.scheduled.range);
			});
            didDelete = true;

        }
        if (this.calendarHead.timestamp && this.calendarMode === CalendarMode.timestamp) {
			await editor.edit((editBuilder) => {
				editBuilder.delete(this.calendarHead.timestamp.range);
			});
            didDelete = true;

        }
        if (this.calendarHead.deadline && this.calendarMode === CalendarMode.deadline) {
			await editor.edit((editBuilder) => {
				editBuilder.delete(this.calendarHead.deadline.range);
			});
            didDelete = true;
        }
        // Insert newline if required.
        if (!didDelete) {
			await editor.edit((editBuilder) => {
				editBuilder.insert(new vscode.Position(line, 0), '\n');
			});
        }
            /*
		} else {
			// remove previous date
			if (this.calendarMode == CalendarMode.schedule && this.calendarHead.scheduleColumn >= 0) {
				column = this.calendarHead.scheduleColumn;
				length = this.calendarHead.schedule.length;
			} else if (this.calendarMode == CalendarMode.deadline && this.calendarHead.deadlineColumn >= 0) {
				column = this.calendarHead.deadlineColumn;
				length = this.calendarHead.deadline.length;
			}
			if (length > 0) {
				await editor.edit((editBuilder) => {
					editBuilder.delete(new vscode.Range(line, column, line, column + length));
				});
			}
			// remove white space
			const dateLine = editor.document.lineAt(line);
			const regex = /(^\s+|\s+$)/g;
			let match;
			let range: vscode.Range | undefined;
			let whiteSpace: vscode.Range[] = [];
			while (match = regex.exec(dateLine.text)) {
				whiteSpace.push(new vscode.Range(line, match.index, line, match.index + match[0].length));
			}
			while (range = whiteSpace.pop()) {
				await editor.edit((editBuilder) => {
					editBuilder.delete(range!);
				});
			}
		}
        */
		// insert new date
		const space = (editor.document.lineAt(line).text.length > 0) ? ' ' : '';
		const text = this.calendarMode + '<' + date.toISOString().slice(0, 10) + ' ' + date.toLocaleString('en-US', { weekday: 'short' }) + '>' + space;
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(line, 0), text);
		});
		return Promise.resolve();
	}    
} 

export function activate(context: vscode.ExtensionContext) {
    OrgExtension.get().activate(context);
    const insertHeadingRespectContentCmd = vscode.commands.registerTextEditorCommand('org.insertHeadingRespectContent', HeaderFunctions.insertHeadingRespectContent);
    const insertChildCmd = vscode.commands.registerTextEditorCommand('org.insertSubheading', HeaderFunctions.insertChild);
    const demoteLineCmd = vscode.commands.registerTextEditorCommand('org.doDemote', HeaderFunctions.demoteLine);
    const promoteLineCmd = vscode.commands.registerTextEditorCommand('org.doPromote', HeaderFunctions.promoteLine);
    const promoteSubtreeCmd = vscode.commands.registerTextEditorCommand('org.promoteSubtree', SubtreeFunctions.promoteSubtree);
    const demoteSubtreeCmd = vscode.commands.registerTextEditorCommand('org.demoteSubtree', SubtreeFunctions.demoteSubtree);

    const insertTimestampCmd = vscode.commands.registerTextEditorCommand('org.timestamp', TimestampFunctions.insertTimestamp);
    const clockInCmd = vscode.commands.registerTextEditorCommand('org.clockin', TimestampFunctions.clockIn);
    const clockOutCmd = vscode.commands.registerTextEditorCommand('org.clockout', TimestampFunctions.clockOut);
    const updateClockCmd = vscode.commands.registerTextEditorCommand('org.updateclock', TimestampFunctions.updateClock);

    const incrementContextCmd = vscode.commands.registerTextEditorCommand('org.incrementContext', incrementContext);

    const decrementContextCmd = vscode.commands.registerTextEditorCommand('org.decrementContext', decrementContext);

    const boldCmd = vscode.commands.registerTextEditorCommand('org.bold', MarkupFunctions.bold);
    const italicCmd = vscode.commands.registerTextEditorCommand('org.italic', MarkupFunctions.italic);
    const underlineCmd = vscode.commands.registerTextEditorCommand('org.underline', MarkupFunctions.underline);
    const codeCmd = vscode.commands.registerTextEditorCommand('org.code', MarkupFunctions.code);
    const verboseCmd = vscode.commands.registerTextEditorCommand('org.verbose', MarkupFunctions.verbose);
    const literalCmd = vscode.commands.registerTextEditorCommand('org.literal', MarkupFunctions.literal);
    const butterflyCmd = vscode.commands.registerTextEditorCommand('org.butterfly', PascuaneseFunctions.butterfly);
    
    const insertCheckboxCmd = vscode.commands.registerTextEditorCommand('org.insertCheckbox', checkbox.insertCheckboxCommand);
    const insertCheckboxSummaryCmd = vscode.commands.registerTextEditorCommand('org.insertCheckboxSummary', checkbox.insertCheckboxSummaryCommand);
    const toggleCheckboxCmd = vscode.commands.registerTextEditorCommand('org.toggleCheckbox', checkbox.toggleCheckboxCommand);
    const recalcCheckboxSummaryCmd = vscode.commands.registerTextEditorCommand('org.recalcCheckboxSummary', checkbox.recalcCheckboxSummaryCommand);
    const recalcAllCheckboxSummaryCmd = vscode.commands.registerTextEditorCommand('org.recalcAllCheckboxSummaries', checkbox.recalcAllCheckboxSummariesCommand);

    const updateNumberedListCmd = vscode.commands.registerTextEditorCommand('org.updateNumberedList', list.updateNumberedListCommand);
    const appendNumberedListCmd = vscode.commands.registerTextEditorCommand('org.appendNumberedList', list.appendNumberedListCommand);
    
    const addDwimCmd = vscode.commands.registerTextEditorCommand('org.addDoWhatIMean', dwim.addDoWhatIMean);
    const toggleDwimCmd = vscode.commands.registerTextEditorCommand('org.toggleDoWhatIMean', dwim.toggleDoWhatIMean);

    const insertPropertyDrawerCmd = vscode.commands.registerTextEditorCommand('org.insertPropertyDrawer', props.insertPropertyDrawerCommand);
    const insertLogbookDrawerCmd = vscode.commands.registerTextEditorCommand('org.insertLogbookDrawer', props.insertLogbookDrawerCommand);
    const insertPropertyCmd = vscode.commands.registerTextEditorCommand('org.insertProperty', props.insertPropertyCommand);
    const tablHandlerCmd = vscode.commands.registerTextEditorCommand('org.tabHandler', folding.tabHandler);

    const showAgendaCmd = vscode.commands.registerTextEditorCommand('org.showAgenda', agenda.showAgenda);
    const connectToOrgsCmd = vscode.commands.registerTextEditorCommand('org.connectToOrgs', odb.connectToOrgs);

    const showDayPageCmd = vscode.commands.registerTextEditorCommand('org.showDayPageToday', daypage.showDayPageToday);
    const prevDayPageCmd = vscode.commands.registerTextEditorCommand('org.prevDayPage', daypage.prevDayPage);
    const nextDayPageCmd = vscode.commands.registerTextEditorCommand('org.nextDayPage', daypage.nextDayPage);
	context.subscriptions.push(vscode.commands.registerCommand('org.schedule', async (mode: CalendarMode = CalendarMode.timestamp) => OrgExtension.get().openCalendar(mode)));
    context.subscriptions.push(nextDayPageCmd);
    context.subscriptions.push(prevDayPageCmd);
    context.subscriptions.push(showDayPageCmd);
    context.subscriptions.push(showAgendaCmd);
    context.subscriptions.push(connectToOrgsCmd);
    context.subscriptions.push(tablHandlerCmd);
    context.subscriptions.push(insertPropertyDrawerCmd);
    context.subscriptions.push(insertLogbookDrawerCmd);
    context.subscriptions.push(insertPropertyCmd);

    context.subscriptions.push(addDwimCmd);
    context.subscriptions.push(toggleDwimCmd);
    context.subscriptions.push(updateNumberedListCmd);
    context.subscriptions.push(appendNumberedListCmd );

    context.subscriptions.push(insertCheckboxCmd );
    context.subscriptions.push(insertCheckboxSummaryCmd );
    context.subscriptions.push(toggleCheckboxCmd );
    context.subscriptions.push(recalcCheckboxSummaryCmd );
    context.subscriptions.push(recalcAllCheckboxSummaryCmd );

    context.subscriptions.push(insertHeadingRespectContentCmd);
    context.subscriptions.push(insertChildCmd);

    context.subscriptions.push(demoteLineCmd);
    context.subscriptions.push(promoteLineCmd);

    context.subscriptions.push(promoteSubtreeCmd);
    context.subscriptions.push(demoteSubtreeCmd);

    context.subscriptions.push(insertTimestampCmd);
    context.subscriptions.push(incrementContextCmd);
    context.subscriptions.push(decrementContextCmd);

    context.subscriptions.push(boldCmd);
    context.subscriptions.push(italicCmd);
    context.subscriptions.push(underlineCmd);
    context.subscriptions.push(codeCmd);
    context.subscriptions.push(verboseCmd);
    context.subscriptions.push(literalCmd);
    context.subscriptions.push(butterflyCmd);

    const provider = new OrgFoldingAndOutlineProvider();
    vscode.languages.registerFoldingRangeProvider('org', provider);
    vscode.languages.registerDocumentSymbolProvider('org', provider);
    vscode.workspace.onDidOpenTextDocument(folding.autoFold);
    vscode.workspace.onDidSaveTextDocument(folding.autoFold);
}

// tslint:disable-next-line:no-empty
export function deactivate() {}
