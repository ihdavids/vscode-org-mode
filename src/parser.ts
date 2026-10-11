import * as vscode from 'vscode';
import { Sets } from './sets';
import { DateType, OrgDate } from './simple-datetime'
//import * as tt from "./todolist";
import * as to from "./tables/ttorg";

export enum OrgTypes {
    Root,
    Headline,
    Scheduled,
    Deadline,
    Closed,
    Timestamp,
    Link,
    List,
    NumList,
    CheckList,
    Comment,
    Property,
    Drawer,
    ClockEntry,
    SourceBlock,
    Table,
    Roll,
};

export type Primitive = string | number | boolean
export interface Data { }
export interface Node {
    type:     OrgTypes;
    range:    vscode.Range;
    isType(type: OrgTypes):  boolean;
};


export interface Parent extends Node {
  children: Node[];
  parent?:  Node;
}

export interface Literal extends Node {
    //value: any
}

export class TypeHelper {

    static typeName(ctor: { name:string }) : string {
        return ctor.name;
    }
}

export class Scheduled implements Node {
    type:     OrgTypes = OrgTypes.Scheduled;
    range:    vscode.Range;
    date:     OrgDate;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == OrgTypes.Scheduled) {
            return true;
        }
        return false;
    }
}
export class Deadline implements Node {
    type:     OrgTypes = OrgTypes.Deadline;
    range:    vscode.Range;
    date:     OrgDate;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}
export class Closed implements Node {
    type:     OrgTypes = OrgTypes.Closed;
    range:    vscode.Range;
    date:     OrgDate;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}
export class Timestamp implements Node {
    type:     OrgTypes = OrgTypes.Timestamp;
    range:    vscode.Range;
    date:     OrgDate;
    active:   string;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}
export class List implements Node {
    type:     OrgTypes = OrgTypes.List;
    range:    vscode.Range;
    ltype:    string;
    text:     string;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }

}
export class NumList extends List {
    type:     OrgTypes = OrgTypes.NumList;
    num:      number;
}
export class CheckList extends List {
    type:     OrgTypes = OrgTypes.CheckList;
    state:    string;
}

export class Roll implements Node {
    type:     OrgTypes = OrgTypes.Roll;
    range:    vscode.Range;
    numDice:     string;
    diceType:    string;
    diceOp:      string;
    diceMod:     string;
    diceResult:  string;
    diceResults: number[];
    parent?:     Headline;

    getRollParser(): RegExp {
        const r = /(^|\s)\/r(?<num>[0-9]+)d(?<type>[0-9]+)(\s*(?<op>[+-])\s*(?<mod>[+-]?[0-9]+))*(\\s*[:]\\s*(?<diceResult>[0-9]+))?/
        return r;
    }

    hasResult(): boolean {
        return this.diceResult && this.diceResult != "";
    }

    eval(): number {
        const num = Number(this.numDice);
        let amt = Number(this.diceType);
        const mod = Number(this.diceMod);

        let accume = 0;
        this.diceResults = [];
        for (let i = 0; i < num; ++i) {
            amt = Math.ceil(amt*Math.random());
            accume += amt;
            this.diceResults.push(amt);
        }
        if (this.diceOp == "+") {
            accume += mod;
        } else if (this.diceOp == "-") {
            accume -= mod;
        } else {
            accume += 0;
        }
        if (accume == 0) {
            accume = 1;
        }
        this.diceResult = `${accume}`;
        return accume;
    }

    getExprNoRes(): string {
        const mod = this.getMod();
        const rv = `/r${this.numDice}d${this.diceType}${mod}`;
        return rv;
    }
    getExpr(): string {
        const res = this.eval();
        const mod = this.getMod();
        const rv = `/r${this.numDice}d${this.diceType}${mod}:${res}`;
        return rv;
    }


    getResult(): string {
        return this.diceResult;
    }

    getMod(space:string=""): string {
        let mod = ""
        if (this.diceOp && (this.diceOp == "+" || this.diceOp == "-")) {
            mod = `${this.diceOp}${space}${this.diceMod}`;
        }
        return mod;
    }

    getResults(): string {
        if (!this.diceResults || this.diceResults.length <= 0) {
            this.eval();
        }
        let res = "";
        for (let i = 0; i < this.diceResults.length; ++i) {
            const r = this.diceResults[i];
            if (res.length > 0) {
                res += ` + ${r}`
            } else {
                res += ` ${r}`;
            }
        }
        return res.trim();
    }

    numResults(): number {
        if (!this.diceResults || this.diceResults.length <= 0) {
            return 0;
        }
        return this.diceResults.length;
    }

    getFormattedResults(): string {
        const mod = this.getMod(" ");
        if (mod === "" && this.numResults() <= 1) {
            return "";
        }
        return `${this.getResults()} ${mod}`.trim();
    }

    // You get a dict of protocol and id values
    /*
    getParse(): {[key:string]: string} {
        let p = this.getRollParser();
        let r = p.exec(this.numDice);
        if (!r) {
            return null;
        }
        return r.groups;
    }*/

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}

export class Link implements Node {
    type:     OrgTypes = OrgTypes.Link;
    range:    vscode.Range;
    href:     string;
    desc:     string;
    parent?:  Headline;

    getFilesTypesToForceIntoVsCode() {
        return ['*.txt', '*.org', '*.py', '*.rb',
        '*.html', '*.css', '*.js', '*.php', '*.c', 
        '*.cpp', '*.h', '*.png', '*.jpg', '*.gif', '*.cs']
    }

