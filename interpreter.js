/**
 * Исполнители — Интерпретатор команд
 * ====================================
 */

class Interpreter {
    constructor(robot, renderer) {
        this.robot = robot;
        this.renderer = renderer;
        this.isRunning = false;
        this.isPaused = false;
        this.shouldStop = false;
        this.speed = 5; // 1-10
        this.currentLine = 0;
        this.onLog = null;
        this.onError = null;
        this.onLineChange = null;
        this.onComplete = null;
        this.onStatusChange = null;
    }

    // Установка скорости (1-10)
    setSpeed(speed) {
        this.speed = Math.max(1, Math.min(10, speed));
    }

    // Получить задержку в зависимости от скорости
    getDelay() {
        return Math.max(50, 600 - this.speed * 55);
    }

    // Логирование
    log(message, type = 'info') {
        if (this.onLog) {
            this.onLog(message, type);
        }
    }

    // Ошибка
    error(message, line = null) {
        const lineInfo = line !== null ? ` (строка ${line + 1})` : '';
        if (this.onError) {
            this.onError(`${message}${lineInfo}`);
        }
    }

    // Токенизация кода
    tokenize(code) {
        const tokens = [];
        const lines = code.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            let line = lines[lineNum];

            // Удаляем комментарии
            const commentIndex = line.indexOf('//');
            if (commentIndex !== -1) {
                line = line.substring(0, commentIndex);
            }

            line = line.trim();
            if (!line) continue;

            // Разбиваем на токены
            const regex = /([а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_]*|\d+|[{}()<=>;,])/g;
            let match;

            while ((match = regex.exec(line)) !== null) {
                tokens.push({
                    value: match[1].toLowerCase(),
                    original: match[1],
                    line: lineNum,
                    position: match.index
                });
            }
        }

