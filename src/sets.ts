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
  	public reload() {
		this.settings = vscode.workspace.getConfiguration('org');
	}
    public static getProp<T>(name: string, defaultVal = undefined): T      
    { 
        return Sets.get().settings.get<T>(name, defaultVal); 
    }
    public static get keywords(): string[] {
        const todoKeywords = Sets.getProp<string[]>("todoKeywords");
        const doneKeywords = Sets.getProp<string[]>("doneKeywords");
        if (todoKeywords.indexOf("") === -1) {
            todoKeywords.push(""); // Since 'nothing' can be a TODO
        }
        return todoKeywords.concat(doneKeywords);
    }
    public static get todos(): string[] {
        const todoKeywords = Sets.getProp<string[]>("todoKeywords");
        return todoKeywords;
    }
    public static get dones(): string[] {
        const doneKeywords = Sets.getProp<string[]>("doneKeywords");
        return doneKeywords;
    }
    public static get leftZero(): boolean           { return Sets.getProp<boolean>("addLeftZero");           }
    public static get clockInOutSeparator(): string { return Sets.getProp<string>("clockInOutSeparator");    }
    public static get clockTotalSeparator(): string { return Sets.getProp<string>("clockTotalSeparator");    }
    public static get orgsConnection(): string      { return Sets.getProp<string>("orgsConnection", 'ws://localhost:8010/org');         }
    public static get decoreUpdate(): number        { return Sets.getProp<number>("updateInterval",10000);    }
    public static get prettyLinks(): boolean        { return Sets.getProp<boolean>("decorateLinks",true);    }
    public static get prettyBullets(): boolean      { return Sets.getProp<boolean>("decorateBullets",true);    }
    // Pretty Bullets
    //  "◉" "○" "✸" "✿"
    //  ♥ ● ◇ ✚ ✜ ☯ ◆ ♠ ♣ ♦ ☢ ❀ ◆ ◖ ▶
    //  ► • ★ ▸
    public static get decoreBullets(): string[]        { return Sets.getProp<string[]>("bullets",["◉","○","◇","◆","●","•","♦"]);    }

}