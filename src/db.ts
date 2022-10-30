
import * as vscode from 'vscode';

//import { Client } from 'rpc-websockets'
import { Sets } from './sets'

import { RpcWebSocketClient } from 'rpc-websocket-client';

function pad2(num: number): string {
    return String(num).padStart(2, '0');
}

export class ODb
{
    private static instance: ODb;
    ws: RpcWebSocketClient;
    
    constructor()
    {
        // instantiate Client and connect to an RPC server
        console.log("CONNECTING TO: ", Sets.orgsConnection);

        this.ws = new RpcWebSocketClient();
        this.ws.connect(Sets.orgsConnection);

        this.ws.onOpen(function(x) {
            console.log("Connection established on Org DB...")
        })
    }

    public static get(): ODb
    {
        if (!ODb.instance) {
            ODb.instance = new ODb();
        }
        return ODb.instance;
    } 

    public static async agenda() {
        const now = new Date();
	    let qry: string = `!IsProject() && !IsArchived() && IsTodo() && OnDate("${now.getFullYear()} ${pad2(now.getDate())} ${pad2(now.getMonth()+1)}")`;
        let result = await ODb.get().ws.call("Db.QueryTodosExp",[{ "Query": qry}])
        return result;
    }

};




export async function connectToOrgs(doc: vscode.TextEditor) {
    console.log("TRYING TO CONNECT TO ORG DB...");
    ODb.get();
}