
/* SDOC: Developers
* Decorations
  The pretty-printing - link markup hidden, a heading's stars shown as one
  bullet, headings styled, source blocks shaded - is drawn from one pass
  over the lines (=decorations-scan.ts= =scanLines=), a moment after typing
  stops (=OrgExtension.update=). Each decoration type is made once, in the
  constructor, and disposed with the extension; nothing is created per
  update.
EDOC */

import * as vscode from 'vscode';
import { scanLines, Span } from './decorations-scan';
import { Sets } from './sets';
import {Decorator} from './decorations/decorator';

export class Decoration implements vscode.Disposable {
	private linkType: vscode.TextEditorDecorationType;
	private tagType: vscode.TextEditorDecorationType;
	private hideType: vscode.TextEditorDecorationType;
	private starTypes: vscode.TextEditorDecorationType[];
	private prefixStarType: vscode.TextEditorDecorationType;
	private headingType: vscode.TextEditorDecorationType[];
	private blockType: vscode.TextEditorDecorationType;
	public static selectedCellType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(Sets.selectedCellIndicator);
	public static targetCellType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(Sets.targetCellIndicator);
	public static activeFormulaType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType(Sets.activeFormulaIndicator);

	constructor() {
		// Source blocks: a shade and a rule down the left, in the theme's colours.
		this.blockType = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			backgroundColor: new vscode.ThemeColor('textCodeBlock.background'),
			borderWidth: '0 0 0 2px',
			borderStyle: 'solid',
			borderColor: new vscode.ThemeColor('editorIndentGuide.background'),
		});
		this.headingType = [];
		const formatting = Sets.headingFormatting;
		// We allow per heading text decorations to make your documents more interesting to read
		for (let i = 0; i < 8; i++) {
			{
				const f = i < formatting.length && formatting[i] ? formatting[i] : {};
				if (Object.keys(f).length <= 0) {
					this.headingType[i] = vscode.window.createTextEditorDecorationType({'textDecoration': ``,});
				} else {
					let props = '';
					for (const k in f) {
						const v = f[k];
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
		[this.linkType, this.tagType, this.hideType, this.prefixStarType, this.blockType]
			.concat(this.starTypes, this.headingType).forEach(t => t && t.dispose());
	}

	// Pretty-print the editor's file: link markup hidden, the stars of a
	// heading shown as one bullet, headings styled, source blocks shaded. One
	// pass over the lines (decorations-scan.ts), so it keeps up with typing.
	async updateDecorations(editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor): Promise<void> {
		if (!editor || editor.document.languageId !== 'org') {
			return;
		}
		const doc = editor.document;
		const lines: string[] = [];
		for (let i = 0; i < doc.lineCount; i++) {
			lines.push(doc.lineAt(i).text);
		}
		const found = scanLines(lines);
		const range = (s: Span) => new vscode.Range(s.line, s.start, s.line, s.end);

		const link: vscode.Range[] = [];
		const hide: vscode.Range[] = [];
		if (Sets.prettyLinks) {
			for (const l of found.links) {
				l.hide.forEach(h => hide.push(range(h)));
				link.push(range(l.text));
			}
		}
		editor.setDecorations(this.linkType, link);
		editor.setDecorations(this.hideType, hide);

		const bullets: vscode.Range[][] = this.starTypes.map(() => []);
		const hidestar: vscode.Range[] = [];
		const headings: vscode.Range[][] = this.headingType.map(() => []);
		const tags: vscode.Range[] = [];
		if (Sets.prettyBullets) {
			for (const h of found.headings) {
				if (h.level > 1) {
					hidestar.push(new vscode.Range(h.line, 0, h.line, h.level - 1));
				}
				if (bullets.length) {
					bullets[(h.level - 1) % bullets.length].push(new vscode.Range(h.line, h.level - 1, h.line, h.level));
				}
				if (h.level - 1 < headings.length) {
					headings[h.level - 1].push(range(h.title));
				}
				if (h.tags) {
					tags.push(range(h.tags));
				}
			}
		}
		this.starTypes.forEach((t, i) => editor.setDecorations(t, bullets[i]));
		editor.setDecorations(this.prefixStarType, hidestar);
		const underline = Sets.underlineTopHeading;
		this.headingType.forEach((t, i) => editor.setDecorations(t, underline ? headings[i] : []));
		editor.setDecorations(this.tagType, tags);
		editor.setDecorations(this.blockType, found.blocks.map(b => new vscode.Range(b.start, 0, b.end, 0)));
		Decorator.decorate(undefined, true);
	}
}
