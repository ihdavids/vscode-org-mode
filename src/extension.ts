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
import { Calendar, CalendarMode } from './calendar';
import { TodoList, chooseTodoView } from './todolist';
import { CapturePage, createJira } from './capture';
import { dynamicEvalText, showFunctionNames } from './execb';
import { getRandomTableRow } from './exectable';
import {ODb} from "./db"
import { Auth } from './auth';
import { WorgPanel, WORG_VIEWS, worgCommand } from './worg';


import { Parser } from './parser';
import { Decoration } from './decorations';
import { Sets } from './sets';
import { jumpToMarker, setMarker } from './marker';
import { activateTableExtension } from "./tables/commands"
import { activateTableView } from "./tables/view"
import { activateOutline } from "./outline/commands"
import { activateLinks } from "./links/providers"
import { activateCompletion } from "./completion"
import { activateBlocks } from "./blocks"
import { activateRefile } from "./refile"
import { activateTime } from "./time"
import { activateExport } from "./export"
import { activateOrgsTools } from "./orgs-tools"
import { activateAgendaView } from "./agenda-view"
import { activateMenu } from "./menu"
import { settled } from "./org-files"
import { activatePreview } from "./preview"
import { activateNarrow } from "./narrow"
import { activateStats } from "./stats"
import { activateColumns } from "./columns"
import { activateClockView } from "./clock-view"
import { activatePomodoro } from "./pomodoro"
import { activateMediaPanel } from "./media-panel"
import { activateFootnotes } from "./footnotes"
import { activateQuickCapture } from "./quick-capture"
import { activateConnection } from "./connection"
import { activateWalkthrough } from "./walkthrough"
import * as tt from "./tables/context"
import {Decorator} from './decorations/decorator';
import { convertToLatex } from './export_latex';

export class OrgExtension {
    private static instance: OrgExtension;

    context: vscode.ExtensionContext;    
    todolist: TodoList<boolean>;
    calendar: Calendar;
    capPage: CapturePage;
    parser: Parser;
    decore: Decoration;
    private updateTimer: NodeJS.Timeout | undefined;
    tableContext: tt.Context;

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
        Sets.get().init();
        this.context  = context;
		this.calendar = new Calendar(context);
        this.todolist = new TodoList<boolean>(context);
        this.parser   = new Parser();
        this.decore   = new Decoration();
		this.capPage  = new CapturePage(context);

