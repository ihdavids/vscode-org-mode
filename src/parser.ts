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