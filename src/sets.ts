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

    public static setProp<T>(name: string, val: T) {
        // This is a bit goofy, when we set a property we have to reload the window.
        // I am not sure if doing this on every set will be a good idea.
        return Sets.get().settings.update(name, val, true).then(() => {
		    vscode.commands.executeCommand('workbench.action.reloadWindow');
        });
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
    public static get leftZero(): boolean           { return Sets.getProp<boolean>("addLeftZero");                 }
    public static get clockInOutSeparator(): string { return Sets.getProp<string>("clockInOutSeparator");          }
    public static get clockTotalSeparator(): string { return Sets.getProp<string>("clockTotalSeparator");          }
    public static get orgsConnection(): string      { return Sets.getProp<string>("orgsConnection", 'https://localhost:443');         }
    public static get decoreUpdate(): number        { return Sets.getProp<number>("updateInterval",10000);         }
    public static get prettyLinks(): boolean        { return Sets.getProp<boolean>("decorateLinks",true);          }
    public static get prettyBullets(): boolean      { return Sets.getProp<boolean>("decorateBullets",true);        }
    public static get underlineTopHeading(): boolean{ return Sets.getProp<boolean>("underlineTopHeading",true);    }
    public static get linkColoring(): string        { return Sets.getProp<string>("linkColoring","rgba(0, 128, 255, 1.0)");    }
    public static get tagColoring(): string         { return Sets.getProp<string>("tagColoring","rgba(128, 128,128, 1.0)");    }
    public static get allowSelfSigned(): boolean    { return Sets.getProp<boolean>("allowSelfSigned", true);         }
    // Pretty Bullets
    //  "◉" "○" "✸" "✿"
    //  ♥ ● ◇ ✚ ✜ ☯ ◆ ♠ ♣ ♦ ☢ ❀ ◆ ◖ ▶
    //  ► • ★ ▸
    public static get decoreBullets(): string[]        { return Sets.getProp<string[]>("bullets",["◉","○","◇","◆","●","•","♦"]);    }
    public static get headingFormatting(): {[key:string]: string}[] { return Sets.getProp<{[key:string]: string}[]>("headingFormatting",
                [{}
                ,{}
                ,{}
                ,{}
                ,{}
                ,{}
                ,{}
                ,{}]);    }

    public static get todoConfigs(): object            { return Sets.getProp<object>("todoConfigs",{"default": {"query": "!IsProject() && IsTask() && !IsArchived()"}});    }
    public static get gantts(): {[key:string]: string} { return Sets.getProp<{[key:string]: string}>("gantts", {
        "default": "HasProperty(\"EFFORT\")"
    });}
    public static get tagOffset(): number              { return Sets.getProp<number>("tagOffset",60);         }
    public static get captureTemplates(): {[key:string]: {[key:string]: string}}      { return Sets.getProp<{[key:string]: {[key:string]: string}}>("captureTemplates", {});}
    public static set captureTemplates(value: {[key:string]: {[key:string]: string}}) { Sets.setProp<{[key:string]: {[key:string]: string}}>("captureTemplates", value);}
    public static get markers(): string[]              { return Sets.getProp<string[]>("markers",["TODAY"]);    }
    public static get popupLog(): boolean             { return Sets.getProp<boolean>("popupLog", false);         }
}