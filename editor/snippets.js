import { BUILTIN_NAMES } from '../language/vocabulary.js';

export const COMMAND_GROUPS = {
    robot: 'Команды Робота',
    sensors: 'Датчики Робота',
    control: 'Операторы',
    types: 'Типы переменных',
    io: 'Ввод и вывод',
    math: 'Математика',
    strings: 'Строки',
};
export const COMMANDS = [];
function add(id, group, description, ru, en = ru) {
    COMMANDS.push({ id, group, description, templates: { ru, en } });
}
function builtin(name, group, description, suffix = '') {
    const names = BUILTIN_NAMES.get(name) ?? { ru: name, en: name };
    add(name, group, description, names.ru + suffix, names.en + suffix);
}
for (const [name, description, suffix] of [
    ['вперед', 'Движение вперёд', '(«1»);'],
    ['назад', 'Движение назад', '(«1»);'],
    ['налево', 'Поворот налево', ';'],
    ['направо', 'Поворот направо', ';'],
    ['кругом', 'Разворот', ';'],
    ['посади', 'Посадить цветы', ';'],
])
    builtin(name, 'robot', description, suffix);
for (const side of ['впереди', 'справа', 'сзади', 'слева']) {
    for (const [kind, label] of [
        ['стена', 'Стена'],
        ['клумба', 'Клумба'],
        ['свободно', 'Свободно'],
    ])
        builtin(`${side}_${kind}`, 'sensors', `${label} ${side}`);
}
for (const [name, description] of [
    ['грядка', 'Робот на грядке'],
    ['база', 'Робот на базе'],
    ['клетка_закрашена', 'Цветы уже посажены'],
])
    builtin(name, 'sensors', description);
for (const [ru, en, description, suffix] of [
    ['если', 'if', 'Условие', ' («истина»)\n{\n    \n}'],
    ['пока', 'while', 'Цикл с условием', ' («ложь»)\n{\n    \n}'],
    ['повтори', 'repeat', 'Повторение команд', ' («4»)\n{\n    \n}'],
    ['цикл', 'for', 'Цикл со счётчиком; объявите i', ' (i = 0; i < «10»; i = i + 1)\n{\n    \n}'],
    ['прервать', 'break', 'Выйти из цикла', ';'],
    ['продолжить', 'continue', 'Следующая итерация', ';'],
    ['возврат', 'return', 'Вернуть значение функции', ' «0»;'],
])
    add(
        ru,
        'control',
        description,
        ru + suffix,
        en + suffix.replace('истина', 'true').replace('ложь', 'false')
    );
add(
    'if-else',
    'control',
    'Условие с двумя ветвями',
    'если («истина»)\n{\n    \n}\nиначе\n{\n    \n}',
    'if («true»)\n{\n    \n}\nelse\n{\n    \n}'
);
for (const [ru, en, description] of [
    ['целые', 'int', 'Целое число'],
    ['дробные', 'float', 'Дробное число'],
    ['символы', 'char', 'Символ'],
    ['логические', 'logical', 'Логическое значение'],
])
    add(ru, 'types', description, `${ru} «n»;`, `${en} «n»;`);
add('input', 'io', 'Ввод значения', 'ввод «n»;', 'input «n»;');
add('print', 'io', 'Вывод без перевода строки', 'вывод «"текст"»;', 'print «"текст"»;');
add('println', 'io', 'Вывод с переводом строки', 'выводстр «"текст"»;', 'println «"текст"»;');
builtin('очистить', 'io', 'Очистить консоль', ';');
for (const [name, description] of [
    ['sqrt', 'Квадратный корень'],
    ['abs', 'Модуль'],
    ['trunc', 'Целая часть'],
    ['round', 'Округление'],
    ['sign', 'Знак числа'],
    ['random', 'Случайное число от 0 до n−1'],
    ['sin', 'Синус, радианы'],
    ['cos', 'Косинус, радианы'],
    ['tan', 'Тангенс, радианы'],
    ['sing', 'Синус, градусы'],
    ['cosg', 'Косинус, градусы'],
    ['tang', 'Тангенс, градусы'],
    ['arcsin', 'Арксинус, радианы'],
    ['arccos', 'Арккосинус, радианы'],
    ['arctan', 'Арктангенс, радианы'],
    ['arcsing', 'Арксинус, градусы'],
    ['arccosg', 'Арккосинус, градусы'],
    ['arctang', 'Арктангенс, градусы'],
    ['exp', 'Экспонента'],
    ['ln', 'Натуральный логарифм'],
    ['lg', 'Десятичный логарифм'],
])
    builtin(name, 'math', description, '(«1»)');
builtin('pi', 'math', 'Число π');
builtin('arctan2', 'math', 'Арктангенс y/x, радианы', '(«y», x)');
builtin('arctan2g', 'math', 'Арктангенс y/x, градусы', '(«y», x)');
for (const [name, description, suffix] of [
    ['длина', 'Длина строки', '(«s»)'],
    ['фрагмент', 'Часть строки', '(«s», 0, 1)'],
    ['позиция', 'Найти подстроку', '(«"текст"», s)'],
    ['вставить', 'Вставить подстроку', '(«"текст"», s, 0)'],
    ['удалить', 'Удалить подстроку', '(«s», 0, 1)'],
])
    builtin(name, 'strings', description, suffix);

export function renderSnippet(command, language, indent = '') {
    const template = command.templates[language].replace(/\n/g, '\n' + indent);
    const start = template.indexOf('«'),
        end = template.indexOf('»');
    const text = template.replace(/[«»]/g, '');
    return { text, selection: start < 0 ? [text.length, text.length] : [start, end - 1] };
}
