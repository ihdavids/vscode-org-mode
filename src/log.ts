import * as vscode from 'vscode';
import { Sets } from './sets';

enum LogLevel {
    Errors,
    Warnings,
    Info,
    Trace
}

export class Log {


    public out: vscode.OutputChannel;
    public level: LogLevel;
    private static instance: Log;

    public constructor() {
        this.out = vscode.window.createOutputChannel("Org Mode");
        this.level = LogLevel.Trace;
    }

    public output(data: any[]) {
      for (var i = 0; i <  data.length; i++) {
            const str = (new String(data[i])).valueOf()
            this.out.append(str);
        }
        this.out.appendLine("");
        if (Sets.popupLog) {
            this.out.show();
        }
    }

    public log(...data: any) {
        if (this.level >= LogLevel.Info) {
            this.output(data);
        }
    }

    public trace(...data: any) {
        if (this.level >= LogLevel.Trace) {
            this.output(data);
        }
    }

    public error(...data: any) {
        this.output(data);
    }

    public warn(...data: any) {
        if (this.level >= LogLevel.Warnings) {
            this.output(data);
        }
    }

    public static get(): Log
    {
        if (!Log.instance) {
            Log.instance = new Log();
        }
        return Log.instance;
    }
};