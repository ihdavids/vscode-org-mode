
import * as vscode from 'vscode';

//import { Client } from 'rpc-websockets'
import { Sets } from './sets'

import { RpcWebSocketClient } from 'rpc-websocket-client';
import { stringify } from 'querystring';
import { NumList } from './parser';
import { URL } from 'url';
import {Request, RequestInfo, Headers} from 'node-fetch';
import * as https from 'https';
import { NodeTarget } from './capture';
//var got = require('got');
//import got from 'got';

const fetchModule = import('node-fetch');
let callFetch = null;
async function fetch(url,...args) {
    if (callFetch === null) {
        const temp = await fetchModule;
        callFetch = temp['default'];
    }
    return callFetch(url,...args);
}
//const fetch = (url,...args) => import('node-fetch').then(({default: callFetch}) => callFetch(url,...args));

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
     
        var httpsAgent = https.globalAgent;
        if (Sets.allowSelfSigned) {
          httpsAgent = new https.Agent({
                rejectUnauthorized: false,
          });
        }
      
        const request: RequestInfo = new Request(url, {
            method: 'GET',
            headers: headers,
            agent: httpsAgent,
        });
        try{
            // Pass in the request object to the `fetch` API
            var res = await fetch(request);
            return res.json() as T;
        } catch(error) {
            vscode.window.showErrorMessage(error.message)
        }
    }

    public static async doPost<T>(url: any, payload: any): Promise<T> {
        // We can use the `Headers` constructor to create headers
        // and assign it as the type of the `headers` variable
        const headers: Headers = new Headers()
        // Add a few headers
        headers.set('Content-Type', 'application/json')
        // We also need to set the `Accept` header to `application/json`
        // to tell the server that we expect JSON in response
        headers.set('Accept', 'application/json')

        if(url instanceof String) {
            url = new URL(Sets.orgsConnection + url);
        }

        var httpsAgent = https.globalAgent;
        if (Sets.allowSelfSigned) {
          httpsAgent = new https.Agent({
                rejectUnauthorized: false,
          });
        }

        const request: RequestInfo = new Request(url, {
            // We need to set the `method` to `POST` and assign the headers
            method: 'POST',
            headers: headers,
            // Convert the user object to JSON and pass it as the body
            body: JSON.stringify(payload),
            agent: httpsAgent,
        });

        try{
            var res = await fetch(request);
            const js = res.json();
            return js as T;
        } catch(error) {
            vscode.window.showErrorMessage("POST FAILED: " + error.message)
        }
    }

    public static async agendaRest<T>(): Promise<T> {
        var url: URL = new URL(Sets.orgsConnection + "/search");

        const now = new Date();
        url.searchParams.append('query',`!IsProject() && !IsArchived() && IsTodo() && OnDate("${now.getFullYear()} ${pad2(now.getDate())} ${pad2(now.getMonth()+1)}")`);
        return await this.doGet(url);
    }

    public static async gantt(query: string, retry: boolean = false) {
        var url: URL = new URL(Sets.orgsConnection + "/file/mermaid");

        const now = new Date();
        //let qry: string = "!IsArchived() && IsTodo()";
        let qry: string = "";
        if (query !== null && query !== "" && qry !== "") {
            qry += ` && ${query}`
        } else {
            qry = query;
        }
        url.searchParams.append('query', qry);
        return await this.doGet(url);
    }

    public static async mindmap(query: string, retry: boolean = false) {
        var url: URL = new URL(Sets.orgsConnection + "/file/mindmap");

        const now = new Date();
        //let qry: string = "!IsArchived() && IsTodo()";
        let qry: string = "";
        if (query !== null && query !== "" && qry !== "") {
            qry += ` && ${query}`
        } else {
            qry = query;
        }
        url.searchParams.append('query', qry);
        return await this.doGet(url);
    }


    public static async html(query: string, retry: boolean = false) {
        var url: URL = new URL(Sets.orgsConnection + "/file/html");

        let qry: string = `!IsArchived() && IsTodo()`;
        if (query !== "") {
            qry += ` && ${query}`
        }
        url.searchParams.append('query', qry);
        return await this.doGet(url);
    }

    public static async latex(query: string, retry: boolean = false): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + "/file/latex");

        /*
        let qry: string = `!IsArchived() && IsTodo()`;
        if (query !== "") {
            qry += ` && ${query}`
        }
        */
        url.searchParams.append('query', query);
        return await this.doGet(url);
    }

    public static async revealjs(query: string, retry: boolean = false) {
        var url: URL = new URL(Sets.orgsConnection + "/file/revealjs");

        let qry: string = `!IsArchived() && IsTodo()`;
        if (query !== "") {
            qry += ` && ${query}`
        }
        url.searchParams.append('query', qry);
        return await this.doGet(url);
    }

    public static async impressjs(query: string, retry: boolean = false) {
        var url: URL = new URL(Sets.orgsConnection + "/file/impressjs");

        let qry: string = `!IsArchived() && IsTodo()`;
        if (query !== "") {
            qry += ` && ${query}`
        }
        url.searchParams.append('query', qry);
        return await this.doGet(url);
    }

    public static async query(query: string, retry: boolean = false) : Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + "/search");
        let qry: string = `!IsArchived() && IsTodo()`;
        if (query !== "") {
            qry += ` && ${query}`
        }
        url.searchParams.append('query', qry);
        return await this.doGet(url);
    }


    public static async lookuphash(file: string, pos) : Promise<string> {
        var url: URL = new URL(Sets.orgsConnection + `/lookuphash/`);
        url.searchParams.append('pos', pos);
        url.searchParams.append('filename', file);
        return await this.doGet(url);
    }

    public static async lookupCurrentHash() : Promise<string> {
        const fname = vscode.window.activeTextEditor.document.fileName;
        const row = vscode.window.activeTextEditor.selection.active.line;
        return await ODb.lookuphash(fname, row);
    }

    public static async getHashTarget() : Promise<NodeTarget> {
        const fname = vscode.window.activeTextEditor.document.fileName;
        const row = vscode.window.activeTextEditor.selection.active.line;
        let t = new NodeTarget();
        t.filename = fname;
        t.id = await ODb.lookuphash(fname, row);
        t.type = "hash";
        return t
    }


    public static async daypage(retry: boolean = false) {
        const now = new Date();
        var url: URL = new URL(Sets.orgsConnection + `/daypage/${now.getFullYear()}-${pad2(now.getDate())}-${pad2(now.getMonth()+1)}/`);
        return await this.doGet(url);
    }

    public static async getdaypage(tm: Date = null, retry: boolean = false) {
        if(tm == null) {
            tm = new Date();
        }
        var url: URL = new URL(Sets.orgsConnection + `/daypage/${tm.getFullYear()}-${pad2(tm.getDate())}-${pad2(tm.getMonth()+1)}`);
        return await this.doGet(url);
    }

    public static async createdaypage() {
        var url: URL = new URL(Sets.orgsConnection + `/daypage`);
        return await this.doPost(url, {});
    }

    public static async capture(name: string, headline: string, content: string, tags: string[] = [], props: {} = {}, priority: string = "") {
        var url: URL = new URL(Sets.orgsConnection + `/capture`);
        return await this.doPost(url, {Template: name, NewNode: { Headline: headline, Content: content, Tags: tags, Props: props, Priority: priority }});
    }

    public static async delete(target: NodeTarget) {
        var url: URL = new URL(Sets.orgsConnection + `/delete`);
        return await this.doPost(url, {Filename: target.filename, Id: target.id, Type: target.type });
    }

    public static async refile(src: NodeTarget, dest: NodeTarget) {
        var url: URL = new URL(Sets.orgsConnection + `/refile`);
        return await this.doPost(url, {FromId: {Filename: src.filename, Id: src.id, Type: src.type }, ToId: {Filename: dest.filename, Id: dest.id, Type: dest.type }});
    }

    public static async archive(src: NodeTarget) {
        var url: URL = new URL(Sets.orgsConnection + `/archive`);
        return await this.doPost(url, {Filename: src.filename, Id: src.id, Type: src.type });
    }

    // Returns a potential list of refile targets
    public static async refiletargets(): Promise<string[]> {
        var url: URL = new URL(Sets.orgsConnection + `/refilefiles`);
        return await this.doGet(url);
    }

    public static async captureTemplates() {
        var url: URL = new URL(Sets.orgsConnection + `/capture/templates`);
        return await this.doGet(url);
    }

    public static async setProperty(hash: string, name: string, value: string) {
        var url: URL = new URL(Sets.orgsConnection + `/property`);
        return await this.doPost(url, {"Hash": hash, "Name": name, "Value": value});
    }

    public static async getdaypageIncrement(): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/daypage/increment/`); 
        return await this.doGet(url);
    }

    public static async reformat(filename: string) {
        var url: URL = new URL(Sets.orgsConnection + `/reformat`);
        return await this.doPost(url, [filename]);
    }

    public static async setMarker(src: NodeTarget, marker: string) {
        var url: URL = new URL(Sets.orgsConnection + `/setexclusivemarker`);
        return await this.doPost(url, {ToId: {Filename: src.filename, Id: src.id, Type: src.type }, Name: marker});
    }

    public static async getMarker(marker: string): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/exclusivemarker`);
        url.searchParams.append('name', marker);
        return await this.doGet(url);
    }

    public static async createJira(src: NodeTarget) {
        var url: URL = new URL(Sets.orgsConnection + `/update`);
        return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Name: "jira"});
    }

    public static async clockIn(src: NodeTarget): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/clockin`);
        return await this.doPost(url, {Filename: src.filename, Id: src.id, Type: src.type });
    }

    public static async clockOut(): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/clockout`);
        return await this.doPost(url, {});
    }

    public static async clockActive(): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/clock`);
        return await this.doGet(url);
    }

    public static async execBlock(src: NodeTarget, row: number): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/execb`);
        return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Row: row});
    }

    public static async execTable(src: NodeTarget, row: number): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/exectable`);
        return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Row: row});
    }

    public static async execAllTable(fname: string): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/execalltables`);
        return await this.doPost(url, fname);
    }

    public static async formulaDetails(src: NodeTarget, row: number): Promise<any> {
        var url: URL = new URL(Sets.orgsConnection + `/tableformulainfo`);
        return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Row: row});
    }

};




export async function connectToOrgs(doc: vscode.TextEditor) {
    console.log("TRYING TO CONNECT TO ORG DB...");
    ODb.get();
}