    getLinkParser(): RegExp {
        const r = /(?<protocol>[a-zA-Z][a-zA-Z0-9]+)[:]\/\/(?<id>.*)/
        //let r = new RegExp(`^(file:)?(?P<filepath>.+?)(((::(?P<row>\d+))(::(?P<col>\d+))?)|(::\#(?P<cid>[a-zA-Z0-9!$@%&_-]+))|(::\*(?P<heading>[a-zA-Z0-9!$@%&_-]+))|(::(?P<textmatch>[a-zA-Z0-9!$@%&_-]+)))?\s*$`)
        return r;
    }

    // You get a dict of protocol and id values
    getParse(): {[key:string]: string} {
        const p = this.getLinkParser();
        const r = p.exec(this.href);
        if (!r) {
            return {'protocol': 'file', 'id': this.href};
        }
        return r.groups;
    }

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}
export class Comment implements Node {
    type:     OrgTypes = OrgTypes.Comment;
    range:    vscode.Range;
    name:     string;
    val:      string;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}
export class Property implements Node {
    type:     OrgTypes = OrgTypes.Property;
    range:    vscode.Range;
    name:     string;
    val:      string;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}
export class Drawer implements Node {
    type:     OrgTypes = OrgTypes.Drawer;
    range:    vscode.Range;
    name:     string;
    val:      string;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }

}

export class SourceBlock implements Node {
    type:     OrgTypes = OrgTypes.SourceBlock;
    range:    vscode.Range;
    name:     string;
    language: string;
    parent?:  Headline;
    maxLen:   number;
    height:   number;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}


export enum RowType {
    Unknown,
    Separator,
    Data
}

export enum Alignment {
    Left,
    Center,
    Right
}

export interface RowDef {
    type: RowType;
}

export interface ColDef {
    alignment: Alignment;
    width: number;
}

export class FormulaDef {
    public Row: number;
    public Start: number;
    public End: number;

    constructor(row: number, start: number, end: number) {
        this.Start = start;
        this.End = end;
        this.Row = row;
    }
}

function isSeparatorRow(text: string): boolean {
    return text.length > 1 && text[1] === to.horizontalSeparator;
}

const tableLineRe = /^\s*[|].*$/
const tableFormulaRe = /^\s*[#][+]TBLFM[:]\s*(.*)$/
export class Table implements Node {
    type:     OrgTypes = OrgTypes.Table;
    range:    vscode.Range;
    startLine = 0;
    height:   number;
    parent?:  Headline;

    rows: RowDef[] = [];
    cols: ColDef[] = [];
    formulas: FormulaDef[] = [];

    private data: string[][] = [];
    indent: number = 0;

    public static IsTableLine(): boolean {
        const editor = vscode.window.activeTextEditor;
        const row = editor.selection.start.line;
        const line = editor.document.lineAt(row).text;
        const mr = tableLineRe.exec(line);
        if (mr) {
            return true;
        }
        return false;
    }

    public static IsFormulaLine(): boolean {
        const editor = vscode.window.activeTextEditor;
        const row = editor.selection.start.line;
        const line = editor.document.lineAt(row).text;
        const mr = tableFormulaRe.exec(line);
        if (mr) {
            return true;
        }
        return false;

    }

    IsLastRow(row: number): boolean{
        return row === (this.rows.length-1);
    }

    IsLastCol(col: number): boolean{
        return col === (this.cols.length-1);
    }

    rowColFromPosition(position: vscode.Position): { row: number, col: number } {
        const result = { row: -1, col: -1 };

        result.row = position.line - this.startLine;
        let counter = 1 + this.indent;
        for (let i = 0; i < this.cols.length; ++i) {
            const col = this.cols[i];
            if (position.character >= counter && position.character < counter + col.width + 3) {
                result.col = i;
                break;
            }
            counter += col.width + 3;
        }
        return result;
    }

    rowColCellFromPosition(position: vscode.Position): { row: number, col: number, rng: vscode.Range } {
        const result = { row: -1, col: -1, rng: null };

        let scol = 0;
        let ecol = 0;
        result.row = position.line - this.startLine;
        let counter = 1 + this.indent;
        for (let i = 0; i < this.cols.length; ++i) {
            const col = this.cols[i];
            ecol = counter + col.width + 3;
            if (position.character >= counter && position.character < ecol) {
                result.col = i;
                scol = counter;
                break;
            }
            counter += col.width + 3;
        }
        if (result.row < this.rows.length && result.col >= 0 && this.rows[result.row].type != RowType.Separator) {
            result.rng = new vscode.Range(position.line, scol, position.line, ecol-1);
        }
        return result;
    }

    addRow(type: RowType, values: string[]) {
        let adjustCount = values.length - this.cols.length;
        while (adjustCount-- > 0) {
            this.cols.push({ alignment: Alignment.Left, width: 0 });
        }

        for (const row of this.data) {
            const adjustee = row.length < values.length ? row : values;
            adjustCount = Math.abs(row.length - values.length);

            while (adjustCount-- > 0) {
                adjustee.push('');
            }
        }

        this.cols.forEach((col, i) => col.width = Math.max(col.width, values[i].length));

        this.rows.push({ type });
        this.data.push(values);
    }

    insertRow(row: number, rtype: RowType=RowType.Data) {
        if (row < 0 || row > this.rows.length) {
            return 
        }
        let idx = 0
        if (row > 0) {
            idx = row - 1
        }
        this.rows.splice(row,0, { type: rtype })

        const rowd: string[] = Array(this.data[0].length)
        for (let i = 0; i < this.data[0].length; ++i) {
            rowd[i] = "";
        }
        this.data.splice(row,0, rowd)
    }

    deleteRow(row: number) {
        if (row < 0 || row > this.rows.length) {
            return 
        }
        this.rows.splice(row,1)
        this.data.splice(row,1)
    }

    deleteCol(col: number) {
        if (col < 0 || col > this.cols.length) {
            return 
        }
        this.cols.splice(col,1)
        for( let i = 0; i < this.data.length; ++i) {
            this.data[i].splice(col, 1)
        }
    }

    addCol(col: number) {
        const cd = {alignment: Alignment.Left, width: 0};
        this.cols.splice(col, 0, cd);
        for (let r = 0; r < this.data.length; ++r) {
            this.data[r].splice(col, 0, '')
        }
    }

    setIndent(idt: number) {
        this.indent = idt;
    }

    getIndent(): string {
        return " ".repeat(this.indent)
    }

    getAt(row: number, col: number): string {
        return this.data[row][col];
    }

    getRow(row: number): string[] {
        return this.data[row];
    }

    setAt(row: number, col: number, value: string) {
        if (this.cols[col].width < value.length) {
            this.cols[col].width = value.length;
        }

        this.data[row][col] = value;
    }

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }

    parseTableLine(line: string) {
        const s = line.trim();

        if (isSeparatorRow(s)) {
            this.addRow(RowType.Separator, []);
            return;
        }

        const lastIndex = s.length - (s.endsWith(to.verticalSeparator) ? 1 : 0);
        const values = s
                .slice(1, lastIndex)
                .split(to.verticalSeparator)
                .map(x => x.trim());

        this.addRow(RowType.Data, values);
    }

    parseFormulaLine(row: number, line: string, mtch: RegExpExecArray) {
        const s = line.trim();
        const full = mtch[0];
        const rawf = mtch[1];
        const start = full.length - rawf.length;
        const forms = rawf.split("::");
        let acc = start;
        forms.forEach( (form) => {
            const end = acc + form.length;
            this.formulas.push(new FormulaDef(row, acc, end));
            acc = end;
        });
                //this.formulas
        // TODO: Add the formula
    }
}


