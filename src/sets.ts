import * as vscode from 'vscode';


export class Sets {
    private static instance: Sets;
    settings: vscode.WorkspaceConfiguration;

    public static get(): Sets 
    {
        if (!Sets.instance) {
            Sets.instance = new Sets();
        }
        return Sets.instance;
    } 

    public constructor() {
        this.settings = vscode.workspace.getConfiguration("org");
    }

    public static getProp<T>(name: string, defaultVal = undefined): T      
    { 
        return Sets.get().settings.get<T>(name, defaultVal); 
    }
    public static get keywords(): string[] {
        const todoKeywords = Sets.getProp<string[]>("todoKeywords");
        todoKeywords.push(""); // Since 'nothing' can be a TODO
        return todoKeywords;
    }
    public static get leftZero(): boolean           { return Sets.getProp<boolean>("addLeftZero");           }
    public static get clockInOutSeparator(): string { return Sets.getProp<string>("clockInOutSeparator");    }
    public static get clockTotalSeparator(): string { return Sets.getProp<string>("clockTotalSeparator");    }
    public static get orgsConnection(): string      { return Sets.getProp<string>("orgsConnection", 'ws://localhost:8010/org');         }

}