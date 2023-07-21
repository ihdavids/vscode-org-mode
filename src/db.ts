
import * as vscode from 'vscode';

//import { Client } from 'rpc-websockets'
import { Sets } from './sets'

import { RpcWebSocketClient } from 'rpc-websocket-client';
import { stringify } from 'querystring';
import { NumList } from './parser';
import { URL } from 'url';
import {Request, RequestInfo, Headers} from 'node-fetch';
import * as https from 'https';
//var got = require('got');
//import got from 'got';

const fetch = (url,...args) => import('node-fetch').then(({default: fetch}) => fetch(url,...args));

function pad2(num: number): string {
    return String(num).padStart(2, '0');
}

export class ODb
{
    private static instance: ODb;
    private static amConnecting: Promise<unknown>;
    ws: RpcWebSocketClient;
    
    constructor()
    {
        // instantiate Client and connect to an RPC server
        console.log("CONNECTING TO: ", Sets.orgsConnection);

    }

    public async connect(): Promise<unknown> {
        this.ws = new RpcWebSocketClient();
        let onConnect = await this.ws.connect(Sets.orgsConnection);

        this.ws.onOpen(function(x) {
            console.log("Connection established on Org DB...")
        })
        this.ws.onClose(function(x) {
            console.log("Connection closed to Org DB...");
            this.ws = null;
        });
        return onConnect;
    }

    public static async get(retry: boolean = false): Promise<ODb>
    {
        try {
        if (!ODb.instance) {
            ODb.instance = new ODb();
            ODb.amConnecting = ODb.instance.connect();
        } else if (!ODb.instance.ws) {
            ODb.amConnecting = ODb.instance.connect();
        }
        await ODb.amConnecting;
        } catch {
            this.reset();
            if (!retry) {
                return this.get(true);
            } else {
                return null;
            }
        }
        return ODb.instance;
    } 
    public static reset() {
        ODb.amConnecting = null;
        ODb.instance     = null
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

    public static async doGet<T>(url: any): Promise<T> {
        // We can use the `Headers` constructor to create headers
        // and assign it as the type of the `headers` variable
        const headers: Headers = new Headers()
        // Add a few headers
        headers.set('Content-Type', 'application/json')
        headers.set('Accept', 'application/json')
        // Add a custom header, which we can use to check
        //headers.set('X-Custom-Header', 'CustomValue')
        // Create the request object, which will be a RequestInfo type. 
        // Here, we will pass in the URL as well as the options object as parameters.
        if(url instanceof String) {
            url = new URL(Sets.orgsConnection + url);
        }
        //const got = await import("got");
        //var res = await got.get(url);
        //return JSON.parse(res.body) as T;
       
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
          });
      
        const request: RequestInfo = new Request(url, {
            method: 'GET',
            headers: headers,
            agent: httpsAgent,
        });
        // Pass in the request object to the `fetch` API
        var res = await fetch(request);
        return res.json() as T;
    }

    public static async doPost<T>(url: any, payload: any): Promise<T> {
        /*
        // We can use the `Headers` constructor to create headers
        // and assign it as the type of the `headers` variable
        const headers: Headers = new Headers()
        // Add a few headers
        headers.set('Content-Type', 'application/json')
        // We also need to set the `Accept` header to `application/json`
        // to tell the server that we expect JSON in response
        headers.set('Accept', 'application/json')

        const request: RequestInfo = new Request('/users', {
            // We need to set the `method` to `POST` and assign the headers
            method: 'POST',
            headers: headers,
            // Convert the user object to JSON and pass it as the body
            body: JSON.stringify(payload)
        });

        // Send the request and print the response
        return fetch(request)
            .then(res => res.json())
            .then(res => {
                return res as T
            });
        */
        if(url instanceof String) {
            url = new URL(Sets.orgsConnection + url);
        }
        const got = await import('got');
        var res = await got.post(url,
            {json: payload}
        );
        return JSON.parse(res.body) as T;
    }

    public static async agendaRest<T>(): Promise<T> {
        var url: URL = new URL(Sets.orgsConnection + "/search");

        const now = new Date();
        url.searchParams.append('query',`!IsProject() && !IsArchived() && IsTodo() && OnDate("${now.getFullYear()} ${pad2(now.getDate())} ${pad2(now.getMonth()+1)}")`);
        return await this.doGet(url);
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
            vscode.window.showErrorMessage("WEB: Cannot contact orgs database, please ensure DB is present: " + e);
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
            console.log("QUERY: ", qry)
            let result = await db.ws.call("Db.QueryTodosExp",[{ "Query": qry}])
            return result;
        } catch(e) {
            vscode.window.showErrorMessage("QUERY: Cannot contact orgs database, please ensure DB is present");
            console.log("QUERY: Cannot contact orgs database, please ensure DB is present: " + e);
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