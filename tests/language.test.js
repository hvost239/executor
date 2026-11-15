import test from 'node:test';
import assert from 'node:assert/strict';
import { Lexer } from '../language/lexer.js';
import { Parser } from '../language/parser.js';
import { compile } from '../language/compiler.js';
import { RobotSyntaxError, RobotRuntimeError } from '../language/errors.js';
import { run } from './helpers.js';

const output = (source, expected, options) => assert.equal(run(source, options).output, expected);

test('lexer separates comments, quoted delimiters, Cyrillic, positions, and numbers', () => {
    const tokens = new Lexer().tokenize(
        '/* строка\nкомментарий */\r\nТест { // заметка\n вывод "// /* текст */", .5e+2; }'
    );
    assert.equal(tokens[0].image, 'Тест');
    assert.equal(tokens[0].startLine, 3);
    assert.equal(tokens[0].startColumn, 1);
    assert.ok(tokens.some((t) => t.image === '.5e+2'));
    output('main { println "// /* текст */"; }', '// /* текст */\n');
});
test('backslash is literal, as in the official Windows path example', () => {
    output(String.raw`main { println pos("\", "C:\folder"); }`, '2\n');
});
for (const source of [
    'main { @; }',
    'main { println "abc; }',
    'main { /* missing }',
    'main { forward(2);',
    'main { right; } unexpected;',
    '123 { right; }',
]) {
    test(`reject invalid source: ${source}`, () =>
        assert.throws(() => compile(source), RobotSyntaxError));
}
test('official and legacy control syntax, dangling else, empty bodies', () => {
    output(
        'Тест() { целые n=0; повтори (3) n=n+1; while (n<5) n=n+1; if(1) if(0) println 0; else println n; повтори 2 раз { println 7; } }',
        '5\n7\n7\n'
    );
    output('main { repeat(0) println 1; for(;;) { break; } repeat(3) ; println 2; }', '2\n');
});
test('operator precedence, right-associative power, unary signs, NOT and short-circuiting', () => {
    output(
        'main { println 2+3*4, ",", 2^3^2, ",", -2^2, ",", 2^-2; println !2*0, ",", не 0, ",", not 1; println 0 & (1/0), ",", 1 | (1/0); }',
        '14,512,-4,0.25\ntrue,true,false\nfalse,true\n'
    );
});
test('all relational operators, logical aliases and original <> notation', () => {
    output(
        'main { println 1<2, 2<=2, 2>1, 2>=2, 1==1, 1!=2, 1<>2; println (1 and 1) и (0 or 1) или 0; }',
        'truetruetruetruetruetruetrue\ntrue\n'
    );
});
test('integer and floating point division, conversion and modulo', () => {
    output(
        'main { int a=7.9; float b=7/2; println a, ",", b, ",", 7.0/2, ",", 7%3; }',
        '7,3,3.5,1\n'
    );
});
test('global/local shadowing and recursive call frames', () => {
    output(
        'int n=10; main { int n=3; println f(n), ",", n; show; } int f(int n) { if(n<=1) return 1; return n*f(n-1); } show { println n; }',
        '6,3\n10\n'
    );
});
test('indirect recursion and calls without parentheses in expressions', () => {
    output(
        'main { println even(8), ",", value; } logical even(int n) { if(n==0) return true; return odd(n-1); } logical odd(int n) { if(n==0) return false; return even(n-1); } int value { return 12; }',
        'true,12\n'
    );
});
test('continue in for executes update, break affects only the nearest loop, return exits loops', () => {
    output(
        'main { int i,s=0; for(i=0;i<5;i=i+1) { if(i==2) continue; repeat(3) { s=s+1; break; } } println s, ",", f(); } int f() { while(1) { repeat(2) return 7; } }',
        '4,7\n'
    );
});
test('arrays and matrices use zero-based indexing and pass by value', () => {
    output(
        'main { int a[3], m[2][2]; a[0]=5; m[1][0]=7; change(a,m); println a[0], ",", m[1][0], ",", a[2]; } change(int x[], int y[][]) { x[0]=9; y[1][0]=11; println x[0]+y[1][0]; }',
        '20\n5,7,0\n'
    );
});
test('strings: assignment, concatenation, capacity, NUL, function results', () => {
    output(
        'main { char s[5]; s="abc"+\'d\'; println s, length(s); s[2]=0; println s, length(s); s=reverse(s); println s; } char[] reverse(char s[]) { char r[5]; r=s[1]+s[0]; return r; }',
        'abcd4\nab2\nba\n'
    );
});
test('all string functions and Russian aliases return new strings', () => {
    output(
        'main { char s[10]; s="abcde"; println длина(s), ",", фрагмент(s,1,2), ",", позиция("cd",s), ",", вставить("X",s,2), ",", удалить(s,1,2); println s; println length(s), copy(s,4,10), pos("z",s), insert("Y",s,0), delete(s,4,1); }',
        '5,bc,2,abXcde,ade\nabcde\n5e-1Yabcdeabcd\n'
    );
});
test('formatted and stream output preserve whitespace and line endings', () => {
    output(
        'main { print "A"; вывод "B"; печать "C"; println; cout << 12:4 << "|" << 1.25:-7:2; coutln << "X"; выводстр; }',
        'ABC\n  12|1.25   X\n\n'
    );
});
test('all scalar input types, stream input, array cells and entire strings', () => {
    output(
        'main { int i,a[2]; float f; logical l; char c,s[20]; input i,f; cin >> l >> c >> a[1] >> s; println i, ",", f, ",", l, ",", c, ",", a[1], ",", s; }',
        '4,2.5,true,Z,8,hello world\n',
        { inputs: ['4', '2.5', 'истина', 'Z', '8', 'hello world'] }
    );
});
test('clear output is a language command, not only an interface button', () =>
    output('main { println "old"; очистить; println "new"; clrscr; print "last"; }', 'last'));
