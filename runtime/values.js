import { RobotRuntimeError } from '../language/errors.js';

export const scalar = (type, value) => ({ type, value });
export const zero = (type) => scalar(type, type === 'logical' ? false : 0);
export const isText = (value) =>
    value.type === 'string' ||
    value.type === 'char' ||
    (value instanceof ArrayValue && value.elementType === 'char' && value.shape.length === 1);
export function textValue(value) {
    if (value instanceof ArrayValue) {
        if (!isText(value))
            throw new RobotRuntimeError('для вывода массива укажите индекс элемента');
        const end = value.values.findIndex((item) => item.value === 0);
        return value.values
            .slice(0, end < 0 ? value.values.length : end)
            .map((item) => String.fromCharCode(item.value))
            .join('');
    }
    if (value.type === 'char') return String.fromCharCode(value.value);
    return String(value.value);
}
export function numberValue(value, loc) {
    if (value instanceof ArrayValue || value.type === 'string' || value.type === 'void')
        throw new RobotRuntimeError('ожидалось числовое значение', loc);
    const result = Number(value.value);
    if (!Number.isFinite(result))
        throw new RobotRuntimeError('результат не является конечным числом', loc);
    return result;
}
export const truth = (value, loc) => numberValue(value, loc) !== 0;
export function convert(value, type, loc) {
    if (type === 'string') {
        if (!isText(value)) throw new RobotRuntimeError('ожидалась строка', loc);
        return scalar('string', textValue(value));
    }
    const number = numberValue(value, loc);
    if (type === 'logical') return scalar(type, number !== 0);
    if (type === 'char' && (number < 0 || number > 65535))
        throw new RobotRuntimeError('код символа вне диапазона 0…65535', loc);
    return scalar(type, type === 'float' ? number : Math.trunc(number));
}
export function integer(value, loc, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    const number = numberValue(value, loc);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum)
        throw new RobotRuntimeError(`ожидалось целое число от ${minimum} до ${maximum}`, loc);
    return number;
}

/** Arrays own their storage; cloning on call implements pass-by-value. */
export class ArrayValue {
    constructor(elementType, shape, loc) {
        const size = shape.reduce((a, b) => a * b, 1);
        if (
            !shape.length ||
            shape.length > 2 ||
            shape.some((n) => !Number.isSafeInteger(n) || n <= 0) ||
            size > 10000
        )
            throw new RobotRuntimeError(
                'массив должен содержать от 1 до 10000 элементов и иметь не более двух измерений',
                loc
            );
        this.type = 'array';
        this.elementType = elementType;
        this.shape = [...shape];
        this.values = Array.from({ length: size }, () => zero(elementType));
    }
    offset(indices, loc) {
        if (indices.length !== this.shape.length)
            throw new RobotRuntimeError('неверное число индексов массива', loc);
        return indices.reduce((offset, index, i) => {
            if (!Number.isSafeInteger(index) || index < 0 || index >= this.shape[i])
                throw new RobotRuntimeError(
                    `индекс ${index} вне границ 0…${this.shape[i] - 1}`,
                    loc
                );
            return offset * this.shape[i] + index;
        }, 0);
    }
    get(indices, loc) {
        return this.values[this.offset(indices, loc)];
    }
    set(indices, value, loc) {
        this.values[this.offset(indices, loc)] = convert(value, this.elementType, loc);
    }
    setText(value, loc) {
        if (!isText(this) || !isText(value))
            throw new RobotRuntimeError('целиком присваивать можно только символьную строку', loc);
        const string = textValue(value);
        if (string.length > this.shape[0])
            throw new RobotRuntimeError('строка не помещается в массив', loc);
        this.values = Array.from({ length: this.shape[0] }, (_, i) =>
            scalar('char', string.charCodeAt(i) || 0)
        );
    }
    clone() {
        const result = new ArrayValue(this.elementType, this.shape);
        result.values = this.values.map((item) => ({ ...item }));
        return result;
    }
}
