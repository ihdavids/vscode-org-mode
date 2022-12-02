
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
            assert.equal(val.nodes[0].isType(par.OrgTypes.Headline), true);
            assert.equal((<par.Headline>val.nodes[0]).level, 1);
            assert.equal((<par.Headline>val.nodes[0]).text,  "H1");
            assert.equal((<par.Headline>val.nodes[0]).children.length,  1);
            assert.equal(val.nodes[1].isType(par.OrgTypes.Headline), true);
            assert.equal((<par.Headline>val.nodes[1]).level, 2);
            assert.equal((<par.Headline>val.nodes[1]).text,  "H2");
            assert.equal((<par.Headline>val.nodes[1]).children.length,  1);
            assert.equal(val.nodes[2].isType(par.OrgTypes.Headline), true);
            assert.equal((<par.Headline>val.nodes[2]).level, 3);
            assert.equal((<par.Headline>val.nodes[2]).text,  "H3");
            assert.equal((<par.Headline>val.nodes[2]).children.length,  0);
            assert.equal(val.nodes[3].isType(par.OrgTypes.Headline), true);
            assert.equal((<par.Headline>val.nodes[3]).level, 1);
            assert.equal((<par.Headline>val.nodes[3]).text,  "H4");
            assert.equal((<par.Headline>val.nodes[3]).children.length,  0);
        }
        // 2 top level nodes
        assert.equal(val.children.length, 2);
        assert.equal(val.links.length, 0);
    });


    test("Links", async () => {
        const file = '* H1\n  [[http://gooble.com][Gooble]]\n  [[https://something.com][Nothing]]\n** H2\n';
        const val:par.RootNode   = par.parseFileContents(file);
        assert.equal(val.children.length, 1);
        assert.equal(val.nodes.length, 4);
        if (val.nodes.length === 4) {
            assert.equal(val.children[0].level, 1);
            assert.equal(val.children[0].text,  "H1");
            assert.equal(val.children[0].children.length,  1);

            assert.equal(val.links.length, 2);
            assert.equal(val.links[0].href, "http://gooble.com");
            assert.equal(val.links[0].desc, "Gooble");
            assert.equal(val.links[0].parent,val.nodes[0]);

            assert.equal(val.links[1].href, "https://something.com");
            assert.equal(val.links[1].desc, "Nothing");
            assert.equal(val.links[1].parent,val.nodes[0]);
        }
    });
    test("Scheduled", async () => {
        const file = '* H1\n  SCHEDULED: <2022-11-30 Wed>\n  Some text\n** H2\n   <2022-11-30 Wed 11:51>\n   More text\n';
        const val:par.RootNode   = par.parseFileContents(file);
        assert.equal(val.children.length, 1);
        assert.equal(val.nodes.length, 4);
        if (val.nodes.length === 4) {
            assert.equal(val.children[0].level, 1);
            assert.equal(val.children[0].text,  "H1");
            assert.equal(val.children[0].children.length,  1);

            assert.equal(val.children[0].scheduled.date.start.getDate(),30);

            assert.equal(val.children[0].children.length, 1);
            assert.equal(val.children[0].children[0].timestamp.date.start.getDate(), 30);
            assert.equal(val.children[0].children[0].timestamp.date.start.getHours(), 11);
            assert.equal(val.children[0].children[0].timestamp.date.start.getMinutes(), 51);
        }
    });
    test("Deadline", async () => {
        const file = '* H1\n  DEADLINE: <2022-11-30 Wed>\n  Some text\n** H2\n   CLOSED: <2022-11-30 Wed 11:51>\n   More text\n';
        const val:par.RootNode   = par.parseFileContents(file);
        assert.equal(val.children.length, 1);
        assert.equal(val.nodes.length, 4);
        if (val.nodes.length === 4) {
            assert.equal(val.children[0].level, 1);
            assert.equal(val.children[0].text,  "H1");
            assert.equal(val.children[0].children.length,  1);

            assert.equal(val.children[0].deadline.date.start.getDate(),30);

            assert.equal(val.children[0].children.length, 1);
            assert.equal(val.children[0].children[0].closed.date.start.getDate(), 30);
            assert.equal(val.children[0].children[0].closed.date.start.getHours(), 11);
            assert.equal(val.children[0].children[0].closed.date.start.getMinutes(), 51);
        }
    });
    test("Comment", async () => {
        const file = '#+STARTUP: content\n#+TODO: TODO|DONE\n* H1\n  #+NAME: Hello\n  Some text\n** H2\n   #+NAME: World\n   More text\n';
        const val:par.RootNode   = par.parseFileContents(file);
        assert.equal(val.children.length, 1);
        assert.equal(val.nodes.length, 6);
        if (val.nodes.length === 6) {
            assert.equal(val.children[0].level, 1);
            assert.equal(val.children[0].text,  "H1");
            assert.equal(val.children[0].children.length,  1);
            assert.equal(val.getComment("STARTUP").val,  "content");
            assert.equal(val.getComment("STARTUP").name, "STARTUP");
            assert.equal(val.getComment("TODO").val,  "TODO|DONE");
            assert.equal(val.getComment("TODO").name, "TODO");
            assert.equal(val.getComment("NOTTHERE"), undefined);

            assert.equal(val.children[0].getComment("NAME").val, "Hello");
            assert.equal(val.children[0].children[0].getComment("NAME").val, "World");
            const cmt = val.children[0].children[0].getComment("STARTUP");
            assert.equal(cmt.val,  "content");
            assert.equal(cmt.name, "STARTUP");
        }
    });


});


