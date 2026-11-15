import { compile } from '../language/compiler.js';
import { Runtime } from '../runtime/runtime.js';
import { Robot, Field } from '../robot.js';
import { Interpreter } from '../interpreter.js';

export function run(source, { inputs = [], robot = new Robot(new Field(8)), ...options } = {}) {
    const runtime = new Runtime(compile(source), { robot, ...options });
    const iterator = runtime.run();
    const steps = [];
    let output = '',
        next = iterator.next(),
        inputIndex = 0;
    while (!next.done) {
        const event = next.value;
        let result;
        if (event.kind === 'step') steps.push(event.loc.line);
        else if (event.effect === 'output') output += event.text;
        else if (event.effect === 'clear') output = '';
        else if (event.effect === 'input') {
            if (inputIndex >= inputs.length) throw new Error(`No input for ${event.name}`);
            result = inputs[inputIndex++];
        } else if (event.effect === 'robot') {
            const operation = event.operation;
            if (operation === 'forward' || operation === 'backward') {
                for (let i = 0; i < event.args[0].value; i++)
                    if (!robot[operation]().success)
                        throw new Error(
                            `Blocked at ${robot.x},${robot.y}, line ${event.loc.line + 1}`
                        );
            } else if (operation === 'paint') {
                if (!robot.isOnTarget() || robot.isCellPainted())
                    throw new Error(
                        `Invalid paint at ${robot.x},${robot.y}, line ${event.loc.line + 1}`
                    );
                robot.paint();
            } else
                robot[{ left: 'turnLeft', right: 'turnRight', around: 'turnAround' }[operation]]();
        } else throw new Error(`Unsupported effect: ${event.effect}`);
        next = iterator.next(result);
    }
    return { output, runtime, robot, steps };
}
export function controller() {
    const field = new Field(8),
        robot = new Robot(field);
    const renderer = {
        render() {},
        stopAnimation() {},
        async animateMove() {},
        async animateTurn() {},
    };
    const interpreter = new Interpreter(robot, renderer);
    interpreter.getDelay = () => 0;
    const output = [],
        errors = [];
    interpreter.onOutput = (text) => output.push(text);
    interpreter.onError = (message) => errors.push(message);
    return { field, robot, renderer, interpreter, output, errors };
}
