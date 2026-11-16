// Shared by the runtime, source translation and the command catalogue.
const groups = [
    ['вперед', 'forward', 'вперёд'],
    ['назад', 'backward', 'back'],
    ['налево', 'left', 'влево'],
    ['направо', 'right', 'вправо'],
    ['кругом', 'around', 'turnaround'],
    ['посади', 'paint', 'посадить', 'закрасить', 'закрась'],
    ['грядка', 'garden', 'на_грядке', 'на_цели', 'цель'],
    ['база', 'base', 'на_базе'],
    ['клетка_закрашена', 'painted'],
    ['очистить', 'clrscr'],
    ['длина', 'length'],
    ['фрагмент', 'copy'],
    ['позиция', 'pos'],
    ['вставить', 'insert'],
    ['удалить', 'delete'],
    ['ЦветТекста', 'TextColor'],
    ['УголТекста', 'TextAngle'],
    ['Точка', 'Point'],
    ['КурсорК', 'MoveTo'],
    ['ЛинияК', 'LineTo'],
    ['Залить', 'Fill'],
    ['Кисть', 'Brush'],
    ['Перо', 'Pen'],
    ['ЗалитьДо', 'FillTo'],
    ['Шрифт', 'Font'],
    ['Текст', 'TextOut'],
    ['Линия', 'Line'],
    ['Прямоугольник', 'Rectangle'],
    ['Эллипс', 'Ellipse'],
    ['Дуга', 'Arc'],
];
for (const [ruSide, enSide] of [
    ['впереди', 'ahead'],
    ['справа', 'right'],
    ['сзади', 'behind'],
    ['слева', 'left'],
]) {
    for (const [ruKind, enKind] of [
        ['стена', 'wall'],
        ['клумба', 'flowerbed'],
        ['свободно', 'free'],
    ]) {
        groups.push([
            `${ruSide}_${ruKind}`,
            `${enKind}_${enSide}`,
            `${ruKind === 'свободно' ? 'свободно' : ruKind}_${ruSide}`,
        ]);
    }
}
export const BUILTIN_NAMES = new Map();
for (const [ru, en, ...aliases] of groups) {
    const entry = { ru, en, aliases: [...new Set([ru, en, ...aliases])] };
    for (const name of entry.aliases) BUILTIN_NAMES.set(name, entry);
}

export const KEYWORD_NAMES = {
    int: ['целые', 'int'],
    float: ['дробные', 'float'],
    char: ['символы', 'char'],
    logical: ['логические', 'logical'],
    repeat: ['повтори', 'repeat'],
    while: ['пока', 'while'],
    for: ['цикл', 'for'],
    if: ['если', 'if'],
    else: ['иначе', 'else'],
    break: ['прервать', 'break'],
    continue: ['продолжить', 'continue'],
    return: ['возврат', 'return'],
    input: ['ввод', 'input'],
    print: ['вывод', 'print'],
    println: ['выводстр', 'println'],
    true: ['истина', 'true'],
    false: ['ложь', 'false'],
    '!': ['не', 'not'],
    '&': ['и', 'and'],
    '|': ['или', 'or'],
    times: ['раз', 'times'],
};
