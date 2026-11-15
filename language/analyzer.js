import { RobotSyntaxError } from './errors.js';
import { builtins } from '../runtime/builtins.js';

const fail = (message, node) => {
    throw new RobotSyntaxError(message, node.loc);
};
const scalarType = (dataType) => ({ dataType, rank: dataType === 'string' ? 1 : 0 });

/** Checks every procedure, including unreachable ones, before anything is executed. */
export class Analyzer {
    analyze(program) {
        this.procedures = new Map();
        this.globals = new Map();
        let seenProcedure = false;
        for (const item of program.items) {
            if (item.type === 'Procedure') {
                seenProcedure = true;
                if (item.returnRank > 1 || (item.returnRank && item.returnType !== 'char'))
                    fail('функция может возвращать скаляр или строку char[]', item);
                this.define(this.procedures, item.name, item, item);
            } else {
                if (seenProcedure)
                    fail('глобальные переменные объявляются перед главной процедурой', item);
                this.declare(item, this.globals);
            }
        }
        const main = program.procedures[0];
        if (!main) fail('ожидалась главная процедура', program);
        if (main.returnType || main.parameters.length)
            fail('главная процедура не имеет параметров и возвращаемого типа', main);
        for (const name of this.globals.keys())
            if (this.procedures.has(name))
                fail(`имя «${name}» занято процедурой`, this.procedures.get(name));
        for (const declaration of program.globals)
            this.statement(declaration, this.globals, null, 0);
        for (const procedure of program.procedures) {
            const scope = new Map(this.globals),
                locals = new Map();
            for (const parameter of procedure.parameters) {
                if (parameter.rank > 2) fail('допустимо не более двух измерений', parameter);
                this.define(locals, parameter.name, parameter, parameter);
            }
            this.collect(procedure.body, locals);
            for (const [name, definition] of locals) {
                if (this.procedures.has(name)) fail(`имя «${name}» занято процедурой`, definition);
                scope.set(name, definition);
            }
            this.statement(procedure.body, scope, procedure, 0);
        }
        return program;
    }
    define(scope, name, definition, node) {
        if (!/^[a-zA-Zа-яА-ЯёЁ][a-zA-Zа-яА-ЯёЁ_0-9]{0,31}$/.test(name))
            fail('имя должно начинаться с буквы и содержать до 32 символов', node);
        if (scope.has(name) || builtins.has(name)) fail(`имя «${name}» уже занято`, node);
        scope.set(name, definition);
    }
    declare(node, scope) {
        if (!node.dataType || node.returnRank)
            fail('ожидалось объявление переменной с типом', node);
        for (const declaration of node.declarations) {
            if (declaration.dimensions.length > 2)
                fail('допустимо не более двух измерений', declaration);
            if (declaration.dimensions.length && declaration.initializer)
                fail('инициализация массива при объявлении не поддерживается', declaration);
            this.define(
                scope,
                declaration.name,
                {
                    dataType: node.dataType,
                    rank: declaration.dimensions.length,
                    loc: declaration.loc,
                },
                declaration
            );
        }
    }
    collect(node, scope) {
        if (!node) return;
        if (node.type === 'Declaration') this.declare(node, scope);
        if (node.type === 'Block') node.statements.forEach((child) => this.collect(child, scope));
        if (node.type === 'If') {
            this.collect(node.thenBody, scope);
            this.collect(node.elseBody, scope);
        }
        if (['While', 'Repeat', 'For'].includes(node.type)) this.collect(node.body, scope);
    }
    reference(node, scope) {
        if (node.type === 'Identifier') {
            if (!scope.has(node.name)) fail(`переменная «${node.name}» не объявлена`, node);
            return scope.get(node.name);
        }
        if (node.type !== 'Index') fail('ожидалась переменная или элемент массива', node);
        const object = this.reference(node.object, scope);
        if (object.rank < 1) fail('индекс указан для скалярной переменной', node);
        this.numeric(this.expression(node.index, scope), node.index);
        return { ...object, rank: object.rank - 1 };
    }
    numeric(type, node) {
        if (type.rank || type.dataType === 'void') fail('ожидалось скалярное выражение', node);
    }
    expression(node, scope) {
        switch (node.type) {
            case 'Literal':
                return scalarType(node.dataType);
            case 'Identifier':
                if (scope.has(node.name)) return scope.get(node.name);
                return this.call({ ...node, arguments: [] }, scope, true);
            case 'Call':
                return this.call(node, scope, true);
            case 'Index':
                return this.reference(node, scope);
            case 'Unary':
                this.numeric(this.expression(node.operand, scope), node);
                return scalarType(node.operator === '!' ? 'logical' : 'float');
            case 'Binary': {
                const left = this.expression(node.left, scope),
                    right = this.expression(node.right, scope);
                const text = (type) =>
                    type.dataType === 'string' || (type.dataType === 'char' && type.rank <= 1);
                if (node.operator === '+' && text(left) && text(right)) return scalarType('string');
                if (!(
                    ['==', '!=', '<', '<=', '>', '>='].includes(node.operator) &&
                    text(left) &&
                    text(right)
                )) {
                    this.numeric(left, node.left);
                    this.numeric(right, node.right);
                }
                return scalarType(
                    ['&', '|', '==', '!=', '<', '<=', '>', '>='].includes(node.operator)
                        ? 'logical'
                        : 'float'
                );
            }
            default:
                fail('ожидалось выражение', node);
        }
    }
    call(node, scope, asExpression) {
        if (node.type !== 'Call' && node.type !== 'Identifier')
            fail('ожидался вызов процедуры', node);
        const builtin = builtins.get(node.name),
            procedure = this.procedures.get(node.name);
        if (!builtin && !procedure) fail(`неизвестная команда или функция «${node.name}»`, node);
        const arity = builtin?.arity ?? [procedure.parameters.length];
        if (!arity.includes(node.arguments.length))
            fail(
                `«${node.name}»: ожидалось параметров ${arity.join(' или ')}, получено ${node.arguments.length}`,
                node
            );
        const args = node.arguments.map((arg) => this.expression(arg, scope));
        if (procedure)
            procedure.parameters.forEach((parameter, i) => {
                const type = args[i];
                if (
                    parameter.rank &&
                    (parameter.rank !== type.rank || parameter.dataType !== type.dataType)
                )
                    fail(
                        `параметр «${parameter.name}»: нужен массив соответствующего типа и размерности`,
                        node.arguments[i]
                    );
                if (!parameter.rank) this.numeric(type, node.arguments[i]);
            });
        const dataType =
            builtin?.returns ??
            (procedure.returnRank ? 'string' : (procedure.returnType ?? 'void'));
        if (asExpression && dataType === 'void')
            fail(`процедура «${node.name}» не возвращает значение`, node);
        return scalarType(dataType);
    }
    statement(node, scope, procedure, loopDepth) {
        if (!node) return;
        const expression = (value) => this.expression(value, scope);
        switch (node.type) {
            case 'Block':
                node.statements.forEach((child) =>
                    this.statement(child, scope, procedure, loopDepth)
                );
                break;
            case 'Declaration':
                for (const item of node.declarations) {
                    item.dimensions.forEach((size) => this.numeric(expression(size), size));
                    if (item.initializer)
                        this.numeric(expression(item.initializer), item.initializer);
                }
                break;
            case 'Assignment': {
                const target = this.reference(node.target, scope),
                    value = expression(node.value);
                if (target.rank) {
                    if (
                        target.dataType !== 'char' ||
                        target.rank !== 1 ||
                        !['char', 'string'].includes(value.dataType) ||
                        value.rank > 1
                    )
                        fail('целиком присваивать можно только строки', node);
                } else this.numeric(value, node.value);
                break;
            }
            case 'CallStatement':
                this.call(node.call, scope, false);
                break;
            case 'If':
                this.numeric(expression(node.condition), node.condition);
                this.statement(node.thenBody, scope, procedure, loopDepth);
                this.statement(node.elseBody, scope, procedure, loopDepth);
                break;
            case 'While':
            case 'Repeat':
            case 'For':
                if (node.condition) this.numeric(expression(node.condition), node.condition);
                if (node.count) this.numeric(expression(node.count), node.count);
                this.statement(node.initializer, scope, procedure, loopDepth);
                this.statement(node.update, scope, procedure, loopDepth);
                this.statement(node.body, scope, procedure, loopDepth + 1);
                break;
            case 'Break':
            case 'Continue':
                if (!loopDepth) fail('оператор допустим только внутри цикла', node);
                break;
            case 'Return':
                if (!procedure) fail('возврат допустим только внутри процедуры', node);
                if (Boolean(procedure.returnType) !== Boolean(node.value))
                    fail('значение возврата должно соответствовать типу процедуры', node);
                if (node.value) {
                    const result = expression(node.value);
                    if (procedure.returnRank) {
                        if (!['char', 'string'].includes(result.dataType) || result.rank > 1)
                            fail('функция должна вернуть строку', node);
                    } else this.numeric(result, node);
                }
                break;
            case 'Output':
                node.items.forEach((item) => {
                    const type = expression(item.value);
                    if (
                        type.rank &&
                        !(
                            type.dataType === 'string' ||
                            (type.dataType === 'char' && type.rank === 1)
                        )
                    )
                        fail('для вывода массива укажите индекс', item.value);
                    if (item.width) this.numeric(expression(item.width), item.width);
                    if (item.precision) this.numeric(expression(item.precision), item.precision);
                });
                break;
            case 'Input':
                node.targets.forEach((target) => {
                    const type = this.reference(target, scope);
                    if (type.rank && !(type.rank === 1 && type.dataType === 'char'))
                        fail('для ввода массива укажите индекс', target);
                });
                break;
        }
    }
}
