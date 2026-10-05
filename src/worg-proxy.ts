// A pass-through from loopback to the orgs server, for the worg panels.
//
// A webview loads its iframe the way a browser does, so a server on https with
// a self-signed certificate is refused outright ("tls: unknown certificate" in
// the server's log) - `org.allowSelfSigned` only ever covered the plugin's own
// requests, made from node. When that setting is on, the panel loads worg from
// here instead: plain http on 127.0.0.1, which a webview counts as a secure
// origin, forwarded to the server with the certificate check off - the same
// trust the user already gave the plugin's own connection.
//
// Worg asks its own origin for the api, so everything it does comes through
// here too. It uses no websockets, so requests are all there is to forward.
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

let server: http.Server | null = null;
let serving: Promise<string> | null = null;
let target = '';

// The loopback address standing in for `to`, started on first use. A change of
// target restarts it.
export function proxyFor(to: string): Promise<string> {
    if (serving && target === to) {
        return serving;
    }
    stopProxy();
    target = to;
    const t = new URL(to);
    const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
    const s = http.createServer((req, res) => {
        const headers = { ...req.headers };
        headers.host = t.host;
        // The page's origin is this proxy's, which the server's cors list has
        // never heard of. Same-origin as far as the page is concerned, so the
        // header carries nothing the server needs.
        delete headers.origin;
        delete headers.referer;
        const up = https.request({
            protocol: t.protocol,
            hostname: t.hostname,
            port: t.port || 443,
            method: req.method,
            path: req.url,
            headers,
            agent,
        }, upRes => {
            res.writeHead(upRes.statusCode || 502, upRes.headers);
            upRes.pipe(res);
        });
        up.on('error', err => {
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
            }
            res.end(`orgs server at ${to} did not answer: ${err.message}`);
        });
        req.pipe(up);
    });
    server = s;
    serving = new Promise<string>((resolve, reject) => {
        s.once('error', reject);
        // Port 0: whatever is free. Bound to loopback only - nothing off this
        // machine can reach the server through here.
        s.listen(0, '127.0.0.1', () => {
            resolve(`http://127.0.0.1:${(s.address() as { port: number }).port}`);
        });
    });
    return serving;
}

export function stopProxy() {
    if (server) {
        server.close();
    }
    server = null;
    serving = null;
    target = '';
}
