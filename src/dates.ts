// Org timestamps and clock lines as text. No vscode here.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

// <2026-10-11 Sun>, [2026-10-11 Sun 14:05] and so on.
export function stamp(d: Date, active: boolean, time: boolean): string {
    const body = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${DAYS[d.getDay()]}` +
        (time ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
    return active ? `<${body}>` : `[${body}]`;
}

function parseStamp(s: string): Date | undefined {
    const m = /(\d{4})-(\d{2})-(\d{2})(?:\s+\w+)?\s+(\d{1,2}):(\d{2})/.exec(s);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : undefined;
}

// A closed CLOCK: line with its total worked out again: =>  1:05.
export function recalcClockLine(line: string): string {
    const m = /^(\s*CLOCK:\s*)(\[[^\]]+\])--(\[[^\]]+\])(?:\s*=>\s*-?\d+:\d{2})?\s*$/.exec(line);
    if (!m) {
        return line;
    }
    const a = parseStamp(m[2]);
    const b = parseStamp(m[3]);
    if (!a || !b) {
        return line;
    }
    const mins = Math.round((b.getTime() - a.getTime()) / 60000);
    const sign = mins < 0 ? '-' : '';
    const abs = Math.abs(mins);
    return `${m[1]}${m[2]}--${m[3]} => ${sign}${String(Math.floor(abs / 60)).padStart(2, ' ')}:${pad(abs % 60)}`;
}

// A heading's title as a CUSTOM_ID: lower case words joined by dashes.
export function slug(title: string): string {
    return title.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'section';
}

export function elapsed(since: Date, now: Date = new Date()): string {
    const mins = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));
    return `${Math.floor(mins / 60)}:${pad(mins % 60)}`;
}
