import test from 'node:test';
import assert from 'node:assert/strict';
import {
    encodeProgramFile,
    programFilename,
    suggestProgramFilename,
} from '../files/program-file.js';

test('original program export uses exact Windows-1251 bytes, CRLF and no BOM', () => {
    const bytes = encodeProgramFile('Яё\n{}\r\n// Ё\r');
    assert.deepEqual([...bytes], [0xdf, 0xb8, 13, 10, 123, 125, 13, 10, 47, 47, 32, 0xa8, 13, 10]);
    assert.equal(new TextDecoder('windows-1251').decode(bytes), 'Яё\r\n{}\r\n// Ё\r\n');
    assert.equal(encodeProgramFile('').length, 0);
    // Saving a work in progress does not require syntactically valid code.
    assert.equal(
        new TextDecoder('windows-1251').decode(encodeProgramFile('НеЗакончена {')),
        'НеЗакончена {'
    );
});

test('Windows-1251 export refuses unsupported characters, while UTF-8 preserves them', () => {
    const source = 'Программа { выводстр "🤖 世界"; }';
    assert.throws(() => encodeProgramFile(source), /UTF-8/);
    assert.equal(new TextDecoder().decode(encodeProgramFile(source, 'utf-8')), source);
    assert.throws(() => encodeProgramFile(source, 'unknown'), /кодировка/);
});

test('export suggests the main procedure name and accepts unfinished code', () => {
    assert.equal(
        suggestProgramFilename('// задача\nцелые n; Решение {} Помощник {}'),
        'Решение.prg'
    );
    assert.equal(suggestProgramFilename('незаконченный код {'), 'program.prg');
    assert.equal(suggestProgramFilename(''), 'program.prg');
    assert.equal(programFilename('  Задача.PRG  '), 'Задача.prg');
    assert.equal(programFilename('CON'), '_CON.prg');
    assert.equal(programFilename('a/b\\c'), 'a_b_c.prg');
    assert.equal(programFilename(' ... '), 'program.prg');
});
