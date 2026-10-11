// The pictures and maths in a stretch of an org file, for the side panel that
// shows them. No vscode here.

import { findLinks, parseTarget, isImage } from './links/model';

export interface Media { kind: 'image' | 'math'; line: number; text: string; display: boolean; }

// Images linked, and LaTeX written: $x$, \(x\), \[x\], $$x$$ and
// \begin{...}...\end{...}. Source blocks are skipped.
export function findMedia(lines: string[], from: number, to: number): Media[] {
    const out: Media[] = [];
    let inSrc = false;
    let env: { name: string, line: number, body: string[] } | undefined;
    for (let i = from; i < to && i < lines.length; i++) {
        const text = lines[i];
        if (/^\s*#\+BEGIN_SRC/i.test(text)) {
            inSrc = true;
            continue;
        }
        if (inSrc) {
            inSrc = !/^\s*#\+END_SRC/i.test(text);
            continue;
        }
        if (env) {
            env.body.push(text);
            if (text.indexOf('\\end{' + env.name + '}') >= 0) {
                out.push({ kind: 'math', line: env.line, text: env.body.join('\n'), display: true });
                env = undefined;
            }
            continue;
        }
        const begin = /\\begin\{([a-z*]+)\}/.exec(text);
        if (begin && /^(equation|align|gather|multline|eqnarray|math|displaymath)\*?$/.test(begin[1])) {
            if (text.indexOf('\\end{' + begin[1] + '}') >= 0) {
                out.push({ kind: 'math', line: i, text: text.trim(), display: true });
            } else {
                env = { name: begin[1], line: i, body: [text] };
            }
            continue;
        }
        if (text.indexOf('[[') >= 0) {
            for (const l of findLinks(text)) {
                const t = parseTarget(l.target);
                if (isImage(t)) {
                    out.push({ kind: 'image', line: i, text: t.path, display: true });
                }
            }
        }
        const re = /\$\$([^$]+)\$\$|\\\[(.+?)\\\]|\\\((.+?)\\\)|(?:^|[^\\$\w])\$([^\s$](?:[^$]*[^\s$])?)\$(?![\w$])/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            const body = m[1] || m[2] || m[3] || m[4];
            out.push({ kind: 'math', line: i, text: body, display: !!(m[1] || m[2]) });
        }
    }
    return out;
}
