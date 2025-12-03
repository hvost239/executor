/**
 * Исполнители — Главный модуль приложения
 * =========================================
 */

class App {
    constructor() {
        // Инициализация компонентов
        this.field = new Field(8);
        this.robot = new Robot(this.field);
        this.canvas = document.getElementById('robotCanvas');
        this.renderer = new FieldRenderer(this.canvas, this.field, this.robot);
        this.interpreter = new Interpreter(this.robot, this.renderer);

        // DOM элементы
        this.elements = {
            // Редактор
            codeEditor: document.getElementById('codeEditor'),
            lineNumbers: document.getElementById('lineNumbers'),

            // Кнопки управления
            runBtn: document.getElementById('runBtn'),
            stepBtn: document.getElementById('stepBtn'),
            stopBtn: document.getElementById('stopBtn'),
            resetBtn: document.getElementById('resetBtn'),

            // Скорость
            speedSlider: document.getElementById('speedSlider'),
            speedValue: document.getElementById('speedValue'),

            // Поле
            fieldSize: document.getElementById('fieldSize'),
            editFieldBtn: document.getElementById('editFieldBtn'),
            loadMazeBtn: document.getElementById('loadMazeBtn'),
            mazeFileInput: document.getElementById('mazeFileInput'),

            // Статус
            robotPosition: document.getElementById('robotPosition'),
            robotDirection: document.getElementById('robotDirection'),
            statusMessage: document.getElementById('statusMessage'),

            // Консоль
            consoleOutput: document.getElementById('consoleOutput'),
            clearConsoleBtn: document.getElementById('clearConsoleBtn'),

            // Редактор кода
            clearCodeBtn: document.getElementById('clearCodeBtn'),
            loadExampleBtn: document.getElementById('loadExampleBtn'),

            // Модальные окна
            examplesModal: document.getElementById('examplesModal'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            fieldEditorModal: document.getElementById('fieldEditorModal'),
            closeFieldEditorBtn: document.getElementById('closeFieldEditorBtn'),
            fieldEditorCanvas: document.getElementById('fieldEditorCanvas'),
            clearFieldBtn: document.getElementById('clearFieldBtn'),
            applyFieldBtn: document.getElementById('applyFieldBtn'),

            // Загрузка лабиринтов
            mazeFileInput: document.getElementById('mazeFileInput')
        };

        // Состояние
        this.editTool = 'wall';
        this.tempField = null;

        // Примеры программ
        this.examples = {
            square: `// Сажаем цветы квадратом 3×3
повтори 4 раз {
    посади
    вперед(2)
    направо
}`,
            allGardens: `// Засадить все грядки и вернуться на базу
пока не на_базе {
    если на_грядке {
        посади
    }
    если свободно_впереди {
        вперед(1)
    } иначе {
        направо
    }
}`,
            line: `// Засадить ряд грядок
пока свободно_впереди {
    если на_грядке {
        посади
    }
    вперед(1)
}
если на_грядке {
    посади
}
кругом`,
            maze: `// Найти путь к базе
// (правило правой руки)
пока не на_базе {
    если свободно_справа {
        направо
        вперед(1)
    } иначе {
        если свободно_впереди {
            вперед(1)
        } иначе {
            налево
        }
    }
}`
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupInterpreterCallbacks();
        this.updateLineNumbers();
        this.updateStatus();
        this.renderer.render();

        // Горячие клавиши
        document.addEventListener('keydown', (e) => this.handleHotkeys(e));

        // Адаптация размера поля при изменении окна
        window.addEventListener('resize', () => {
            this.renderer.resize();
        });

        this.log('🚗 Робот-садовник готов к работе!', 'info');
        this.log('Загрузите лабиринт (📥) и напишите программу для посадки цветов.', 'hint');
    }

    setupEventListeners() {
        const { elements } = this;

        // Управление выполнением
        elements.runBtn.addEventListener('click', () => this.run());
        elements.stepBtn.addEventListener('click', () => this.step());
        elements.stopBtn.addEventListener('click', () => this.stop());
        elements.resetBtn.addEventListener('click', () => this.reset());

        // Скорость
        elements.speedSlider.addEventListener('input', (e) => {
            const speed = parseInt(e.target.value);
            elements.speedValue.textContent = speed;
            this.interpreter.setSpeed(speed);
        });

        // Размер поля
        elements.fieldSize.addEventListener('change', (e) => {
            const size = parseInt(e.target.value);
            this.field.resize(size);
            this.robot.fullReset();
            this.renderer.resize();
            this.updateStatus();
            this.log(`Размер поля изменён на ${size}×${size}`, 'info');
        });

        // Редактор кода
        elements.codeEditor.addEventListener('input', () => {
            this.updateLineNumbers();
        });

        elements.codeEditor.addEventListener('scroll', () => {
            elements.lineNumbers.scrollTop = elements.codeEditor.scrollTop;
        });

        elements.codeEditor.addEventListener('keydown', (e) => {
            // Tab для отступов
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = elements.codeEditor.selectionStart;
                const end = elements.codeEditor.selectionEnd;
                const value = elements.codeEditor.value;

                elements.codeEditor.value = value.substring(0, start) + '    ' + value.substring(end);
                elements.codeEditor.selectionStart = elements.codeEditor.selectionEnd = start + 4;
                this.updateLineNumbers();
            }
        });

        // Кнопки редактора
        elements.clearCodeBtn.addEventListener('click', () => {
            if (confirm('Очистить код?')) {
                elements.codeEditor.value = '';
                this.updateLineNumbers();
            }
        });

        elements.loadExampleBtn.addEventListener('click', () => {
            this.showModal('examplesModal');
        });

        // Консоль
        elements.clearConsoleBtn.addEventListener('click', () => {
            elements.consoleOutput.innerHTML = '';
            this.log('Консоль очищена', 'info');
        });

        // Модальное окно примеров
        elements.closeModalBtn.addEventListener('click', () => {
            this.hideModal('examplesModal');
        });

        document.querySelectorAll('.example-card').forEach(card => {
            card.addEventListener('click', () => {
                const example = card.dataset.example;
                if (this.examples[example]) {
                    elements.codeEditor.value = this.examples[example];
                    this.updateLineNumbers();
                    this.hideModal('examplesModal');
                    this.log(`Загружен пример: ${card.querySelector('h4').textContent}`, 'info');
                }
            });
        });

        // Загрузка лабиринтов из файла
        elements.loadMazeBtn.addEventListener('click', () => {
            elements.mazeFileInput.click();
        });

        elements.mazeFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadMazeFromFile(file);
            }
            e.target.value = ''; // Сбрасываем для повторной загрузки того же файла
        });

        // Редактор поля
        elements.editFieldBtn.addEventListener('click', () => {
            this.openFieldEditor();
        });

        elements.closeFieldEditorBtn.addEventListener('click', () => {
            this.hideModal('fieldEditorModal');
        });

        elements.clearFieldBtn.addEventListener('click', () => {
            if (this.tempField) {
                this.tempField.clear();
                this.renderFieldEditor();
            }
        });

        elements.applyFieldBtn.addEventListener('click', () => {
            this.applyFieldChanges();
        });

        // Инструменты редактора поля
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.editTool = btn.dataset.tool;
            });
        });

        // Клик по холсту редактора поля
        if (elements.fieldEditorCanvas) {
            elements.fieldEditorCanvas.addEventListener('click', (e) => {
                this.handleFieldEditorClick(e);
            });
        }

        // Закрытие модальных окон по клику вне
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }

    setupInterpreterCallbacks() {
        this.interpreter.onLog = (message, type) => {
            this.log(message, type);
        };

        this.interpreter.onError = (message) => {
            this.log(message, 'error');
            this.setStatus('Ошибка!', 'error');
        };

        this.interpreter.onLineChange = (line) => {
            this.highlightLine(line);
        };

        this.interpreter.onComplete = (success) => {
            this.updateStatus();
            if (success) {
                this.setStatus('Выполнено!', 'success');
            }
        };

        this.interpreter.onStatusChange = (status) => {
            if (status === 'running') {
                this.setStatus('Выполняется...', 'running');
                this.elements.runBtn.disabled = true;
                this.elements.stepBtn.disabled = true;
            } else {
                this.elements.runBtn.disabled = false;
                this.elements.stepBtn.disabled = false;
            }
        };
    }

    // Управление выполнением
    run() {
        const code = this.elements.codeEditor.value;
        if (!code.trim()) {
            this.log('Введите программу для выполнения', 'warning');
            return;
        }

        this.interpreter.execute(code);
    }

    async step() {
        const code = this.elements.codeEditor.value;
        if (!code.trim()) {
            this.log('Введите программу для выполнения', 'warning');
            return;
        }

        const hasMore = await this.interpreter.step(code);
        this.updateStatus();

        if (!hasMore) {
            this.setStatus('Завершено', 'success');
        }
    }

    stop() {
        this.interpreter.stop();
        this.setStatus('Остановлено', 'warning');
        this.clearHighlight();
    }

    reset() {
        this.stop();
        this.robot.reset();
        this.renderer.render();
        this.updateStatus();
        this.setStatus('Готов к работе', 'ready');
        this.log('Робот возвращён в начальную позицию', 'info');
    }

    // Горячие клавиши
    handleHotkeys(e) {
        // F5 - запуск
        if (e.key === 'F5') {
            e.preventDefault();
            this.run();
        }

        // F10 - шаг
        if (e.key === 'F10') {
            e.preventDefault();
            this.step();
        }

        // Escape - стоп
        if (e.key === 'Escape') {
            this.stop();
        }

        // Ctrl+R - сброс
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            this.reset();
        }
    }

    // Обновление номеров строк
    updateLineNumbers() {
        const lines = this.elements.codeEditor.value.split('\n');
        const numbers = [];

        for (let i = 1; i <= lines.length; i++) {
            numbers.push(`<span>${i}</span>`);
        }

        this.elements.lineNumbers.innerHTML = numbers.join('');
    }

    // Подсветка текущей строки
    highlightLine(line) {
        const spans = this.elements.lineNumbers.querySelectorAll('span');
        spans.forEach((span, i) => {
            span.classList.toggle('active', i === line);
        });
    }

    clearHighlight() {
        const spans = this.elements.lineNumbers.querySelectorAll('span');
        spans.forEach(span => span.classList.remove('active'));
    }

    // Обновление статуса
    updateStatus() {
        const pos = this.robot.getPosition();
        this.elements.robotPosition.textContent = `(${pos.x}, ${pos.y})`;
        this.elements.robotDirection.textContent = this.robot.getDirectionName();
    }

    setStatus(message, type = 'info') {
        const el = this.elements.statusMessage;
        el.textContent = message;
        el.className = 'status-item';

        if (type === 'error') {
            el.classList.add('error');
        } else if (type === 'running') {
            el.classList.add('running');
        }
    }

    // Логирование в консоль
    log(message, type = 'info') {
        const div = document.createElement('div');
        div.className = `console-message ${type}`;
        div.textContent = message;

        this.elements.consoleOutput.appendChild(div);
        this.elements.consoleOutput.scrollTop = this.elements.consoleOutput.scrollHeight;
    }

    // Модальные окна
    showModal(id) {
        document.getElementById(id).classList.add('active');
    }

    hideModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    // Редактор поля
    openFieldEditor() {
        // Создаём копию поля для редактирования
        this.tempField = new Field(this.field.size);

        // Копируем текущее состояние
        for (let y = 0; y < this.field.size; y++) {
            for (let x = 0; x < this.field.size; x++) {
                const cell = this.field.getCell(x, y);
                if (cell.wall) this.tempField.setWall(x, y, true);
                if (cell.target) this.tempField.setTarget(x, y, true);
            }
        }

        this.tempRobotX = this.robot.x;
        this.tempRobotY = this.robot.y;

        this.renderFieldEditor();
        this.showModal('fieldEditorModal');
    }

    renderFieldEditor() {
        const canvas = this.elements.fieldEditorCanvas;
        const ctx = canvas.getContext('2d');
        const field = this.tempField;

        const cellSize = 50;
        const size = cellSize * field.size;

        canvas.width = size;
        canvas.height = size;

        // Цвета
        const colors = {
            background: '#0d1117',
            grid: '#30363d',
            cell: '#21262d',
            wall: '#484f58',
            target: '#f85149',
            robot: '#ffd700'
        };

        // Фон
        ctx.fillStyle = colors.background;
        ctx.fillRect(0, 0, size, size);

        // Клетки
        for (let y = 0; y < field.size; y++) {
            for (let x = 0; x < field.size; x++) {
                const px = x * cellSize;
                const py = y * cellSize;
                const cell = field.getCell(x, y);

                if (cell.wall) {
                    ctx.fillStyle = colors.wall;
                } else {
                    ctx.fillStyle = colors.cell;
                }

                ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);

                if (cell.target) {
                    ctx.fillStyle = colors.target;
        ctx.beginPath();
                    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
        ctx.fill();
                }

                // Сетка
                ctx.strokeStyle = colors.grid;
                ctx.strokeRect(px, py, cellSize, cellSize);
            }
        }

        // Робот
        const rx = this.tempRobotX * cellSize + cellSize / 2;
        const ry = this.tempRobotY * cellSize + cellSize / 2;

        ctx.fillStyle = colors.robot;
        ctx.beginPath();
        ctx.arc(rx, ry, cellSize / 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0d1117';
        ctx.font = `${cellSize / 2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🤖', rx, ry);
    }

    handleFieldEditorClick(e) {
        if (!this.tempField) return;

        const canvas = this.elements.fieldEditorCanvas;
        const rect = canvas.getBoundingClientRect();
        const cellSize = canvas.width / this.tempField.size;

        const x = Math.floor((e.clientX - rect.left) / cellSize);
        const y = Math.floor((e.clientY - rect.top) / cellSize);

        if (x < 0 || x >= this.tempField.size || y < 0 || y >= this.tempField.size) return;

        switch (this.editTool) {
            case 'wall':
                const isWall = this.tempField.isWall(x, y);
                this.tempField.setWall(x, y, !isWall);
                break;
            case 'robot':
                this.tempRobotX = x;
                this.tempRobotY = y;
                break;
            case 'target':
                const isTarget = this.tempField.isTarget(x, y);
                this.tempField.setTarget(x, y, !isTarget);
                break;
            case 'erase':
                this.tempField.setWall(x, y, false);
                this.tempField.setTarget(x, y, false);
                break;
        }

        this.renderFieldEditor();
    }

    applyFieldChanges() {
        if (!this.tempField) return;

        // Копируем изменения в основное поле
        this.field.clear();

        for (let y = 0; y < this.tempField.size; y++) {
            for (let x = 0; x < this.tempField.size; x++) {
                const cell = this.tempField.getCell(x, y);
                if (cell.wall) this.field.setWall(x, y, true);
                if (cell.target) this.field.setTarget(x, y, true);
            }
        }

        // Устанавливаем позицию робота
        if (!this.field.isWall(this.tempRobotX, this.tempRobotY)) {
            this.robot.x = this.tempRobotX;
            this.robot.y = this.tempRobotY;
        }

        this.robot.saveStartPosition();
        this.renderer.render();
        this.updateStatus();

        this.hideModal('fieldEditorModal');
        this.log('Поле обновлено', 'success');
    }

    // =============================================
    // Загрузка лабиринтов из файла
    // =============================================

    loadMazeFromFile(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            const content = e.target.result;
            this.parseMazeFile(content, file.name);
        };

        reader.onerror = () => {
            this.log('Ошибка чтения файла', 'error');
        };

        reader.readAsText(file);
    }

    parseMazeFile(content, filename) {
        const lines = content.split('\n').filter(line => line.trim().length > 0);

        if (lines.length === 0) {
            this.log('Файл пуст', 'error');
            return;
        }

        // Определяем размеры поля
        const height = lines.length;
        const width = Math.max(...lines.map(line => line.length));
        const size = Math.max(width, height);

        // Создаём новое поле
        this.field.resize(size);
        this.field.clear();

        let robotX = 0;
        let robotY = 0;
        let robotFound = false;
        let baseX = -1;
        let baseY = -1;

        // Парсим содержимое файла
        // Формат:
        //   . = пустая клетка
        //   w/W = стена
        //   x/X = клетка для закрашивания
        //   0 = начальная позиция робота
        //   b = финиш/база (маленькая)
        //   B = позиция робота (большая) или тоже финиш
        for (let y = 0; y < lines.length; y++) {
            const line = lines[y];

            for (let x = 0; x < line.length; x++) {
                const char = line[x];
                const charLower = char.toLowerCase();

                switch (charLower) {
                    case 'w':
                        // Стена
                        this.field.setWall(x, y, true);
                        break;

                    case 'x':
                        // Клетка-цель для закрашивания
                        this.field.setTarget(x, y, true);
                        break;

                    case '0':
                        // Начальная позиция робота
                        robotX = x;
                        robotY = y;
                        robotFound = true;
                        break;

                    case 'b':
                        if (char === 'B') {
                            // Большая B - позиция робота
                            robotX = x;
                            robotY = y;
                            robotFound = true;
        } else {
                            // Маленькая b - финишная точка (база)
                            baseX = x;
                            baseY = y;
                            this.field.setBase(x, y);
                        }
                        break;

                    case '.':
                    default:
                        // Пустая клетка - ничего не делаем
                        break;
                }
            }
        }

        // Устанавливаем позицию робота
        if (robotFound) {
            this.robot.x = robotX;
            this.robot.y = robotY;
        } else {
            // Если робот не найден, ставим в первую свободную клетку
            this.robot.x = 0;
            this.robot.y = 0;

            // Ищем первую свободную клетку
            outer: for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (!this.field.isWall(x, y)) {
                        this.robot.x = x;
                        this.robot.y = y;
                        robotX = x;
                        robotY = y;
                        break outer;
                    }
                }
            }
        }

        this.robot.direction = Direction.RIGHT;
        this.robot.saveStartPosition();

        // Обновляем UI - добавляем размер в select если его нет
        const sizeOption = this.elements.fieldSize.querySelector(`option[value="${size}"]`);
        if (!sizeOption) {
            const newOption = document.createElement('option');
            newOption.value = size;
            newOption.textContent = `${size}×${size}`;
            this.elements.fieldSize.appendChild(newOption);
        }
        this.elements.fieldSize.value = size;

        this.renderer.resize();
        this.updateStatus();

        this.log(`Лабиринт "${filename}" загружен (${width}×${height})`, 'success');
        this.log(`Робот установлен в позицию (${robotX + 1}, ${robotY + 1})`, 'info');

        if (baseX >= 0) {
            this.log(`Цель: достичь точки (${baseX + 1}, ${baseY + 1})`, 'hint');
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
