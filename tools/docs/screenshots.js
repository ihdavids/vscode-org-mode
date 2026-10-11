#!/usr/bin/env node
// Takes the manual's screenshots. It opens VS Code on the demo workspace with
// the plugin under development and a debugging port, lets tools/docs/scenes.js
// set each scene up, and captures the window through the Chrome DevTools
// Protocol - no screen recording permission needed. The pictures are scaled to
// 1600 pixels across with macOS's sips.
//
//   node tools/docs/screenshots.js --demo <dir> --out docs/images --orgs <url> [--vscode <path>] [--scenes a,b]

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}
const root = path.resolve(__dirname, '../..');
const demo = path.resolve(args.demo);
const outDir = path.resolve(args.out || path.join(root, 'docs/images'));
const vscodePath = args.vscode || process.env.VSCODE_PATH || '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const debugPort = 9300 + Math.floor(Math.random() * 500);
fs.mkdirSync(outDir, { recursive: true });

// A profile of its own: one theme, no chat panel or minimap, nothing to sign
// in to - the same window every time.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'iorg-shots-'));
const extensions = path.join(profile, 'extensions');
fs.mkdirSync(path.join(profile, 'User'), { recursive: true });
fs.mkdirSync(extensions);
fs.writeFileSync(path.join(profile, 'User', 'settings.json'), JSON.stringify({
    'workbench.colorTheme': 'Default Dark Modern',
    'workbench.startupEditor': 'none',
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.disableAIFeatures': true,
    'workbench.tips.enabled': false,
    'workbench.layoutControl.enabled': false,
    'window.commandCenter': false,
    'window.restoreWindows': 'none',
    'editor.minimap.enabled': false,
    'editor.fontSize': 14,
    'editor.lineHeight': 22,
    'editor.renderWhitespace': 'none',
    'git.enabled': false,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'extensions.ignoreRecommendations': true,
    'org.orgsConnection': args.orgs,
}, null, 2));

async function cdp(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const waiting = new Map();
    ws.onmessage = m => {
        const d = JSON.parse(m.data);
        if (waiting.has(d.id)) {
            waiting.get(d.id)(d);
            waiting.delete(d.id);
        }
    };
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    return {
        send: (method, params = {}) => new Promise(resolve => {
            const i = ++id;
            waiting.set(i, resolve);
            ws.send(JSON.stringify({ id: i, method, params }));
        }),
        close: () => ws.close(),
    };
}

async function workbench() {
    for (let t = 0; t < 60; t++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
            const page = targets.find(x => x.type === 'page' && /workbench/.test(x.url));
            if (page) {
                return page;
            }
        } catch (e) {
            // not up yet
        }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('VS Code did not come up');
}

let page;
let sized = false;
async function capture(name) {
    page = page || await workbench();
    if (!sized) {
        // The same window size every time.
        const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
        const browser = await cdp(version.webSocketDebuggerUrl);
        const win = await browser.send('Browser.getWindowForTarget', { targetId: page.id });
        if (win.result) {
            await browser.send('Browser.setWindowBounds', { windowId: win.result.windowId, bounds: { windowState: 'normal' } });
            await browser.send('Browser.setWindowBounds', { windowId: win.result.windowId, bounds: { left: 40, top: 40, width: 1440, height: 900 } });
        }
        browser.close();
        sized = true;
        await new Promise(r => setTimeout(r, 800));
    }
    const conn = await cdp(page.webSocketDebuggerUrl);
    const shot = await conn.send('Page.captureScreenshot', { format: 'png' });
    conn.close();
    const raw = path.join(profile, name + '.png');
    fs.writeFileSync(raw, Buffer.from(shot.result.data, 'base64'));
    const out = path.join(outDir, name + '.png');
    try {
        execFileSync('sips', ['-Z', '1600', raw, '--out', out], { stdio: 'ignore' });
    } catch (e) {
        fs.copyFileSync(raw, out);   // no sips: full size
    }
    console.log('  ' + path.relative(root, out));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/shot') {
        try {
            await capture(url.searchParams.get('name'));
            res.end('ok');
        } catch (e) {
            res.statusCode = 500;
            res.end(e.message);
        }
        return;
    }
    res.statusCode = 404;
    res.end();
});

server.listen(0, '127.0.0.1', () => {
    const shotPort = server.address().port;
    console.log(`Taking screenshots of ${path.relative(root, demo) || demo}:`);
    const code = spawn(vscodePath, [
        demo,
        `--extensionDevelopmentPath=${root}`,
        `--extensionTestsPath=${path.join(__dirname, 'scenes.js')}`,
        `--user-data-dir=${profile}`,
        `--extensions-dir=${extensions}`,
        `--remote-debugging-port=${debugPort}`,
        '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
    ], { env: Object.assign({}, process.env, { SHOT_PORT: String(shotPort), DEMO_DIR: demo, SCENES: args.scenes || '' }), stdio: ['ignore', 'pipe', 'pipe'] });
    code.stderr.on('data', d => /scene .* failed/.test(String(d)) && process.stderr.write(d));
    code.stdout.on('data', d => /scene .* failed/.test(String(d)) && process.stderr.write(d));
    code.on('exit', () => {
        server.close();
        fs.rmSync(profile, { recursive: true, force: true });
    });
});
