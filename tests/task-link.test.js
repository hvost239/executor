import test from 'node:test';
import assert from 'node:assert/strict';
import { Field, Direction } from '../robot.js';
import { createTaskLink, readTaskLink, encodeMaze, decodeMaze } from '../sharing/task-link.js';

const site = 'https://hvost239.github.io/executor/';
const queryLink = (parameters) => `${site}?${new URLSearchParams(parameters)}`;

test('maze snapshots preserve all task cells, the base and each initial direction', () => {
    const field = new Field(3);
    field.setWall(2, 0, true);
    field.setTarget(0, 1, true);
    field.setTarget(2, 0, true);
    field.setBase(0, 1);
    field.paint(0, 1);
    for (const direction of Object.values(Direction)) {
        const start = { x: 0, y: 1, direction };
        const restored = decodeMaze(encodeMaze(field, start));
        assert.deepEqual(restored.start, start);
        assert.deepEqual(restored.field.walls, field.walls);
        assert.deepEqual(restored.field.targets, field.targets);
        assert.equal(restored.field.isBase(0, 1), true);
        assert.equal(restored.field.painted.size, 0);
        assert.equal(field.isPainted(0, 1), true);
    }
});

test('share links round-trip exact Unicode and URL punctuation without stale task parameters', () => {
    const program = 'Программа\r\n{\n    выводстр "🧩 + % & ? # = /"; // ещё не закончил';
    const field = new Field(2);
    const start = { x: 1, y: 1, direction: Direction.LEFT };
    const href = createTaskLink(`${site}?course=1&maze=old&program=old#old`, {
        field,
        start,
        program,
    });
    const url = new URL(href);
    assert.equal(url.search, '?course=1');
    assert.match(url.hash, /^#maze=/);
    const restored = readTaskLink(href);
    assert.equal(restored.program, program);
    assert.deepEqual(restored.maze.start, start);
    assert.equal(restored.maze.field.baseX, -1);
    assert.equal(restored.maze.field.baseY, -1);
});

test('query parameters accept plain MAZ text and may contain only a program or only a maze', () => {
    const task = readTaskLink(queryLink({ maze: '.w.\r\n.Bx\r\n...', program: 'тест{}' }));
    assert.equal(task.program, 'тест{}');
    assert.equal(task.maze.field.isWall(1, 0), true);
    assert.equal(task.maze.field.isTarget(2, 1), true);
    assert.equal(task.maze.field.isBase(1, 1), true);
    assert.deepEqual(task.maze.start, { x: 1, y: 1, direction: Direction.UP });
    assert.deepEqual(readTaskLink(queryLink({ program: '' })), { program: '', maze: null });
    assert.equal(readTaskLink(queryLink({ maze: 'B' })).program, null);
    assert.equal(readTaskLink(`${site}?course=1#workspace`), null);
});

test('fragment parameters override matching query parameters and support local files', () => {
    const url = new URL(queryLink({ maze: 'B', program: 'old{}' }));
    url.hash = new URLSearchParams({ program: 'новая{}' }).toString();
    assert.equal(readTaskLink(url.href).program, 'новая{}');
    const local = createTaskLink('file:///tmp/executor/index.html', {
        field: new Field(1),
        start: { x: 0, y: 0, direction: 0 },
        program: '',
    });
    assert.equal(new URL(local).protocol, 'file:');
    assert.equal(readTaskLink(local).maze.field.size, 1);
});

test('invalid links are rejected before a partial task is returned', () => {
    for (const maze of [
        '',
        '???',
        '{',
        '{"v":2}',
        JSON.stringify({ v: 1, rows: ['0'], base: null, start: [0, 0, 4] }),
    ]) {
        assert.throws(() => readTaskLink(queryLink({ maze, program: 'main{}' })));
    }
    assert.throws(() => readTaskLink(`${site}?program=a&program=b`), /несколько раз/);
    assert.throws(() => readTaskLink(`${site}#maze=B&maze=B`), /несколько раз/);
    const valid = { v: 1, rows: ['00', '00'], base: null, start: [0, 0, 0] };
    for (const changes of [
        { rows: [] },
        { rows: ['00'] },
        { rows: ['04', '00'] },
        { rows: ['1'] },
        { rows: Array(201).fill('0'.repeat(201)) },
        { rows: { length: 2 } },
        { base: [2, 0] },
        { base: [-1, -1] },
        { base: '0,0' },
        { start: [0.5, 0, 0] },
        { start: [0, 2, 0] },
        { start: null },
    ]) {
        assert.throws(() => decodeMaze(JSON.stringify({ ...valid, ...changes })));
    }
});

test('large tasks stay in the fragment and restore without being placed in an HTTP request path', () => {
    const field = new Field(200);
    field.setWall(199, 199, true);
    const program = 'выводстр "длинная программа";\n'.repeat(1000);
    const url = new URL(
        createTaskLink(site, {
            field,
            start: { x: 0, y: 0, direction: 1 },
            program,
        })
    );
    assert.equal(url.pathname + url.search, '/executor/');
    const task = readTaskLink(url.href);
    assert.equal(task.maze.field.size, 200);
    assert.equal(task.maze.field.isWall(199, 199), true);
    assert.equal(task.program, program);
});
