import * as vscode from 'vscode';
import { Sets } from './sets';
import { isHeaderLine } from './utils';
import { DateType, OrgDate } from './simple-datetime'
import { listenerCount } from 'stream';
import * as tt from "./todolist";

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
        let r = /(?<protocol>[a-zA-Z][a-zA-Z0-9]+)[:]\/\/(?<id>.*)/
        //let r = new RegExp(`^(file:)?(?P<filepath>.+?)(((::(?P<row>\d+))(::(?P<col>\d+))?)|(::\#(?P<cid>[a-zA-Z0-9!$@%&_-]+))|(::\*(?P<heading>[a-zA-Z0-9!$@%&_-]+))|(::(?P<textmatch>[a-zA-Z0-9!$@%&_-]+)))?\s*$`)
        return r;
    }

    // You get a dict of protocol and id values
    getParse(): {[key:string]: string} {
        let p = this.getLinkParser();
        let r = p.exec(this.href);
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
    statusRange: vscode.Range;
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
    nodes:     Node[];
    comments:  {[key: string]: Comment};
    properties:  PropertyDrawer;
    logbook:     LogBook;
    root:      RootNode;
    todos:     string[];
    dones:     string[];
    todoKeywords: string;
    sourceBlocks: SourceBlock[];
    
    public getHeadline(): string {
        let tags = "";
        let status = "";
        if (this.status) {
            status = `${this.status} `;
        }
        let txt = `${"*".repeat(this.level)} ${status}${this.text.trim()}`
        if (this.tags.length > 0) {
            tags = `:${this.tags.join(':')}:`;
            tags = `${padPreHeadline(txt, Sets.tagOffset)} ${tags}`
        } else {
            tags = txt;
        }
        return tags;
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
        this.nodes    = [];
        this.comments = {};
        this.sourceBlocks = [];
    }

    getSourceBlocks(): SourceBlock[] {
        return this.sourceBlocks;
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
    comments: {[key: string]: Comment};
    todos: string[];
    dones: string[];

    constructor() {
        this.nodes    = [];
        this.children = [];
        this.links    = [];
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


function finishHeadline(curNode, start, end) {
    curNode.range = new vscode.Range(new vscode.Position(start,0), new vscode.Position(end, 0));
}

function startHeadline(rootNode, m: RegExpExecArray, curLine, last: Headline | null): Headline {
    let h: Headline = new Headline();
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
    var line;
    var lastLine = 0;
    var curNode  = null;
    var start    = 0;
    //const linere = /(^.*$)|(^\r?\n)/mg;
    const commentRegexp = /^\s*[#][+](?<name>[A-Za-z][A-Za-z0-9_]+)[:]\s*(?<val>.*)$/;
    //content = content.replace(/\r/gm,"");
    const lines = content.split('\n');
    //while((line = linere.exec(content)) && line.index < content.length) {
    for(let line of lines) {
        line = line.replace('\r','');
        let todoKeywords = null;
        if (curNode) {
            todoKeywords = curNode.getTodoKeywords();
        } else {
            todoKeywords = rootNode.getTodoKeywords();
        }
        const todoHeaderRegexp = new RegExp(`^\\s*(?<stars>\\*+)\\s+(?<status>${todoKeywords})?\\s*(?<text>[^:]+)\\s*(?<tags>[:][a-zA-Z0-9@#$!_]+[:])?`);
        const m = todoHeaderRegexp.exec(line);
        if(state.canParse(ParserPhase.Headline) && m) {
            if (curNode == null) {
                start   = curLine;
                curNode = startHeadline(rootNode, m, curLine, null);
            } else {
                finishHeadline(curNode, start, curLine);
                start = curLine;
                curNode = startHeadline(rootNode, m, curLine, curNode);
            }
        } else {
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
        finishHeadline(curNode, start, curLine);
    }
}

function* parseNumList(gen, state: ParserState) {
    const numRegexp = /^(?<num>\d+)(?<type>[.)])\s+(?<text>.*)/
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = numRegexp.exec(line);
        if (state.canParse(ParserPhase.NumberedLists) && m) {
            let r    = new NumList();
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
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = listRegexp.exec(line);
        if (state.canParse(ParserPhase.Lists) && m) {
            let r = new List();
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
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = listRegexp.exec(line);
        if (state.canParse(ParserPhase.Checklists) && m) {
            let r = new CheckList();
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
    let cmnt = new Comment();
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
    for (var lineData of gen) {
        const commentRegexp = /^\s*[#][+](?<name>[A-Za-z][A-Za-z0-9_]+)[:]\s*(?<val>.*)$/
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = commentRegexp.exec(line);
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
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
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
                        let r = new ClockEntry();
                        r.parent = curNode;
                        const startPos = new vscode.Position(curLine, lm.index);
                        const endPos   = new vscode.Position(curLine, lm.index + lm[0].length);

                        let dm = OrgDate.getClockRegex().exec(line);
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
                let p: LogBook = new LogBook();
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
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
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
                    let r = new Property();
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
                let p = new PropertyDrawer();
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
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
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
                let p = new SourceBlock();
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



function* parseLinks(gen, state: ParserState) {
    for (var lineData of gen) {
        const linkRegexp = /\[\[(?<link>[^\]]+)\](\[(?<desc>[^\]]+)\])?\]/g
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = linkRegexp.exec(line);
        if (state.canParse(ParserPhase.Links) && m) {
            let link = new Link();
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

function* parseSDC(gen, state: ParserState) {
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
        if (offset < 3) {
            let m = OrgDate.getRegex().exec(line);
            if (state.canParse(ParserPhase.SDC) && m) {
                const date     = OrgDate.parseFromRegex(m);
                const startPos = new vscode.Position(curLine, m.index);
                const endPos   = new vscode.Position(curLine, m.index + m[0].length);
                const range    = new vscode.Range(startPos, endPos);

                switch(date.dateType) {
                    case DateType.SCHEDULED: 
                    {
                        let r = new Scheduled();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.scheduled = r;
                        rootNode.nodes.push(r);
                        curNode.nodes.push(r);
                    } break;
                    case DateType.DEADLINE:
                    {
                        let r = new Deadline();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.deadline = r;
                        rootNode.nodes.push(r);
                        curNode.nodes.push(r);
                    } break;
                    case DateType.CLOSED:
                    {
                        let r = new Closed();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.closed = r;
                        rootNode.nodes.push(r);
                        curNode.nodes.push(r);
                    } break;
                    case DateType.TIMESTAMP:
                    {
                        let r = new Timestamp();
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
    let root: RootNode = new RootNode();
    let state: ParserState = new ParserState();
    let gen = parseLines(root, contents, state);
    gen     = parseComments(gen,state);
    gen     = parseSDC(gen,state);
    gen     = parseProperties(gen,state);
    gen     = parseLogbook(gen,state);
    gen     = parseLinks(gen,state);
    gen     = parseCheckList(gen,state);
    gen     = parseNumList(gen,state);
    gen     = parseList(gen,state);
    gen     = parseSourceBlock(gen,state);

    for (var x of gen) {}

    return root;
}


export class Parser implements vscode.Disposable {
    public doc: RootNode;

	public async parse(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return Promise.resolve();
		}
		const text = editor.document.getText();
        this.doc = parseFileContents(text);
        return Promise.resolve();
    }

    public find(pos: vscode.Position | undefined = undefined): Node {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
            return undefined;
		}
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




/*
import * as vscode from 'vscode';
import { Config } from './config';
import { Head } from './orgdoc';

export class Parser implements vscode.Disposable {
	private config: Config;
	private level: number;
	private state: string[];
	private headRegex: RegExp;
	private countRegex: RegExp;
	private linkRegex: RegExp;
	private srcRegex: RegExp;
	private first: Head | undefined;
	private links: vscode.Range[];
	private sources: vscode.Range[];

	constructor(context: vscode.ExtensionContext) {
		this.config = Config.getInstance();
		this.level = this.config.get('headLevel');
		this.state = (this.config.get('todoState') + ' ' + this.config.get('doneState')).split(' ');
		this.headRegex = new RegExp('^[*]{1,' + this.level.toString() + '}\\s+', 'gm');
		this.countRegex = new RegExp('\\[\\d*\\/\\d*\\]', 'g');
		this.linkRegex = new RegExp('\\[\\[[^\\n]+\\]\\]', 'g');
		this.srcRegex = new RegExp('#\\+(begin|end)_src', 'gi');
		this.first = undefined;
		this.links = [];
		this.sources = [];
	}

	dispose(): void {
	}

	async parse(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return Promise.resolve();
		}
		this.first = undefined;
		this.links = [];
		this.sources = [];
		const text = editor.document.getText();
		let match;
		const parent: Head[] = [];
		let prevHead: Head | undefined = undefined;
		while (match = this.headRegex.exec(text)) {
			const level = match[0].trim().startsWith('*') ? match[0].trim().length : 0;
			const pos = editor.document.positionAt(match.index);

			// head
			const line = editor.document.lineAt(pos.line);
			const head = new Head(level, line.range);
			if (!this.first) {
				this.first = head;
			}

			// state
			const lineArray = line.text.split(/\s+/);
			if ((lineArray.length > 2) && this.state.includes(lineArray[1])) {
				head.state = lineArray[1];
				head.stateColumn = line.text.indexOf(head.state);
			}

			// count
			const countMatch = this.countRegex.exec(line.text);
			if (countMatch) {
				head.count = countMatch[0];
				head.countColumn = countMatch.index;
			}

			// schedule and deadline
			if (editor.document.lineCount > pos.line + 1) {
				const nextLine = editor.document.lineAt(pos.line + 1);
				head.scheduleColumn = nextLine.text.indexOf('SCHEDULED:');
				if (head.scheduleColumn >= 0) {
					const end = nextLine.text.indexOf('>', head.scheduleColumn);
					head.schedule = nextLine.text.slice(head.scheduleColumn, end + 1);
				}
				head.deadlineColumn = nextLine.text.indexOf('DEADLINE:');
				if (head.deadlineColumn >= 0) {
					const end = nextLine.text.indexOf('>', head.deadlineColumn);
					head.deadline = nextLine.text.slice(head.deadlineColumn, end + 1);
				}
			}

			// body
			if (prevHead) {
				prevHead.nextHead = head;
				const prevLine = prevHead.rangeHead.start.line;
				if (prevLine >= 0 && pos.line - 1 > prevLine) {
					const range = new vscode.Range(prevLine + 1, 0, pos.line - 1, 0);
					prevHead.rangeBody = range;
				}
			}
			head.prevHead = prevHead;

			// parent
			let p = parent.pop();
			if (!p) {
				parent.push(head);
			} else {
				while (p && p.level >= head.level) {
					p = parent.pop();
				}
				if (p) {
					p.children.push(head);
					head.parent = p;
					parent.push(p);
				}
				parent.push(head);
			}

			prevHead = head;
		}
		// end of file
		if (prevHead) {
			const prevLine = prevHead.rangeHead.start.line;
			const lastLine = editor.document.lineCount - 1;
			if (prevLine >= 0 && lastLine > prevLine) {
				const range = new vscode.Range(prevLine + 1, 0, lastLine, 0);
				prevHead.rangeBody = range;
			}
		}
		while (match = this.linkRegex.exec(text)) {
			const start = editor.document.positionAt(match.index);
			const end = editor.document.positionAt(match.index + match[0].length);
			this.links.push(new vscode.Range(start, end));
		}
		let beginSrc: vscode.Position | undefined = undefined;
		while (match = this.srcRegex.exec(text)) {
			const start = editor.document.positionAt(match.index);
			const end = editor.document.positionAt(match.index + match[0].length);
			if (match[0].toLowerCase() === '#+begin_src') {
				beginSrc = editor.document.positionAt(match.index);
			} else if (beginSrc) {
				this.sources.push(new vscode.Range(beginSrc, editor.document.positionAt(match.index)));
				beginSrc = undefined;
			}
		}
		return Promise.resolve();
	}

	getHead(line: number | undefined = undefined): Head | undefined {
		if (!line) {
			return this.first;
		}
		let h = this.first;
		while (h) {
			const headLine = h.rangeHead.start.line;
			const bodyLine = (h.rangeBody) ? h.rangeBody.end.line : h.rangeHead.start.line;
			if (line >= headLine && line <= bodyLine) {
				break;
			}
			h = h.nextHead;
		}
		return h;
	}

	getLinks(): vscode.Range[] {
		return this.links;
	}

	getSources(): vscode.Range[] {
		return this.sources;
	}
}
*/


/*

import * as fs from "fs";
import * as readline from "readline";
import * as stream from "stream";
import * as pevt from "p-event";

function readLines( input : fs.ReadStream) : stream.PassThrough 
{
    const output = new stream.PassThrough({ objectMode: true });
    const rl = readline.createInterface({ input });
    rl.on("line", line => { 
        output.write(line);
    });
    rl.on("close", () => {
        output.push(null);
    }); 
    return output;
}

function* range(start: number, stop: number)
{
    for (let i = start; i < stop; yield i++) {}
}

class OrgProperties
{
    key : string;
    value : string;
    line : number;
}

class OrgBlock
{
    line: number;
}

class OrgDynamicBlocks
{
    line: number;
}

class OrgDateTime extends Date
{
    
}


class OffsetIter implements Iterator<string> 
{
    lines: string[];
    cur:   number;
    
    constructor(lines:string[]) 
    {
        this.lines = lines;
        this.cur   = 0;
    }
    
    public next(): IteratorResult<string>
    {
        if(this.cur < this.lines.length)
        {
            let rv = { done: false, value: this.lines[this.cur]};
            this.cur += 1;
            return rv;
        }
        else
        {
            return { done: true, value: null };
        }
    }    
    
    offset() : number
    {
        return this.cur;
    }
}

class OrgNode
{
    start: number;
    end: number;
    heading: string;
    header: string;
    level: number;
    tags:  string[];
    todo: string;
    priority: string;
    properties: OrgProperties[];
    blocks: OrgBlock[];
    scheduled: OrgDateTime;
    deadline: OrgDateTime;
    closed: OrgDateTime;
    timestamps: OrgDateTime[];
    clocklist: OrgDateTime[];
    customId: string;
    
};

class Chunk
{
    lines : string[];
    start : number;
    end : number;
    
    constructor(lines : string[], s : number, e: number)
    {
        this.lines = lines;
        this.start = s;
        this.end = e;
    }
};

export async function* chunk(rh : fs.ReadStream) : AsyncGenerator<Chunk>
{
    let chunks: string[] = [];
    let start = 0;
    let end   = 0;
    let count = 0;
    let rr : readline.ReadLine = readline.createInterface({input: rh, crlfDelay: Infinity});
    const asyncIterator : AsyncIterableIterator<string> = pevt.iterator(rr, 'line', {
        resolutionEvents: ['close']
    });
    for await ( const line of asyncIterator )
    {
        if(/^\s*[*]+\s/.test(line))
        {
            end = count - 1;
            yield new Chunk(chunks, start, end);
            chunks = [];
            start = count;
        }
        chunks.push(line);
        count += 1;
    }
    end = count - 1;
    yield new Chunk(chunks, start, end);
    return;
}

class OrgFile
{
    public nodes : OrgNode[];
    
    ParseHeader(c : Chunk)
    {
        
    }
    
    ParseNodeHeading(n: OrgNode)
    {
        // TODO This has to be the full list of headings.
        let todoCandidates = ["DONE", "TODO"];
        n.header = n.heading;
        let m = n.heading.match(/^(\*+)\s+(.*?)\s*$/);
        n.level = m[1].length;
        let remainder = m[2];
        // priority
        m = remainder.match(/^\s*\[#([A-Z0-9])\] ?(.*)$/);
        if(!m)
        {
            n.priority = m[1];
            remainder  = m[2];
        }
        // tags
        m = remainder.match(/(.*?)\s*:([\w@:]+):\s*$/);
        if(!m)
        {
            n.tags = m[2].split(":");
            remainder = m[1];
        }
        // todo
        for(let todo of todoCandidates)
        {
            let todows = todo + " ";            
            if(remainder.startsWith(todows))
            {
                remainder = remainder.slice(todows.length);
                n.todo = todo;
                break;
            }
        }
        n.heading = remainder;
    }
    
    *ParseSdc(ilines: OffsetIter)
    {
        for(let i of range(0,3))
        {
            let linei = ilines.next();
        } 
        
    }
    
    ParseChunk(c : Chunk) : OrgNode
    {
        let n : OrgNode = new OrgNode();
        n.start = c.start;
        n.end   = c.end;
        n.heading = c.lines[0];
        this.ParseNodeHeading(n);
        
        let ilines = new OffsetIter(c.lines);
        let gen = this.ParseSdc(ilines)
        //gen = self._iparse_names(gen, ilines)
        //gen = self._iparse_clock(gen, ilines)
        //gen = self._iparse_tables(gen, ilines)
        //gen = self._iparse_properties(gen, ilines)
        //gen = self._iparse_drawers(gen, ilines)
        //gen = self._iparse_targets(gen, ilines)
        //gen = self._iparse_blocks(gen, ilines)
        //gen = self._iparse_repeated_tasks(gen, ilines)
        //gen = self._iparse_timestamps(gen, ilines)
        
        return n;
    }
    
    async FromChunks(g : AsyncGenerator<Chunk>)
    {
        let ci : IteratorResult<Chunk>;
        ci = await g.next();
        this.ParseHeader(ci.value);
        
        while(ci = await g.next())
        {
            let c: Chunk = ci.value;
            this.nodes.push(this.ParseChunk(c));
        }
    }
};



export function parseFile(filename: string) : OrgFile
{
    let rs : fs.ReadStream = fs.createReadStream(filename);
    let f : OrgFile = new OrgFile();
    
    f.FromChunks(chunk(rs));
    return f;
}

*/