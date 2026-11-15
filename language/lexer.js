import { Lexer as ChevrotainLexer } from 'chevrotain';
import { allTokens, StringLiteral, NumberLiteral } from './tokens.js';
import { RobotSyntaxError } from './errors.js';

export function location(token) {
    return { line: token.startLine - 1, column: token.startColumn - 1, offset: token.startOffset };
}

export function decodeString(token) {
    // Original .prg examples use "\\" for one literal backslash; there are no C escapes.
    return token.image.slice(1, -1);
}

const engine = new ChevrotainLexer(allTokens);
/** Public lexer boundary: invalid characters are errors, never silently discarded. */
export class Lexer {
    tokenize(source) {
        const { tokens, errors } = engine.tokenize(source);
        if (errors.length) {
            const error = errors[0];
            throw new RobotSyntaxError(
                `недопустимый символ или незакрытая строка: «${source.slice(error.offset, error.offset + error.length)}»`,
                { line: error.line - 1, column: error.column - 1 }
            );
        }
        for (const token of tokens) {
            if (token.tokenType === StringLiteral) decodeString(token);
            if (token.tokenType === NumberLiteral && !Number.isFinite(Number(token.image)))
                throw new RobotSyntaxError('число слишком велико', location(token));
        }
        return tokens;
    }
}
