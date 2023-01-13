
import * as vscode from 'vscode';

//import { Client } from 'rpc-websockets'
import { Sets } from './sets'

import { RpcWebSocketClient } from 'rpc-websocket-client';
import { stringify } from 'querystring';

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
    public static reset() {
        ODb.instance = null
    }

    public static async agenda(retry: boolean = false) {
        try {
            const now = new Date();
	        let qry: string = `!IsProject() && !IsArchived() && IsTodo() && OnDate("${now.getFullYear()} ${pad2(now.getDate())} ${pad2(now.getMonth()+1)}")`;
            let db     = await ODb.get();
            let result = await db.ws.call("Db.QueryTodosExp",[{ "Query": qry}])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("AGENDA: Cannot contact orgs database, please ensure DB is present");
            ODb.reset();
            if (!retry) {
                return await ODb.agenda(true);
            }
            return null;
        }
    }
    public static async gantt(query: string, retry: boolean = false) {
        try {
	        let qry: string = `!IsProject() && !IsArchived() && IsTodo()`;
            if (query !== "") {
                qry += ` && ${query}`
            }
            let db     = await ODb.get();
            let result = await db.ws.call("Db.ExportToString",[{ "Name": "gantt", "Query": qry, "Filename": "", "Opts": ""}])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("GANTT: Cannot contact orgs database, please ensure DB is present");
            ODb.reset();
            if (!retry) {
                return ODb.gantt(query, true);
            }
            return null;
        }
    }

    public static async html(query: string, retry: boolean = false) {
        try {
	        let qry: string = query;
            let db     = await ODb.get();
            let result = await db.ws.call("Db.ExportToString",[{ "Name": "html", "Query": qry, "Filename": "", "Opts": ""}])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("WEB: Cannot contact orgs database, please ensure DB is present");
            ODb.reset();
            if (!retry) {
                return ODb.html(query, true);
            }
            return null;
        }
    }

    public static async query(qry: string, retry: boolean = false) {
        try {
            let db     = await ODb.get();
            let result = await db.ws.call("Db.QueryTodosExp",[{ "Query": qry}])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("QUERY: Cannot contact orgs database, please ensure DB is present");
            ODb.reset();
            if (!retry) {
                return ODb.query(qry, true);
            }
            return null;
        }
    }

    public static async daypage(retry: boolean = false) {
        try {
            const now = new Date();
	        let qry: string = `${now.getFullYear()}-${pad2(now.getDate())}-${pad2(now.getMonth()+1)}`;
            let db     = await ODb.get();
            let result = await db.ws.call("Db.CreateDayPage",[qry])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("DAYPAGE: Cannot contact orgs database, please ensure DB is present");
            ODb.reset();
            if (!retry) {
                return ODb.daypage(true);
            }
            return null;
        }
    }

    public static async getdaypage(tm: Date = null, retry: boolean = false) {
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
            ODb.reset();
            if (!retry) {
                return ODb.getdaypage(tm, true);
            }
            return null;
        }
    }

};




export async function connectToOrgs(doc: vscode.TextEditor) {
    console.log("TRYING TO CONNECT TO ORG DB...");
    ODb.get();
}