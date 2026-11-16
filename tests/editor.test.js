import test from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory } from '../editor/history.js';
import { translateCode } from '../language/translate.js';
import { BUILTIN_NAMES } from '../language/vocabulary.js';
import { COMMANDS, renderSnippet } from '../editor/snippets.js';
import { compile } from '../language/compiler.js';
import { run } from './helpers.js';
import { builtins } from '../runtime/builtins.js';

test('history groups nearby typing, respects boundaries and discards redo after new edits', () => {
    const h = new EditHistory(2);
    const state = (value) => ({ value, start: value.length, end: value.length });
    h.record(state(''), state('a'), 'insertText', 100);
    h.record(state('a'), state('ab'), 'insertText', 200);
    assert.deepEqual(h.undo(state('ab')), state(''));
    assert.deepEqual(h.redo(state('')), state('ab'));
    h.record(state('ab'), state('abc'), 'insertText', 300);
    assert.deepEqual(h.undo(state('abc')), state('ab'));
    h.record(state('ab'), state('abX'), null, 400);
    assert.equal(h.redo(state('abX')), null);
    h.record(state('abX'), state('abXY'), null, 500);
    assert.deepEqual(h.undo(state('abXY')), state('abX'));
    assert.deepEqual(h.undo(state('abX')), state('ab'));
    assert.equal(h.undo(state('ab')), null);
});

test('translation preserves whitespace, user procedure names, comments and string literals', () => {
    const ru =
        '// вперед если база\nЛабиринт\n{\n    целые n = 2;\n    выводстр "вперед & if";\n    повтори (n) { НАПРАВО; }\n}\nНАПРАВО { если (не база и впереди_свободно) направо; }';
    const en = translateCode(ru, 'en');
    assert.equal(
        en,
        '// вперед если база\nЛабиринт\n{\n    int n = 2;\n    println "вперед & if";\n    repeat (n) { НАПРАВО; }\n}\nНАПРАВО { if (not base and free_ahead) right; }'
    );
    assert.equal(translateCode(en, 'ru'), ru);
    assert.equal(translateCode(en, 'en'), en);
    assert.doesNotThrow(() => compile(en));
    assert.equal(translateCode('// only a comment', 'en'), '// only a comment');
    assert.throws(() => translateCode('main{', 'en'));
    assert.equal(
        translateCode('main { целые Счётчик; Счётчик = 1; }', 'en'),
        'main { int Счётчик; Счётчик = 1; }'
    );
});

test('translated math, strings, loops and stream IO execute identically', () => {
    const ru =
        'Главная { целые n; символы s[20]; ввод n; s="текст"; пока(n>0){выводстр длина(s), фрагмент(s,0,n); n=n-1;} cout << "ввод"; }';
    assert.equal(
        run(translateCode(ru, 'en'), { inputs: ['3'] }).output,
        run(ru, { inputs: ['3'] }).output
    );
    assert.equal(translateCode('main{println !(1&0)|0;}', 'ru'), 'main{выводстр !(1&0)|0;}');
    assert.equal(
        translateCode('main{влево(90); вправо(45); закрась(1); влево;}', 'en'),
        'main{влево(90); вправо(45); закрась(1); left;}'
    );
});

test('every translated builtin alias retains the runtime signature and robot sensor behavior', () => {
    const source =
        'main{println впереди_стена, справа_свободно, сзади_клумба, слева_стена, грядка, база, клетка_закрашена;}';
    assert.equal(run(translateCode(source, 'en')).output, run(source).output);
    for (const entry of new Set(BUILTIN_NAMES.values())) {
        assert.deepEqual(builtins.get(entry.ru).arity, builtins.get(entry.en).arity, entry.ru);
        assert.equal(builtins.get(entry.ru).returns, builtins.get(entry.en).returns, entry.ru);
        assert.equal(
            builtins.get(entry.ru).implementation,
            builtins.get(entry.en).implementation,
            entry.ru
        );
    }
});

test('all command templates compile in both languages and select their first parameter', () => {
    for (const command of COMMANDS) {
        for (const language of ['ru', 'en']) {
            const { text, selection } = renderSnippet(command, language);
            assert.ok(!/[«»]/.test(text));
            assert.ok(selection[0] >= 0 && selection[1] <= text.length);
            let source;
            if (['sensors', 'math', 'strings'].includes(command.group))
                source = `main{int x,y; char s[30]; println ${text};}`;
            else if (command.id === 'возврат') source = `main{} int f{${text}}`;
            else if (command.group === 'control') source = `main{int i; while(false){${text}}}`;
            else source = `main{${command.id === 'input' ? 'int n;' : ''}${text}}`;
            assert.doesNotThrow(() => compile(source), `${language}: ${command.id}`);
        }
    }
});
