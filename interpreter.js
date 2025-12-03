/**
 * Исполнители — Интерпретатор команд
 * ====================================
 */

// Пользовательские классы ошибок
class RobotSyntaxError extends Error {
    constructor(message, line = null) {
        super(message);
        this.name = 'RobotSyntaxError';
        this.line = line;
    }
}

class RobotRuntimeError extends Error {
    constructor(message, line = null) {
        super(message);
        this.name = 'RobotRuntimeError';
        this.line = line;
    }
}

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

    // Синтаксическая ошибка "НЕ ПОНИМАЮ"
    syntaxError(message, line = null) {
        const lineInfo = line !== null ? ` (строка ${line + 1})` : '';
        if (this.onError) {
            this.onError(`❌ НЕ ПОНИМАЮ: ${message}${lineInfo}`);
        }
    }

    // Ошибка выполнения "НЕ МОГУ"
    runtimeError(message, line = null) {
        const lineInfo = line !== null ? ` (строка ${line + 1})` : '';
        if (this.onError) {
            this.onError(`🚫 НЕ МОГУ: ${message}${lineInfo}`);
        }
    }

    // Общая ошибка (для совместимости)
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

                // Пропускаем точки с запятой
                if (token.value === ';') {
                    pos++;
                    continue;
                }

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

        // Парсинг обязательного числа в скобках: (n)
        const parseRequiredNumber = (commandName, line) => {
            // Проверяем на открывающую скобку
            if (pos >= tokens.length || tokens[pos].value !== '(') {
                throw new RobotSyntaxError(`после "${commandName}" ожидались скобки с числом, например: ${commandName}(3)`, line);
            }
            pos++; // пропускаем (

            // Проверяем число
            if (pos >= tokens.length || isNaN(parseInt(tokens[pos].value))) {
                throw new RobotSyntaxError(`внутри скобок "${commandName}(...)" ожидалось число`, line);
            }
            const num = parseInt(tokens[pos].value);
            pos++;

            // Проверяем закрывающую скобку
            if (pos >= tokens.length || tokens[pos].value !== ')') {
                throw new RobotSyntaxError(`ожидалась закрывающая скобка после "${commandName}(${num}"`, line);
            }
            pos++; // пропускаем )

            return num;
        };

        const parseStatement = () => {
            if (pos >= tokens.length) return null;

            const token = tokens[pos];

            // Команды движения с обязательным параметром: вперед(n), назад(n)
            if (['вперёд', 'вперед', 'forward'].includes(token.value)) {
                pos++;
                const count = parseRequiredNumber('вперед', token.line);
                return { type: 'forward', count, line: token.line };
            }

            if (['назад', 'backward', 'back'].includes(token.value)) {
                pos++;
                const count = parseRequiredNumber('назад', token.line);
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
                    throw new RobotSyntaxError(`Ожидалось число после "повтори" (строка ${token.line + 1})`);
                }
                const count = parseInt(tokens[pos].value);
                pos++;

                // Пропускаем "раз" если есть
                if (pos < tokens.length && ['раз', 'раза', 'times'].includes(tokens[pos].value)) {
                    pos++;
                }

                // Ожидаем {
                if (pos >= tokens.length || tokens[pos].value !== '{') {
                    throw new RobotSyntaxError(`Ожидалась '{' после "повтори ${count}" (строка ${token.line + 1})`);
                }
                pos++;

                const body = parseBlock();

                // Ожидаем }
                if (pos >= tokens.length || tokens[pos].value !== '}') {
                    throw new RobotSyntaxError(`Ожидалась '}' для закрытия цикла (строка ${token.line + 1})`);
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
                    throw new RobotSyntaxError(`Ожидалась '{' после условия (строка ${token.line + 1})`);
                }
                pos++;

                const body = parseBlock();

                // Ожидаем }
                if (pos >= tokens.length || tokens[pos].value !== '}') {
                    throw new RobotSyntaxError(`Ожидалась '}' для закрытия цикла "пока" (строка ${token.line + 1})`);
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
                    throw new RobotSyntaxError(`Ожидалась '{' после условия (строка ${token.line + 1})`);
                }
                pos++;

                const thenBody = parseBlock();

                // Ожидаем }
                if (pos >= tokens.length || tokens[pos].value !== '}') {
                    throw new RobotSyntaxError(`Ожидалась '}' для закрытия блока "если" (строка ${token.line + 1})`);
                }
                pos++;

                let elseBody = null;

                // Проверяем наличие "иначе"
                if (pos < tokens.length && ['иначе', 'else'].includes(tokens[pos].value)) {
                    pos++;

                    if (pos >= tokens.length || tokens[pos].value !== '{') {
                        throw new RobotSyntaxError(`Ожидалась '{' после "иначе" (строка ${tokens[pos-1].line + 1})`);
                    }
                    pos++;

                    elseBody = parseBlock();

                    if (pos >= tokens.length || tokens[pos].value !== '}') {
                        throw new RobotSyntaxError(`Ожидалась '}' для закрытия блока "иначе"`);
                    }
                    pos++;
                }

                return { type: 'if', condition, thenBody, elseBody, line: token.line };
            }

            // Неизвестная команда - ошибка "НЕ ПОНИМАЮ"
            throw new RobotSyntaxError(`неизвестная команда "${token.original}"`, token.line);
        };

        const parseCondition = () => {
            if (pos >= tokens.length) {
                throw new RobotSyntaxError('Ожидалось условие');
            }

            const token = tokens[pos];
            let negate = false;

            // Отрицание
            if (['не', 'not', '!'].includes(token.value)) {
                negate = true;
                pos++;
                if (pos >= tokens.length) {
                    throw new RobotSyntaxError('Ожидалось условие после "не"');
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
                throw new RobotSyntaxError(`Неизвестное условие: "${condToken.original}" (строка ${condToken.line + 1})`);
            }

            return { type: condName, negate, line: condToken.line };
        };

        // Проверяем, что программа имеет имя и фигурные скобки
        if (tokens.length === 0) {
            throw new RobotSyntaxError('программа пуста');
        }

        // Первый токен должен быть именем программы
        const firstToken = tokens[pos];

        // Проверяем, есть ли структура: ИмяПрограммы { ... }
        if (pos + 1 < tokens.length && tokens[pos + 1].value === '{') {
            // Это именованная программа
            const programName = firstToken.original;
            pos++; // пропускаем имя
            pos++; // пропускаем {

            const body = parseBlock();

            // Проверяем закрывающую скобку
            if (pos >= tokens.length || tokens[pos].value !== '}') {
                throw new RobotSyntaxError(`ожидалась '}' в конце программы "${programName}"`);
            }

            return body;
        }

        // Если нет структуры с именем — ошибка
        throw new RobotSyntaxError('программа должна иметь имя и быть в фигурных скобках, например: МояПрограмма { ... }');
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
            // Сбрасываем робота в начальную позицию перед выполнением
            this.robot.reset();
            this.renderer.render();

            // Токенизация и парсинг
            this.log('Компиляция программы...', 'info');
            const tokens = this.tokenize(code);
            const ast = this.parse(tokens);

            this.log('Выполнение программы...', 'info');

            // Выполнение
            await this.executeStatements(ast);

            if (!this.shouldStop) {
                // Проверяем результат выполнения
                const allPlanted = this.robot.field.allTargetsPainted();
                const onBase = this.robot.isOnBase();

                if (!onBase) {
                    this.log('⚠️ Программа завершена, но робот не вернулся на базу!', 'warning');
                    if (this.onComplete) {
                        this.onComplete(false);
                    }
                } else if (!allPlanted) {
                    this.log('⚠️ Робот на базе, но не все грядки засажены!', 'warning');
                    if (this.onComplete) {
                        this.onComplete(false);
                    }
                } else {
                    this.log('🎉 Программа успешно завершена!', 'success');
                    this.log('✅ Все грядки засажены и робот вернулся на базу!', 'success');
                    if (this.onComplete) {
                        this.onComplete(true);
                    }
                }
            }

        } catch (e) {
            if (e instanceof RobotSyntaxError) {
                this.syntaxError(e.message);
            } else if (e instanceof RobotRuntimeError) {
                this.runtimeError(e.message);
            } else {
                this.error(e.message);
            }
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
                throw new RobotRuntimeError('впереди препятствие (стена или клумба)');
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
                throw new RobotRuntimeError('сзади препятствие (стена или клумба)');
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

        // Проверяем, что робот на грядке
        if (!this.robot.isOnTarget()) {
            throw new RobotRuntimeError('здесь нет грядки');
        }

        // Проверяем, что грядка ещё не засажена
        if (this.robot.isCellPainted()) {
            throw new RobotRuntimeError('здесь уже посажены цветы');
        }

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
                // Сбрасываем робота в начальную позицию
                this.robot.reset();
                this.renderer.render();

                this.stepState = {
                    ast: this.parse(tokens),
                    index: 0,
                    stack: []
                };
                this.log('Начало пошагового выполнения', 'info');
            } catch (e) {
                if (e instanceof RobotSyntaxError) {
                    this.syntaxError(e.message);
                } else if (e instanceof RobotRuntimeError) {
                    this.runtimeError(e.message);
                } else {
                    this.error(e.message);
                }
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
                    this.log(`🔄 повтори: итерация ${context.iteration + 1}/${context.count}`, 'info');
                    return true;
                } else if (context.type === 'while') {
                    const condResult = this.evaluateCondition(context.condition);
                    this.log(`🔄 пока ... → ${condResult ? 'продолжаем' : 'выход'}`, 'info');
                    if (condResult) {
                        context.index = 0;
                        stack.push(context);
                        return true;
                    }
                }

                // Выходим из блока
                return true;
            }

            // Проверяем результат выполнения
            const allPlanted = this.robot.field.allTargetsPainted();
            const onBase = this.robot.isOnBase();

            if (!onBase) {
                this.log('⚠️ Программа завершена, но робот не вернулся на базу!', 'warning');
            } else if (!allPlanted) {
                this.log('⚠️ Робот на базе, но не все грядки засажены!', 'warning');
            } else {
                this.log('🎉 Программа успешно завершена!', 'success');
                this.log('✅ Все грядки засажены и робот вернулся на базу!', 'success');
            }

            this.stepState = null;
            return false;
        }

        const stmt = currentStatements[currentIndex];

        try {
            // Увеличиваем индекс в текущем контексте
            const incrementIndex = () => {
                if (stack.length === 0) {
                    this.stepState.index++;
                } else {
                    stack[stack.length - 1].index++;
                }
            };

            if (stmt.type === 'repeat') {
                this.log(`🔄 повтори ${stmt.count} раз: начало`, 'info');
                incrementIndex();
                stack.push({
                    type: 'repeat',
                    statements: stmt.body,
                    count: stmt.count,
                    iteration: 0,
                    index: 0
                });
            } else if (stmt.type === 'while') {
                const condResult = this.evaluateCondition(stmt.condition);
                this.log(`🔄 пока ... → ${condResult ? 'истина' : 'ложь'}`, 'info');
                incrementIndex();
                if (condResult) {
                    stack.push({
                        type: 'while',
                        statements: stmt.body,
                        condition: stmt.condition,
                        index: 0
                    });
                }
            } else if (stmt.type === 'if') {
                const condResult = this.evaluateCondition(stmt.condition);
                this.log(`❓ если ... → ${condResult ? 'истина' : 'ложь'}`, 'info');
                incrementIndex();
                if (condResult) {
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
            } else {
                // Выполняем реальную команду
                await this.executeStatement(stmt);
                incrementIndex();
            }
        } catch (e) {
            if (e instanceof RobotSyntaxError) {
                this.syntaxError(e.message);
            } else if (e instanceof RobotRuntimeError) {
                this.runtimeError(e.message);
            } else {
                this.error(e.message);
            }
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
window.RobotSyntaxError = RobotSyntaxError;
window.RobotRuntimeError = RobotRuntimeError;
window.Interpreter = Interpreter;
