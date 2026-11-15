import { RobotRuntimeError } from '../language/errors.js';
import { scalar, numberValue, integer, textValue, isText } from './values.js';

/** Shared signatures are used by the analyzer; implementations are used by the VM. */
export const builtins = new Map();
function register(names, arity, returns, implementation, extra = {}) {
    for (const name of names)
        builtins.set(name, {
            name,
            arity: Array.isArray(arity) ? arity : [arity],
            returns,
            implementation,
            ...extra,
        });
}
const numeric =
    (fn, returns = 'float') =>
    (args, runtime, loc) => {
        const result = fn(...args.map((arg) => numberValue(arg, loc)));
        if (!Number.isFinite(result))
            throw new RobotRuntimeError('аргумент функции вне области определения', loc);
        return scalar(returns, result);
    };
for (const [name, fn] of Object.entries({ trunc: Math.trunc, round: Math.round, sign: Math.sign }))
    register([name], 1, 'int', numeric(fn, 'int'));
for (const [name, fn] of Object.entries({
    sqrt: Math.sqrt,
    abs: Math.abs,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    arcsin: Math.asin,
    arccos: Math.acos,
    arctan: Math.atan,
    exp: Math.exp,
    ln: Math.log,
    lg: Math.log10,
}))
    register([name], 1, 'float', numeric(fn));
const radians = (degrees) => (degrees * Math.PI) / 180;
for (const [name, fn] of Object.entries({ sing: Math.sin, cosg: Math.cos, tang: Math.tan }))
    register(
        [name],
        1,
        'float',
        numeric((x) => fn(radians(x)))
    );
for (const [name, fn] of Object.entries({
    arcsing: Math.asin,
    arccosg: Math.acos,
    arctang: Math.atan,
}))
    register(
        [name],
        1,
        'float',
        numeric((x) => (fn(x) * 180) / Math.PI)
    );
register(['arctan2'], 2, 'float', numeric(Math.atan2));
register(
    ['arctan2g'],
    2,
    'float',
    numeric((y, x) => (Math.atan2(y, x) * 180) / Math.PI)
);
register(['pi'], 0, 'float', () => scalar('float', Math.PI));
register(['random'], [0, 1], 'float', (args, runtime, loc) =>
    args.length
        ? scalar('int', Math.floor(runtime.random() * integer(args[0], loc, 1)))
        : scalar('float', runtime.random())
);
const string = (value, loc) => {
    if (!isText(value)) throw new RobotRuntimeError('ожидалась строка', loc);
    return textValue(value);
};
register(['length', 'длина'], 1, 'int', (a, r, loc) => scalar('int', string(a[0], loc).length));
register(['copy', 'фрагмент'], 3, 'string', (a, r, loc) =>
    scalar('string', string(a[0], loc).substr(integer(a[1], loc), integer(a[2], loc)))
);
register(['pos', 'позиция'], 2, 'int', (a, r, loc) =>
    scalar('int', string(a[1], loc).indexOf(string(a[0], loc)))
);
register(['insert', 'вставить'], 3, 'string', (a, r, loc) => {
    const target = string(a[1], loc),
        i = integer(a[2], loc, 0, target.length);
    return scalar('string', target.slice(0, i) + string(a[0], loc) + target.slice(i));
});
register(['delete', 'удалить'], 3, 'string', (a, r, loc) => {
    const target = string(a[0], loc),
        i = integer(a[1], loc, 0, target.length),
        length = integer(a[2], loc);
    return scalar('string', target.slice(0, i) + target.slice(i + length));
});
for (const [operation, names, arity] of [
    ['forward', ['вперед', 'вперёд', 'forward'], 1],
    ['backward', ['назад', 'backward', 'back'], 1],
    ['left', ['налево', 'влево', 'left'], 0],
    ['right', ['направо', 'вправо', 'right'], 0],
    ['around', ['кругом', 'around', 'turnaround'], 0],
    ['paint', ['посади', 'посадить', 'закрасить', 'закрась', 'paint'], 0],
])
    register(names, arity, 'void', null, { effect: 'robot', operation });
for (const [side, offset] of [
    ['впереди', 0],
    ['справа', 1],
    ['сзади', 2],
    ['слева', 3],
]) {
    for (const kind of ['стена', 'клумба', 'свободно'])
        register(
            [`${side}_${kind}`, `${kind === 'свободно' ? 'свободно' : kind}_${side}`],
            0,
            'logical',
            (a, runtime) => {
                runtime.robotUsed = true;
                const robot = runtime.robot,
                    direction = (robot.direction + offset) % 4;
                const [dx, dy] = [
                    [0, -1],
                    [1, 0],
                    [0, 1],
                    [-1, 0],
                ][direction];
                const x = robot.x + dx,
                    y = robot.y + dy;
                return scalar(
                    'logical',
                    kind === 'стена'
                        ? robot.field.isWall(x, y)
                        : kind === 'клумба'
                          ? robot.field.isPainted(x, y)
                          : robot.canMove(direction)
                );
            }
        );
}
register(['грядка', 'на_грядке', 'на_цели', 'цель'], 0, 'logical', (a, r) => {
    r.robotUsed = true;
    return scalar('logical', r.robot.isOnTarget() && !r.robot.isCellPainted());
});
register(['база', 'на_базе'], 0, 'logical', (a, r) => {
    r.robotUsed = true;
    return scalar('logical', r.robot.isOnBase());
});
register(['клетка_закрашена'], 0, 'logical', (a, r) => {
    r.robotUsed = true;
    return scalar('logical', r.robot.isCellPainted());
});
register(['очистить', 'clrscr'], 0, 'void', null, { effect: 'clear' });

// Graphics calls belong to the language but require a different executor host.
const graphics = [
    [['покажись', 'скройся', 'подними_перо', 'опусти_перо', 'домой'], 0],
    [['курс', 'цвет', 'окружность', 'TextColor', 'ЦветТекста', 'TextAngle', 'УголТекста'], 1],
    [
        [
            'в_точку',
            'вектор',
            'Point',
            'Точка',
            'MoveTo',
            'КурсорК',
            'LineTo',
            'ЛинияК',
            'Fill',
            'Залить',
            'Brush',
            'Кисть',
        ],
        2,
    ],
    [
        [
            'цветRGB',
            'закрасьRGB',
            'Pen',
            'Перо',
            'FillTo',
            'ЗалитьДо',
            'Font',
            'Шрифт',
            'TextOut',
            'Текст',
        ],
        3,
    ],
    [['Line', 'Линия', 'Rectangle', 'Прямоугольник', 'Ellipse', 'Эллипс'], 4],
    [['Arc', 'Дуга'], 6],
];
for (const [names, arity] of graphics) register(names, arity, 'void', null, { effect: 'graphics' });
for (const name of ['влево', 'вправо', 'закрась']) builtins.get(name).arity.push(1);
register(['RGB'], 3, 'int', (args, r, loc) => {
    const [red, green, blue] = args.map((arg) => integer(arg, loc, 0, 255));
    return scalar('int', red + green * 256 + blue * 65536);
});