export class PropertyDrawer extends Drawer {
    properties:  {[key: string]: Property};
    add(n: Property) {
        if (!this.properties) {
            this.properties = {};
        }    
        this.properties[n.name] = n;
    }

    get(n: string): Property | undefined {
        return this.properties[n];
    }

}

export class ClockEntry {
    type:     OrgTypes = OrgTypes.ClockEntry;
    range:    vscode.Range;
    date:     OrgDate;
    parent?:  Headline;

    isType(type: OrgTypes):  boolean {
        if (type == this.type) {
            return true;
        }
        return false;
    }
}

export class LogBook extends Drawer {
    entries:  string[];
    clocks:   ClockEntry[];
    add(entry: string) {
        if (!this.entries) {
            this.entries = [];
        }    
        this.entries.push(entry);
    }
    addclock(entry: ClockEntry) {
        if (!this.clocks) {
            this.clocks = [];
        }    
        this.clocks.push(entry);
    }
}


export function padPreHeadline(name, len) {
    if (name === null || name === undefined) {
        name = "";
    }
    if (name.length < len) {
        name = name.padEnd(len, ' ');
    }
    return name
}
export class Headline implements Parent {
    type:      OrgTypes = OrgTypes.Headline;
    range:     vscode.Range;
    fullLine:  vscode.Range;
    noTagsFullLine:    vscode.Range;
    statusRange: vscode.Range;
    tagsRange: vscode.Range;
    level:     number;
    status:    string;
    scheduled: Scheduled | undefined;
    deadline:  Deadline | undefined;
    closed:    Closed | undefined;
    timestamp: Timestamp | undefined;
    text:      string;
    tags:      string[];
    parent?:   Headline;
    children:  Headline[];
    links:     Link[];
    rolls:     Roll[];
    nodes:     Node[];
    comments:  {[key: string]: Comment};
    properties:  PropertyDrawer;
    logbook:     LogBook;
    root:      RootNode;
    todos:     string[];
    dones:     string[];
    todoKeywords: string;
    sourceBlocks: SourceBlock[];
    tables: Table[];
    data: string;
    
    public getHeadline(): string {
        let tags = "";
        let status = "";
        if (this.status) {
            status = `${this.status} `;
        }
        const txt = `${"*".repeat(this.level)} ${status}${this.text.trim()}`
        if (this.tags.length > 0) {
            tags = `:${this.tags.join(':')}:`;
            tags = `${padPreHeadline(txt, Sets.tagOffset)} ${tags}`
        } else {
            tags = txt;
        }
        return tags;
    }

    public getRawHeadline(): string {
        return `${this.text.trim()}`
    }