        // Table mode needs no status item of its own: in a table, the cell's
        // reference shows (tables/view.ts), and says when table keys are off.
        this.tableContext = new tt.Context(tt.ContextType.TableMode, "Table Mode");
    }

    async timestamp(mode: CalendarMode): Promise<void> {
        const x = await this.calendar.openCalendarEditor(mode);
        await x.writeToEditor(this.calendar.hasTimestamp());
        return Promise.resolve();
    }

    async capture(): Promise<void> {
        const x = await this.capPage.openCaptureEditor();
        //await x.writeToEditor(this.calendar.hasTimestamp());
        return Promise.resolve();
    }

    // The server rewrites the file the way org writes it.
    async reformat(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || (editor.document.isDirty && !await editor.document.save())) {
            return;
        }
        const res: any = await odb.ODb.reformat(editor.document.fileName);
        if (!res || !res.Ok) {
            vscode.window.showErrorMessage('Could not reformat: ' + (res && res.Msg || 'the orgs server did not answer'));
            return;
        }
        await settled([editor.document.fileName]);
    }

	dispose(): void {
		this.stopUpdate();
		this.decore.dispose();
	}

	// Pretty-print the active file. Typing sends a burst of these; only the
	// last, a moment after the burst, does the work.
	private decorateTimer: NodeJS.Timeout | undefined;
	async update(delay: number = 40): Promise<void> {
		if (this.decorateTimer) {
			clearTimeout(this.decorateTimer);
		}
		this.decorateTimer = setTimeout(() => {
			this.decorateTimer = undefined;
			if (this.decore) {
				this.decore.updateDecorations();
			}
		}, delay);
	}

    public async showTodoList(name: string) {
        await this.todolist.open(name);
    }

    public getTodoList(): TodoList<boolean> {
        return this.todolist;
    }

	startUpdate(): void {
		const delay: number = Sets.decoreUpdate;
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = undefined;
		}
		this.updateTimer = setTimeout(() => this.update(), delay);
	}

	stopUpdate(): void {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = undefined;
		}
	}
} 
export function activate(context: vscode.ExtensionContext) {
    Auth.get().init(context);
    OrgExtension.get().activate(context);

    vscode.commands.executeCommand('setContext', 'hasMyFocus', false);
    const insertHeadingRespectContentCmd = vscode.commands.registerTextEditorCommand('org.insertHeadingRespectContent', HeaderFunctions.insertHeadingRespectContent);
    const insertChildCmd = vscode.commands.registerTextEditorCommand('org.insertSubheading', HeaderFunctions.insertChild);
    const demoteLineCmd = vscode.commands.registerTextEditorCommand('org.doDemote', HeaderFunctions.demoteLine);
    const promoteLineCmd = vscode.commands.registerTextEditorCommand('org.doPromote', HeaderFunctions.promoteLine);
    const insertTagCmd = vscode.commands.registerTextEditorCommand('org.insertTag', HeaderFunctions.insertTagCommand);

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('org.insertProjectTag',  HeaderFunctions.insertProjectTagCommand));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('org.insertWorkTag',  HeaderFunctions.insertWorkTagCommand));

    const promoteSubtreeCmd = vscode.commands.registerTextEditorCommand('org.promoteSubtree', SubtreeFunctions.promoteSubtree);
    const demoteSubtreeCmd = vscode.commands.registerTextEditorCommand('org.demoteSubtree', SubtreeFunctions.demoteSubtree);
    const selectNodeCmd = vscode.commands.registerTextEditorCommand('org.selectNode', SubtreeFunctions.selectNode);

    const insertTimestampCmd = vscode.commands.registerTextEditorCommand('org.timestamp', TimestampFunctions.insertTimestamp);
    const clockInCmd = vscode.commands.registerCommand('org.clockin', () => vscode.window.activeTextEditor && TimestampFunctions.clockIn(vscode.window.activeTextEditor, undefined));
    const clockOutCmd = vscode.commands.registerCommand('org.clockout', () => TimestampFunctions.clockOut(vscode.window.activeTextEditor, undefined));
    const clockActiveCmd = vscode.commands.registerTextEditorCommand('org.clockactive', TimestampFunctions.clockActive);
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
    const updateEffortPropertyCmd = vscode.commands.registerTextEditorCommand('org.updateEffortProperty', props.updateEffortPropertyCommand);
    const tablHandlerCmd = vscode.commands.registerTextEditorCommand('org.tabHandler', folding.tabHandler);

    // The agenda is worg's unless the classic one is asked for.
    const showAgendaCmd = vscode.commands.registerCommand('org.showAgenda', async () => {
        if (Sets.agendaView === 'classic' && vscode.window.activeTextEditor) {
            return agenda.showAgenda(vscode.window.activeTextEditor);
        }
        return WorgPanel.show('Agenda');
    });
    // Every other worg view, one command each, straight from the palette.
    for (const v of WORG_VIEWS.filter(v => v.app !== 'Agenda')) {
        context.subscriptions.push(vscode.commands.registerCommand(worgCommand(v.app), async () => WorgPanel.show(v.app)));
    }
    const connectToOrgsCmd = vscode.commands.registerTextEditorCommand('org.connectToOrgs', odb.connectToOrgs);
    context.subscriptions.push(vscode.commands.registerCommand('org.login', async () => await Auth.get().ensureLoggedIn()));
    context.subscriptions.push(vscode.commands.registerCommand('org.logout', async () => { await Auth.get().logout(); vscode.window.showInformationMessage('Logged out of Orgs server.'); }));

    const showDayPageCmd = vscode.commands.registerTextEditorCommand('org.showDayPageToday', daypage.showDayPageToday);
    const prevDayPageCmd = vscode.commands.registerTextEditorCommand('org.prevDayPage', daypage.prevDayPage);
    const nextDayPageCmd = vscode.commands.registerTextEditorCommand('org.nextDayPage', daypage.nextDayPage);
	context.subscriptions.push(vscode.commands.registerCommand('org.scheduleNode',  async () => OrgExtension.get().timestamp(CalendarMode.schedule)));
	context.subscriptions.push(vscode.commands.registerCommand('org.deadlineNode',  async () => OrgExtension.get().timestamp(CalendarMode.deadline)));
	context.subscriptions.push(vscode.commands.registerCommand('org.timestampNode', async () => OrgExtension.get().timestamp(CalendarMode.timestamp)));
	context.subscriptions.push(vscode.commands.registerCommand('org.chooseTodo', HeaderFunctions.chooseAndChangeTodo));
	context.subscriptions.push(vscode.commands.registerCommand('org.chooseTodoView', chooseTodoView));
	context.subscriptions.push(vscode.commands.registerCommand('org.capture', async () => OrgExtension.get().capture()));
	context.subscriptions.push(vscode.commands.registerCommand('org.reformat', async () => OrgExtension.get().reformat()));
	context.subscriptions.push(vscode.commands.registerCommand('org.setMarker', async () => await setMarker()));
	context.subscriptions.push(vscode.commands.registerCommand('org.jumpToMarker', async () => await jumpToMarker()));
	context.subscriptions.push(vscode.commands.registerCommand('org.createJira', async () => await createJira()));
	context.subscriptions.push(vscode.commands.registerCommand('org.dynamicEval', async () => await dynamicEvalText()));
	context.subscriptions.push(vscode.commands.registerCommand('org.showFunctionNames', async () => await showFunctionNames()));
    context.subscriptions.push(vscode.commands.registerCommand('org.randomTableRow', async () => await getRandomTableRow()))
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('org.latexExport', convertToLatex));
    context.subscriptions.push(nextDayPageCmd);
    context.subscriptions.push(prevDayPageCmd);
    context.subscriptions.push(showDayPageCmd);
    context.subscriptions.push(showAgendaCmd);
    context.subscriptions.push(connectToOrgsCmd);
    context.subscriptions.push(tablHandlerCmd);
    context.subscriptions.push(insertPropertyDrawerCmd);
    context.subscriptions.push(insertLogbookDrawerCmd);
    context.subscriptions.push(insertPropertyCmd);
    context.subscriptions.push(updateEffortPropertyCmd);
    context.subscriptions.push(insertTagCmd);

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
    context.subscriptions.push(selectNodeCmd);

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

    // Clocking commands
    context.subscriptions.push(clockInCmd);
    context.subscriptions.push(clockOutCmd);
    context.subscriptions.push(clockActiveCmd);
    context.subscriptions.push(updateClockCmd);

    activateTableExtension(context);
    activateTableView(context, OrgExtension.get().tableContext);
    activateOutline(context);
    activateLinks(context);
    activateCompletion(context);
    activateBlocks(context);
    activateRefile(context);
    activateTime(context);
    activateExport(context);
    activateOrgsTools(context);
    activateAgendaView(context);
    activateMenu(context);
    activatePreview(context);
    activateNarrow(context);
    activateStats(context);
    activateColumns(context);
    activateClockView(context);
    activatePomodoro(context);
    activateMediaPanel(context);
    activateFootnotes(context);
    activateQuickCapture(context);
    activateConnection(context);
    activateWalkthrough(context);

    const provider = new OrgFoldingAndOutlineProvider();
    vscode.languages.registerFoldingRangeProvider('org', provider);
    vscode.languages.registerDocumentSymbolProvider('org', provider);
    vscode.workspace.onDidOpenTextDocument(folding.autoFold);
    vscode.workspace.onDidSaveTextDocument(folding.autoFold);

    		// open new document
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && editor.document.languageId === 'org') {
				OrgExtension.get().update(0);
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

        vscode.workspace.onDidChangeConfiguration( () => {
            Decorator.init();
            Decorator.decorate(undefined, true);
        });

		// current document
		if (vscode.window.activeTextEditor) {
			const editor = vscode.window.activeTextEditor;
			if (editor.document.languageId === 'org') {
				OrgExtension.get().update();
			}
		}

        Decorator.init();
        Decorator.decorate();
}

// tslint:disable-next-line:no-empty
export function deactivate() {}


