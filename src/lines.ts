// Lines of text, and the smallest edit between two versions of them. Shared by
// everything that rewrites a block of a document: tables, outlines, lists.

export interface LineEdit { startLine: number; startCh: number; endLine: number; endCh: number; text: string; }

// The smallest single edit that turns one block of lines into another, in the
// block's own coordinates. Writing back only what changed leaves the cursor,
// markers and vim's idea of where it is alone wherever nothing moved.
export function diffLines(old: string[], next: string[]): LineEdit | undefined {
    let p = 0;
    while (p < old.length && p < next.length && old[p] === next[p]) {
        p++;
    }
    if (p === old.length && p === next.length) {
        return undefined;
    }
    let s = 0;
    while (s < Math.min(old.length, next.length) - p && old[old.length - 1 - s] === next[next.length - 1 - s]) {
        s++;
    }
    const oldMid = old.slice(p, old.length - s);
    const newMid = next.slice(p, next.length - s);
    if (oldMid.length === 1 && newMid.length === 1) {
        const a = oldMid[0];
        const b = newMid[0];
        let cp = 0;
        while (cp < a.length && cp < b.length && a[cp] === b[cp]) {
            cp++;
        }
        let cs = 0;
        while (cs < Math.min(a.length, b.length) - cp && a[a.length - 1 - cs] === b[b.length - 1 - cs]) {
            cs++;
        }
        return { startLine: p, startCh: cp, endLine: p, endCh: a.length - cs, text: b.slice(cp, b.length - cs) };
    }
    if (oldMid.length && newMid.length) {
        const last = p + oldMid.length - 1;
        return { startLine: p, startCh: 0, endLine: last, endCh: old[last].length, text: newMid.join('\n') };
    }
    if (oldMid.length === 0) {
        if (p < old.length) {
            return { startLine: p, startCh: 0, endLine: p, endCh: 0, text: newMid.join('\n') + '\n' };
        }
        const last = old.length - 1;
        return { startLine: last, startCh: old[last].length, endLine: last, endCh: old[last].length, text: '\n' + newMid.join('\n') };
    }
    const end = p + oldMid.length;
    if (end < old.length) {
        return { startLine: p, startCh: 0, endLine: end, endCh: 0, text: '' };
    }
    return { startLine: p - 1, startCh: old[p - 1].length, endLine: old.length - 1, endCh: old[old.length - 1].length, text: '' };
}
