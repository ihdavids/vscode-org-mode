
import * as vscode from 'vscode';

//import { SSL_OP_TLS_BLOCK_PADDING_BUG } from 'constants';
//import { Client } from 'rpc-websockets'
import { Sets } from './sets'

var WebSocket = require('rpc-websockets').Client




export class ODb
{
    private static instance: ODb;
    ws: typeof WebSocket;
    
    constructor()
    {
        // instantiate Client and connect to an RPC server
        console.log("CONNECTING TO: ", Sets.orgsConnection);
        this.ws = new WebSocket(Sets.orgsConnection);
        this.ws.on("open", function() {
            console.log("Connection established to Org DB...");
        })
    }

    public static get(): ODb
    {
        if (!ODb.instance) {
            ODb.instance = new ODb();
        }
        return ODb.instance;
    } 

    public static agenda() {
        const now = new Date();
	    //let qry: string = `!IsProject() && !IsArchived() && IsTodo() && OnDate("${now.getFullYear()} ${now.getDay()} ${now.getMonth()}")`;
	    let qry: string = `!IsProject() && !IsArchived() && IsTodo() && OnDate("2022 29 10")`;
        let res = ODb.get().ws.call("Db.QueryTodosExp",[{ "Query": qry}])
            .then(function(result) {
                console.log(result);
            }).catch( e => { console.log(e); });
    }

};




export async function connectToOrgs(doc: vscode.TextEditor) {
    console.log("TRYING TO CONNECT TO ORG DB...");
    ODb.get();
}