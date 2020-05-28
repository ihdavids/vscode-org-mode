import * as Org from './heading';

export class OrgFile {
    _todos: Array<string> = [];
    _dones: Array<string> = [];
    _todo_not_specified_in_comment: boolean = true;
    _headings: any;
    properties: any;
    customids: any;
    _filename: string;


    constructor(todos : Array<string>, dones: Array<string>, filename: string) {
        this._todos = todos;
        this._dones = dones;
        this._todo_not_specified_in_comment = true;
        this._filename = filename;
        this._headings = [];
        this.properties = [];
        this.customids = {};
    }

    get Headings() {
        return this._headings;
    }

    public AddTodoKeys(todos: any[], dones: any[]) {
        if(this._todo_not_specified_in_comment) {
            this._todos = [];
            this._dones = [];
        }
        this._todos.concat(todos);
        this._dones.concat(dones);
    }

    get TodoKeys() {
        return this._todos;
    }

    get DoneKeys() {
        return this._dones;
    }

    get AllKeys() {
        let temp = [];
        return temp.concat(this.TodoKeys, this.DoneKeys);
    }

    get Filename() {
        return this._filename;
    }

    private ParseRoot(chunk) {
        // TODO Fill this in!
    }

    public FromChunks(chunks) {
        this.ParseRoot(chunks.next());
        let chunk;
        this._headings = [];
        let i : number = 0;
        while((chunk = chunks.next())) {
            i += 1;
            let heading = Org.Heading.FromChunk(chunk);
            this._headings.push(heading);
            heading.SetIndex(i);
            heading.PostParse();
        }
    }
}