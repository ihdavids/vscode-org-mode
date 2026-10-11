// The extension tests, as the Extension Host runs them: every *.test.js
// beside this file, or those named in TEST_FILES (comma separated).
import * as path from 'path';
import * as fs from 'fs';
import * as Mocha from 'mocha';

export function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20000 });
    const named = (process.env.TEST_FILES || '').split(',').filter(f => f);
    const files = named.length ? named : fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'));
    files.forEach(f => mocha.addFile(path.join(__dirname, f)));
    return new Promise((resolve, reject) => {
        mocha.run(failures => failures ? reject(new Error(`${failures} test${failures === 1 ? '' : 's'} failed`)) : resolve());
    });
}
