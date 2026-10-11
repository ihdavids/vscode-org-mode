// Run the extension tests in a VS Code of their own: the one at VSCODE_PATH,
// or a copy downloaded for the purpose. Other extensions are off, except in
// TEST_EXTENSIONS_DIR (put VSCodeVim there for the vim tests).
//
//   npm test                                   unit tests, then the editor tests
//   ORGS_TEST_URL=http://localhost:8010 npm test   ...with the formula tests
//   TEST_ORG_DIR=... (the server's org dir)    ...and the feature tests
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    const root = path.resolve(__dirname, '../..');
    const launchArgs = ['--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'];
    if (process.env.TEST_ORG_DIR) {
        launchArgs.unshift(process.env.TEST_ORG_DIR);
    }
    if (process.env.TEST_EXTENSIONS_DIR) {
        launchArgs.push('--extensions-dir=' + process.env.TEST_EXTENSIONS_DIR);
    } else {
        launchArgs.push('--disable-extensions');
    }
    try {
        await runTests({
            vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
            extensionDevelopmentPath: root,
            extensionTestsPath: path.join(__dirname, 'index'),
            launchArgs,
        });
    } catch (e) {
        console.error(e.message || e);
        process.exit(1);
    }
}

main();
