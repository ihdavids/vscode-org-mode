
import * as vscode from 'vscode';

//import { SSL_OP_TLS_BLOCK_PADDING_BUG } from 'constants';
//import { Client } from 'rpc-websockets'
import { Sets } from './sets'

//var WebSocket = require('rpc-websockets').Client
import { RpcWebSocketClient } from 'rpc-websocket-client';

// JSONRPCClient needs to know how to send a JSON-RPC request.
// Tell it by passing a function to its constructor. The function must take a JSON-RPC request and send it.

// Use client.request to make a JSON-RPC request call.
// The function returns a promise of the result.

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

    public static agenda() {
        const now = new Date();
	    let qry: string = `!IsProject() && !IsArchived() && IsTodo() && OnDate("${now.getFullYear()} ${pad2(now.getDate())} ${pad2(now.getMonth()+1)}")`;
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