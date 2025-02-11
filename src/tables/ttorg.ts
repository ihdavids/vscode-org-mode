import * as tt from './tttable';
import {Table, RowType, ColDef} from '../parser'
import * as vscode from 'vscode';


export const verticalSeparator = '|';
export const horizontalSeparator = '-';
export const intersection = '+';

type StringReducer = (previous: string, current: string, index: number) => string;

// Table execution done by orgs is a process of asking orgs to evaluate the table,
// return the entire table as a string, then have the editor replace the table.
// WHY? Because that means you can undo in the editor but by doing all evaluation
// .    at once in orgs it's much faster.


export class OrgParser implements tt.Parser {
    parse(text: string): Table | undefined {
        if (!text || text.length === 0) {
            return undefined;
        }

        const result = new Table();
        const lines = text.split('\n');
        let indent = 0;
        if (lines && lines.length > 0) {
            const idx = lines[0].indexOf(verticalSeparator);
            if (idx >= 0) {
                indent = idx;
            }
        }
        const strings = lines.map(x => x.trim()).filter(x => x.startsWith(verticalSeparator));

        for (const s of strings) {
            if (this.isSeparatorRow(s)) {
                result.addRow(RowType.Separator, []);
                continue;
            }

            const lastIndex = s.length - (s.endsWith(verticalSeparator) ? 1 : 0);
            const values = s
                .slice(1, lastIndex)
                .split(verticalSeparator)
                .map(x => x.trim());

            result.addRow(RowType.Data, values);
        }
        result.setIndent(indent);
        return result;
    }

    isSeparatorRow(text: string): boolean {
        return text.length > 1 && text[1] === horizontalSeparator;
    }
}

export class OrgStringifier implements tt.Stringifier {
    private reducers = new Map([
        [RowType.Data, this.dataRowReducer],
        [RowType.Separator, this.separatorReducer],
    ]);

    public indent: string = "";

    stringify(table: Table, range: any= null): string {
        const result = [];
        let width  = 0;
        let height = table.rows.length;
        this.indent = table.getIndent();
        for (let i = 0; i < table.rows.length; ++i) {
            let rowString = '';
            const rowData = table.getRow(i);
            const reducer = this.reducers.get(table.rows[i].type);
            if (reducer) {
                rowString = rowData.reduce(reducer(table.cols), verticalSeparator);
            }
            rowString = this.indent + rowString
            width = rowString.length
            result.push(rowString);
        }
        if (range) {
            range.width = width;
            range.height = height;
        }
        return result.join('\n');
    }

    private dataRowReducer(cols: ColDef[]): StringReducer {
        return (prev, cur, idx) => {
            const pad = ' '.repeat(cols[idx].width - cur.length + 1);
            return prev + ' ' + cur + pad + verticalSeparator;
        };
    }

    private separatorReducer(cols: ColDef[]): (p: string, c: string, i: number) => string {
        return (prev, _, idx) => {
            // Intersections for each cell are '+', except the last one, where it should be '|'
            const ending = (idx === cols.length - 1)
                ? verticalSeparator
                : intersection;

            return prev + horizontalSeparator.repeat(cols[idx].width + 2) + ending;
        };
    }
}

export class OrgLocator implements tt.Locator {
    /**
     * Locate start and end of Org table in text from line number.
     *
     * @param reader Reader that is able to read line by line
     * @param lineNr Current line number
     * @returns vscode.Range if table was located. undefined if it failed
     */
    locate(reader: tt.LineReader, lineNr: number): vscode.Range | undefined {

        // Checks that line starts with vertical bar
        const isTableLikeString = (ln: number) => {
            if (ln < 0 || ln >= reader.lineCount) {
                return false;
            }
            const line = reader.lineAt(ln);
            const firstCharIdx = line.firstNonWhitespaceCharacterIndex;
            const firstChar = line.text[firstCharIdx];
            return firstChar === '|';
        };

        let start = lineNr;
        while (isTableLikeString(start)) {
            start--;
        }

        let end = lineNr;
        while (isTableLikeString(end)) {
            end++;
        }

        if (start === end) {
            return undefined;
        }

        const startPos = reader.lineAt(start + 1).range.start;
        const endPos = reader.lineAt(end - 1).range.end;

        return new vscode.Range(startPos, endPos);
    }
}