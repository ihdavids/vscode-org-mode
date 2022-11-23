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
        const input    = '1d 3:44';
        const expected = '1d3h44min';
        const val   = dur.OrgDuration.parse(input);
        const result = val.toString();
        assert.equal(result, expected);
    });
    test("Sec Time Duration", async () => {
        const input    = '1d 4:12:43';
        const expected = '1d4h12min';
        const val   = dur.OrgDuration.parse(input);
        const result = val.toString();
        assert.equal(result, expected);
    });
});