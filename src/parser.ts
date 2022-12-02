import * as vscode from 'vscode';
import { Sets } from './sets';
import { isHeaderLine } from './utils';
import { DateType, OrgDate } from './simple-datetime'

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
export class Headline implements Parent {
    type:      OrgTypes = OrgTypes.Headline;
    range:     vscode.Range;
    level:     number;
    status:    string;
    scheduled: Scheduled | undefined;
    deadline:  Deadline | undefined;
    closed:    Closed | undefined;
    timestamp: Timestamp | undefined;
    text:      string;
    tags:      string;
    parent?:   Headline;
    children:  Headline[];
    links:     Link[];
    nodes:     Node[];
    comments:  {[key: string]: Comment}
    root:      RootNode;
    

    constructor() {
        this.children = [];
        this.links    = [];
        this.nodes    = [];
        this.comments = {};
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

    constructor() {
        this.nodes    = [];
        this.children = [];
        this.links    = [];
        this.comments = {};
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


function finishHeadline(curNode, start, end) {
    curNode.range = new vscode.Range(new vscode.Position(start,0), new vscode.Position(end, 0));
}

function startHeadline(rootNode, m, curLine, last: Headline | null): Headline {
    let h: Headline = new Headline();
    // Track our nodes from parent to child and child to parent.
    rootNode.nodes.push(h);
    h.root = rootNode;
    // Now fill out headline details.
    const stars = m.groups.stars;
    h.level = stars.length;
    h.status = m.groups.status;
    h.text   = m.groups.text;
    h.tags   = m.groups.tags;
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

// const todoWords = "TODO|DONE";
function* parseLines(rootNode: RootNode, content: string) {
    let curLine  = 0;
    var line;
    var lastLine = 0;
    var curNode  = null;
    var start    = 0;
    const linere = /^.*$/mg;
    const todoKeywords = Sets.keywords.join("|");
    const todoHeaderRegexp = new RegExp(`^\\s*(?<stars>\\*+)\\s+(?<status>${todoKeywords})?\\s*(?<text>[^:]+)\\s*(?<tags>[:][a-zA-Z0-9@#$!_]+[:])?`);
    const commentRegexp = /^\s*[#][+](?<name>[A-Za-z][A-Za-z0-9_]+)[:]\s*(?<val>.*)$/;
    while((line = linere.exec(content)) && line.index < content.length) {
        const m = todoHeaderRegexp.exec(line);
        if(m) {
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
                    rootNode.comments[comment.name] = comment;
                }
            } else {
                yield [rootNode, curNode, offset, curLine, line];
            }
        }
        curLine += 1;
    } 
}

function* parseNumList(gen) {
    const numRegexp = /^(?<num>\d+)(?<type>[.)])\s+(?<text>.*)/g
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = numRegexp.exec(line);
        if (m) {
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
function* parseList(gen) {
    const listRegexp = /^\s*(?<pre>[+-]+)\s+(?<text>[^\[].*)/g
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = listRegexp.exec(line);
        if (m) {
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
function* parseCheckList(gen) {
    const listRegexp = /^\s*(?<pre>[+-]+)\s+\[(?<state>[ x-])\]\s*(?<text>.*)/g
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = listRegexp.exec(line);
        if (m) {
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
    }
    return cmnt;
}

function* parseComments(gen) {
    for (var lineData of gen) {
        const commentRegexp = /^\s*[#][+](?<name>[A-Za-z][A-Za-z0-9_]+)[:]\s*(?<val>.*)$/g
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = commentRegexp.exec(line);
        if (m) {
            parseComment(m, rootNode, curLine, curNode);
        }
        yield lineData;
    }
}


function* parseLinks(gen) {
    for (var lineData of gen) {
        const linkRegexp = /\[\[(?<link>[^\]]+)\](\[(?<desc>[^\]]+)\])?\]/g
        let [rootNode, curNode, offset, curLine, line] = lineData;
        let m = linkRegexp.exec(line);
        if (m) {
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
        }
        yield lineData;
    }
}

function* parseSDC(gen) {
    for (var lineData of gen) {
        let [rootNode, curNode, offset, curLine, line] = lineData;
        if (offset < 3) {
            let m = OrgDate.getRegex().exec(line);
            if (m) {
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
                    } break;
                    case DateType.DEADLINE:
                    {
                        let r = new Deadline();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.deadline = r;
                        rootNode.nodes.push(r);
                    } break;
                    case DateType.CLOSED:
                    {
                        let r = new Closed();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.closed = r;
                        rootNode.nodes.push(r);
                    } break;
                    case DateType.TIMESTAMP:
                    {
                        let r = new Timestamp();
                        r.range = range;
                        r.date  = date;
                        r.parent = curNode;
                        curNode.timestamp = r;
                        rootNode.nodes.push(r);
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
    let gen = parseLines(root, contents);
    gen     = parseSDC(gen);
    gen     = parseComments(gen);
    gen     = parseLinks(gen);
    gen     = parseCheckList(gen);
    gen     = parseNumList(gen);
    gen     = parseList(gen);

    for (var x of gen) {}

    return root;
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