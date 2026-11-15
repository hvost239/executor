import { AstBuilder, grammar } from './ast-builder.js';
import { RobotSyntaxError } from './errors.js';
import { location } from './lexer.js';

/** Token vector -> AST. Semantic name/type checking is a separate compilation phase. */
export class Parser {
    parse(tokens) {
        grammar.input = tokens;
        const tree = grammar.program();
        if (grammar.errors.length) {
            const error = grammar.errors[0];
            const token = Number.isFinite(error.token.startLine) ? error.token : tokens.at(-1);
            const loc = token ? location(token) : { line: 0, column: 0 };
            throw new RobotSyntaxError(
                `неожиданный ${error.token.image ? `фрагмент «${error.token.image}»` : 'конец программы'}; проверьте скобки и структуру оператора`,
                loc
            );
        }
        return new AstBuilder().visit(tree);
    }
}
