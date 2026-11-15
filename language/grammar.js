import { CstParser, EOF, tokenMatcher } from 'chevrotain';
import * as T from './tokens.js';

/** Syntax only. CST-to-AST conversion lives in ast-builder.js. */
export class Grammar extends CstParser {
    constructor() {
        super(T.allTokens, { nodeLocationTracking: 'full', recoveryEnabled: false });
        const $ = this;
        $.RULE('program', () => {
            $.AT_LEAST_ONE(() => $.SUBRULE($.topLevel));
            $.CONSUME(EOF);
        });
        $.RULE('topLevel', () => {
            $.OPTION(() => $.SUBRULE($.typeSpecifier));
            $.CONSUME(T.Identifier);
            $.OR([
                {
                    GATE: () => tokenMatcher($.LA(1), T.LParen) || tokenMatcher($.LA(1), T.LBrace),
                    ALT: () => $.SUBRULE($.procedureTail),
                },
                { ALT: () => $.SUBRULE($.declarationTail) },
            ]);
        });
        $.RULE('typeSpecifier', () => {
            $.CONSUME(T.Type);
            $.MANY(() => {
                $.CONSUME(T.LBracket);
                $.CONSUME(T.RBracket);
            });
        });
        $.RULE('procedureTail', () => {
            $.OPTION(() => {
                $.CONSUME(T.LParen);
                $.OPTION2(() =>
                    $.AT_LEAST_ONE_SEP({ SEP: T.Comma, DEF: () => $.SUBRULE($.parameter) })
                );
                $.CONSUME(T.RParen);
            });
            $.SUBRULE($.block);
        });
        $.RULE('parameter', () => {
            $.CONSUME(T.Type);
            $.CONSUME(T.Identifier);
            $.MANY(() => {
                $.CONSUME(T.LBracket);
                $.CONSUME(T.RBracket);
            });
        });
        $.RULE('declaration', () => {
            $.CONSUME(T.Type);
            $.CONSUME(T.Identifier);
            $.SUBRULE($.declarationTail);
        });
        $.RULE('declarationTail', () => {
            $.SUBRULE($.declarator);
            $.MANY(() => {
                $.CONSUME(T.Comma);
                $.CONSUME(T.Identifier);
                $.SUBRULE2($.declarator);
            });
            $.OPTION(() => $.CONSUME(T.Semicolon));
        });
        $.RULE('declarator', () => {
            $.MANY(() => {
                $.CONSUME(T.LBracket);
                $.SUBRULE($.expression, { LABEL: 'dimension' });
                $.CONSUME(T.RBracket);
            });
            $.OPTION(() => {
                $.CONSUME(T.Assignment);
                $.SUBRULE2($.expression, { LABEL: 'initializer' });
            });
        });
        $.RULE('block', () => {
            $.CONSUME(T.LBrace);
            $.MANY(() => $.SUBRULE($.statement));
            $.CONSUME(T.RBrace);
        });
        $.RULE('statement', () =>
            $.OR([
                { ALT: () => $.SUBRULE($.block) },
                { ALT: () => $.SUBRULE($.declaration) },
                { ALT: () => $.SUBRULE($.ifStatement) },
                { ALT: () => $.SUBRULE($.whileStatement) },
                { ALT: () => $.SUBRULE($.repeatStatement) },
                { ALT: () => $.SUBRULE($.forStatement) },
                { ALT: () => $.SUBRULE($.flowStatement) },
                { ALT: () => $.SUBRULE($.returnStatement) },
                { ALT: () => $.SUBRULE($.outputStatement) },
                { ALT: () => $.SUBRULE($.inputStatement) },
                {
                    ALT: () => {
                        $.SUBRULE($.simpleStatement);
                        $.OPTION(() => $.CONSUME(T.Semicolon));
                    },
                },
                { ALT: () => $.CONSUME2(T.Semicolon) },
            ])
        );
        // Parentheses are parsed by expression/atom; old unparenthesized forms remain accepted.
        $.RULE('ifStatement', () => {
            $.CONSUME(T.If);
            $.SUBRULE($.expression);
            $.SUBRULE($.statement, { LABEL: 'thenBody' });
            $.OPTION({
                IGNORE_AMBIGUITIES: true,
                DEF: () => {
                    $.CONSUME(T.Else);
                    $.SUBRULE2($.statement, { LABEL: 'elseBody' });
                },
            });
        });
        $.RULE('whileStatement', () => {
            $.CONSUME(T.While);
            $.SUBRULE($.expression);
            $.SUBRULE($.statement);
        });
        $.RULE('repeatStatement', () => {
            $.CONSUME(T.Repeat);
            $.SUBRULE($.expression);
            $.OPTION(() => $.CONSUME(T.Times));
            $.SUBRULE($.statement);
        });
        $.RULE('forStatement', () => {
            $.CONSUME(T.For);
            $.CONSUME(T.LParen);
            $.OPTION(() => $.SUBRULE($.simpleStatement, { LABEL: 'initializer' }));
            $.CONSUME(T.Semicolon);
            $.OPTION2(() => $.SUBRULE($.expression, { LABEL: 'condition' }));
            $.CONSUME2(T.Semicolon);
            $.OPTION3(() => $.SUBRULE2($.simpleStatement, { LABEL: 'update' }));
            $.CONSUME(T.RParen);
            $.SUBRULE($.statement);
        });
        $.RULE('flowStatement', () => {
            $.OR([{ ALT: () => $.CONSUME(T.Break) }, { ALT: () => $.CONSUME(T.Continue) }]);
            $.OPTION(() => $.CONSUME(T.Semicolon));
        });
        $.RULE('returnStatement', () => {
            $.CONSUME(T.Return);
            $.OPTION(() => $.SUBRULE($.expression));
            $.OPTION2(() => $.CONSUME(T.Semicolon));
        });
        $.RULE('outputStatement', () => {
            $.OR([
                {
                    ALT: () => {
                        $.OR2([
                            { ALT: () => $.CONSUME(T.Print) },
                            { ALT: () => $.CONSUME(T.Println) },
                        ]);
                        $.OPTION(() =>
                            $.AT_LEAST_ONE_SEP({ SEP: T.Comma, DEF: () => $.SUBRULE($.outputItem) })
                        );
                    },
                },
                {
                    ALT: () => {
                        $.OR3([
                            { ALT: () => $.CONSUME(T.Cout) },
                            { ALT: () => $.CONSUME(T.Coutln) },
                        ]);
                        $.MANY(() => {
                            $.CONSUME(T.ShiftLeft);
                            $.SUBRULE2($.outputItem);
                        });
                    },
                },
            ]);
            $.OPTION2(() => $.CONSUME(T.Semicolon));
        });
        $.RULE('outputItem', () => {
            $.SUBRULE($.expression, { LABEL: 'value' });
            $.OPTION(() => {
                $.CONSUME(T.Colon);
                $.SUBRULE2($.expression, { LABEL: 'width' });
                $.OPTION2(() => {
                    $.CONSUME2(T.Colon);
                    $.SUBRULE3($.expression, { LABEL: 'precision' });
                });
            });
        });
        $.RULE('inputStatement', () => {
            $.OR([
                {
                    ALT: () => {
                        $.CONSUME(T.Input);
                        $.AT_LEAST_ONE_SEP({ SEP: T.Comma, DEF: () => $.SUBRULE($.reference) });
                    },
                },
                {
                    ALT: () => {
                        $.CONSUME(T.Cin);
                        $.AT_LEAST_ONE(() => {
                            $.CONSUME(T.ShiftRight);
                            $.SUBRULE2($.reference);
                        });
                    },
                },
            ]);
            $.OPTION(() => $.CONSUME(T.Semicolon));
        });
        $.RULE('simpleStatement', () => {
            $.SUBRULE($.expression, { LABEL: 'target' });
            $.OPTION(() => {
                $.CONSUME(T.Assignment);
                $.SUBRULE2($.expression, { LABEL: 'value' });
            });
        });
        $.RULE('reference', () => {
            $.CONSUME(T.Identifier);
            $.MANY(() => {
                $.CONSUME(T.LBracket);
                $.SUBRULE($.expression);
                $.CONSUME(T.RBracket);
            });
        });
        $.RULE('expression', () => $.SUBRULE($.orExpression));
        const binary = (name, operand, operator) =>
            $.RULE(name, () => {
                $.SUBRULE(operand, { LABEL: 'operand' });
                $.MANY(() => {
                    $.CONSUME(operator, { LABEL: 'operator' });
                    $.SUBRULE2(operand, { LABEL: 'operand' });
                });
            });
        // Rules are referenced by closures, so they can be declared from the leaves upwards.
        $.RULE('atom', () => {
            $.OR([
                { ALT: () => $.CONSUME(T.NumberLiteral) },
                { ALT: () => $.CONSUME(T.StringLiteral) },
                { ALT: () => $.CONSUME(T.True) },
                { ALT: () => $.CONSUME(T.False) },
                {
                    ALT: () => {
                        $.CONSUME(T.LParen);
                        $.SUBRULE($.expression, { LABEL: 'parenthesized' });
                        $.CONSUME(T.RParen);
                    },
                },
                {
                    ALT: () => {
                        $.CONSUME(T.Identifier);
                        $.OPTION(() => {
                            $.CONSUME2(T.LParen);
                            $.OPTION2(() =>
                                $.AT_LEAST_ONE_SEP({
                                    SEP: T.Comma,
                                    DEF: () => $.SUBRULE2($.expression, { LABEL: 'argument' }),
                                })
                            );
                            $.CONSUME2(T.RParen);
                        });
                    },
                },
            ]);
            $.MANY(() => {
                $.CONSUME(T.LBracket);
                $.SUBRULE3($.expression, { LABEL: 'index' });
                $.CONSUME(T.RBracket);
            });
        });
        $.RULE('powerExpression', () => {
            $.SUBRULE($.atom);
            $.OPTION(() => {
                $.CONSUME(T.Power);
                $.SUBRULE($.unaryExpression);
            });
        });
        $.RULE('unaryExpression', () =>
            $.OR([
                {
                    ALT: () => {
                        $.CONSUME(T.Addition);
                        $.SUBRULE($.unaryExpression);
                    },
                },
                {
                    ALT: () => {
                        $.CONSUME(T.Not);
                        $.SUBRULE($.multiplyExpression);
                    },
                },
                { ALT: () => $.SUBRULE($.powerExpression) },
            ])
        );
        binary('multiplyExpression', $.unaryExpression, T.Multiplication);
        binary('addExpression', $.multiplyExpression, T.Addition);
        binary('compareExpression', $.addExpression, T.Comparison);
        binary('andExpression', $.compareExpression, T.And);
        binary('orExpression', $.andExpression, T.Or);
        this.performSelfAnalysis();
    }
}