    public find(pos: vscode.Position | undefined = undefined): Node|undefined {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
            return undefined;
		}
        if (pos === undefined) {
            pos = editor.selection.active;
        }
        let cur = undefined;
        if (this.range.contains(pos)) {
            cur = this;
        }
        if (this.children) {
            for (const h of this.children) {
                const c = h.find(pos);
                if (c !== undefined) {
                    return c;
                }
            }
        }
        // Okay, now we have the headline, lets check the sub elements to try to find
        // another element that might own this.
        for (const n of this.nodes) {
            if (n.range.contains(pos)) {
                return n;
            }
        }
        return cur;
    }


    constructor() {
        this.children = [];
        this.links    = [];
        this.rolls    = [];
        this.nodes    = [];
        this.comments = {};
        this.sourceBlocks = [];
        this.tables = [];
    }

    getSourceBlocks(): SourceBlock[] {
        return this.sourceBlocks;
    }

    getTables(): Table[] {
        return this.tables;
    }

    getComment(name: string, defaultVal: Comment | undefined = undefined): Comment | undefined {
        if (this.comments) {
            let val = this.comments[name];
            if (!val) {
                if (this.parent) {
                    val = this.parent.getComment(name, defaultVal);
                } else {
                    if (this.root) {
                        val = this.root.getComment(name, defaultVal);
                    } else {
                        val = defaultVal;
                    }
                }
            }
            return val;
        }
        return undefined;
    }
    getTodoKeywords(): string {
        if (!this.todoKeywords) {
            this.todoKeywords = this.getTodos().concat(this.getDones()).join("|");
        }
        return this.todoKeywords;
    }

    getAllTodos(): string[] {
        return this.getTodos().concat(this.getDones());
    }

    getTodos(): string[] {
        if (this.todos) {
            return this.todos;
        }
        else if (this.parent) {
            return this.parent.getTodos();
        } else if (this.root) {
            return this.root.getTodos();
        }
    }

    getDones(): string[] {
        if (this.dones) {
            return this.dones;
        }
        else if (this.parent) {
            return this.parent.getDones();
        } else if (this.root) {
            return this.root.getDones();
        }
    }

    getProp(name: string, defaultVal: Property | undefined = undefined): Property | undefined {
        let val = defaultVal;
        if (this.properties) {
            val = this.properties.get(name);
            if (!val) {
                if (this.parent) {
                    val = this.parent.getProp(name, defaultVal);
                }
            }
        }
        return val;
    }

    getLogEntries(): string[] | undefined {
        if (this.logbook) {
            return this.logbook.entries;
        }
        return undefined;
    }

    getClockEntries(): ClockEntry[] | undefined {
        if (this.logbook) {
            return this.logbook.clocks;
        }
        return undefined;
    }

    haveClockEntries(): boolean {
        if (this.logbook) {
            if (this.logbook.clocks && this.logbook.clocks.length > 0) {
                return true;
            }
        }
        return false;
    }

    isType(type: OrgTypes):  boolean {
        if (type == OrgTypes.Headline) {
            return true;
        }
        return false;
    }
    asType(type: OrgTypes): Headline | undefined {
        if (type == OrgTypes.Headline) {
            return this;
        }
        return undefined;
    }

}

export class RootNode implements Parent {
    type:     OrgTypes = OrgTypes.Root;
    range:    vscode.Range;
    children: Headline[];
    nodes:    Node[];
    links:    Link[];
    rolls:    Roll[];
    comments: {[key: string]: Comment};
    todos: string[];
    dones: string[];
    lineMap: Node[];

    constructor() {
        this.nodes    = [];
        this.children = [];
        this.links    = [];
        this.rolls    = [];
        this.comments = {};
    }

    getTodoKeywords(): string {
        return this.getTodos().concat(this.getDones()).join("|");
    }

    getTodos(): string[] {
        if (this.todos) {
            return this.todos;
        }
        return Sets.todos;
    }

    getDones(): string[] {
        if (this.dones) {
            return this.dones;
        }
        return Sets.dones;
    }

    getLinks(): Link[] {
        return this.links;
    }

    getRolls(): Roll[] {
        return this.rolls;
    }

    getComment(name: string, defaultVal: Comment | undefined = undefined): Comment | undefined {
        if (this.comments) {
            const val = this.comments[name] || defaultVal;
            return val;
        }
        return undefined;
    }

    isType(type: OrgTypes):  boolean {
        if (type == OrgTypes.Root) {
            return true;
        }
        return false;
    }
    asType(type: OrgTypes): RootNode | undefined {
        if (type == OrgTypes.Root) {
            return this;
        }
        return undefined;
    }

}

function notEmpty(str) {
  if (str?.trim()) {
    return true;
  } else {
    return false;
  }
}

function parseSpecialComments(cmt: Comment) {
    const splits = cmt.val.split('|');
    let todos = null; 
    let dones = null;
    if (splits.length > 0) {
        todos = splits[0];
        todos = todos.split(/\s+/);
        todos = todos.map(x => { if(x) { return x.split('(')[0].trim(); } else { return x; }} ).filter(notEmpty);
    } 
    if (splits.length > 1) {
        dones = splits[1];
        dones = dones.split(/\s+/);
        dones = dones.map(x => { if(x) { return x.split('(')[0].trim(); } else { return x; }} ).filter(notEmpty);
    }
    return [todos, dones];
}


function finishHeadline(curNode, start, end, buildup) {
    curNode.range = new vscode.Range(new vscode.Position(start,0), new vscode.Position(end, 0));
    curNode.data = buildup;
}

