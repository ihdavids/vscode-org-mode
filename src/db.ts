
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

    }
/*
    function ping() {
        ws.send('__ping__');
        tm = setTimeout(function () {

           /// ---connection closed ///


    }, 5000);
}

function pong() {
    clearTimeout(tm);
}
websocket_conn.onopen = function () {
    setInterval(ping, 30000);
}
websocket_conn.onmessage = function (evt) {
    var msg = evt.data;
    if (msg == '__pong__') {
        pong();
        return;
    }
    //////-- other operation --//
}    
*/
    public async connect(): Promise<unknown> {
        this.ws = new RpcWebSocketClient();
        let onConnect = this.ws.connect(Sets.orgsConnection);

        this.ws.onOpen(function(x) {
            console.log("Connection established on Org DB...")
        })
        this.ws.onClose(function(x) {
            console.log("Connection closed to Org DB...");
            this.ws = null;
        });
        return onConnect;
    }

    public static async get(): Promise<ODb>
    {
        if (!ODb.instance) {
            ODb.instance = new ODb();
            await ODb.instance.connect();
        } else if (!ODb.instance.ws) {
            await ODb.instance.connect();
        }
        return ODb.instance;
    } 

    public static async agenda() {
        try {
            const now = new Date();
	        let qry: string = `!IsProject() && !IsArchived() && IsTodo() && OnDate("${now.getFullYear()} ${pad2(now.getDate())} ${pad2(now.getMonth()+1)}")`;
            let db     = await ODb.get();
            let result = await db.ws.call("Db.QueryTodosExp",[{ "Query": qry}])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("AGENDA: Cannot contact orgs database, please ensure DB is present");
            return null;
        }
    }

    public static async daypage() {
        try {
            const now = new Date();
	        let qry: string = `${now.getFullYear()}-${pad2(now.getDate())}-${pad2(now.getMonth()+1)}`;
            let db     = await ODb.get();
            let result = await db.ws.call("Db.CreateDayPage",[qry])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("DAYPAGE: Cannot contact orgs database, please ensure DB is present");
            return null;
        }
    }

    public static async getdaypage(tm: Date = null) {
        try {
            if(tm == null) {
                tm = new Date();
            }
	        let qry: string = `${tm.getFullYear()}-${pad2(tm.getDate())}-${pad2(tm.getMonth()+1)}`;
            let db     = await ODb.get();
            let result = await db.ws.call("Db.GetDayPageAt",[qry])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("DAYPAGE: Cannot contact orgs database, please ensure DB is present");
            return null;
        }
    }

};




export async function connectToOrgs(doc: vscode.TextEditor) {
    console.log("TRYING TO CONNECT TO ORG DB...");
    ODb.get();
}