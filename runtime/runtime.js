import { RobotRuntimeError } from '../language/errors.js';
import { Environment } from './environment.js';
import { builtins } from './builtins.js';
import {
    scalar,
    zero,
    ArrayValue,
    convert,
    numberValue,
    integer,
    truth,
    textValue,
} from './values.js';
import { unary, binary } from './operators.js';

/** AST evaluator. It yields steps/effects; it knows nothing about DOM, timers, or animation. */
export class Runtime {
    constructor(
        program,
        { robot, random = Math.random, maxSteps = 1000000, maxCallDepth = 256 } = {}
    ) {
        this.program = program;
        this.robot = robot;
        this.random = random;
        this.maxSteps = maxSteps;
        this.maxCallDepth = maxCallDepth;
        this.steps = 0;
        this.callDepth = 0;
        this.robotUsed = false;
        this.globals = new Environment();
        this.procedures = new Map(
            program.procedures.map((procedure) => [procedure.name, procedure])
        );
        this.frames = [];
    }
    *run() {
        for (const declaration of this.program.globals)
            yield* this.statement(declaration, this.globals);
        yield* this.call(this.program.procedures[0].name, [], this.program.loc);
    }
    *checkpoint(node, environment) {
        if (++this.steps > this.maxSteps)
            throw new RobotRuntimeError(`превышен предел ${this.maxSteps} шагов`, node.loc);
        yield {
            kind: 'step',
            loc: node.loc,
            environment,
            procedure: this.frames.at(-1)?.name ?? null,
        };
    }
    *evaluate(node, environment) {
        try {
            switch (node.type) {
                case 'Literal':
                    return scalar(
                        node.dataType,
                        node.dataType === 'char' ? node.value.charCodeAt(0) : node.value
                    );
                case 'Identifier':
                    return environment.has(node.name)
                        ? environment.get(node.name, node.loc)
                        : yield* this.call(node.name, [], node.loc);
                case 'Index':
                    return (yield* this.reference(node, environment)).get();
                case 'Call': {
                    const args = [];
                    for (const argument of node.arguments)
                        args.push(yield* this.evaluate(argument, environment));
                    return yield* this.call(node.name, args, node.loc);
                }
                case 'Unary':
                    return unary(
                        node.operator,
                        yield* this.evaluate(node.operand, environment),
                        node.loc
                    );
                case 'Binary': {
                    const left = yield* this.evaluate(node.left, environment);
                    if (node.operator === '&' && !truth(left, node.loc))
                        return scalar('logical', false);
                    if (node.operator === '|' && truth(left, node.loc))
                        return scalar('logical', true);
                    const right = yield* this.evaluate(node.right, environment);
                    if (['&', '|'].includes(node.operator))
                        return scalar('logical', truth(right, node.loc));
                    return binary(node.operator, left, right, node.loc);
                }
                default:
                    throw new RobotRuntimeError(
                        `неизвестный узел выражения ${node.type}`,
                        node.loc
                    );
            }
        } catch (error) {
            this.attachLocation(error, node.loc);
            throw error;
        }
    }
    *reference(node, environment) {
        const indices = [];
        let object = node;
        while (object.type === 'Index') {
            indices.unshift(object.index);
            object = object.object;
        }
        const value = environment.get(object.name, node.loc);
        if (!indices.length)
            return {
                name: object.name,
                get: () => environment.get(object.name, node.loc),
                set: (next) => environment.set(object.name, next, node.loc),
            };
        if (!(value instanceof ArrayValue))
            throw new RobotRuntimeError('индекс указан для скалярной переменной', node.loc);
        const resolved = [];
        for (const index of indices)
            resolved.push(integer(yield* this.evaluate(index, environment), index.loc));
        value.offset(resolved, node.loc);
        return {
            name: object.name + resolved.map((i) => `[${i}]`).join(''),
            get: () => value.get(resolved, node.loc),
            set: (next) => value.set(resolved, next, node.loc),
        };
    }
    *call(name, args, loc) {
        const builtin = builtins.get(name);
        if (builtin) {
            if (builtin.implementation) return builtin.implementation(args, this, loc);
            if (builtin.effect === 'robot') this.robotUsed = true;
            yield {
                kind: 'effect',
                effect: builtin.effect,
                name,
                operation: builtin.operation,
                args,
                loc,
            };
            return scalar('void', null);
        }
        const procedure = this.procedures.get(name);
        if (++this.callDepth > this.maxCallDepth)
            throw new RobotRuntimeError(`превышена глубина вызовов ${this.maxCallDepth}`, loc);
        const environment = new Environment(this.globals);
        this.frames.push({ name, environment });
        try {
            procedure.parameters.forEach((parameter, i) => {
                const value = args[i];
                if (parameter.rank) {
                    if (
                        !(value instanceof ArrayValue) ||
                        value.elementType !== parameter.dataType ||
                        value.shape.length !== parameter.rank
                    )
                        throw new RobotRuntimeError('тип параметра-массива не совпадает', loc);
                    environment.define(parameter.name, value.clone());
                } else environment.define(parameter.name, convert(value, parameter.dataType, loc));
            });
            const flow = yield* this.statement(procedure.body, environment);
            if (!procedure.returnType) return scalar('void', null);
            if (!flow || flow.kind !== 'return' || !flow.value)
                throw new RobotRuntimeError(
                    `функция «${name}» завершилась без возврата значения`,
                    procedure.loc
                );
            return convert(flow.value, procedure.returnRank ? 'string' : procedure.returnType, loc);
        } finally {
            this.callDepth--;
            this.frames.pop();
        }
    }
    *statement(node, environment) {
        if (!node) return;
        if (node.type === 'Block') {
            for (const statement of node.statements) {
                const flow = yield* this.statement(statement, environment);
                if (flow) return flow;
            }
            return;
        }
        if (node.type === 'Empty') return;
        yield* this.checkpoint(node, environment);
        try {
            switch (node.type) {
                case 'Declaration':
                    for (const declaration of node.declarations) {
                        let value;
                        if (declaration.dimensions.length) {
                            const shape = [];
                            for (const dimension of declaration.dimensions)
                                shape.push(
                                    integer(
                                        yield* this.evaluate(dimension, environment),
                                        dimension.loc,
                                        1,
                                        10000
                                    )
                                );
                            value = new ArrayValue(node.dataType, shape, declaration.loc);
                        } else
                            value = declaration.initializer
                                ? convert(
                                      yield* this.evaluate(declaration.initializer, environment),
                                      node.dataType,
                                      declaration.loc
                                  )
                                : zero(node.dataType);
                        environment.define(declaration.name, value);
                    }
                    break;
                case 'Assignment': {
                    const target = yield* this.reference(node.target, environment);
                    target.set(yield* this.evaluate(node.value, environment));
                    break;
                }
                case 'CallStatement':
                    yield* this.evaluate(node.call, environment);
                    break;
                case 'If':
                    return yield* this.statement(
                        truth(yield* this.evaluate(node.condition, environment), node.loc)
                            ? node.thenBody
                            : node.elseBody,
                        environment
                    );
                case 'While':
                case 'Repeat':
                case 'For':
                    return yield* this.loop(node, environment);
                case 'Break':
                    return { kind: 'break' };
                case 'Continue':
                    return { kind: 'continue' };
                case 'Return':
                    return {
                        kind: 'return',
                        value: node.value ? yield* this.evaluate(node.value, environment) : null,
                    };
                case 'Output': {
                    let output = '';
                    for (const item of node.items) {
                        const value = yield* this.evaluate(item.value, environment);
                        let text = textValue(value);
                        const width = item.width
                            ? integer(
                                  yield* this.evaluate(item.width, environment),
                                  item.width.loc,
                                  -10000,
                                  10000
                              )
                            : 0;
                        if (item.precision)
                            text = numberValue(value, item.value.loc).toFixed(
                                integer(
                                    yield* this.evaluate(item.precision, environment),
                                    item.precision.loc,
                                    0,
                                    100
                                )
                            );
                        output += width < 0 ? text.padEnd(-width) : text.padStart(width);
                    }
                    yield {
                        kind: 'effect',
                        effect: 'output',
                        text: output + (node.newline ? '\n' : ''),
                        loc: node.loc,
                    };
                    break;
                }
                case 'Input':
                    for (const targetNode of node.targets) {
                        const target = yield* this.reference(targetNode, environment),
                            previous = target.get();
                        const input = yield {
                            kind: 'effect',
                            effect: 'input',
                            name: target.name,
                            dataType: previous instanceof ArrayValue ? 'string' : previous.type,
                            loc: targetNode.loc,
                        };
                        target.set(this.readInput(input, previous, targetNode.loc));
                    }
                    break;
                default:
                    throw new RobotRuntimeError(`неизвестный оператор ${node.type}`, node.loc);
            }
        } catch (error) {
            this.attachLocation(error, node.loc);
            throw error;
        }
    }
    *loop(node, environment) {
        if (node.initializer) yield* this.statement(node.initializer, environment);
        const count =
            node.type === 'Repeat'
                ? integer(yield* this.evaluate(node.count, environment), node.loc)
                : Infinity;
        for (let iteration = 0; iteration < count; iteration++) {
            if (iteration) yield* this.checkpoint(node, environment);
            if (
                node.condition &&
                !truth(yield* this.evaluate(node.condition, environment), node.loc)
            )
                break;
            const flow = yield* this.statement(node.body, environment);
            if (flow?.kind === 'return') return flow;
            if (flow?.kind === 'break') break;
            if (node.update) yield* this.statement(node.update, environment);
        }
    }
    readInput(input, previous, loc) {
        if (input == null) throw new RobotRuntimeError('ввод отменён', loc);
        const raw = String(input);
        if (previous instanceof ArrayValue) return scalar('string', raw);
        if (previous.type === 'char') {
            if (raw.length !== 1) throw new RobotRuntimeError('введите один символ', loc);
            return scalar('char', raw.charCodeAt(0));
        }
        if (previous.type === 'logical') {
            const boolean = new Map([
                ['true', true],
                ['истина', true],
                ['1', true],
                ['false', false],
                ['ложь', false],
                ['0', false],
            ]);
            if (!boolean.has(raw.trim().toLowerCase()))
                throw new RobotRuntimeError('введите истина или ложь', loc);
            return scalar('logical', boolean.get(raw.trim().toLowerCase()));
        }
        const numeric = raw.trim();
        if (
            !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(numeric) ||
            !Number.isFinite(Number(numeric))
        )
            throw new RobotRuntimeError('введите число', loc);
        if (previous.type === 'int' && !Number.isSafeInteger(Number(numeric)))
            throw new RobotRuntimeError('введите целое число', loc);
        return scalar(previous.type, Number(numeric));
    }
    attachLocation(error, loc) {
        if (error.line == null) {
            error.line = loc.line;
            error.column = loc.column;
        }
    }
}