function startHeadline(rootNode, m: RegExpExecArray, curLine, last: Headline | null): Headline {
    const h: Headline = new Headline();
    // Track our nodes from parent to child and child to parent.
    rootNode.nodes.push(h);
    h.root = rootNode;
    // Now fill out headline details.
    const stars = m.groups.stars;
    h.level = stars.length;
    h.status = m.groups.status;
    h.text   = m.groups.text;
    if (m.groups.tags) {
        h.tags   = m.groups.tags.split(':').filter(e=>e);
    } else {
        h.tags = [];
    }
    const statusOffset = h.level + 1; 
    const statusLen = h.status ? h.status.length : 0;
    h.statusRange = new vscode.Range(new vscode.Position(curLine,statusOffset),new vscode.Position(curLine,statusOffset + statusLen));


    const startPos = new vscode.Position(curLine, m.index);
    const endPos   = new vscode.Position(curLine, m.index + m[0].length);
    const range    = new vscode.Range(startPos, endPos);
    h.fullLine = range;
    if(m.groups['tags']) {
        const endPos2   = new vscode.Position(curLine, m.index + m[0].length - m.groups.tags.length);
        const range2    = new vscode.Range(startPos, endPos2);
        h.noTagsFullLine = range2;
        h.tagsRange = new vscode.Range(h.noTagsFullLine.end,h.fullLine.end);
    } else {
        h.noTagsFullLine = h.fullLine;
        h.tagsRange = new vscode.Range(h.fullLine.end,h.fullLine.end);
    }

    
    if(h.level === 1) {
        rootNode.children.push(h);
    } 
    if(!last) {
        h.parent = undefined;
        // Still a child even if we start with **
        if (h.level !== 1) {
            rootNode.children.push(h);
        }
    } else if (h.level > last.level) {
        h.parent = last;
        last.children.push(h);
    } else {
        h.parent = undefined;
        let ll = last;
        while(ll && ll.level > h.level) {
            ll = ll.parent;
        }
        if (ll) {
            h.parent = ll.parent;
            if (ll.parent) {
                ll.parent.children.push(h);
            }
        }
    }
    return h;
}

enum ParserPhase {
    None,
    Comment,
    Headline,
    SDC,
    Checklists,
    NumberedLists,
    Lists,
    Properties,
    LogBook,
    Links,
    SourceBlock,
    Table,
    Roll,
}

class ParserState {
    ownedBy: ParserPhase;

    constructor() {
        this.ownedBy = ParserPhase.None;
    }

    canParse(phase: ParserPhase): boolean {
        return this.ownedBy === ParserPhase.None || this.ownedBy === phase;
    }

    setState(phase: ParserPhase) {
        this.ownedBy = phase;
    }
}

