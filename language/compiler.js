import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Analyzer } from './analyzer.js';

export function compile(source) {
    return new Analyzer().analyze(new Parser().parse(new Lexer().tokenize(source)));
}
