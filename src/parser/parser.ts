import fs from 'fs';
import * as Org from './orgfile';
import * as M from './matcher'

export class OrgParser {
        public static Load(filename: string) : Org.OrgFile {
            let data : string = fs.readFileSync(filename, 'utf8');
            return OrgParser.LoadString(data)
        }

        public static LoadString(filedata: string) : Org.OrgFile {
            let lines = filedata.split(/\r?\n/);
            return OrgParser.LoadFromLines(lines);
        }

        public static * LinesToChunks(lines) {
            let chunk = [];
            let count : number = 0;
            let start : number = 0;
            let end : number   = 0;
            for( let l of lines) {
                if(M.OrgRe.RE_NODE_HEADER.test(l)) {
                    end = count - 1;
                    yield [chunk, start, end];
                    chunk = [];
                    start = count;
                }
                chunk.push(l.replace(/\s+$/,''));
                count += 1;
            }
            end = count - 1;
            yield [chunk, start, end];
        }

        public static LoadFromLines(lines) : Org.OrgFile {
            let f : Org.OrgFile = new Org.OrgFile([], [], "unknown");
            f.FromChunks( OrgParser.LinesToChunks(lines) );
            return f;
        }
}