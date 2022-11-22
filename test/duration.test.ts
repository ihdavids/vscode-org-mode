import * as assert from 'assert';
import * as vscode from 'vscode';
import * as dur    from '../src/duration';

suite("Duration Tests", () => {

    // Defines a Mocha unit test
    test("Simple Duration", async () => {
        const expected = '2y3d5h6min';
        const val   = dur.OrgDuration.parse(expected);
        const result = val.toString();
        assert.equal(result, expected);
    });
    test("Year Duration", async () => {
        const expected = '1y';
        const val   = dur.OrgDuration.parse(expected);
        const result = val.toString();
        assert.equal(result, expected);
    });
    test("Day Duration", async () => {
        const expected = '2d';
        const val   = dur.OrgDuration.parse(expected);
        const result = val.toString();
        assert.equal(result, expected);
    });
    test("Hour Duration", async () => {
        const expected = '3h';
        const val   = dur.OrgDuration.parse(expected);
        const result = val.toString();
        assert.equal(result, expected);
    });
    test("Min Duration", async () => {
        const expected = '4min';
        const val   = dur.OrgDuration.parse(expected);
        const result = val.toString();
        assert.equal(result, expected);
    });
    test("Time Duration", async () => {
        const expected = '1d 3:44';
        const val   = dur.OrgDuration.parse(expected);
        const result = val.toString();
        assert.equal(result, expected);
    });
    test("Sec Time Duration", async () => {
        const expected = '1d 4:12:43';
        const val   = dur.OrgDuration.parse(expected);
        const result = val.toString();
        assert.equal(result, expected);
    });
});
/*
// ================================================================================
class OrgTestDurationCommand(sublime_plugin.TextCommand):
    def run(self, edit, onDone=None):
        d = OrgDuration.Parse("2y3d5h6min")
        print(str(d))
        d = OrgDuration.Parse("1y")
        print(str(d))
        d = OrgDuration.Parse("2d")
        print(str(d))
        d = OrgDuration.Parse("3h")
        print(str(d))
        d = OrgDuration.Parse("4min")
        print(str(d))
        d = OrgDuration.Parse("1d 3:44")
        print(str(d))
        d = OrgDuration.Parse("1d 4:55:55")
        print(str(d))
        */