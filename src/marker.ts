import * as vscode from 'vscode';
import * as Util from './utils';
import {ODb} from "./db"
import { settled } from './org-files';
import { Sets } from './sets';


async function getMarkerName(): Promise<string> {
    const markers = Sets.markers
    if (!markers) {
        return undefined;
    }
    let marker = undefined;
    if (markers.length > 1) {
        marker = await vscode.window.showQuickPick(markers);
    } else {
        marker = markers[0]
    }
    return marker
}

export async function setMarker(): Promise<void> {
    const marker = await getMarkerName();
    const editor = vscode.window.activeTextEditor;
    if (!marker || !editor) {
        return undefined;
    }
    // The server finds the heading in the saved file.
    if (editor.document.isDirty && !await editor.document.save()) {
        return;
    }
    const src = await ODb.getHashTarget();
    const res: any = await ODb.setMarker(src, marker);
    if (!res || !res.Ok) {
        vscode.window.showErrorMessage(`Could not set the ${marker} marker: ${res && res.Msg || 'the orgs server did not answer'}`);
        return;
    }
    await settled([src.filename]);
    vscode.window.setStatusBarMessage(`$(bookmark) ${marker} is here`, 3000);
}

export async function jumpToMarker(): Promise<void> {
    const marker = await getMarkerName();
    if (!marker) {
        return undefined;
    }
    const res: any = await ODb.getMarker(marker);
    if (!Array.isArray(res) || res.length === 0) {
        vscode.window.showInformationMessage(`No heading has the ${marker} marker. Set Marker puts it on one.`);
        return;
    }
    Util.jumpToHeading(res[0].Filename, res[0].LineNum);
}

