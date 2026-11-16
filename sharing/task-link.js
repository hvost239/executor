import { Field } from '../robot.js';
import { parseMaze } from '../maze.js';

const taskParameters = ['maze', 'program'];

function validPosition(position, size, withDirection = false) {
    return (
        Array.isArray(position) &&
        position.length === (withDirection ? 3 : 2) &&
        position.every(Number.isInteger) &&
        position[0] >= 0 &&
        position[0] < size &&
        position[1] >= 0 &&
        position[1] < size &&
        (!withDirection || (position[2] >= 0 && position[2] <= 3))
    );
}

function validateMaze(data) {
    if (!data || data.v !== 1) throw new Error('Неизвестная версия лабиринта в ссылке');
    const size = data.rows?.length;
    if (
        !Array.isArray(data.rows) ||
        size < 1 ||
        size > 200 ||
        !data.rows.every(
            (row) => typeof row === 'string' && row.length === size && /^[0-3]+$/.test(row)
        )
    ) {
        throw new Error('Некорректное поле в ссылке: ожидается квадрат от 1×1 до 200×200');
    }
    if (data.base !== null && !validPosition(data.base, size)) {
        throw new Error('Некорректная позиция базы в ссылке');
    }
    if (
        !validPosition(data.start, size, true) ||
        (Number(data.rows[data.start[1]][data.start[0]]) & 1) !== 0
    ) {
        throw new Error('Некорректная начальная позиция или направление Робота в ссылке');
    }
}

/** Store the task, including overlapping base/garden cells, without execution progress. */
export function encodeMaze(field, start) {
    const data = {
        v: 1,
        // Each cell stores a wall bit and a garden bit; planted flowers are runtime state.
        rows: field.cells.map((row) =>
            row.map((cell) => Number(cell.wall) + 2 * Number(cell.target)).join('')
        ),
        base: field.baseX === -1 && field.baseY === -1 ? null : [field.baseX, field.baseY],
        start: [start.x, start.y, start.direction],
    };
    validateMaze(data);
    return JSON.stringify(data);
}

/** Accept both generated snapshots and plain .maz text supplied in a URL parameter. */
export function decodeMaze(value) {
    if (!value.trimStart().startsWith('{')) return parseMaze(value);
    let data;
    try {
        data = JSON.parse(value);
    } catch {
        throw new Error('Повреждённые данные лабиринта в ссылке');
    }
    validateMaze(data);
    const size = data.rows.length;
    const field = new Field(size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cell = Number(data.rows[y][x]);
            field.setWall(x, y, Boolean(cell & 1));
            field.setTarget(x, y, Boolean(cell & 2));
        }
    }
    if (data.base) field.setBase(...data.base);
    const [x, y, direction] = data.start;
    return { field, start: { x, y, direction }, width: size, height: size };
}

export function createTaskLink(href, { field, start, program }) {
    const url = new URL(href);
    const parameters = new URLSearchParams({ maze: encodeMaze(field, start), program });
    for (const key of taskParameters) url.searchParams.delete(key);
    // The fragment stays in the browser, avoiding a large request URL on static hosting.
    url.hash = parameters.toString();
    return url.href;
}

/** Parse everything before applying it, so an invalid maze cannot partly replace a task. */
export function readTaskLink(href) {
    const url = new URL(href);
    const parameters = new URLSearchParams(url.search);
    const fragment = new URLSearchParams(url.hash.slice(1));
    for (const source of [parameters, fragment]) {
        for (const key of taskParameters) {
            if (source.getAll(key).length > 1) {
                throw new Error(`Параметр «${key}» указан несколько раз`);
            }
        }
    }
    for (const key of taskParameters) {
        if (fragment.has(key)) parameters.set(key, fragment.get(key));
    }
    if (!taskParameters.some((key) => parameters.has(key))) return null;
    return {
        maze: parameters.has('maze') ? decodeMaze(parameters.get('maze')) : null,
        program: parameters.has('program') ? parameters.get('program') : null,
    };
}
