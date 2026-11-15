import { Grammar } from './grammar.js';
import { decodeString, location } from './lexer.js';
import { KEYWORDS } from './keywords.js';

export const grammar = new Grammar();
const BaseVisitor = grammar.getBaseCstVisitorConstructor();
const word = (token) =>
    token.image === '<>' ? '!=' : (KEYWORDS.get(token.image.toLowerCase()) ?? token.image);
const at = (ctx) => {
    const positions = Object.values(ctx)
        .flat()
        .map((item) => item.location ?? item)
        .filter((item) => Number.isFinite(item.startOffset));
    return location(positions.sort((a, b) => a.startOffset - b.startOffset)[0]);
};

/** Produces plain data objects; AST nodes contain no execution behavior. */
export class AstBuilder extends BaseVisitor {
    constructor() {
        super();
        this.validateVisitor();
    }
    program(ctx) {
        const items = ctx.topLevel.map((node) => this.visit(node));
        return {
            type: 'Program',
            items,
            globals: items.filter((x) => x.type === 'Declaration'),
            procedures: items.filter((x) => x.type === 'Procedure'),
            loc: items[0].loc,
        };
    }
    topLevel(ctx) {
        const spec = this.visit(ctx.typeSpecifier),
            name = ctx.Identifier[0].image,
            loc = at(ctx);
        if (ctx.procedureTail)
            return {
                type: 'Procedure',
                name,
                returnType: spec?.dataType ?? null,
                returnRank: spec?.rank ?? 0,
                ...this.visit(ctx.procedureTail),
                loc,
            };
        return this.makeDeclaration(
            spec?.dataType,
            ctx.Identifier[0],
            this.visit(ctx.declarationTail),
            loc,
            spec?.rank
        );
    }
    typeSpecifier(ctx) {
        return { dataType: word(ctx.Type[0]), rank: ctx.LBracket?.length ?? 0 };
    }
    procedureTail(ctx) {
        return {
            parameters: (ctx.parameter ?? []).map((node) => this.visit(node)),
            body: this.visit(ctx.block),
        };
    }
    parameter(ctx) {
        return {
            name: ctx.Identifier[0].image,
            dataType: word(ctx.Type[0]),
            rank: ctx.LBracket?.length ?? 0,
            loc: at(ctx),
        };
    }
    declaration(ctx) {
        return this.makeDeclaration(
            word(ctx.Type[0]),
            ctx.Identifier[0],
            this.visit(ctx.declarationTail),
            at(ctx)
        );
    }
    makeDeclaration(dataType, first, tail, loc, returnRank = 0) {
        const names = [first, ...tail.names];
        return {
            type: 'Declaration',
            dataType,
            returnRank,
            declarations: tail.items.map((item, i) => ({
                ...item,
                name: names[i].image,
                loc: location(names[i]),
            })),
            loc,
        };
    }
    declarationTail(ctx) {
        return {
            names: ctx.Identifier ?? [],
            items: ctx.declarator.map((node) => this.visit(node)),
        };
    }
    declarator(ctx) {
        return {
            dimensions: (ctx.dimension ?? []).map((node) => this.visit(node)),
            initializer: this.visit(ctx.initializer) ?? null,
        };
    }
    block(ctx) {
        return {
            type: 'Block',
            statements: (ctx.statement ?? []).map((node) => this.visit(node)),
            loc: at(ctx),
        };
    }
    statement(ctx) {
        const child = Object.entries(ctx).find(([key]) => key !== 'Semicolon');
        return child ? this.visit(child[1]) : { type: 'Empty', loc: at(ctx) };
    }
    ifStatement(ctx) {
        return {
            type: 'If',
            condition: this.visit(ctx.expression),
            thenBody: this.visit(ctx.thenBody),
            elseBody: this.visit(ctx.elseBody) ?? null,
            loc: at(ctx),
        };
    }
    whileStatement(ctx) {
        return {
            type: 'While',
            condition: this.visit(ctx.expression),
            body: this.visit(ctx.statement),
            loc: at(ctx),
        };
    }
    repeatStatement(ctx) {
        return {
            type: 'Repeat',
            count: this.visit(ctx.expression),
            body: this.visit(ctx.statement),
            loc: at(ctx),
        };
    }
    forStatement(ctx) {
        return {
            type: 'For',
            initializer: this.visit(ctx.initializer) ?? null,
            condition: this.visit(ctx.condition) ?? null,
            update: this.visit(ctx.update) ?? null,
            body: this.visit(ctx.statement),
            loc: at(ctx),
        };
    }
    flowStatement(ctx) {
        return { type: ctx.Break ? 'Break' : 'Continue', loc: at(ctx) };
    }
    returnStatement(ctx) {
        return { type: 'Return', value: this.visit(ctx.expression) ?? null, loc: at(ctx) };
    }
    outputStatement(ctx) {
        return {
            type: 'Output',
            items: (ctx.outputItem ?? []).map((node) => this.visit(node)),
            newline: Boolean(ctx.Println || ctx.Coutln),
            loc: at(ctx),
        };
    }
    outputItem(ctx) {
        return {
            value: this.visit(ctx.value),
            width: this.visit(ctx.width) ?? null,
            precision: this.visit(ctx.precision) ?? null,
        };
    }
    inputStatement(ctx) {
        return {
            type: 'Input',
            targets: ctx.reference.map((node) => this.visit(node)),
            loc: at(ctx),
        };
    }
    simpleStatement(ctx) {
        const target = this.visit(ctx.target),
            loc = at(ctx);
        if (ctx.Assignment)
            return { type: 'Assignment', target, value: this.visit(ctx.value), loc };
        return {
            type: 'CallStatement',
            call:
                target.type === 'Identifier'
                    ? { type: 'Call', name: target.name, arguments: [], loc }
                    : target,
            loc,
        };
    }
    reference(ctx) {
        let result = { type: 'Identifier', name: ctx.Identifier[0].image, loc: at(ctx) };
        for (const node of ctx.expression ?? [])
            result = { type: 'Index', object: result, index: this.visit(node), loc: result.loc };
        return result;
    }
    expression(ctx) {
        return this.visit(ctx.orExpression);
    }
    binary(ctx) {
        let result = this.visit(ctx.operand[0]);
        for (let i = 0; i < (ctx.operator?.length ?? 0); i++)
            result = {
                type: 'Binary',
                operator: word(ctx.operator[i]),
                left: result,
                right: this.visit(ctx.operand[i + 1]),
                loc: result.loc,
            };
        return result;
    }
    orExpression(ctx) {
        return this.binary(ctx);
    }
    andExpression(ctx) {
        return this.binary(ctx);
    }
    compareExpression(ctx) {
        return this.binary(ctx);
    }
    addExpression(ctx) {
        return this.binary(ctx);
    }
    multiplyExpression(ctx) {
        return this.binary(ctx);
    }
    unaryExpression(ctx) {
        if (ctx.powerExpression) return this.visit(ctx.powerExpression);
        return {
            type: 'Unary',
            operator: ctx.Not ? '!' : ctx.Addition[0].image,
            operand: this.visit(ctx.unaryExpression ?? ctx.multiplyExpression),
            loc: at(ctx),
        };
    }
    powerExpression(ctx) {
        const left = this.visit(ctx.atom);
        return ctx.Power
            ? {
                  type: 'Binary',
                  operator: '^',
                  left,
                  right: this.visit(ctx.unaryExpression),
                  loc: left.loc,
              }
            : left;
    }
    atom(ctx) {
        let result;
        const loc = at(ctx);
        if (ctx.NumberLiteral) {
            const image = ctx.NumberLiteral[0].image;
            result = {
                type: 'Literal',
                value: Number(image),
                dataType: /[.eE]/.test(image) ? 'float' : 'int',
                loc,
            };
        } else if (ctx.StringLiteral) {
            const value = decodeString(ctx.StringLiteral[0]);
            result = {
                type: 'Literal',
                value,
                dataType: value.length === 1 ? 'char' : 'string',
                loc,
            };
        } else if (ctx.True || ctx.False)
            result = { type: 'Literal', value: Boolean(ctx.True), dataType: 'logical', loc };
        else if (ctx.parenthesized) result = this.visit(ctx.parenthesized);
        else {
            const name = ctx.Identifier[0].image;
            result = ctx.LParen
                ? {
                      type: 'Call',
                      name,
                      arguments: (ctx.argument ?? []).map((node) => this.visit(node)),
                      loc,
                  }
                : { type: 'Identifier', name, loc };
        }
        for (const node of ctx.index ?? [])
            result = { type: 'Index', object: result, index: this.visit(node), loc };
        return result;
    }
}