// const todoWords = "TODO|DONE";
function* parseLines(rootNode: RootNode, content: string, state: ParserState) {
    state.ownedBy = ParserPhase.None;
    let curLine  = 0;
    let line;
    const lastLine = 0;
    let curNode  = null;
    let start    = 0;
    //const linere = /(^.*$)|(^\r?\n)/mg;
    const commentRegexp = /^\s*[#][+](?<name>[A-Za-z][A-Za-z0-9_]+)[:]\s*(?<val>.*)$/;
    //content = content.replace(/\r/gm,"");
    const lines = content.split('\n');
    rootNode.lineMap = new Array(lines.length);
    //while((line = linere.exec(content)) && line.index < content.length) {
    let buildup = "";
    for(let line of lines) {
        line = line.replace('\r','');
        let todoKeywords = null;
        if (curNode) {
            todoKeywords = curNode.getTodoKeywords();
        } else {
            todoKeywords = rootNode.getTodoKeywords();
        }
        const todoHeaderRegexp = new RegExp(`^\\s*(?<stars>\\*+)\\s+(?<status>${todoKeywords})?\\s*(?<text>[^:]+)\\s*(?<tags>[:]([a-zA-Z0-9@#$!_]+[:])*)?`);
        const m = todoHeaderRegexp.exec(line);
        if(state.canParse(ParserPhase.Headline) && m) {
            if (curNode == null) {
                start   = curLine;
                curNode = startHeadline(rootNode, m, curLine, null);
            } else {
                finishHeadline(curNode, start, curLine, buildup);
                start = curLine;
                curNode = startHeadline(rootNode, m, curLine, curNode);
            }
        } else {
            buildup += "\n" + line;
            // Offset within the heading.
            const offset = curLine - start;
            // In header, have to parse heading bits.
            if (curNode == null) {
                const cm = commentRegexp.exec(line);
                if (cm) {
                    const comment: Comment = parseComment(cm, rootNode, curLine, null);
                    if (comment.name === "TODO" || comment.name === "SEQ_TODO" || comment.name === "TYP_TODO") {
                        [rootNode.todos, rootNode.dones] = parseSpecialComments(comment);
                    }
                    rootNode.comments[comment.name] = comment;
                }
            } else {
                yield [rootNode, curNode, offset, curLine, line];
            }
        }
        curLine += 1;
    } 
    if (curNode) {
        finishHeadline(curNode, start, curLine, buildup);
    }
}

function* parseNumList(gen, state: ParserState) {
    const numRegexp = /^(?<num>\d+)(?<type>[.)])\s+(?<text>.*)/
    for (const lineData of gen) {
        const [rootNode, curNode, offset, curLine, line] = lineData;
        const m = numRegexp.exec(line);
        if (state.canParse(ParserPhase.NumberedLists) && m) {
            const r    = new NumList();
            r.parent = curNode;
            r.num    = parseInt(m.groups.num);
            r.text   = m.groups.text;
            r.ltype  = m.groups.type;
            const startPos = new vscode.Position(curLine, m.index);
            const endPos   = new vscode.Position(curLine, m.index + m[0].length);
            const range    = new vscode.Range(startPos, endPos);
            r.range = range;
            rootNode.nodes.push(r);
            curNode.nodes.push(r);
        } else {
            yield lineData;
        }
    }
}
function* parseList(gen, state: ParserState) {
    const listRegexp = /^\s*(?<pre>[+-]+)\s+(?<text>[^\[].*)/
    for (const lineData of gen) {
        const [rootNode, curNode, offset, curLine, line] = lineData;
        const m = listRegexp.exec(line);
        if (state.canParse(ParserPhase.Lists) && m) {
            const r = new List();
            r.parent = curNode;
            r.ltype = m.groups.pre;
            r.text = m.groups.text;
            const startPos = new vscode.Position(curLine, m.index);
            const endPos   = new vscode.Position(curLine, m.index + m[0].length);
            const range    = new vscode.Range(startPos, endPos);
            r.range = range;
            rootNode.nodes.push(r);
            curNode.nodes.push(r);
        } else {
            yield lineData;
        }
    }
}
function* parseCheckList(gen, state: ParserState) {
    const listRegexp = /^\s*(?<pre>[+-]+)\s+\[(?<state>[ x-])\]\s*(?<text>.*)/
    for (const lineData of gen) {
        const [rootNode, curNode, offset, curLine, line] = lineData;
        const m = listRegexp.exec(line);
        if (state.canParse(ParserPhase.Checklists) && m) {
            const r = new CheckList();
            r.parent = curNode;
            r.ltype = m.groups.pre;
            r.text = m.groups.text;
            r.state = m.groups.state;
            const startPos = new vscode.Position(curLine, m.index);
            const endPos   = new vscode.Position(curLine, m.index + m[0].length);
            const range    = new vscode.Range(startPos, endPos);
            r.range = range;
            rootNode.nodes.push(r);
            curNode.nodes.push(r);
        } else {
            yield lineData;
        }
    }
}

function parseComment(m, rootNode: RootNode, curLine, curNode: Headline=null): Comment {
    const cmnt = new Comment();
    cmnt.name = m.groups.name;
    cmnt.val  = m.groups.val;
    cmnt.parent = curNode;
    const startPos = new vscode.Position(curLine, m.index);
    const endPos   = new vscode.Position(curLine, m.index + m[0].length);
    cmnt.range     = new vscode.Range(startPos, endPos);
           
    rootNode.nodes.push(cmnt);
    if (curNode) {
        curNode.comments[cmnt.name] = cmnt;
        curNode.nodes.push(cmnt);
    }
    return cmnt;
}

function* parseComments(gen, state: ParserState) {
    for (const lineData of gen) {
        const commentRegexp = /^\s*[#][+](?<name>[A-Za-z][A-Za-z0-9_]+)[:]\s*(?<val>.*)$/
        const [rootNode, curNode, offset, curLine, line] = lineData;
        const m = commentRegexp.exec(line);
        if (state.canParse(ParserPhase.Comment) && m) {
            const cmt = parseComment(m, rootNode, curLine, curNode);
            if (cmt) {
                if (curNode && (cmt.name == "TODO" || cmt.name == "SEQ_TODO")) {
                    [curNode.todos, curNode.dones] = parseSpecialComments(cmt);
                }
                continue;
            }
        }
        yield lineData;
    }
}

function* parseLogbook(gen, state: ParserState) {
    let inDrawer = false;
    let startPos;
    let curEntry = null;
    for (const lineData of gen) {
        const [rootNode, curNode, offset, curLine, line] = lineData;
        if (inDrawer) {
            const endRegexp = /^\s*[:]END[:]\s*$/
            const em = endRegexp.exec(line);
            if (em) {
                inDrawer = false;
                state.setState(ParserPhase.None);
                const endPos              = new vscode.Position(curLine, em.index + em[0].length);
                curNode.logbook.range  = new vscode.Range(startPos, endPos);
                if (curEntry) {
                    curNode.logbook.add(curEntry);
                    curEntry = null;
                }
            } else {
                const logRegexp = /^\s*(([-]?\s*(?<clock>CLOCK[:])\s+)|([-]\s+))(?<text>.*)$/
                const lm = logRegexp.exec(line);
                if (lm) {
                    if (curEntry) {
                        curNode.logbook.add(curEntry);
                        curEntry = null;
                    }
                    if (lm.groups.clock) {
                        const r = new ClockEntry();
                        r.parent = curNode;
                        const startPos = new vscode.Position(curLine, lm.index);
                        const endPos   = new vscode.Position(curLine, lm.index + lm[0].length);

                        const dm = OrgDate.getClockRegex().exec(line);
                        if (dm) {
                            r.date     = OrgDate.parseFromRegex(dm);
                        }
                        r.range        = new vscode.Range(startPos, endPos);
                        rootNode.nodes.push(r);
                        curNode.nodes.push(r);
                        curNode.logbook.addclock(r);
                    } else {
                        curEntry = lm.groups.text;
                    }
                } else {
                    if(curEntry) {
                        curEntry += "\n" + line;
                    }
                }
            }
            continue;
        } else {
            const startRegexp = /^\s*[:]LOGBOOK[:]\s*$/
            const sm          = startRegexp.exec(line);
            if (state.canParse(ParserPhase.LogBook) && sm) {
                state.setState(ParserPhase.LogBook);
                inDrawer = true;
                const p: LogBook = new LogBook();
                startPos = new vscode.Position(curLine, sm.index);
                curNode.logbook = p;
                rootNode.nodes.push(p);
                curNode.nodes.push(p);
                p.parent = curNode;
                continue;
            }
        }
        yield lineData;
    }
}



function* parseProperties(gen, state: ParserState) {
    let inPropDrawer = false;
    let startPos;
    for (const lineData of gen) {
        const [rootNode, curNode, offset, curLine, line] = lineData;
        if (inPropDrawer) {
            const endRegexp = /^\s*[:]END[:]\s*$/
            const em = endRegexp.exec(line);
            if (em) {
                inPropDrawer = false;
                state.setState(ParserPhase.None);
                const endPos              = new vscode.Position(curLine, em.index + em[0].length);
                curNode.properties.range  = new vscode.Range(startPos, endPos);
            } else {
                const propRegexp = /^\s*[:](?<name>[A-Za-z][A-Za-z0-9_]+)[:]\s*(?<val>.*)$/
                const pm = propRegexp.exec(line);
                if (pm) {
                    const r = new Property();
                    r.name = pm.groups.name;
                    r.val  = pm.groups.val;
                    r.parent = curNode;
                    const startPos = new vscode.Position(curLine, pm.index);
                    const endPos   = new vscode.Position(curLine, pm.index + pm[0].length);
                    r.range        = new vscode.Range(startPos, endPos);
                    rootNode.nodes.push(r);
                    if (curNode) {
                        curNode.nodes.push(r);
                        curNode.properties.add(r);
                    }
                }
            }
            continue;
        } else {
            const startRegexp = /^\s*[:]PROPERTIES[:]\s*$/
            const sm = startRegexp.exec(line);
            if (state.canParse(ParserPhase.Properties) && sm) {
                inPropDrawer = true;
                state.setState(ParserPhase.Properties);
                const p = new PropertyDrawer();
                startPos = new vscode.Position(curLine, sm.index);
                curNode.properties = p;
                rootNode.nodes.push(p);
                curNode.nodes.push(p);
                p.parent = curNode;
                continue;
            }
        }
        yield lineData;
    }
}
function* parseSourceBlock(gen, state: ParserState) {
    let inBlock = false;
    let startPos;
    let maxLen = 0;
    let height = 0;
    for (const lineData of gen) {
        const [rootNode, curNode, offset, curLine, line] = lineData;
        if (inBlock) {
            const endRegexp = /^\s*[#][+][Ee][Nn][Dd]_[Ss][Rr][Cc]\s*$/
            const em = endRegexp.exec(line);
            if (em) {
                inBlock = false;
                state.setState(ParserPhase.None);
                const endPos              = new vscode.Position(curLine, em.index + em[0].length);
                curNode.sourceBlocks[curNode.sourceBlocks.length-1].range   = new vscode.Range(startPos, endPos);
                curNode.sourceBlocks[curNode.sourceBlocks.length-1].maxLen  = maxLen;
                curNode.sourceBlocks[curNode.sourceBlocks.length-1].height  = height+1;
            } else {
                if (maxLen < line.length) {
                    maxLen = line.length;
                }
                height += 1;
            }
            continue;
        } else {
            const startRegexp = /^\s*[#][+][Bb][Ee][Gg][Ii][Nn]_[Ss][Rr][Cc]\s*(?<language>[a-zA-Z0-9_-]+)?(\s.*)?$/
            const sm = startRegexp.exec(line);
            if (state.canParse(ParserPhase.SourceBlock) && sm) {
                inBlock = true;
                state.setState(ParserPhase.SourceBlock);
                const p = new SourceBlock();
                startPos = new vscode.Position(curLine, sm.index);
                curNode.sourceBlocks.push(p);
                rootNode.nodes.push(p);
                curNode.nodes.push(p);
                p.parent = curNode;
                maxLen = line.length;
                height = 1;
                continue;
            }
        }
        yield lineData;
    }
}


function* parseTable(gen, state: ParserState) {
    let inTable = false;
    let startPos;
    let maxLen = 0;
    let height = 0;
    let curTable = null;
    const tregexp = /^\s*[|].*$/
    for (const lineData of gen) {
        const [rootNode, curNode, offset, curLine, line] = lineData;
        if (inTable) {
            const form = tableFormulaRe.exec(line);
            if (form) {
                curTable.parseFormulaLine(curLine, line, form);
                rootNode.lineMap[curLine] = curTable;
                continue
            }
            const em = tregexp.exec(line);
            if (!em) {
                inTable = false;
                state.setState(ParserPhase.None);
                const endPos     = new vscode.Position(curLine, line.length);
                curTable.range   = new vscode.Range(startPos, endPos);
                curTable.maxLen  = maxLen;
                curTable.height  = height+1;
            } else {
                if (maxLen < line.length) {
                    maxLen = line.length;
                }
                height += 1;
                curTable.parseTableLine(line);
                rootNode.lineMap[curLine] = curTable;
            }
            continue;
        } else {
            const sm = tregexp.exec(line);
            if (state.canParse(ParserPhase.Table) && sm) {
                inTable = true;
                state.setState(ParserPhase.Table);
                curTable = new Table();
                curTable.startLine = curLine;
                startPos = new vscode.Position(curLine, sm.index);
                curNode.tables.push(curTable);
                rootNode.nodes.push(curTable);
                curNode.nodes.push(curTable);
                curTable.parent = curNode;
                maxLen = line.length;
                height = 1;
                const idx = line.indexOf(to.verticalSeparator);
                if (idx >= 0) {
                    curTable.setIndent(idx)
                }
                curTable.parseTableLine(line)
                rootNode.lineMap[curLine] = curTable;
                continue;
            }
        }
        yield lineData;
    }
}


function* parseLinks(gen, state: ParserState) {
    for (const lineData of gen) {
        const linkRegexp = /\[\[(?<link>[^\]]+)\](\[(?<desc>[^\]]+)\])?\]/g
        const [rootNode, curNode, offset, curLine, line] = lineData;
        const m = linkRegexp.exec(line);
        if (state.canParse(ParserPhase.Links) && m) {
            const link = new Link();
            link.href = m.groups.link;
            link.desc = m.groups.desc;
            link.parent = curNode;
            const startPos = new vscode.Position(curLine, m.index);
            const endPos   = new vscode.Position(curLine, m.index + m[0].length);
            link.range     = new vscode.Range(startPos, endPos);
           
            rootNode.nodes.push(link);
            rootNode.links.push(link);
            curNode.links.push(link);
            curNode.nodes.push(link);
        }
        yield lineData;
    }
}

function* parseRolls(gen, state: ParserState) {
    for (const lineData of gen) {
        const rollRegexp = /(?<spaces>^|\s)\/r(?<numdice>[0-9]+)d(?<dicetype>[0-9]+)(\s*(?<diceOp>[+-])\s*(?<diceMod>[+-]?[0-9]+))*(\s*[:]\s*(?<diceResult>[0-9]+))?/g
        const [rootNode, curNode, offset, curLine, line] = lineData;
        const m = rollRegexp.exec(line);
        if (state.canParse(ParserPhase.Roll) && m) {
            const rl = new Roll();
            rl.numDice = m.groups.numdice;
            rl.diceType = m.groups.dicetype;
            rl.diceOp = m.groups.diceOp;
            rl.diceMod = m.groups.diceMod;
            rl.diceResult = m.groups.diceResult;
            rl.parent = curNode;
            const spaces = m.groups.spaces.length
            const startPos = new vscode.Position(curLine, m.index+spaces);
            const endPos   = new vscode.Position(curLine, m.index + m[0].length);
            rl.range     = new vscode.Range(startPos, endPos);
           
            rootNode.nodes.push(rl);
            rootNode.rolls.push(rl);
            curNode.rolls.push(rl);
            curNode.nodes.push(rl);
        }
        yield lineData;
    }

}

function* parseSDC(gen, state: ParserState) {
    for (const lineData of gen) {
        const [rootNode, curNode, offset, curLine, line] = lineData;
        if (offset < 3) {
            const m = OrgDate.getRegex().exec(line);
            if (state.canParse(ParserPhase.SDC) && m) {
                const date     = OrgDate.parseFromRegex(m);
                const startPos = new vscode.Position(curLine, m.index);
                const endPos   = new vscode.Position(curLine, m.index + m[0].length);
                const range    = new vscode.Range(startPos, endPos);

                switch(date.dateType) {
                    case DateType.SCHEDULED: 
                    {
                        const r = new Scheduled();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.scheduled = r;
                        rootNode.nodes.push(r);
                        curNode.nodes.push(r);
                    } break;
                    case DateType.DEADLINE:
                    {
                        const r = new Deadline();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.deadline = r;
                        rootNode.nodes.push(r);
                        curNode.nodes.push(r);
                    } break;
                    case DateType.CLOSED:
                    {
                        const r = new Closed();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.closed = r;
                        rootNode.nodes.push(r);
                        curNode.nodes.push(r);
                    } break;
                    case DateType.TIMESTAMP:
                    {
                        const r = new Timestamp();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.timestamp = r;
                        rootNode.nodes.push(r);
                        curNode.nodes.push(r);
                    } break;
                }
                continue;
            }
        }
        yield lineData;
    }
}

export function parseFileContents(contents: string) {
    const root: RootNode = new RootNode();
    const state: ParserState = new ParserState();
    let gen = parseLines(root, contents, state);
    gen     = parseComments(gen,state);
    gen     = parseSDC(gen,state);
    gen     = parseProperties(gen,state);
    gen     = parseLogbook(gen,state);
    gen     = parseRolls(gen, state);
    gen     = parseLinks(gen,state);
    gen     = parseCheckList(gen,state);
    gen     = parseNumList(gen,state);
    gen     = parseList(gen,state);
    gen     = parseSourceBlock(gen,state);
    gen     = parseTable(gen,state);

    for (const x of gen) {}

    return root;
}


// The whole-document parse, for the few commands that want a node tree: the
// TODO keyword picker, tags, capture and do-what-I-mean. It runs when one of
// them asks and the document has changed since, not on every keystroke -
// decorations and folding read the lines themselves.
export class Parser implements vscode.Disposable {
    public doc: RootNode;
    private parsedFor: { uri: string, version: number } | undefined;

    public async parse(): Promise<void> {
        this.ensureParsed();
    }

    private ensureParsed() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const d = editor.document;
        const key = d.uri.toString();
        if (!this.parsedFor || this.parsedFor.uri !== key || this.parsedFor.version !== d.version) {
            this.doc = parseFileContents(d.getText());
            this.parsedFor = { uri: key, version: d.version };
        }
    }

    public async parseFromDoc(doc: vscode.TextDocument): Promise<void> {
        if (doc) {
            this.doc = parseFileContents(doc.getText());
            this.parsedFor = { uri: doc.uri.toString(), version: doc.version };
        }
    }

    public async parseFromText(txt: string): Promise<void> {
        if (txt) {
            this.doc = parseFileContents(txt);
            this.parsedFor = undefined;
        }
    }

    public find(pos: vscode.Position | undefined = undefined): Node {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }
        this.ensureParsed();
        if (pos === undefined) {
            pos = editor.selection.active;
        }
        let cur = undefined;
        if (this.doc && this.doc.children) {
            for (const h of this.doc.children) {
                if (h && h.range) {
                    cur = h.find(pos);
                    if (cur !== undefined) {
                        break;
                    }
                }
            }
        }
        return cur;
    }

    public dispose() {
    }
}
