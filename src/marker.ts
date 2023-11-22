import { join, parse } from 'path';
import * as vscode from 'vscode';
import { Signal } from "./signal";
import * as Util from './utils';
import {ODb} from "./db"
import { Sets } from './sets';
import { Parser } from './parser';
import { Log } from './log';


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
    const src = await ODb.getHashTarget();
    const marker = await getMarkerName();
    if (!marker) {
        return undefined;
    }
    const res: any = await ODb.setMarker(src, marker);
    if (!res.Ok) {
        Log.get().error("MARKER: ", src);
        Log.get().error("  > MARKER ERROR: ", JSON.stringify(res))
    } else {
        Log.get().log("MARKER: ", src);
    }
}

export async function jumpToMarker(): Promise<void> {
    const marker = await getMarkerName();
    if (!marker) {
        return undefined;
    }
    const res: any = await ODb.getMarker(marker);
    if (!res) {
        Log.get().error("  > JUMP MARKER ERROR: ", JSON.stringify(res))
    } else {
        Log.get().error("  > JUMP MARKER: ", JSON.stringify(res))
        Util.jumpToHeading(res[0].Filename, res[0].LineNum);
    }
}

