
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as par    from '../src/parser';

suite("Parser Tests", () => {

    // Defines a Mocha unit test
    test("Headings", async () => {
        const file = '* H1\n** H2\n*** H3\n* H4\n';
        const val:par.RootNode   = par.parseFileContents(file);
        assert.equal(val.nodes.length, 4);
        if (val.nodes.length === 4) {
            assert.equal(val.nodes[0].level, 1);
            assert.equal(val.nodes[0].text,  "H1");
            assert.equal(val.nodes[0].children.length,  1);
            assert.equal(val.nodes[1].level, 2);
            assert.equal(val.nodes[1].text,  "H2");
            assert.equal(val.nodes[1].children.length,  1);
            assert.equal(val.nodes[2].level, 3);
            assert.equal(val.nodes[2].text,  "H3");
            assert.equal(val.nodes[2].children.length,  0);
            assert.equal(val.nodes[3].level, 1);
            assert.equal(val.nodes[3].text,  "H4");
            assert.equal(val.nodes[3].children.length,  0);
        }
        // 2 top level nodes
        assert.equal(val.children.length, 2);
        assert.equal(val.links.length, 0);
    });
});


