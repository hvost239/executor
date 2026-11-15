import { RobotRuntimeError } from '../language/errors.js';
import { scalar, isText, textValue, numberValue, truth } from './values.js';

export function unary(operator, value, loc) {
    if (operator === '!') return scalar('logical', !truth(value, loc));
    const number = numberValue(value, loc);
    return scalar(value.type === 'float' ? 'float' : 'int', operator === '-' ? -number : number);
}
export function binary(operator, left, right, loc) {
    if (operator === '+' && isText(left) && isText(right))
        return scalar('string', textValue(left) + textValue(right));
    if (['==', '!=', '<', '<=', '>', '>='].includes(operator)) {
        const textual = isText(left) && isText(right);
        const a = textual ? textValue(left) : numberValue(left, loc),
            b = textual ? textValue(right) : numberValue(right, loc);
        return scalar(
            'logical',
            {
                '==': () => a === b,
                '!=': () => a !== b,
                '<': () => a < b,
                '<=': () => a <= b,
                '>': () => a > b,
                '>=': () => a >= b,
            }[operator]()
        );
    }
    const a = numberValue(left, loc),
        b = numberValue(right, loc);
    if ((operator === '/' || operator === '%') && b === 0)
        throw new RobotRuntimeError('деление на ноль', loc);
    let result = {
        '+': () => a + b,
        '-': () => a - b,
        '*': () => a * b,
        '/': () => a / b,
        '%': () => a % b,
        '^': () => a ** b,
    }[operator]();
    const type =
        left.type === 'float' || right.type === 'float' || operator === '^' ? 'float' : 'int';
    if (!Number.isFinite(result))
        throw new RobotRuntimeError('недопустимый результат арифметической операции', loc);
    if (operator === '/' && type === 'int') result = Math.trunc(result);
    return scalar(type, result);
}
