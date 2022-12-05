
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

	constructor(parser: Parser) {
		this.parser = parser;
		/*
  public UnfoldDecorationType = (langId?: string): TextEditorDecorationType => {
    return window.createTextEditorDecorationType({
      rangeBehavior: DecorationRangeBehavior.ClosedOpen,
      opacity: ExtSettings.Get<string>(Settings.unfoldedOpacity).toString()
    })
  }

  public MatchedDecorationType = (langId?: string): TextEditorDecorationType => {
    return window.createTextEditorDecorationType({
      before: {
        contentText: ExtSettings.Get<string>(Settings.maskChar),
        color: ExtSettings.Get<string>(Settings.maskColor),
      },
      after: {
        contentText: ExtSettings.Get<string>(Settings.after),
      },
      textDecoration: "none; display: none;"
    });

  };
*/

		// links
		this.descRegex = new RegExp('\\]\\[');
		this.linkType = vscode.window.createTextEditorDecorationType({
			'light': {
				'color': 'rgba(0, 128, 255, 1.0)',
      			'textDecoration': "underline;"
			},
			'dark': {
				'color': 'rgba(0, 128, 255, 1.0)',
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
			const level = 0;
			for (let l of this.parser.doc.children) {
				this.addPrefix(hidestar, prefix, l, 0);
			}
			for (const [idx, _] of this.starTypes.entries()) {
				if (idx < prefix.length) {
					editor.setDecorations(this.starTypes[idx], prefix[idx]);
				} else {
					editor.setDecorations(this.starTypes[idx], []);
				}
			}
			editor.setDecorations(this.prefixStarType, hidestar);
		}
	}

}

/*
import * as vscode from 'vscode';
import { Config } from './config';
import { Head } from './orgdoc';
import { Parser } from './parser';

export class Decoration implements vscode.Disposable {
	private config: Config;
	private parser: Parser;
	private level: number;
	private headType: vscode.TextEditorDecorationType[] = [];
	private bodyType: vscode.TextEditorDecorationType[] = [];
	private doneState: string;
	private todoType: vscode.TextEditorDecorationType;
	private doneType: vscode.TextEditorDecorationType;
	private descRegex: RegExp;
	private linkType: vscode.TextEditorDecorationType;
	private hideType: vscode.TextEditorDecorationType;

	constructor(parser: Parser) {
		this.config = Config.getInstance();
		this.parser = parser;

		// indent
		this.level = this.config.get('headLevel');
		let i;
		for (i = 0; i < this.level; i++) {
			const headIndent = '*'.repeat(i);
			this.headType.push(vscode.window.createTextEditorDecorationType({
				'light': {
					'color': 'rgba(255, 255, 255, 0.0)'
				},
				'dark': {
					'color': 'rgba(255, 255, 255, 0.0)'
				},
				'before': {
					'color': 'rgba(255, 255, 255, 0.0)',
					'contentText': headIndent
				}
			}));
			const bodyIndent = '*'.repeat((i + 1) * 2);
			this.bodyType.push(vscode.window.createTextEditorDecorationType({
				'light': {
					'backgroundColor': 'rgba(255, 0, 0, 1.0)'
				},
				'dark': {
					'backgroundColor': 'rgba(255, 0, 0, 1.0)'
				},
				'before': {
					'color': 'rgba(255, 255, 255, 0.0)',
					'contentText': bodyIndent
				}
			}));
		}

		// state
		this.doneState = this.config.get('doneState');
		this.todoType = vscode.window.createTextEditorDecorationType({
			'light': {
				'color': 'rgba(255, 0, 0, 1.0)'
			},
			'dark': {
				'color': 'rgba(255, 0, 0, 1.0)'
			}
		});
		this.doneType = vscode.window.createTextEditorDecorationType({
			'light': {
				'color': 'rgba(0, 255, 0, 1.0)'
			},
			'dark': {
				'color': 'rgba(0, 255, 0, 1.0)'
			}
		});

		// links
		this.descRegex = new RegExp('\\]\\[', 'g');
		this.linkType = vscode.window.createTextEditorDecorationType({
			'light': {
				'color': 'rgba(0, 128, 255, 1.0)'
			},
			'dark': {
				'color': 'rgba(0, 128, 255, 1.0)'
			}
		});
		this.hideType = vscode.window.createTextEditorDecorationType({
			'light': {
				'color': 'rgba(0, 128, 255, 0.0)',
				'letterSpacing': '-256px'
			},
			'dark': {
				'color': 'rgba(0, 128, 255, 0.0)',
				'letterSpacing': '-256px'
			}
		});
	}

	dispose(): void {
	}

	async updateDecorations(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return Promise.resolve();
		}

		let h: Head | undefined = this.parser.getHead();
		let i;
		const head: vscode.Range[][] = [];
		const body: vscode.Range[][] = [];
		for (i = 0; i < this.level; i++) {
			head[i] = [];
			body[i] = [];
		}
		const todo: vscode.Range[] = [];
		const done: vscode.Range[] = [];
		while (h) {
			const level = h.level;
			const headLine = h.rangeHead.start.line;

			// head
			head[level - 1].push(new vscode.Range(headLine, 0, headLine, level - 1));

			// body
			if (h.rangeBody) {
				const stLine = h.rangeBody.start.line;
				const edLine = h.rangeBody.end.line;
				for (i = stLine; i <= edLine; i++) {
					body[level - 1].push(new vscode.Range(i, 0, i, 0));
				}
			}

			// state
			if (h.stateColumn > 0) {
				if (this.doneState.includes(h.state)) {
					// done
					done.push(new vscode.Range(headLine, h.stateColumn, headLine, h.stateColumn + h.state.length));
				} else {
					// todo
					todo.push(new vscode.Range(headLine, h.stateColumn, headLine, h.stateColumn + h.state.length));
				}
			}

			// count
			if (h.countColumn > 0) {
				const count = h.count.substring(1, h.count.length - 1).split('/');
				if (parseInt(count[0]) >= parseInt(count[1])) {
					// done
					done.push(new vscode.Range(headLine, h.countColumn, headLine, h.countColumn + h.count.length));
				} else {
					// todo
					todo.push(new vscode.Range(headLine, h.countColumn, headLine, h.countColumn + h.count.length));
				}
			}

			h = h.nextHead;
		}

		// links
		const link: vscode.Range[] = [];
		const hide: vscode.Range[] = [];
		for (let range of this.parser.getLinks()) {
			const start = range.start;
			const end = range.end;
			const text = editor.document.getText(range);
			const match = this.descRegex.exec(text);
			const offset = (match) ? match.index + 2 : 2;
			hide.push(new vscode.Range(start.line, start.character, start.line, start.character + offset))
			hide.push(new vscode.Range(end.line, end.character - 2, end.line, end.character));
			link.push(new vscode.Range(start.line, start.character + offset, end.line, end.character - 2));
		}

		for (i = 0; i < this.level; i++) {
			editor.setDecorations(this.headType[i], head[i]);
			editor.setDecorations(this.bodyType[i], body[i]);
		}
		editor.setDecorations(this.todoType, todo);
		editor.setDecorations(this.doneType, done);
		editor.setDecorations(this.linkType, link);
		editor.setDecorations(this.hideType, hide);
	}
}

*/