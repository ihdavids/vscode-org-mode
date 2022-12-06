import { window, workspace } from 'vscode';
import { getUniq } from './utils';
import { Sets } from './sets';
import { Headline } from './parser';

export default function (h: Headline, action: string) {
    let todoString = h.status;
    if (todoString === undefined)  {
        todoString = "";
    }
    let todoKeywords = getUniq(h.getAllTodos());
    if (todoKeywords.indexOf("") < 0) {
        todoKeywords.splice(0,0,"");
    }
    let nextKeywordIdx = todoKeywords.indexOf(todoString);
    if (nextKeywordIdx < 0) {
        window.showErrorMessage(`Keyword '${todoString}' not found`);
        return todoString;
    } else {
        const mod = action === "UP" ? 1 : -1;
        nextKeywordIdx = (nextKeywordIdx + mod);
        if (nextKeywordIdx < 0) {
            nextKeywordIdx = todoKeywords.length - 1;
        } else {
            nextKeywordIdx %= todoKeywords.length;
        }
    }

    let nextWord = todoKeywords[nextKeywordIdx];
    if (todoString === "") {
        nextWord += " ";
    }

    return nextWord;
}