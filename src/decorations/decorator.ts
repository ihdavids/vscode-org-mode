import * as _ from 'lodash';
import * as vscode from 'vscode';
import {Utils} from '../utils';
import { Sets, defaultHighlights } from '../sets';

const stringMatches = ( str: string, regex: RegExp, maxMatches = Infinity ): RegExpExecArray[] => {
  if ( regex.global ) {
    const matches: RegExpExecArray[] = [];
    let match;
    regex.lastIndex = 0;
    while ( match = regex.exec ( str ) ) {
      matches.push ( match );
      if ( matches.length === maxMatches ) break;
    }
    return matches;
  } else {
    const match = regex.exec ( str );
    return match ? [match] : [];
  }
};


export class Decorator {
  static config: any;
  static regexesStrs: any;
  static regexes: any;
  static types: any;
  static typesDynamic: vscode.TextEditorDecorationType[];
  static decorations: {}; // Map of document id => decorations
  static docsLines: {};

  static init() {
    Decorator.docsLines = {};
    Decorator.decorations = {};
    Decorator.typesDynamic = [];
    Decorator.initConfig();
    Decorator.initRegexes();
    Decorator.initTypes();
    /*
    Decorator.decorateThrottled = (() => {
      const minDelay = Sets.decoreUpdate;
      return _.debounce(( target?: vscode.TextEditor | vscode.TextDocument, force?: boolean ): void => {
        Decorator.decorate( target, force );
      }, minDelay, { maxWait: minDelay } );
    })()
    */
  }

  static initConfig() {
    Decorator.config = Sets.getProp<{}>('highlight',defaultHighlights)
  }

  static initRegexes() {
    Decorator.regexesStrs = Object.keys ( Decorator.config.regexes );
    const res = Decorator.regexesStrs.map ( reStr => {
      const options = Decorator.config.regexes[reStr];
      return new RegExp ( reStr, options.regexFlags || Decorator.config.regexFlags );
    });
    Decorator.regexes = _.zipObject ( Decorator.regexesStrs, res );
  }

  static getRegex(reStr: string) {
    if (Decorator.regexes) {
        return Decorator.regexes[reStr];
    }
    return undefined;
  }

  static initTypes() {
    if ( Decorator.types ) Decorator.undecorate ();
    const decorations = Decorator.config.decorations,
          types = Decorator.regexesStrs.map ( reStr => {
            const options = Decorator.config.regexes[reStr],
                  reDecorations = _.castArray ( options.decorations || options );
            return reDecorations.map ( options => {
              const decorationsFull = _.merge ( {}, decorations, options ),
                    decorationsStr = JSON.stringify ( decorationsFull );
              if ( /\$\d/.test ( decorationsStr ) ) { // Dynamic decorator
                return _.memoize<any> ( match => {
                  const decorationsStrReplaced = decorationsStr.replace ( /\$(\d)/g, ( m, index ) => match[index] ),
                        decorationsFullReplaced = JSON.parse ( decorationsStrReplaced );
                  const type = vscode.window.createTextEditorDecorationType ( decorationsFullReplaced );
                  Decorator.typesDynamic.push ( type );
                  return type;
                }, match => match[0] );
              } else { // Static decorator
                return vscode.window.createTextEditorDecorationType ( decorationsFull );
              }
            });
          });
    Decorator.types = _.zipObject ( Decorator.regexesStrs, types );
  }

  static getTypes( reStr: string ) {
    return Decorator.types[reStr];
  }

  static getType ( reStr, matchNr = 0 ) {
    return Decorator.getTypes ( reStr )[matchNr];
  }

