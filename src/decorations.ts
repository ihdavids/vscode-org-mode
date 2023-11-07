
import * as vscode from 'vscode';
import { Parser } from './parser';
import { Sets } from './sets';

export class Decoration implements vscode.Disposable {
	private parser: Parser;
	private descRegex: RegExp;
	private linkType: vscode.TextEditorDecorationType;
	private tagType: vscode.TextEditorDecorationType;
	private hideType: vscode.TextEditorDecorationType;
	private starTypes: vscode.TextEditorDecorationType[];
	private prefixStarType: vscode.TextEditorDecorationType;
	private headingType: vscode.TextEditorDecorationType[];
	private blockType: vscode.TextEditorDecorationType[];

	constructor(parser: Parser) {
		this.blockType = [];
		this.parser = parser;
		this.headingType = [];
		let formatting = Sets.headingFormatting;
		// We allow per heading text decorations to make your documents more interesting to read
		for (var i = 0; i < 8; i++) {
			if (i < formatting.length) {
				let f = formatting[i];
				if (Object.keys(f).length <= 0) {
					this.headingType[i] = vscode.window.createTextEditorDecorationType({'textDecoration': ``,});
				} else {
					let props = '';
					for (let k in f) {
						let v = f[k];
						props += k + ": " + v + ";";
					}
					//font-size: 20px; 
					//font-style: italic; 
					//font-family: "Ink Free";
					//console.log("props: ",i,props);
					this.headingType[i] = vscode.window.createTextEditorDecorationType({
						'textDecoration': `; display: inline-block;
						${props}
						`,
					});
				}
			}
		}
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
		this.tagType = vscode.window.createTextEditorDecorationType({
			'light': {
				'color': Sets.tagColoring,
			},
			'dark': {
				'color': Sets.tagColoring,
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

	addPrefix(hidestar, prefs, h, level: number, blocks, editor, headings, tags) {
		while (prefs.length <= level) {
			prefs.push([])
		}
		if (h && h.range) {

			let clevel = h.level
			let hlevel = h.level-1;
			if (hlevel < headings.length && h.range.start && h.range.end) {
				headings[hlevel].push(new vscode.Range(new vscode.Position(h.fullLine.start.line, h.fullLine.start.character + hlevel + 2), new vscode.Position(h.noTagsFullLine.end.line, h.noTagsFullLine.end.character + hlevel)));
			}
			if (h.tags.length > 0) {
				tags.push(h.tagsRange);
			}
			let blks = h.getSourceBlocks();
			for (let b of blks) {
				let height = b.height*100;
				let clevel = b.parent.level*10;

				let editorBackgroundFormula = 'var(--vscode-editor-background)';
				let bgColor = `linear-gradient(to right, ${editorBackgroundFormula}, ${editorBackgroundFormula})`;
				let id = this.blockType.push(vscode.window.createTextEditorDecorationType({
					'before': {
					'contentText': '',
					'textDecoration': `;box-sizing: content-box !important; display: inline-block;
						width: 90%;
						height: ${height}%;
						left: ${clevel}px;
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
			this.addPrefix(hidestar, prefs, c, c.level-1, blocks, editor, headings, tags);
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
			const headings: vscode.Range[][] = [[],[],[],[],[],[],[],[]];
			const sourceBlocks: vscode.Range[] = [];
			const tags: vscode.Range[] = [];
			const level = 0;
			for (let l of this.parser.doc.children) {
				this.addPrefix(hidestar, prefix, l, 0, sourceBlocks, editor, headings, tags);
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
				for (let i in headings) {
					editor.setDecorations(this.headingType[i], headings[i]);
				}
			}
			editor.setDecorations(this.tagType, tags);
		}
	}

}