test('math functions, radians/degrees and random with/without arguments', () => {
    output(
        'main { println trunc(1.8), round(1.8), sign(-2), abs(-2), sqrt(9); println round(sin(pi/2)), round(cos(0)), round(tan(pi/4)), round(sing(90)), round(cosg(0)), round(tang(45)); println round(arcsin(1)*180/pi), round(arccos(0)*180/pi), round(arctan(1)*180/pi), round(arctan2(1,1)*180/pi); println arcsing(1), arccosg(0), arctang(1), arctan2g(1,1); println round(exp(0)), ln(1), lg(100), random(10), random; }',
        '12-123\n111111\n90904545\n90904545\n10240.4\n',
        { random: () => 0.4 }
    );
});
for (const source of [
    'main { unknown; }',
    'main {} unused { unknown; }',
    'main { x=1; }',
    'main { int x,x; }',
    'main { break; }',
    'main { continue; }',
    'main { return 1; }',
    'int main {}',
    'main(int x) {}',
    'main {} main {}',
    'main {} int x;',
    'main { forward; }',
    'main { right(2); }',
    'main { int x=right(); }',
    'main { foo(1); } foo {}',
    'main { int a[1][2][3]; }',
    'main { int a[2]=1; }',
    'main { int a[2]; a=1; }',
    'main { int x; x[0]=1; }',
    'main { int a[2]; foo(a); } foo(float a[]) {}',
    'main { int a[2]; println a; }',
    'main { int a[2]; input a; }',
    'main { int a[2][2]; println a[1]; }',
    'main { 1+2; }',
    'main { 1=2; }',
])
    test(`semantic diagnostics: ${source}`, () =>
        assert.throws(() => compile(source), RobotSyntaxError));
for (const source of [
    'main { println 1/0; }',
    'main { println sqrt(-1); }',
    'main { int a[2]; println a[2]; }',
    'main { int a[2]; println a[-1]; }',
    'main { int a[10001]; }',
    'main { int a[0]; }',
    'main { char s[2]; s="abc"; }',
    'main { println f(); } int f {}',
    'main { repeat(-2) ; }',
    'main { repeat(0.5) ; }',
])
    test(`runtime diagnostics: ${source}`, () =>
        assert.throws(() => run(source), RobotRuntimeError));
test('errors retain the exact source location', () => {
    assert.throws(
        () => run('main {\n int a[2];\n a[2]=1;\n}'),
        (error) => error.line === 2 && error.column === 1
    );
});
test('empty and recursive infinite programs have resource limits', () => {
    assert.throws(() => run('main { while(1) {} }', { maxSteps: 20 }), /предел/);
    assert.throws(() => run('main { f; } f { f; }', { maxCallDepth: 20 }), /глубина/);
});
test('parser builds AST without evaluating input', () => {
    const tree = new Parser().parse(new Lexer().tokenize('main { println 1/0; }'));
    assert.equal(tree.procedures[0].body.statements[0].type, 'Output');
});
