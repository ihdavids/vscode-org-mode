import * as M from './matchers'

class OffsetIter implements Iterator<string> {
    _lines = null;
    _cur   = 0;
    _len   = 0;

    constructor(lines) {
        this._lines = lines;
        this._len   = lines.length;
    }

    public get offset() {
        return this._cur;
    }

    public next(): IteratorResult<string> {
        this._cur += 1;
        if(this._cur < this._len) {
            return {
               done: false,
               value: this._lines[this._cur]
            };
        } else {
            return {
                done: true,
                value: null
            };
        }
    }
}

export class Heading {
    _start : number = 0;
    _index :   number   = 0;
    _heading : string   = null;
    _level :   number   = 0;
    _tags: string[] = null;
    _todo: string[] = null;
    _priority: string = null;
    _properties = null;
    _property_drawer_location = null;
    _drawers = null;
    _blocks = null;
    _scheduled = null;
    _deadline = null;
    _closed = null;
    _timestamps = [];
    _clocklist = [];
    _body_lines = [];
    _repeated_tasks = [];
    _body_lines_start = null;
    _customid = null;
    _parent = null;
    _lines = null;
    _full_heading = null;

    constructor(lines: string[]) {
        this._lines = lines;
    }

    public static FromChunk(chunk) : Heading {
        return null;
    }

    public PostParse() : void {
        // TODO: This is stuff that needs to happen AFTER we have an index?
    }

    public SetIndex(index: number) : void {
        this._index = index;
    }

    get CustomId()               { return this._customid; }
    get PropertyDrawerLocation() { return this._property_drawer_location; }
    get BodyLinesStart()         { return this._body_lines_start; }
    get Blocks()                 { return this._blocks; }
    get Drawers()                { return this._drawers; }
    get FullHeading()            { return this._full_heading; }
    get Level()                  { return this._level; }


    public GetDrawer(name: string) {
        for (let i of this._drawers) {
            if(i['name'] == name) {
                return i;
            }
        }
        return null;
    }


    public InitialParse() {
        this.ParseHeading();
        let ilines = new OffsetIter(this._lines)
        // This is creative each parser gets a crack at
        // each line. The problem is that we can't
        // tell the offset from the heading
        let gen = this.IParseSDC(ilines);
        gen     = this.IParseClock(gen, ilines);
        gen     = this.IParseProperties(gen, ilines);
        gen     = this.IParseDrawers(gen, ilines);
        gen     = this.IParseBlocks(gen, ilines);
        gen     = this.IParseRepeatedTasks(gen, ilines);
        gen     = this.IParseTimestamps(gen, ilines);
        if(this._body_lines_start == null) {
            this._body_lines_start = this._start + ilines.offset + 1;
        }
        // TODO: Strip this in cases we don't care.
        // TODO: Remove _lines in cases we don't care.
       this._body_lines = Array.from(gen);
    }

    private ParseHeading() {
        let heading = this._lines[0];
        [heading, this._level]    = parse_heading_level(heading);
        [heading, this._tags]     = parse_heading_tags(heading);
        [heading, this._todo]     = parse_heading_todos(heading, self.env.all_todo_keys);
        [heading, this._priority] = parse_heading_priority(heading);
        this._heading = heading;
    }

    // SCHEDULED, DEADLINE, CLOSED
    // Spec has these always on the first lines.
    private * IParseSDC(ilines) {
        for( let line of ilines) {
            // This is a datetime method.
            let [scheduled, deadline, closed] = parse_sdc(line);
            let found = false;
            if(scheduled) {
                this._scheduled = scheduled;
                found = true;
            } 
            if (deadline) {
                this._deadline = deadline;
                found = true;
            }
            if (closed) {
                this._closed = closed;
                found = true;
            }
            if(!found) {
                yield line;
            }
        }
    }

    private * IParseClock(ilines, at) {
        this._clocklist = [];
        for( let line of ilines) {
            let cl = OrgDateClock.from_str(line)
            if(cl) {
                this._clocklist.push(cl);
            }
            else {
                yield line;
            }
        }
    }

    private * IParseTimestamps(ilines, at) {
        this._timestamps = [];
        let inHeading = OrgDate.list_from_str(this._heading);
        if(inHeading) {
            this._timestamps.concat(inHeading);
        }
        for( let line in ilines) {
            let ts = OrgDate.list_from_str(line);
            if(ts) {
                this._timestamps.concat(ts);
            }
            else {
                yield line;
            }
        }
    }

