import { createToken, Lexer } from 'chevrotain';

const category = (name) => createToken({ name, pattern: Lexer.NA });
export const Type = category('Type');
export const Comparison = category('Comparison');
export const Addition = category('Addition');
export const Multiplication = category('Multiplication');
export const Assignment = category('Assignment');
export const Identifier = createToken({
    name: 'Identifier',
    pattern: /[a-zA-Zа-яА-ЯёЁ_][a-zA-Zа-яА-ЯёЁ_0-9]*/,
});
const keyword = (name, pattern, categories = []) =>
    createToken({ name, pattern, longer_alt: Identifier, categories });
export const Int = keyword('Int', /int|целые/i, [Type]);
export const Float = keyword('Float', /float|дробные/i, [Type]);
export const Char = keyword('Char', /char|символы/i, [Type]);
export const Logical = keyword('Logical', /logical|логические/i, [Type]);
export const Repeat = keyword('Repeat', /repeat|повторить|повтори/i);
export const While = keyword('While', /while|пока/i);
export const For = keyword('For', /for|цикл/i);
export const If = keyword('If', /if|если/i);
export const Else = keyword('Else', /else|иначе/i);
export const Break = keyword('Break', /break|прервать/i);
export const Continue = keyword('Continue', /continue|продолжить/i);
export const Return = keyword('Return', /return|возврат/i);
export const Input = keyword('Input', /input|ввод/i);
export const Println = keyword('Println', /println|выводстр/i);
export const Print = keyword('Print', /print|вывод|печать/i);
export const Coutln = keyword('Coutln', /coutln/i);
export const Cout = keyword('Cout', /cout/i);
export const Cin = keyword('Cin', /cin/i);
export const True = keyword('True', /true|истина/i);
export const False = keyword('False', /false|ложь/i);
export const Times = keyword('Times', /times|раза|раз/i);
export const Or = keyword('Or', /\||or|или/i);
export const And = keyword('And', /&|and|и/i);
export const Not = keyword('Not', /!|not|не/i);
const symbol = (name, pattern, categories = []) => createToken({ name, pattern, categories });
export const NotEqual = symbol('NotEqual', /!=|<>/, [Comparison]);
export const Equal = symbol('Equal', /==/, [Comparison]);
export const LessEqual = symbol('LessEqual', /<=/, [Comparison]);
export const GreaterEqual = symbol('GreaterEqual', />=/, [Comparison]);
export const ShiftLeft = symbol('ShiftLeft', /<</);
export const ShiftRight = symbol('ShiftRight', />>/);
export const Less = symbol('Less', /</, [Comparison]);
export const Greater = symbol('Greater', />/, [Comparison]);
export const ColonAssign = symbol('ColonAssign', /:=/, [Assignment]);
export const Assign = symbol('Assign', /=/, [Assignment]);
export const Plus = symbol('Plus', /\+/, [Addition]);
export const Minus = symbol('Minus', /-/, [Addition]);
export const Star = symbol('Star', /\*/, [Multiplication]);
export const Slash = symbol('Slash', /\//, [Multiplication]);
export const Modulo = symbol('Modulo', /%/, [Multiplication]);
export const Power = symbol('Power', /\^/);
export const LParen = symbol('LParen', /\(/);
export const RParen = symbol('RParen', /\)/);
export const LBrace = symbol('LBrace', /\{/);
export const RBrace = symbol('RBrace', /\}/);
export const LBracket = symbol('LBracket', /\[/);
export const RBracket = symbol('RBracket', /\]/);
export const Comma = symbol('Comma', /,/);
export const Semicolon = symbol('Semicolon', /;/);
export const Colon = symbol('Colon', /:/);
export const NumberLiteral = symbol('NumberLiteral', /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
export const StringLiteral = createToken({
    name: 'StringLiteral',
    pattern: /"[^"\r\n]*"|'[^'\r\n]*'/,
});
const Space = createToken({
    name: 'Space',
    pattern: /\s+/,
    group: Lexer.SKIPPED,
    line_breaks: true,
});
const LineComment = createToken({
    name: 'LineComment',
    pattern: /\/\/[^\r\n]*/,
    group: 'comments',
});
const BlockComment = createToken({
    name: 'BlockComment',
    pattern: /\/\*[\s\S]*?\*\//,
    group: 'comments',
    line_breaks: true,
});
export const allTokens = [
    Space,
    LineComment,
    BlockComment,
    StringLiteral,
    NumberLiteral,
    Type,
    Comparison,
    Addition,
    Multiplication,
    Assignment,
    Int,
    Float,
    Char,
    Logical,
    Repeat,
    While,
    For,
    If,
    Else,
    Break,
    Continue,
    Return,
    Input,
    Println,
    Print,
    Coutln,
    Cout,
    Cin,
    True,
    False,
    Times,
    NotEqual,
    Equal,
    LessEqual,
    GreaterEqual,
    ShiftLeft,
    ShiftRight,
    ColonAssign,
    Or,
    And,
    Not,
    Identifier,
    Less,
    Greater,
    Assign,
    Plus,
    Minus,
    Star,
    Slash,
    Modulo,
    Power,
    LParen,
    RParen,
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    Comma,
    Semicolon,
    Colon,
];