  static decorate ( target?: vscode.TextEditor | vscode.TextDocument, force?: boolean ) {
    if ( !target ) {
      const textEditor = vscode.window.activeTextEditor;
      if ( !textEditor ) return;
      return Decorator.decorate ( textEditor, force );
    }
    if ( !Utils.editor.is ( target ) ) {
      const textEditors = Utils.document.getEditors ( target );
      return textEditors.forEach ( textEditor => Decorator.decorate ( textEditor, force ) );
    }

    const textEditor = target,
          doc = target.document,
          text = doc.getText (),
          decorations = new Map ();

    Decorator.regexesStrs.forEach ( reStr => {
      const types = Decorator.getTypes ( reStr );
      types.forEach ( type => {
          decorations.set ( type, [] );
        }
      );
      const options = Decorator.config.regexes[reStr],
            isFiltered = Utils.document.isFiltered ( doc, options );
      if ( !isFiltered ) return;
      const re = Decorator.getRegex ( reStr ),
            matches = stringMatches ( text, re, Decorator.config.maxMatches );

      matches.forEach ( match => {
        let startIndex = match.index;
        for ( let i = 1, l = match.length; i < l; i++ ) {
          const value = match[i];
          if ( _.isUndefined ( value ) ) continue;
          const startPos = doc.positionAt ( startIndex ),
                endPos = doc.positionAt ( startIndex + value.length ),
                range = new vscode.Range ( startPos, endPos );
          let type = Decorator.getType ( reStr, i - 1 );
          if ( !type ) return;
          if ( _.isFunction ( type ) ) type = type ( match );
          const ranges = decorations.get ( type );
          decorations.set ( type, ( ranges || [] ).concat ([ range ]) );
          startIndex += value.length;
        }
      });
    });

    const id = textEditor['id'];
    const prevLineCount = Decorator.docsLines[id];
    Decorator.docsLines[id] = doc.lineCount;

    const prevDecorations = Decorator.decorations[id];
    if ( force !== true && ( ( ( !prevDecorations || !prevDecorations.size ) && !decorations.size ) || ( prevLineCount === doc.lineCount && _.isEqual ( prevDecorations, decorations ) ) ) ) {
        return; // Nothing changed, skipping unnecessary work //URL: https://github.com/Microsoft/vscode/issues/50415 
    }
    Decorator.decorations[id] = decorations;

    // Decorator.undecorate (); // No longer needed? We are setting an empty array only for the types that are not used anymore

    decorations.forEach ( ( ranges, type ) => {
      textEditor.setDecorations ( type, ranges );
    });
  }

  static decorateLines( doc: vscode.TextDocument, lineNrs: number[] ) {

    // Optimizing the case where:
    // 1. The line count is the same
    // 2. There were no decorations in lineNrs
    // 3. There still are no decorations in lineNrs
    const textEditor = Utils.document.getEditors ( doc )[0];
    if ( textEditor && Decorator.docsLines[textEditor['id']] === doc.lineCount ) {
      const decorations = Decorator.decorations[textEditor['id']];
      let hadDecorations = false;
      if ( decorations ) {
        for ( let ranges of decorations.values () ) {
          if ( ranges.find ( range => _.includes ( lineNrs, range.start.line ) || _.includes ( lineNrs, range.end.line ) ) ) {
            hadDecorations = true;
            break;
          }
        }
      }
      if ( !hadDecorations ) {
        const hasDecorations = _.isNumber ( lineNrs.find ( lineNr => {
          const line = doc.lineAt ( lineNr );
          return Decorator.regexesStrs.find ( reStr => {
            const re = Decorator.getRegex ( reStr ),
                  matches = stringMatches ( line.text, re );
            return !!matches.length;
          });
        }));
        if ( !hasDecorations ) return;
      }
    }
    //Decorator.decorateThrottled ( doc );
  }

  static undecorate(textEditor: vscode.TextEditor = vscode.window.activeTextEditor ) {
    if ( !textEditor ) return;
    const types = _.flatten ( _.values ( Decorator.types ) );
    types.forEach ( type => {
      if ( _.isFunction ( type ) ) return;
      textEditor.setDecorations ( type, [] );
    });
    Decorator.typesDynamic.forEach ( type => {
      textEditor.setDecorations ( type, [] );
    });
  }
};
