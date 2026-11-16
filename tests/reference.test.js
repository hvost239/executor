import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../language/compiler.js';
import { formatCode } from '../language/formatter.js';
import { Lexer } from '../language/lexer.js';
import { parseMaze } from '../maze.js';
import { Robot } from '../robot.js';
import { run } from './helpers.js';
import { encodeProgramFile } from '../files/program-file.js';
import { translateCode } from '../language/translate.js';
import { BUILTIN_NAMES } from '../language/vocabulary.js';

// The reference distribution is not copied into this repository.
const root = process.env.EXECUTOR_REFERENCE_DIR;
test(
    'official .prg corpus compiles and formats, and all 47 Robot programs execute',
    { skip: !root && 'Set EXECUTOR_REFERENCE_DIR to the extracted official distribution' },
    () => {
        let compiled = 0,
            executed = 0;
        const mazeFolder = path.join(root, 'maze');
        const mazes = new Map(
            fs
                .readdirSync(mazeFolder)
                .map((name) => [name.toLowerCase().replace(/\.maz$/, ''), name])
        );
        for (const folder of ['robot', 'kurs', 'drawer', 'turtle', 'fractals']) {
            const directory = path.join(root, 'program', folder);
            for (const name of fs.readdirSync(directory).filter((name) => /\.prg$/i.test(name))) {
                const originalBytes = fs.readFileSync(path.join(directory, name));
                const source = new TextDecoder('windows-1251').decode(originalBytes);
                assert.deepEqual(
                    Buffer.from(encodeProgramFile(source)),
                    originalBytes,
                    `${folder}/${name}: export must match original .prg bytes`
                );
                assert.doesNotThrow(() => compile(source), `${folder}/${name}`);
                const english = translateCode(source, 'en');
                const normalized = (code) =>
                    JSON.parse(
                        JSON.stringify(compile(code), (key, value) =>
                            key === 'loc'
                                ? undefined
                                : key === 'name'
                                  ? (BUILTIN_NAMES.get(value)?.ru ?? value)
                                  : value
                        )
                    );
                assert.deepEqual(
                    normalized(english),
                    normalized(source),
                    `${folder}/${name}: translation must preserve semantics`
                );
                assert.deepEqual(
                    normalized(translateCode(english, 'ru')),
                    normalized(source),
                    `${folder}/${name}: round trip`
                );
                const formatted = formatCode(source);
                const signature = (text) =>
                    new Lexer()
                        .tokenize(text, { includeComments: true })
                        .map((token) => [token.tokenType.name, token.image]);
                assert.deepEqual(signature(formatted), signature(source), name);
                assert.equal(formatCode(formatted), formatted, name);
                assert.doesNotThrow(() => compile(formatted), name);
                compiled++;
                if (folder !== 'robot') continue;
                let robot;
                const mazeName = mazes.get(name.toLowerCase().replace(/\.prg$/, ''));
                if (mazeName) {
                    const maze = parseMaze(
                        fs.readFileSync(path.join(mazeFolder, mazeName), 'utf8')
                    );
                    robot = new Robot(maze.field);
                    Object.assign(robot, maze.start);
                    robot.saveStartPosition();
                }
                assert.doesNotThrow(
                    () => run(formatted, { robot, inputs: Array(30).fill('3'), maxSteps: 100000 }),
                    name
                );
                if (robot) assert.equal(robot.field.allTargetsPainted(), true, name);
                if (mazeName) {
                    const maze = parseMaze(
                        fs.readFileSync(path.join(mazeFolder, mazeName), 'utf8')
                    );
                    const englishRobot = new Robot(maze.field);
                    Object.assign(englishRobot, maze.start);
                    englishRobot.saveStartPosition();
                    run(english, {
                        robot: englishRobot,
                        inputs: Array(30).fill('3'),
                        maxSteps: 100000,
                    });
                    assert.deepEqual(
                        [englishRobot.x, englishRobot.y, englishRobot.direction],
                        [robot.x, robot.y, robot.direction],
                        name
                    );
                    assert.deepEqual(englishRobot.field.painted, robot.field.painted, name);
                }
                // Some official examples intentionally have no base or stop away from it.
                if (name.toLowerCase() === 'z1.prg') assert.equal(robot.isOnBase(), true);
                executed++;
            }
        }
        assert.equal(compiled, 141);
        assert.equal(executed, 47);
    }
);
