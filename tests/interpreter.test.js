import test from 'node:test';
import assert from 'node:assert/strict';
import { controller, run } from './helpers.js';
import { parseMaze } from '../maze.js';
import { Robot, Direction, FieldRenderer } from '../robot.js';

async function steps(interpreter, code) {
    for (let i = 0; i < 1000; i++) if (!(await interpreter.step(code))) return;
    assert.fail('Step mode did not finish');
}
test('Run and Step execute the same nested functions/loops/input/output', async () => {
    const source =
        'main { int i; input i; for(i=i;i>0;i=i-1) { repeat(0) println 99; if(i==2) continue; println double(i); } } int double(int n) { return n*2; }';
    const normal = controller(),
        stepped = controller();
    for (const f of [normal, stepped]) f.interpreter.onInput = async () => 3;
    await normal.interpreter.execute(source);
    await steps(stepped.interpreter, source);
    assert.equal(normal.output.join(''), '6\n2\n');
    assert.deepEqual(stepped.output, normal.output);
    assert.deepEqual(stepped.errors, []);
    assert.equal(normal.interpreter.lastResult.success, true);
});
test('robot commands, zero movement, beds and successful completion', async () => {
    const f = controller();
    f.field.setTarget(1, 0, true);
    f.field.setBase(2, 0);
    await f.interpreter.execute('main { вперед(0); вперед(1); посади; вперед(1); }');
    assert.deepEqual(f.errors, []);
    assert.equal(f.interpreter.lastResult.success, true);
});
test('robot runtime failures do not become successful completions in step mode', async () => {
    const f = controller();
    await steps(f.interpreter, 'main { посади; }');
    assert.equal(f.interpreter.lastResult.reason, 'error');
    assert.equal(f.errors.length, 1);
});
test('all directional sensors distinguish wall, garden, flowerbed, and empty cell', () => {
    for (const [side, offset] of [
        ['впереди', 0],
        ['справа', 1],
        ['сзади', 2],
        ['слева', 3],
    ]) {
        for (const state of ['empty', 'wall', 'garden', 'flowerbed']) {
            const f = controller();
            f.robot.x = f.robot.y = 3;
            const direction = (f.robot.direction + offset) % 4;
            const [dx, dy] = [
                [0, -1],
                [1, 0],
                [0, 1],
                [-1, 0],
            ][direction];
            if (state === 'wall') f.field.setWall(3 + dx, 3 + dy, true);
            if (state === 'garden') f.field.setTarget(3 + dx, 3 + dy, true);
            if (state === 'flowerbed') f.field.paint(3 + dx, 3 + dy);
            const result = run(
                `main { println ${side}_стена, ",", ${side}_клумба, ",", ${side}_свободно; }`,
                { robot: f.robot }
            );
            assert.equal(
                result.output,
                `${state === 'wall'},${state === 'flowerbed'},${['empty', 'garden'].includes(state)}\n`
            );
        }
    }
});
test('a planted garden stops being a garden; border is a wall', () => {
    const f = controller();
    f.field.setTarget(0, 0, true);
    f.robot.direction = Direction.UP;
    assert.equal(
        run('main { println грядка; посади; println грядка, ",", впереди_стена; }', {
            robot: f.robot,
        }).output,
        'true\nfalse,true\n'
    );
});
test('stop during animation cancels the session and permits a fresh run', async () => {
    const f = controller();
    let release;
    f.renderer.animateMove = () =>
        new Promise((resolve) => {
            release = resolve;
        });
    const execution = f.interpreter.execute('main { вперед(1); println 99; }');
    await Promise.resolve();
    f.interpreter.stop();
    await execution;
    assert.equal(f.interpreter.isRunning, false);
    await f.interpreter.execute('main { println 7; }');
    release();
    assert.equal(f.output.join(''), '7\n');
});
test('stop during pending input and restart cannot apply stale input', async () => {
    const f = controller();
    let release;
    f.interpreter.onInput = () =>
        new Promise((resolve) => {
            release = resolve;
        });
    const execution = f.interpreter.execute('main { int x; input x; println x; }');
    await Promise.resolve();
    await Promise.resolve();
    f.interpreter.stop();
    await f.interpreter.execute('main { println 8; }');
    release('99');
    await execution;
    assert.equal(f.output.join(''), '8\n');
    assert.equal(f.errors.length, 0);
});
test('stopping a computational loop yields back to the event loop', async () => {
    const f = controller();
    const execution = f.interpreter.execute('main { while(1) {} }');
    setTimeout(() => f.interpreter.stop(), 0);
    await execution;
    assert.equal(f.interpreter.lastResult.reason, 'stopped');
});
test('step after stop resets state and executes movement', async () => {
    const f = controller();
    f.interpreter.stop();
    await f.interpreter.step('main { вперед(1); }');
    assert.equal(f.robot.x, 1);
});
test('changing source between steps starts a fresh program', async () => {
    const f = controller();
    await f.interpreter.step('main { вперед(1); направо; }');
    await f.interpreter.step('main { вперед(2); }');
    assert.equal(f.robot.x, 2);
});
test('negative/invalid movement produces a located diagnostic', async () => {
    const f = controller();
    await f.interpreter.execute('main {\n вперед(-2);\n}');
    assert.match(f.errors[0], /строка 2/);
    assert.equal(f.robot.x, 0);
});
test('Windows and Unix maze files load identically; start/base and rectangular edges survive', () => {
    const a = parseMaze('0.b\n...\n'),
        b = parseMaze('0.b\r\n...\r\n');
    assert.deepEqual(a, b);
    assert.equal(a.start.direction, Direction.UP);
    assert.equal(a.field.isWall(0, 2), true);
    const combined = parseMaze('...\n.B.\n...');
    assert.equal(combined.field.isBase(1, 1), true);
});
test('stopping FieldRenderer resolves its outstanding animation promise', async () => {
    const originalRequest = globalThis.requestAnimationFrame,
        originalCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
    try {
        const renderer = Object.assign(Object.create(FieldRenderer.prototype), {
            cellSize: 40,
            robot: { direction: 0 },
            render() {},
            drawRobot() {},
        });
        const animation = renderer.animateMove(0, 0, 1, 0);
        renderer.stopAnimation();
        await animation;
        assert.equal(renderer.animationFrame, null);
    } finally {
        globalThis.requestAnimationFrame = originalRequest;
        globalThis.cancelAnimationFrame = originalCancel;
    }
});