        return tokens;
    }

    // Парсинг в AST
    parse(tokens) {
        let pos = 0;

        const parseBlock = () => {
            const statements = [];

            while (pos < tokens.length) {
                const token = tokens[pos];

                if (token.value === '}') {
                    break;
                }

                const stmt = parseStatement();
                if (stmt) {
                    statements.push(stmt);
                }
            }

            return statements;
        };

        // Парсинг опционального числа в скобках: (n) или просто n
        const parseOptionalNumber = () => {
            if (pos >= tokens.length) return 1;

            // Проверяем на открывающую скобку
            if (tokens[pos].value === '(') {
                pos++;
                if (pos >= tokens.length || isNaN(parseInt(tokens[pos].value))) {
                    return 1;
                }
                const num = parseInt(tokens[pos].value);
                pos++;
                // Пропускаем закрывающую скобку
                if (pos < tokens.length && tokens[pos].value === ')') {
                    pos++;
                }
                return num;
            }

            // Проверяем на число без скобок
            if (!isNaN(parseInt(tokens[pos].value))) {
                const num = parseInt(tokens[pos].value);
                pos++;
                return num;
            }

            return 1; // По умолчанию 1 шаг
        };

        const parseStatement = () => {
            if (pos >= tokens.length) return null;

            const token = tokens[pos];

            // Команды движения с параметром: вперед(n), назад(n)
            if (['вперёд', 'вперед', 'forward'].includes(token.value)) {
                pos++;
                const count = parseOptionalNumber();
                return { type: 'forward', count, line: token.line };
            }

            if (['назад', 'backward', 'back'].includes(token.value)) {
                pos++;
                const count = parseOptionalNumber();
                return { type: 'backward', count, line: token.line };
            }

            // Повороты
            if (['влево', 'налево', 'left'].includes(token.value)) {
                pos++;
                return { type: 'left', line: token.line };
            }

            if (['вправо', 'направо', 'right'].includes(token.value)) {
                pos++;
                return { type: 'right', line: token.line };
            }

            if (['кругом', 'around', 'turnaround'].includes(token.value)) {
                pos++;
                return { type: 'around', line: token.line };
            }

            // Посадить цветы
            if (['закрасить', 'закрась', 'посадить', 'посади', 'paint'].includes(token.value)) {
                pos++;
                return { type: 'paint', line: token.line };
            }

            // Цикл "повтори N раз"
            if (['повтори', 'повторить', 'repeat'].includes(token.value)) {
                pos++;

                // Число повторений
                if (pos >= tokens.length || isNaN(parseInt(tokens[pos].value))) {
                    throw new SyntaxError(`Ожидалось число после "повтори" (строка ${token.line + 1})`);
                }
                const count = parseInt(tokens[pos].value);
                pos++;

                // Пропускаем "раз" если есть
                if (pos < tokens.length && ['раз', 'раза', 'times'].includes(tokens[pos].value)) {
                    pos++;
                }

                // Ожидаем {
                if (pos >= tokens.length || tokens[pos].value !== '{') {
                    throw new SyntaxError(`Ожидалась '{' после "повтори ${count}" (строка ${token.line + 1})`);
                }
                pos++;

                const body = parseBlock();

                // Ожидаем }
                if (pos >= tokens.length || tokens[pos].value !== '}') {
                    throw new SyntaxError(`Ожидалась '}' для закрытия цикла (строка ${token.line + 1})`);
                }
                pos++;

                return { type: 'repeat', count, body, line: token.line };
            }

            // Цикл "пока"
            if (['пока', 'while'].includes(token.value)) {
                pos++;

                const condition = parseCondition();

                // Ожидаем {
                if (pos >= tokens.length || tokens[pos].value !== '{') {
                    throw new SyntaxError(`Ожидалась '{' после условия (строка ${token.line + 1})`);
                }
                pos++;

                const body = parseBlock();

                // Ожидаем }
                if (pos >= tokens.length || tokens[pos].value !== '}') {
                    throw new SyntaxError(`Ожидалась '}' для закрытия цикла "пока" (строка ${token.line + 1})`);
                }
                pos++;

                return { type: 'while', condition, body, line: token.line };
            }

            // Условие "если"
            if (['если', 'if'].includes(token.value)) {
                pos++;

                const condition = parseCondition();

                // Ожидаем {
                if (pos >= tokens.length || tokens[pos].value !== '{') {
                    throw new SyntaxError(`Ожидалась '{' после условия (строка ${token.line + 1})`);
                }
                pos++;

                const thenBody = parseBlock();

                // Ожидаем }
                if (pos >= tokens.length || tokens[pos].value !== '}') {
                    throw new SyntaxError(`Ожидалась '}' для закрытия блока "если" (строка ${token.line + 1})`);
                }
                pos++;

                let elseBody = null;

                // Проверяем наличие "иначе"
                if (pos < tokens.length && ['иначе', 'else'].includes(tokens[pos].value)) {
                    pos++;

                    if (pos >= tokens.length || tokens[pos].value !== '{') {
                        throw new SyntaxError(`Ожидалась '{' после "иначе" (строка ${tokens[pos-1].line + 1})`);
                    }
                    pos++;

                    elseBody = parseBlock();

                    if (pos >= tokens.length || tokens[pos].value !== '}') {
                        throw new SyntaxError(`Ожидалась '}' для закрытия блока "иначе"`);
                    }
                    pos++;
                }

                return { type: 'if', condition, thenBody, elseBody, line: token.line };
            }

            // Неизвестная команда - пропускаем
            pos++;
            return null;
        };

        const parseCondition = () => {
            if (pos >= tokens.length) {
                throw new SyntaxError('Ожидалось условие');
            }

            const token = tokens[pos];
            let negate = false;

            // Отрицание
            if (['не', 'not', '!'].includes(token.value)) {
                negate = true;
                pos++;
                if (pos >= tokens.length) {
                    throw new SyntaxError('Ожидалось условие после "не"');
                }
            }

            const condToken = tokens[pos];
            pos++;

            // Условия проверки стен
            const conditions = {
                // Стена
                'стена_впереди': 'wallAhead',
                'стена_слева': 'wallLeft',
                'стена_справа': 'wallRight',
                'стена_сзади': 'wallBehind',
                'впереди_стена': 'wallAhead',
                'слева_стена': 'wallLeft',
                'справа_стена': 'wallRight',
                'сзади_стена': 'wallBehind',

                // Свободно
                'свободно_впереди': 'freeAhead',
                'свободно_слева': 'freeLeft',
                'свободно_справа': 'freeRight',
                'свободно_сзади': 'freeBehind',
                'впереди_свободно': 'freeAhead',
                'слева_свободно': 'freeLeft',
                'справа_свободно': 'freeRight',
                'сзади_свободно': 'freeBehind',

                // Другие
                'клетка_закрашена': 'cellPainted',
                'на_грядке': 'onTarget',
                'грядка': 'onTarget',
                'на_цели': 'onTarget',
                'цель': 'onTarget',
                'на_базе': 'onBase',
                'база': 'onBase'
            };

            const condName = conditions[condToken.value];

            if (!condName) {
                throw new SyntaxError(`Неизвестное условие: "${condToken.original}" (строка ${condToken.line + 1})`);
            }

            return { type: condName, negate, line: condToken.line };
        };

        return parseBlock();
    }

    // Выполнение условия
    evaluateCondition(condition) {
        let result;

        switch (condition.type) {
            case 'wallAhead':
                result = this.robot.isWallAhead();
                break;
            case 'wallLeft':
                result = this.robot.isWallLeft();
                break;
            case 'wallRight':
                result = this.robot.isWallRight();
                break;
            case 'wallBehind':
                result = this.robot.isWallBehind();
                break;
            case 'freeAhead':
                result = this.robot.isFreeAhead();
                break;
            case 'freeLeft':
                result = this.robot.isFreeLeft();
                break;
            case 'freeRight':
                result = this.robot.isFreeRight();
                break;
            case 'freeBehind':
                result = this.robot.isFreeBehind();
                break;
            case 'cellPainted':
                result = this.robot.isCellPainted();
                break;
            case 'onTarget':
                result = this.robot.isOnTarget();
                break;
            case 'onBase':
                result = this.robot.isOnBase();
                break;
            default:
                result = false;
        }

        return condition.negate ? !result : result;
    }

    // Выполнение программы
    async execute(code) {
        if (this.isRunning) {
            this.log('Программа уже выполняется', 'warning');
            return;
        }

        this.isRunning = true;
        this.shouldStop = false;
        this.isPaused = false;

        if (this.onStatusChange) {
            this.onStatusChange('running');
        }

        try {
            // Сохраняем начальную позицию
            this.robot.saveStartPosition();

            // Токенизация и парсинг
            this.log('Компиляция программы...', 'info');
            const tokens = this.tokenize(code);
            const ast = this.parse(tokens);

            this.log('Выполнение программы...', 'info');

            // Выполнение
            await this.executeStatements(ast);

            if (!this.shouldStop) {
                this.log('Программа успешно завершена!', 'success');

                if (this.robot.isOnTarget()) {
                    this.log('🎉 Робот достиг цели!', 'success');
                }

                if (this.onComplete) {
                    this.onComplete(true);
                }
            }

        } catch (e) {
            this.error(e.message);
            if (this.onComplete) {
                this.onComplete(false);
            }
        } finally {
            this.isRunning = false;
            if (this.onStatusChange) {
                this.onStatusChange('stopped');
            }
        }
    }

    // Выполнение списка операторов
    async executeStatements(statements) {
        for (const stmt of statements) {
            if (this.shouldStop) break;

            // Ожидание при паузе
            while (this.isPaused && !this.shouldStop) {
                await this.delay(100);
            }

            if (this.shouldStop) break;

            await this.executeStatement(stmt);
        }
    }

    // Выполнение одного оператора
    async executeStatement(stmt) {
        if (this.onLineChange) {
            this.onLineChange(stmt.line);
        }

        switch (stmt.type) {
            case 'forward':
                await this.executeForward(stmt.count || 1);
                break;

            case 'backward':
                await this.executeBackward(stmt.count || 1);
                break;

            case 'left':
                await this.executeTurnLeft();
                break;

            case 'right':
                await this.executeTurnRight();
                break;

            case 'around':
                await this.executeTurnAround();
                break;

            case 'paint':
                await this.executePaint();
                break;

            case 'repeat':
                await this.executeRepeat(stmt);
                break;

            case 'while':
                await this.executeWhile(stmt);
                break;

            case 'if':
                await this.executeIf(stmt);
                break;
        }
    }

    // Команда вперёд
    async executeForward(count = 1) {
        this.log(`→ вперёд(${count})`, 'command');

        for (let i = 0; i < count; i++) {
            if (this.shouldStop) break;

            const oldX = this.robot.x;
            const oldY = this.robot.y;

            const result = this.robot.forward();

            if (result.success) {
                await this.renderer.animateMove(oldX, oldY, this.robot.x, this.robot.y, this.getDelay());
                this.renderer.render();
            } else {
                throw new Error(result.error);
            }

            await this.delay(50);
        }
    }

    // Команда назад
    async executeBackward(count = 1) {
        this.log(`← назад(${count})`, 'command');

        for (let i = 0; i < count; i++) {
            if (this.shouldStop) break;

            const oldX = this.robot.x;
            const oldY = this.robot.y;

            const result = this.robot.backward();

            if (result.success) {
                await this.renderer.animateMove(oldX, oldY, this.robot.x, this.robot.y, this.getDelay());
                this.renderer.render();
            } else {
                throw new Error(result.error);
            }

            await this.delay(50);
        }
    }

    // Команда налево
    async executeTurnLeft() {
        this.log('↰ налево', 'command');

        const oldDirection = this.robot.direction;
        this.robot.turnLeft();

        await this.renderer.animateTurn(oldDirection, this.robot.direction, this.getDelay() * 0.7);
        this.renderer.render();

        await this.delay(50);
    }

    // Команда вправо
    async executeTurnRight() {
        this.log('↱ направо', 'command');

        const oldDirection = this.robot.direction;
        this.robot.turnRight();

        await this.renderer.animateTurn(oldDirection, this.robot.direction, this.getDelay() * 0.7);
        this.renderer.render();

        await this.delay(50);
    }

    // Команда кругом (разворот на 180°)
    async executeTurnAround() {
        this.log('↻ кругом', 'command');

        const oldDirection = this.robot.direction;
        this.robot.turnAround();

        await this.renderer.animateTurn(oldDirection, this.robot.direction, this.getDelay());
        this.renderer.render();

        await this.delay(50);
    }

    // Команда посадить
    async executePaint() {
        this.log('🌸 посади', 'command');

        this.robot.paint();
        this.renderer.render();

        await this.delay(this.getDelay() * 0.5);
    }

    // Цикл повтори
    async executeRepeat(stmt) {
        this.log(`🔄 повтори ${stmt.count} раз`, 'info');

        for (let i = 0; i < stmt.count; i++) {
            if (this.shouldStop) break;

            await this.executeStatements(stmt.body);
        }
    }

    // Цикл пока
    async executeWhile(stmt) {
        this.log('🔄 пока ...', 'info');

        let iterations = 0;
        const maxIterations = 10000; // Защита от бесконечного цикла

        while (this.evaluateCondition(stmt.condition) && !this.shouldStop) {
            iterations++;

            if (iterations > maxIterations) {
                throw new Error('Превышено максимальное количество итераций цикла (возможно бесконечный цикл)');
            }

            await this.executeStatements(stmt.body);
        }
    }

    // Условие если
    async executeIf(stmt) {
        if (this.evaluateCondition(stmt.condition)) {
            this.log('✓ условие истинно', 'info');
            await this.executeStatements(stmt.thenBody);
        } else if (stmt.elseBody) {
            this.log('✗ условие ложно, выполняем иначе', 'info');
            await this.executeStatements(stmt.elseBody);
        }
    }

    // Задержка
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Выполнение одного шага
    async step(code) {
        // Для пошагового выполнения
        if (!this.stepState) {
            try {
                const tokens = this.tokenize(code);
                this.stepState = {
                    ast: this.parse(tokens),
                    index: 0,
                    stack: []
                };
                this.robot.saveStartPosition();
                this.log('Начало пошагового выполнения', 'info');
            } catch (e) {
                this.error(e.message);
                return false;
            }
        }

        return await this.executeNextStep();
    }

    async executeNextStep() {
        if (!this.stepState) return false;

        const { ast, stack } = this.stepState;

        // Определяем текущий контекст выполнения
        let currentStatements = ast;
        let currentIndex = this.stepState.index;

        if (stack.length > 0) {
            const context = stack[stack.length - 1];
            currentStatements = context.statements;
            currentIndex = context.index;
        }

        if (currentIndex >= currentStatements.length) {
            if (stack.length > 0) {
                const context = stack.pop();

                // Проверяем циклы
                if (context.type === 'repeat' && context.iteration < context.count - 1) {
                    context.iteration++;
                    context.index = 0;
                    stack.push(context);
                    return true;
                } else if (context.type === 'while') {
                    if (this.evaluateCondition(context.condition)) {
                        context.index = 0;
                        stack.push(context);
                        return true;
                    }
                }

                return true;
            }

            this.log('Программа завершена', 'success');
            this.stepState = null;
            return false;
        }

        const stmt = currentStatements[currentIndex];

        try {
            if (stmt.type === 'repeat') {
                stack.push({
                    type: 'repeat',
                    statements: stmt.body,
                    count: stmt.count,
                    iteration: 0,
                    index: 0
                });
                if (stack.length === 1) {
                    this.stepState.index++;
                } else {
                    stack[stack.length - 2].index++;
                }
            } else if (stmt.type === 'while') {
                if (this.evaluateCondition(stmt.condition)) {
                    stack.push({
                        type: 'while',
                        statements: stmt.body,
                        condition: stmt.condition,
                        index: 0
                    });
                }
                if (stack.length === 1) {
                    this.stepState.index++;
                } else {
                    stack[stack.length - 2].index++;
                }
            } else if (stmt.type === 'if') {
                if (this.evaluateCondition(stmt.condition)) {
                    stack.push({
                        type: 'if',
                        statements: stmt.thenBody,
                        index: 0
                    });
                } else if (stmt.elseBody) {
                    stack.push({
                        type: 'if',
                        statements: stmt.elseBody,
                        index: 0
                    });
                }
                if (stack.length === 1) {
                    this.stepState.index++;
                } else {
                    stack[stack.length - 2].index++;
                }
            } else {
                await this.executeStatement(stmt);

                if (stack.length === 0) {
                    this.stepState.index++;
                } else {
                    stack[stack.length - 1].index++;
                }
            }
        } catch (e) {
            this.error(e.message, stmt.line);
            this.stepState = null;
            return false;
        }

        return true;
    }

    // Остановка выполнения
    stop() {
        this.shouldStop = true;
        this.stepState = null;
        this.renderer.stopAnimation();
        this.log('Выполнение остановлено', 'warning');
    }

    // Пауза/продолжение
    togglePause() {
        this.isPaused = !this.isPaused;
        this.log(this.isPaused ? 'Пауза' : 'Продолжение', 'info');
    }

    // Сброс состояния
    reset() {
        this.stop();
        this.stepState = null;
        this.currentLine = 0;
    }
}

// Экспорт
window.Interpreter = Interpreter;
