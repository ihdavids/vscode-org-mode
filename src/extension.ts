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

export function activate(context: vscode.ExtensionContext) {
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

    context.subscriptions.push(addDwimCmd);
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
}

// tslint:disable-next-line:no-empty
export function deactivate() {}
