import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCode } from '../language/formatter.js';
import { Lexer } from '../language/lexer.js';
import { Parser } from '../language/parser.js';
import { run } from './helpers.js';

const lexer = new Lexer();
const parser = new Parser();
const tokens = (source) =>
    lexer
        .tokenize(source, { includeComments: true })
        .map((token) => [token.tokenType.name, token.image]);
const ast = (source) =>
    JSON.parse(
        JSON.stringify(parser.parse(lexer.tokenize(source)), (key, value) =>
            key === 'loc' ? undefined : value
        )
    );

test('formatter indents blocks and spaces expressions while preserving for headers', () => {
    const source =
        'main{int i;for(i=0;i<3;i=i+1){println -i;}if(i==3){println "ok";}else{println "bad";}}';
    const formatted = formatCode(source);
    assert.equal(
        formatted,
        `main
{
    int i;
    for (i = 0; i < 3; i = i + 1)
    {
        println -i;
    }
    if (i == 3)
    {
        println "ok";
    }
    else
    {
        println "bad";
    }
}
`
    );
    assert.equal(run(formatted).output, run(source).output);
});

for (const [name, source] of [
    [
        'strings and comments',
        String.raw`// intro
main{println "{ ; } // /*"; // inline
/* keep this comment
    exactly as written */ coutln << "C:\tmp\"; println '"quoted"';} // end
// after the program`,
    ],
    [
        'empty control bodies',
        'НАПРАВО { пока(не база); { если(справа_свободно); { направо; вперед(1); } } }',
    ],
    [
        'legacy syntax without semicolons',
        'main { направо налево повтори 2 раз { кругом } если база направо иначе налево }',
    ],
    [
        'nested single statements and dangling else',
        'main{int x;while(x<3) if(x==0) x=1; else if(x==1)x=2;else x=3;}',
    ],
    [
        'arrays, unary operators and formatted output',
        'main{int a[2],x; x=- -1; a[0]=+x; println !(x<0), a[0]:4:2;}',
    ],
    [
        'comments inside expressions and around else',
        'main{int a;a=(1+ // sum\n2); if(a){println a;} /* why */ else {println 0;}}',
    ],
    [
        'procedure order and aliases',
        'НАПРАВО{направо;} НАЛЕВО{налево;} Лабиринт{целые dir;ввод dir;если(dir==1){НАПРАВО}else{НАЛЕВО}}',
    ],
    [
        'the original maze program with empty loop and if bodies',
        'НАПРАВО { пока(не база); { если(справа_свободно); { направо; вперед(1); } { если(впереди_свободно); { вперед(1); } { налево; вперед(1); } } } } НАЛЕВО { пока(не база); { если(слева_свободно); { налево; вперед(1); } { если(впереди_свободно); { вперед(1); } { направо; вперед(1); } } } } Лабиринт { целые dir; вывод "Введите направление движения: 1 - НАПРАВО, 2 - НАЛЕВО"; ввод dir; если(dir == 1); { НАПРАВО } { НАЛЕВО } }',
    ],
]) {
    test(`formatter preserves tokens, comments and syntax: ${name}`, () => {
        const formatted = formatCode(source);
        assert.deepEqual(tokens(formatted), tokens(source));
        assert.deepEqual(ast(formatted), ast(source));
        assert.equal(formatCode(formatted), formatted);
    });
}

test('formatting does not require semantic validity while writing a program', () => {
    assert.equal(formatCode('main{unknown=5;}'), 'main\n{\n    unknown = 5;\n}\n');
});
test('empty and comment-only text are supported', () => {
    assert.equal(formatCode(' \n\t'), '');
    assert.equal(formatCode(' // comment\r\n'), '// comment\n');
});
test('invalid syntax is reported rather than silently repaired', () => {
    for (const source of [
        'main {',
        'main { println "oops; }',
        'main { /* unfinished',
        'main { @; }',
    ]) {
        assert.throws(() => formatCode(source));
    }
});
