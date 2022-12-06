
import * as vscode from 'vscode';
import { Parser } from './parser';
import { Sets } from './sets';

export class Decoration implements vscode.Disposable {
	private parser: Parser;
	private descRegex: RegExp;
	private linkType: vscode.TextEditorDecorationType;
	private hideType: vscode.TextEditorDecorationType;
	private starTypes: vscode.TextEditorDecorationType[];
	private prefixStarType: vscode.TextEditorDecorationType;
	private headingType: vscode.TextEditorDecorationType;

	constructor(parser: Parser) {
		this.parser = parser;
		this.headingType = vscode.window.createTextEditorDecorationType({
			'textDecoration': 'underline wavy 1px'
		});
		// links
		this.descRegex = new RegExp('\\]\\[');
		this.linkType = vscode.window.createTextEditorDecorationType({
			'light': {
				'color': Sets.linkColoring,
      			'textDecoration': "underline;"
			},
			'dark': {
				'color': Sets.linkColoring,
      			'textDecoration': "underline;"
			}
		});
		// 'letterSpacing': '-256px',
		this.hideType = vscode.window.createTextEditorDecorationType({

			'light': {
				'color': 'rgba(0, 128, 255, 0.0)',
				'letterSpacing': '2px',
      			'textDecoration': "none; display: none;"
			},
			'dark': {
				'color': 'rgba(0, 128, 255, 0.0)',
				'letterSpacing': '2px',
      			'textDecoration': "none; display: none;"
			}
		});
		this.starTypes = [];
		const bullets = Sets.decoreBullets
		for (const bullet of bullets) {
			//console.log("BULLET: ", bullet);
			this.starTypes.push(vscode.window.createTextEditorDecorationType({
				'after': {
    	    		'contentText': bullet,
				},
    	  		'textDecoration': "none; display: none;"
			}));
		}
		this.prefixStarType = vscode.window.createTextEditorDecorationType({
			'light': {
				'color': 'rgba(1.0, 1.0, 1.0, 0.0)',
			},
			'dark': {
				'color': 'rgba(0.0, 0.0, 0.0, 0.0)',
			},
		});
	}

	dispose(): void {
	}

	addPrefix(hidestar, prefs, h, level: number) {
		if (prefs.length == level) {
			prefs.push([])
		}
		if (h && h.range) {
			if (level > 0) {
				const start = h.range.start;
				const end = new vscode.Position(h.range.start.line, h.range.start.character + level);
				const ran = new vscode.Range(start, end);
				hidestar.push(ran);
			}
			const start = new vscode.Position(h.range.start.line, h.range.start.character + level);
			const end = new vscode.Position(h.range.start.line, h.range.start.character + level + 1);
			const ran = new vscode.Range(start, end);
			prefs[level].push(ran);
		}
		for(let c of h.children) {
			this.addPrefix(hidestar, prefs, c, level + 1);
		}
	}

	async updateDecorations(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return Promise.resolve();
		}
		const shouldUnderline = Sets.underlineTopHeading;

		// Links
		if (Sets.prettyLinks) {
			const link: vscode.Range[] = [];
			const hide: vscode.Range[] = [];
			for (let l of this.parser.doc.getLinks()) {
				const start = l.range.start;
				const end = l.range.end;
				const text = editor.document.getText(l.range);
				const match = this.descRegex.exec(text);
				const offset = (match) ? match.index + 2 : 2;
				hide.push(new vscode.Range(start.line, start.character, start.line, start.character + offset))
				hide.push(new vscode.Range(end.line, end.character - 2, end.line, end.character));
				link.push(new vscode.Range(start.line, start.character + offset, end.line, end.character - 2));
			}
			editor.setDecorations(this.linkType, link);
			editor.setDecorations(this.hideType, hide);
		}

		// Bullets
		if (Sets.prettyBullets) {
			const prefix: vscode.Range[][] = [];
			const hidestar: vscode.Range[] = [];
			const headings: vscode.Range[] = [];
			const level = 0;
			for (let l of this.parser.doc.children) {
				this.addPrefix(hidestar, prefix, l, 0);
				if (shouldUnderline && l && l.range && l.range.start && l.range.end) {
					headings.push(new vscode.Range(new vscode.Position(l.fullLine.start.line, l.fullLine.start.character + 2), new vscode.Position(l.fullLine.end.line, l.fullLine.end.character)));
				}
			}
			for (const [idx, _] of this.starTypes.entries()) {
				if (idx < prefix.length) {
					editor.setDecorations(this.starTypes[idx], prefix[idx]);
				} else {
					editor.setDecorations(this.starTypes[idx], []);
				}
			}
			editor.setDecorations(this.prefixStarType, hidestar);
			if (shouldUnderline) {
				editor.setDecorations(this.headingType, headings);
			}
		}
	}

}