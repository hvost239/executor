import { Lexer } from './lexer.js';
import { Parser } from './parser.js';

const lexer = new Lexer();
const parser = new Parser();
const kind = (token) => token?.tokenType.name;
const isComment = (token) => ['LineComment', 'BlockComment'].includes(kind(token));
const expressionEnds = new Set([
    'Identifier',
    'NumberLiteral',
    'StringLiteral',
    'True',
    'False',
    'RParen',
    'RBracket',
]);

/** Find statement boundaries even in the legacy syntax without semicolons. */
function statementStarts(program) {
    const starts = new Set();
    function visit(node) {
        if (!node) return;
        if (node.type === 'Block') {
            for (const statement of node.statements) {
                starts.add(statement.loc.offset);
                visit(statement);
            }
        } else if (node.type === 'If') {
            visit(node.thenBody);
            visit(node.elseBody);
        } else if (['While', 'Repeat', 'For', 'Procedure'].includes(node.type)) {
            visit(node.body);
        }
    }
    for (const item of program.items) {
        starts.add(item.loc.offset);
        visit(item);
    }
    return starts;
}

/** Format whitespace only; original token spelling and comments are retained. */
export function formatCode(source) {
    const tokens = lexer.tokenize(source, { includeComments: true });
    const code = tokens.filter((token) => !isComment(token));
    // Require valid syntax, but permit unknown names while the user is writing a program.
    const starts = code.length ? statementStarts(parser.parse(code)) : new Set();
    const lines = [];
    let line = '',
        indent = 0,
        parentheses = 0;
    let previous = null,
        previousCode = null,
        previousUnary = false;
    let pendingBreak = false,
        betweenProcedures = false;

    function write(text, space = false) {
        if (!line) line = '    '.repeat(indent) + text;
        else line += (space ? ' ' : '') + text;
    }
    function newline() {
        if (line) lines.push(line);
        line = '';
        pendingBreak = false;
    }
    function needsSpace(token) {
        const current = kind(token),
            before = kind(previousCode);
        if (isComment(previous)) return true;
        if (['RParen', 'RBracket', 'Comma', 'Semicolon', 'Colon', 'LBracket'].includes(current))
            return false;
        if (['LParen', 'LBracket', 'Colon'].includes(before)) return false;
        if (current === 'LParen' && before === 'Identifier') return false;
        if (previousUnary) {
            // Keep word operators separate and avoid turning "- -x" into "--x".
            return (
                /[a-zа-яё]/i.test(previousCode.image) ||
                (['Plus', 'Minus'].includes(before) && current === before)
            );
        }
        return true;
    }

    for (const token of tokens) {
        const current = kind(token);
        const trailingComment =
            isComment(token) && previous && token.startLine === previous.endLine && Boolean(line);

        if (pendingBreak && !trailingComment && current !== 'Semicolon') {
            newline();
        }
        if (betweenProcedures && !trailingComment && current !== 'Semicolon') {
            newline();
            if (lines.length && lines.at(-1) !== '') lines.push('');
            betweenProcedures = false;
        }
        if (starts.has(token.startOffset) && line) newline();
        if (isComment(token)) {
            if (!trailingComment && token.startLine > (previous?.endLine ?? 0)) newline();
            write(token.image, Boolean(line));
            if (current === 'LineComment') newline();
        } else if (current === 'LBrace') {
            newline();
            write('{');
            newline();
            indent++;
        } else if (current === 'RBrace') {
            newline();
            indent--;
            write('}');
            pendingBreak = true;
            betweenProcedures = indent === 0;
        } else {
            const unary =
                current === 'Not' ||
                (['Plus', 'Minus'].includes(current) && !expressionEnds.has(kind(previousCode)));
            write(token.image, needsSpace(token));
            if (current === 'LParen') parentheses++;
            if (current === 'RParen') parentheses--;
            if (current === 'Semicolon' && parentheses === 0) pendingBreak = true;
            if (current === 'Else') pendingBreak = false;
            previousUnary = unary;
        }
        if (!isComment(token)) previousCode = token;
        previous = token;
    }
    newline();
    return lines.length ? lines.join('\n') + '\n' : '';
}
