import { window, workspace } from 'vscode';
import { getUniq } from './utils';
import { Sets } from './sets';

export default function (todoString: string, action: string) {
    const todoKeywords = getUniq(Sets.keywords);
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