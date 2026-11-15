const aliases = {
    int: ['int', 'целые'],
    float: ['float', 'дробные'],
    char: ['char', 'символы'],
    logical: ['logical', 'логические'],
    repeat: ['repeat', 'повтори', 'повторить'],
    while: ['while', 'пока'],
    for: ['for', 'цикл'],
    if: ['if', 'если'],
    else: ['else', 'иначе'],
    break: ['break', 'прервать'],
    continue: ['continue', 'продолжить'],
    return: ['return', 'возврат'],
    input: ['input', 'ввод'],
    print: ['print', 'вывод', 'печать'],
    println: ['println', 'выводстр'],
    cin: ['cin'],
    cout: ['cout'],
    coutln: ['coutln'],
    true: ['true', 'истина'],
    false: ['false', 'ложь'],
    '!': ['not', 'не'],
    '&': ['and', 'и'],
    '|': ['or', 'или'],
    times: ['раз', 'раза', 'times'],
};
export const KEYWORDS = new Map(
    Object.entries(aliases).flatMap(([name, words]) => words.map((word) => [word, name]))
);