    private * IParseProperties(ilines, at) {
        this._properties       = {};
        let in_property_field: boolean = false;
        let start: number = 0;
        let end: number   = 0;
        for(let line of ilines) {
            if (in_property_field) {
                if (line.includes(":END:")) {
                    end = this._start + at.offset;
                    this._property_drawer_location = [start, end];
                    this.env.properties.push(this._property_drawer_location);
                    in_property_field = false;
                    break;
                }
                else {
                    let [key, val] = parse_property(line);
                    if(key) {
                        this._properties.update({key: [val, at.offset]});
                        if(key.lower() == "custom_id") {
                            this._customid = (val, at.offset);
                            this.env.customids[val] = (at.offset, this._start);
                        }
                    }
                }
            } else if (line.includes(":PROPERTIES:")) {
                start = this._start + at.offset;
                in_property_field = true;
            } else {
                yield line;
            }
        }
        for(let line of ilines) {
            yield line;
        }
    }

    private * IParseDrawers(ilines, at) {
        this._drawers = [];
        let drawerName: string = "";
        let in_field : boolean = false;
        let start: number   = 0;
        let end: number     = 0;
        for( let line of ilines ) {
            let m = M.OrgRe.RE_DRAWER.exec(line);
            if(in_field) {
                if(line.includes(":END:")) {
                    end = this._start + at.offset;
                    let loc = [start, end];
                    let drw = { "name":drawerName, "loc":loc };
                    this._drawers.append(drw);
                    in_field = false;
                }
            } else if(m != null && m[1] != "PROPERTIES" && m[1] != "END") {
                drawerName = m[1];
                start      = this._start + at.offset;
                in_field   = true;
            } else {
                yield line;
            }
        }
        for(let line of ilines) {
            yield line;
        }
    }

    private * IParseBlocks(ilines, at) {
        this._blocks = [];
        let in_block = false;
        let start:number = 0;
        let end:number   = 0;
        for( let line of ilines) {
            if(in_block) {
                if(line.include("#+END_") || line.includes("#+end_")) {
                    end = this._start + at.offset;
                    let blk = [start, end];
                    this._blocks.append(blk);
                    in_block = false;
                }
            } else if( line.include("#+BEGIN_") || line.include("#+begin_")) {
                start = this._start + at.offset;
                in_block = true;
            } else {
                yield line;
            }
        }
        for(let line of ilines) {
            yield line;
        }
    }

    _repeated_tasks_re = /\s+ - \s+State \s+ "(?P<done> [^"]+)" \s+from  \s+ "(?P<todo> [^"]+)" \s+\[ (?P<date> [^\]]+) \]/

    private * IParseRepeatedTasks(ilines, at) {
        this._repeated_tasks = [];
        for(let line of ilines) {
            let match = this._repeated_tasks_re.exec(line);
            if(match) {
                // FIXME: move this parsing to OrgDateRepeatedTask.from_str
                let mdict = match.groups;
                let done_state = mdict["done"];
                let todo_state = mdict['todo'];
                let date = OrgDate.from_str(mdict['date']);
                this._repeated_tasks.push(
                    OrgDateRepeatedTask(date.start, todo_state, done_state));
            } else {
                yield line;
            }
        }
    }

    private static GetText(text: string, format="plain") {
        if(format == "plain") {
            return M.OrgRe.ToPlainText(text);
        } else {
            return text;
        }
    }

    public GetHeading(format="plain"):string {
        return Heading.GetText(this._heading, format);
    }

    public GetBody(format="plain") : string {
        return Heading.GetText(this._body_lines.join("\n"),format);
    }

    public get Heading():string {
        return this.GetHeading();
    }

    public get Body():string {
        return this.GetBody();
    }

    public get Priority(): string {
        return this._priority;        
    }

    public GetTags(inher:boolean=false) {
        let tags = this._tags;
        if(inher) {
            let parent = this.GetParent();
            if(parent) {
                return tags | parent.GetTags(true);
            }
        }
        return tags;    
    }

    // Get a unique locator for this heading
    public GetLocator() {
        let heading = this._heading;
        let cur     = this;
        while(cur._parent && cur._parent.level > 0) {
            cur     = cur._parent;
            heading = cur._heading + ":" + heading;
        }
        return heading;
    }

    public GetParent() {
        return this._parent;
    }

    public get Todo() {
        return this._todo;
    }

    public GetProperty(key, val=null) {
        return this._properties.Get(key, val);
    }

    public get Properties() {
        return this._properties;
    }

    public get Scheduled() {
        return this._scheduled;
    }

    public get Deadline() {
        return this._deadline;
    }

    public get Closed() {
        return this._closed;
    }

    public get Clock() {
        return this._clocklist;
    }
}