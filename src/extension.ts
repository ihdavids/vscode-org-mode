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
import { Calendar, CalendarMode } from './calendar';


import { Parser } from './parser';
import { Decoration } from './decorations';
import { Sets } from './sets';


export class OrgExtension {
    private static instance: OrgExtension;

    context: vscode.ExtensionContext;    
    calendar: Calendar;
    parser: Parser;
    decore: Decoration;
    private updateTimer: NodeJS.Timer | undefined;

    constructor()
    {
        this.startUpdate();
    }

    public static get(): OrgExtension
    {
        if (!OrgExtension.instance) {
            OrgExtension.instance = new OrgExtension();
        }
        return OrgExtension.instance;
    } 

    public activate(context: vscode.ExtensionContext) {
        this.context  = context;
		this.calendar = new Calendar(context);
        this.parser   = new Parser();
        this.decore   = new Decoration(this.parser);
    }

    async timestamp(mode: CalendarMode): Promise<void> {
        let x = await this.calendar.openCalendarEditor(mode);
        await x.writeToEditor();
        return Promise.resolve();
    }

	dispose(): void {
		this.stopUpdate();
		this.decore.dispose();
	}

	async update(): Promise<void> {
		await this.parser.parse();
        console.log("UPDATE ATTEMPT");
		this.decore.updateDecorations();
	}

	startUpdate(): void {
		const delay: number = Sets.decoreUpdate;
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = undefined;
		}
		this.updateTimer = setTimeout(this.update, delay, this);
	}

	stopUpdate(): void {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = undefined;
		}
	}
} 

export async function doDecorations(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
    //OrgExtension.get().parser.parse();
	//OrgExtension.get().decore.updateDecorations();
}
export function activate(context: vscode.ExtensionContext) {
    OrgExtension.get().activate(context);

    vscode.commands.executeCommand('setContext', 'hasMyFocus', false);
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
	context.subscriptions.push(vscode.commands.registerCommand('org.scheduleNode',  async () => OrgExtension.get().timestamp(CalendarMode.schedule)));
	context.subscriptions.push(vscode.commands.registerCommand('org.deadlineNode',  async () => OrgExtension.get().timestamp(CalendarMode.deadline)));
	context.subscriptions.push(vscode.commands.registerCommand('org.timestampNode', async () => OrgExtension.get().timestamp(CalendarMode.timestamp)));
	context.subscriptions.push(vscode.commands.registerCommand('org.chooseTodo', HeaderFunctions.chooseAndChangeTodo));
	context.subscriptions.push(vscode.commands.registerCommand('org.decoreTemp', doDecorations));

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

    		// open new document
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && editor.document.languageId === 'org') {
				OrgExtension.get().update();
			}
		}, null, context.subscriptions);

		// modify current document
		vscode.workspace.onDidChangeTextDocument(event => {
			const editor = vscode.window.activeTextEditor;
			if (editor && event.document === editor.document &&
				editor.document.languageId === 'org') {
					OrgExtension.get().update();
			}
		}, null, context.subscriptions);

		// current document
		if (vscode.window.activeTextEditor) {
			const editor = vscode.window.activeTextEditor;
			if (editor.document.languageId === 'org') {
				OrgExtension.get().update();
			}
		}
}

// tslint:disable-next-line:no-empty
export function deactivate() {}


