
import * as vscode from 'vscode';

import { Sets } from './sets'
import { URL } from 'url';
import {Request, RequestInfo, Headers} from 'node-fetch';
import { NodeTarget } from './capture';
import { Auth, orgsAgent } from './auth';
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
    // The server dropped its websocket RPC api; everything is REST now. This is
    // a cheap authenticated request, to find out whether the server is there
    // and will talk to us.
    public static async ping(): Promise<boolean> {
        const url: URL = new URL(Sets.orgsConnection + "/daypage/increment");
        const res = await this.doGet<number>(url);
        return typeof res === 'number';
    }

    public static async doGet<T>(url: any): Promise<T> {
        const loggedIn = await Auth.get().ensureLoggedIn();
        if (!loggedIn) {
            return undefined;
        }

        const headers: Headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Accept', 'application/json')
        const token = Auth.get().getToken();
        if (token) {
            headers.set('Authorization', 'Bearer ' + token);
        }

        if(url instanceof String) {
            url = new URL(Sets.orgsConnection + url);
        }

        const httpsAgent = orgsAgent();

        const request: RequestInfo = new Request(url, {
            method: 'GET',
            headers: headers,
            agent: httpsAgent,
        });
        try{
            const res = await fetch(request);
            if (res.status === 401) {
                // A server that answered without a login may want one now.
                await Auth.get().probe();
                await Auth.get().logout();
                vscode.window.showWarningMessage('Orgs session expired. Please log in again.');
                const relogged = await Auth.get().ensureLoggedIn();
                if (!relogged) { return undefined; }
                return await this.doGet<T>(url);
            }
            return res.json() as T;
        } catch(error) {
            // Most likely the server is not there: the status bar will say so.
            Auth.get().probe();
            vscode.window.showErrorMessage(error.message)
        }
    }

    // GET an api path with query parameters.
    public static async api<T>(path: string, params: {[key: string]: string} = {}): Promise<T> {
        const url: URL = new URL(Sets.orgsConnection + path);
        Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
        return await this.doGet<T>(url);
    }

    // POST a json body to an api path.
    public static async apiPost<T>(path: string, body: any): Promise<T> {
        return await this.doPost<T>(new URL(Sets.orgsConnection + path), body);
    }

    // POST a file as multipart/form-data, with some plain fields beside it.
    public static async upload<T>(path: string, fields: {[key: string]: string}, fileField: string, fileName: string, data: Buffer): Promise<T | undefined> {
        const loggedIn = await Auth.get().ensureLoggedIn();
        if (!loggedIn) {
            return undefined;
        }
        const boundary = '----orgs' + Math.random().toString(16).slice(2);
        const parts: Buffer[] = [];
        Object.keys(fields).forEach(k => parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${fields[k]}\r\n`, 'utf8')));
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName.replace(/"/g, '')}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`, 'utf8'));
        parts.push(data);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
        const headers: Headers = new Headers();
        headers.set('Content-Type', 'multipart/form-data; boundary=' + boundary);
        headers.set('Accept', 'application/json');
        const token = Auth.get().getToken();
        if (token) {
            headers.set('Authorization', 'Bearer ' + token);
        }
        try {
            const res = await fetch(new Request(new URL(Sets.orgsConnection + path), { method: 'POST', headers, body: Buffer.concat(parts), agent: orgsAgent() }));
            return await res.json() as T;
        } catch (error) {
            vscode.window.showErrorMessage('Upload failed: ' + error.message);
            return undefined;
        }
    }

    // A hash as a path segment wants it: base64 url encoded, padding and all.
    public static pathHash(hash: string): string {
        return Buffer.from(hash, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    }

    // A GET answered with bytes rather than json (a pdf). Undefined, with the
    // server's message shown, when it fails.
    public static async doGetBytes(url: URL | string): Promise<Buffer | undefined> {
        if (typeof url === 'string') {
            url = new URL(Sets.orgsConnection + url);
        }
        const loggedIn = await Auth.get().ensureLoggedIn();
        if (!loggedIn) {
            return undefined;
        }
        const headers: Headers = new Headers();
        const token = Auth.get().getToken();
        if (token) {
            headers.set('Authorization', 'Bearer ' + token);
        }
        try {
            const res = await fetch(new Request(url, { method: 'GET', headers, agent: orgsAgent() }));
            if (!res.ok) {
                vscode.window.showErrorMessage((await res.text()).trim() || `The server answered ${res.status}`);
                return undefined;
            }
            return await res.buffer();
        } catch (error) {
            vscode.window.showErrorMessage(error.message);
            return undefined;
        }
    }

    // A file run through an exporter: {Ok, Msg} with the text in Msg. With a
    // subtree hash, just that heading and what is under it.
    public static async exportText(type: string, filename: string, subtree?: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/file/` + encodeURIComponent(type));
        url.searchParams.append('query', filename);
        if (subtree) {
            url.searchParams.append('subtree', subtree);
        }
        return await this.doGet(url);
    }

    // An exporter that writes its own file (pdf), at `out` on the server's disk.
    public static async exportToFile(type: string, filename: string, out: string, subtree?: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/file/` + encodeURIComponent(type));
        url.searchParams.append('query', filename);
        url.searchParams.append('local', 't');
        url.searchParams.append('filename', out);
        if (subtree) {
            url.searchParams.append('subtree', subtree);
        }
        return await this.doGet(url);
    }

    public static async pdf(filename: string): Promise<Buffer | undefined> {
        const url: URL = new URL(Sets.orgsConnection + `/pdf`);
        url.searchParams.append('query', filename);
        return await this.doGetBytes(url);
    }

    public static async exporters(): Promise<string[]> {
        const url: URL = new URL(Sets.orgsConnection + `/exporters`);
        const res: any = await this.doGet(url);
        return res && res.Names ? res.Names : [];
    }

    public static async doPost<T>(url: any, payload: any): Promise<T> {
        const loggedIn = await Auth.get().ensureLoggedIn();
        if (!loggedIn) {
            return undefined;
        }

        const headers: Headers = new Headers()
        headers.set('Content-Type', 'application/json')
        headers.set('Accept', 'application/json')
        const token = Auth.get().getToken();
        if (token) {
            headers.set('Authorization', 'Bearer ' + token);
        }

        if(url instanceof String) {
            url = new URL(Sets.orgsConnection + url);
        }

        const httpsAgent = orgsAgent();

        const request: RequestInfo = new Request(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            agent: httpsAgent,
        });

        try{
            const res = await fetch(request);
            if (res.status === 401) {
                // A server that answered without a login may want one now.
                await Auth.get().probe();
                await Auth.get().logout();
                vscode.window.showWarningMessage('Orgs session expired. Please log in again.');
                const relogged = await Auth.get().ensureLoggedIn();
                if (!relogged) { return undefined; }
                return await this.doPost<T>(url, payload);
            }
            const js = res.json();
            return js as T;
        } catch(error) {
            vscode.window.showErrorMessage("POST FAILED: " + error.message)
        }
    }

    public static async agendaRest<T>(): Promise<T> {
        const url: URL = new URL(Sets.orgsConnection + "/search");

        const now = new Date();
        url.searchParams.append('query',`!IsProject() && !IsArchived() && IsTodo() && OnDate("${now.getFullYear()} ${pad2(now.getDate())} ${pad2(now.getMonth()+1)}")`);
        return await this.doGet(url);
    }

    public static async latex(query: string, retry: boolean = false): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + "/file/latex");

        /*
        let qry: string = `!IsArchived() && IsTodo()`;
        if (query !== "") {
            qry += ` && ${query}`
        }
        */
        url.searchParams.append('query', query);
        return await this.doGet(url);
    }

    public static async query(query: string, retry: boolean = false) : Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + "/search");
        let qry: string = `!IsArchived() && IsTodo()`;
        if (query !== "") {
            qry += ` && ${query}`
        }
        url.searchParams.append('query', qry);
        return await this.doGet(url);
    }

    public static async lookuphash(file: string, pos) : Promise<string> {
        const url: URL = new URL(Sets.orgsConnection + `/lookuphash`);
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
        const t = new NodeTarget();
        t.filename = fname;
        t.id = await ODb.lookuphash(fname, row);
        t.type = "hash";
        return t
    }

    public static async daypage(retry: boolean = false) {
        return await this.getdaypage();
    }

    public static async getdaypage(tm: Date = null, retry: boolean = false) {
        if(tm == null) {
            tm = new Date();
        }
        const url: URL = new URL(Sets.orgsConnection + `/daypage/${tm.getFullYear()}-${pad2(tm.getDate())}-${pad2(tm.getMonth()+1)}`);
        return await this.doGet(url);
    }

    public static async createdaypage() {
        const url: URL = new URL(Sets.orgsConnection + `/daypage`);
        return await this.doPost(url, {});
    }

    public static async capture(name: string, headline: string, content: string, tags: string[] = [], props: {} = {}, priority: string = "") {
        const url: URL = new URL(Sets.orgsConnection + `/capture`);
        return await this.doPost(url, {Template: name, NewNode: { Headline: headline, Content: content, Tags: tags, Props: props, Priority: priority }});
    }

    public static async delete(target: NodeTarget) {
        const url: URL = new URL(Sets.orgsConnection + `/delete`);
        return await this.doPost(url, {Filename: target.filename, Id: target.id, Type: target.type });
    }

    public static async refile(src: NodeTarget, dest: NodeTarget) {
        const url: URL = new URL(Sets.orgsConnection + `/refile`);
        return await this.doPost(url, {FromId: {Filename: src.filename, Id: src.id, Type: src.type }, ToId: {Filename: dest.filename, Id: dest.id, Type: dest.type }});
    }

    public static async archive(src: NodeTarget) {
        const url: URL = new URL(Sets.orgsConnection + `/archive`);
        return await this.doPost(url, {Filename: src.filename, Id: src.id, Type: src.type });
    }

    // Returns a potential list of refile targets
    public static async refiletargets(): Promise<string[]> {
        const url: URL = new URL(Sets.orgsConnection + `/refilefiles`);
        return await this.doGet(url);
    }

    public static async captureTemplates() {
        const url: URL = new URL(Sets.orgsConnection + `/capture/templates`);
        return await this.doGet(url);
    }

    public static async setProperty(hash: string, name: string, value: string) {
        const url: URL = new URL(Sets.orgsConnection + `/property`);
        return await this.doPost(url, {"Hash": hash, "Name": name, "Value": value});
    }

    public static async getdaypageIncrement(): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/daypage/increment`); 
        return await this.doGet(url);
    }

    public static async reformat(filename: string) {
        const url: URL = new URL(Sets.orgsConnection + `/reformat`);
        return await this.doPost(url, [filename]);
    }

    public static async setMarker(src: NodeTarget, marker: string) {
        const url: URL = new URL(Sets.orgsConnection + `/setexclusivemarker`);
        return await this.doPost(url, {ToId: {Filename: src.filename, Id: src.id, Type: src.type }, Name: marker});
    }

    public static async getMarker(marker: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/exclusivemarker`);
        url.searchParams.append('name', marker);
        return await this.doGet(url);
    }

    public static async createJira(src: NodeTarget) {
        const url: URL = new URL(Sets.orgsConnection + `/update`);
        return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Name: "jira"});
    }

    public static async clockIn(src: NodeTarget): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/clockin`);
        return await this.doPost(url, {Filename: src.filename, Id: src.id, Type: src.type });
    }

    public static async clockOut(): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/clockout`);
        return await this.doPost(url, {});
    }

    public static async clockActive(): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/clock`);
        return await this.doGet(url);
    }

    public static async execBlock(src: NodeTarget, row: number): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/execb`);
        return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Row: row});
    }

    // Runs the source block, #+CALL: or inline code at a line, writing the
    // results into the file. Lines are zero based.
    public static async babelExec(filename: string, line: number): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/babel/exec`);
        return await this.doPost(url, {Filename: filename, Line: line});
    }

    // Work out a table sent as text, unsaved edits and all. Nothing is
    // written: the answer is the table as it reads afterwards, and the colours
    // its formulas gave cells.
    public static async tableCalc(filename: string, line: number, text: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/table/calc`);
        return await this.doPost(url, {Filename: filename, Line: line, Text: text});
    }

    // Every source block, #+CALL: and inline code in a file, top to bottom.
    public static async babelExecAll(filename: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/babel/exec`);
        return await this.doPost(url, {Filename: filename, All: true});
    }

    // Refresh the dynamic block at a line, or (all) every one in the file.
    public static async dynamicBlocks(filename: string, line: number, all: boolean = false): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/dblocks/update`);
        return await this.doPost(url, all ? {Filename: filename, All: true} : {Filename: filename, Line: line});
    }

    // Write out the :tangle source blocks of a file. Answers {files: [{filename, lines}]}.
    public static async tangle(filename: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/tangle`);
        url.searchParams.append('filename', filename);
        url.searchParams.append('write', 't');
        return await this.doGet(url);
    }

    // Everywhere a heading can be refiled to: {Targets: [{Hash, Filename, Olp, Level, Todo, Tags}]},
    // a Hash of "" meaning the end of the file.
    public static async refileTargets(): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/refile/targets`);
        return await this.doGet(url);
    }

    // Refile, copy or archive any number of headings at once. The server finds
    // them all before it writes anything, so one call is safe where a loop is not.
    public static async move(op: 'refile' | 'copy' | 'archive', from: any[], to?: any): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/move`);
        return await this.doPost(url, {Op: op, From: from, To: to || {}});
    }

    public static async execTable(src: NodeTarget, row: number): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/exectable`);
        return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Row: row});
    }

    public static async execAllTable(fname: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/execalltables`);
        return await this.doPost(url, fname);
    }

    public static async formulaDetails(src: NodeTarget, row: number): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/tableformulainfo`);
        return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Row: row});
    }

    // Returns a random row of a table specified by table name
    public static async tableRandomRow(src: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/tablerandomget`);
        url.searchParams.append('name', src);
        return await this.doGet(url);
        //return await this.doPost(url, {Target: {Filename: src.filename, Id: src.id, Type: src.type }, Row: row});
    }

    // Every table the server knows, or those of one file: where each is, its
    // name, the heading over it, its size and how many formulas it has.
    public static async tables(filename: string = ""): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/tables`);
        if (filename) {
            url.searchParams.append('filename', filename);
        }
        return await this.doGet(url);
    }

    // The heading with this ID or CUSTOM_ID, anywhere the server looks: a Todo,
    // or undefined when there is none.
    public static async byId(id: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/id/` + encodeURIComponent(id));
        const res: any = await this.doGet(url);
        return res && typeof res === 'object' ? res : undefined;
    }

    // The heading with this hash: a Todo, or undefined. A hash in a path goes
    // base64 url encoded, padding and all.
    public static async byHash(hash: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/hash/` + ODb.pathHash(hash));
        const res: any = await this.doGet(url);
        return res && typeof res === 'object' && res.Headline !== undefined ? res : undefined;
    }

    // The links into, out of and within a file, as the server's link index has them.
    public static async links(filename: string): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/links`);
        url.searchParams.append('filename', filename);
        return await this.doGet(url);
    }

    // Returns a list of all tables found in all org files
    public static async tableNames(): Promise<any> {
        const url: URL = new URL(Sets.orgsConnection + `/tablenames`);
        return await this.doGet(url);
    }

};

export async function connectToOrgs(doc: vscode.TextEditor) {
    console.log("TRYING TO CONNECT TO ORG DB...");
    const loggedIn = await Auth.get().ensureLoggedIn();
    if (loggedIn) {
        if (await ODb.ping()) {
            vscode.window.showInformationMessage('Connected to orgs at ' + Sets.orgsConnection);
        } else {
            vscode.window.showErrorMessage('Could not reach orgs at ' + Sets.orgsConnection);
        }
    }
}