/** Locations are zero-based internally; diagnostics displayed to students are one-based. */
export class RobotSyntaxError extends Error {
    constructor(message, location = {}) {
        super(message);
        this.name = 'RobotSyntaxError';
        this.line = typeof location === 'number' ? location : location.line;
        this.column = location.column;
    }
}

export class RobotRuntimeError extends Error {
    constructor(message, location = {}) {
        super(message);
        this.name = 'RobotRuntimeError';
        this.line = typeof location === 'number' ? location : location.line;
        this.column = location.column;
    }
}

export function diagnostic(error) {
    const prefix = error instanceof RobotSyntaxError ? '❌ НЕ ПОНИМАЮ' : '🚫 НЕ МОГУ';
    const position =
        error.line == null
            ? ''
            : ` (строка ${error.line + 1}${error.column == null ? '' : `, столбец ${error.column + 1}`})`;
    return `${prefix}: ${error.message}${position}`;
}
