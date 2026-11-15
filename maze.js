import { Field, Direction } from './robot.js';

/** Decode files separately from DOM/FileReader so imported tasks can be tested in Node. */
export function parseMaze(content) {
    const lines = content
        .replace(/^\uFEFF/, '')
        .split(/\r\n|\n|\r/)
        .filter((line) => line.trim().length);
    if (!lines.length) throw new Error('Файл лабиринта пуст');
    const width = Math.max(...lines.map((line) => line.length)),
        height = lines.length;
    if (width > 200 || height > 200) throw new Error('Поле не должно превышать 200×200 клеток');
    const field = new Field(Math.max(width, height));
    let start = null;
    const directions = {
        0: Direction.UP,
        2: Direction.RIGHT,
        4: Direction.DOWN,
        6: Direction.LEFT,
    };
    for (let y = 0; y < field.size; y++)
        for (let x = 0; x < field.size; x++) {
            const char = lines[y]?.[x];
            if (char === undefined || char === 'w' || char === 'W') field.setWall(x, y, true);
            else if (char === 'x' || char === 'X') field.setTarget(x, y, true);
            else if (char === 'b' || char === 'B') field.setBase(x, y);
            if (Object.hasOwn(directions, char) || char === 'B' || char === 'X') {
                if (start) throw new Error('В лабиринте несколько начальных позиций Робота');
                start = { x, y, direction: directions[char] ?? Direction.UP };
            }
            if (char !== undefined && !'.wWxXbB0246'.includes(char))
                throw new Error(`Неизвестный символ лабиринта «${char}» (${x + 1}, ${y + 1})`);
        }
    if (!start) {
        for (let y = 0; y < height && !start; y++)
            for (let x = 0; x < width; x++)
                if (!field.isWall(x, y)) {
                    start = { x, y, direction: Direction.UP };
                    break;
                }
    }
    if (!start) throw new Error('В лабиринте нет места для Робота');
    return { field, start, width, height };
}
