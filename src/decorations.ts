
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
	private blockType: vscode.TextEditorDecorationType[];

	constructor(parser: Parser) {
		this.blockType = [];
		this.parser = parser;
		this.headingType = vscode.window.createTextEditorDecorationType({
			'textDecoration': 'underline wavy 1px'
		});
		// Source block shading

				//border-radius: 30px;
				//margin: -1px;
				//'backgroundColor': 'rgba(0, 0, 0, 1.0)',
				//height: calc(100% + 1px);
				//position: static;
				//width: 100%; max-width: 100%; min-width: 100%;
				//
				//position: relative;
				//background-origin: padding-box, border-box;
				//top: -1px;
				//left: 3%;
				//z-index: -100;
		/*
		this.blockType = vscode.window.createTextEditorDecorationType({
			'before': {
			'contentText': '',
			'textDecoration': `;box-sizing: content-box !important; display: inline-block;
				width: 90%;
				height: 300%;
				left: 3%;
				border-radius: 5px;
				position: absolute;
				background-origin: padding-box, border-box;
				background: black;
				z-index: -100;
				border-left: 3px solid grey;
				`,
			}
		});
		*/
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

	addPrefix(hidestar, prefs, h, level: number, blocks, editor) {
		if (prefs.length == level) {
			prefs.push([])
		}
		if (h && h.range) {

			let blks = h.getSourceBlocks();
			for (let b of blks) {
				let height = b.height*100;
				let level = b.parent.level;

				let editorBackgroundFormula = 'var(--vscode-editor-background)';
				let bgColor = `linear-gradient(to right, ${editorBackgroundFormula}, ${editorBackgroundFormula})`;
				let id = this.blockType.push(vscode.window.createTextEditorDecorationType({
					'before': {
					'contentText': '',
					'textDecoration': `;box-sizing: content-box !important; display: inline-block;
						width: 90%;
						height: ${height}%;
						left: ${level}.5%;
						border-radius: 5px;
						position: absolute;
						background-origin: padding-box, border-box;
						background: linear-gradient(to right,rgba(0.1,0.1,.1,1.0),transparent 80%), ${bgColor};
						z-index: -100;
						border-left: 2px solid grey;
						`,
					}
					}));
				editor.setDecorations(this.blockType[id-1], [b.range]);
			}
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
			this.addPrefix(hidestar, prefs, c, level + 1, blocks, editor);
		}
	}

	async updateDecorations(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return Promise.resolve();
		}
		const shouldUnderline = Sets.underlineTopHeading;

		for (let x of this.blockType) {
			editor.setDecorations(x, []);
		}
		this.blockType = []
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
			const sourceBlocks: vscode.Range[] = [];
			const level = 0;
			for (let l of this.parser.doc.children) {
				this.addPrefix(hidestar, prefix, l, 0, sourceBlocks, editor);
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