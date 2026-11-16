import { Field, Robot, FieldRenderer } from './robot.js';
import { Interpreter } from './interpreter.js';
import { parseMaze } from './maze.js';
import { ProgramConsole } from './ui/program-console.js';
import { formatCode } from './language/formatter.js';
import { diagnostic } from './language/errors.js';
import { readTaskLink } from './sharing/task-link.js';
import { TaskShareDialog } from './ui/task-share.js';
import { ProgramFileDialog } from './ui/program-file.js';
import { CodeEditor } from './ui/code-editor.js';
import { CommandPalette } from './ui/command-palette.js';
import { translateCode } from './language/translate.js';

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
            codeLanguage: document.getElementById('codeLanguage'),
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
            formatCodeBtn: document.getElementById('formatCodeBtn'),
            loadExampleBtn: document.getElementById('loadExampleBtn'),

            // Модальные окна
            examplesModal: document.getElementById('examplesModal'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            fieldEditorModal: document.getElementById('fieldEditorModal'),
            closeFieldEditorBtn: document.getElementById('closeFieldEditorBtn'),
            fieldEditorCanvas: document.getElementById('fieldEditorCanvas'),
            clearFieldBtn: document.getElementById('clearFieldBtn'),
            applyFieldBtn: document.getElementById('applyFieldBtn'),
        };

        // Состояние
        this.editTool = 'wall';
        this.tempField = null;

        // Примеры программ
        this.examples = {
            square: `Квадрат
{
    повтори (4)
    {
        посади;
        вперед(2);
        направо;
    }
}`,
            allGardens: `ВсеГрядки
{
    пока (не база)
    {
        если (грядка)
        {
            посади;
        }
        если (впереди_свободно)
        {
            вперед(1);
        }
        иначе
        {
            направо;
        }
    }
}`,
            line: `РядГрядок
{
    пока (впереди_свободно)
    {
        если (грядка)
        {
            посади;
        }
        вперед(1);
    }
    если (грядка)
    {
        посади;
    }
    кругом;
}`,
            maze: `КБазе
{
    пока (не база)
    {
        если (справа_свободно)
        {
            направо;
            вперед(1);
        }
        иначе
        {
            если (впереди_свободно)
            {
                вперед(1);
            }
            иначе
            {
                налево;
            }
        }
    }
}`,
        };

        this.programConsole = new ProgramConsole(this.elements.consoleOutput);
        this.editor = new CodeEditor(this.elements.codeEditor, {
            undoButton: document.getElementById('undoCodeBtn'),
            redoButton: document.getElementById('redoCodeBtn'),
            onChange: () => {
                if (this.interpreter.session) this.stop();
                this.updateLineNumbers();
                this.clearHighlight();
                this.elements.lineNumbers.scrollTop = this.elements.codeEditor.scrollTop;
                this.elements.codeLanguage.value = this.editor.language;
            },
        });
        this.commands = new CommandPalette(this.editor, () => this.editor.language);
        this.programFile = new ProgramFileDialog({
            getSource: () => this.elements.codeEditor.value,
        });
        this.taskShare = new TaskShareDialog({
            getTask: () => ({
                field: this.field,
                start: {
                    x: this.robot.startX,
                    y: this.robot.startY,
                    direction: this.robot.startDirection,
                },
                program: this.elements.codeEditor.value,
            }),
            onError: (message) => this.log(message, 'error'),
        });
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
        window.addEventListener('hashchange', () => this.loadTaskFromLink());

        this.log('🚗 Робот-садовник готов к работе!', 'info');
        this.log('Загрузите лабиринт (📥) и напишите программу для посадки цветов.', 'hint');
        this.loadTaskFromLink();
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
            this.stop();
            const size = parseInt(e.target.value);
            this.field.resize(size);
            this.robot.fullReset();
            this.renderer.resize();
            this.updateStatus();
            this.log(`Размер поля изменён на ${size}×${size}`, 'info');
        });

        // Редактор кода
        elements.codeEditor.addEventListener('scroll', () => {
            elements.lineNumbers.scrollTop = elements.codeEditor.scrollTop;
        });

        elements.codeLanguage.addEventListener('change', () =>
            this.translateEditor(elements.codeLanguage.value)
        );

        // Кнопки редактора
        elements.formatCodeBtn.addEventListener('click', () => this.formatEditor());
        elements.clearCodeBtn.addEventListener('click', () => {
            if (confirm('Очистить код?')) {
                this.editor.setValue('', { focus: true });
            }
        });

        elements.loadExampleBtn.addEventListener('click', () => {
            this.showModal('examplesModal');
        });

        // Консоль
        elements.clearConsoleBtn.addEventListener('click', () => {
            elements.consoleOutput
                .querySelectorAll('.console-message')
                .forEach((node) => node.remove());
            this.programConsole.clear();
            this.log('Консоль очищена', 'info');
        });

        // Модальное окно примеров
        elements.closeModalBtn.addEventListener('click', () => {
            this.hideModal('examplesModal');
        });

        document.querySelectorAll('.example-card').forEach((card) => {
            card.addEventListener('click', () => {
                const example = card.dataset.example;
                if (this.examples[example]) {
                    this.editor.setValue(this.examples[example], { language: 'ru', focus: true });
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
        document.querySelectorAll('.tool-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
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
        document.querySelectorAll('.modal').forEach((modal) => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }

    setupInterpreterCallbacks() {
        this.interpreter.onOutput = (text) => this.programConsole.write(text);
        this.interpreter.onInput = (request) => this.programConsole.read(request);
        this.interpreter.onClearOutput = () => this.programConsole.clear();
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

        this.interpreter.onComplete = (success, result) => {
            this.updateStatus();
            if (success) this.setStatus('Выполнено!', 'success');
            else if (result.reason === 'incomplete') this.setStatus('Задача не решена', 'warning');
        };

        this.interpreter.onStatusChange = (status) => {
            this.elements.formatCodeBtn.disabled = this.interpreter.isRunning;
            if (status === 'running') {
                this.setStatus('Выполняется...', 'running');
                this.elements.runBtn.disabled = true;
                this.elements.stepBtn.disabled = true;
            } else {
                if (status === 'paused') this.setStatus('Пошаговое выполнение', 'ready');
                this.elements.runBtn.disabled = false;
                this.elements.stepBtn.disabled = false;
            }
        };
    }

    // Управление выполнением
    formatEditor() {
        if (this.interpreter.isRunning) return;
        const editor = this.elements.codeEditor;
        if (!editor.value.trim()) return;
        try {
            const formatted = formatCode(editor.value);
            if (formatted === editor.value) return;
            if (this.interpreter.session) this.stop();
            this.editor.setValue(formatted, { focus: true });
            this.elements.lineNumbers.scrollTop = 0;
            this.log('Код отформатирован', 'info');
        } catch (error) {
            this.log(`Не удалось отформатировать код: ${diagnostic(error)}`, 'error');
        }
    }

    translateEditor(language) {
        try {
            const source = translateCode(this.elements.codeEditor.value, language);
            this.editor.setValue(source, { language, focus: true });
        } catch (error) {
            this.elements.codeLanguage.value = this.editor.language;
            this.log(`Не удалось переключить язык: ${diagnostic(error)}`, 'error');
        }
    }

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

        await this.interpreter.step(code);

        // Принудительно перерисовываем поле после шага
        this.renderer.render();
        this.updateStatus();
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
        const pos = this.robot.getPosition();
        this.log(
            `Робот возвращён в позицию (${pos.x}, ${pos.y}), направление: ${this.robot.getDirectionName()}`,
            'info'
        );
    }

    // Горячие клавиши
    handleHotkeys(e) {
        if (this.taskShare.isOpen || this.programFile.isOpen || this.commands.isOpen) return;
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
            e.preventDefault();
            this.programFile.open();
            return;
        }
        if (e.altKey && e.shiftKey && e.code === 'KeyF') {
            e.preventDefault();
            this.formatEditor();
            return;
        }
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
        spans.forEach((span) => span.classList.remove('active'));
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
        this.stop();
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

        this.tempField.setBase(this.field.baseX, this.field.baseY);
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
            robot: '#ffd700',
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

                if (field.isBase(x, y)) {
                    ctx.fillStyle = '#58a6ff';
                    ctx.font = 'bold 30px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('P', px + cellSize / 2, py + cellSize / 2);
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

        const x = Math.floor(((e.clientX - rect.left) * canvas.width) / rect.width / cellSize);
        const y = Math.floor(((e.clientY - rect.top) * canvas.height) / rect.height / cellSize);

        if (x < 0 || x >= this.tempField.size || y < 0 || y >= this.tempField.size) return;

        switch (this.editTool) {
            case 'wall':
                const isWall = this.tempField.isWall(x, y);
                this.tempField.setWall(x, y, !isWall);
                break;
            case 'base':
                this.tempField.setWall(x, y, false);
                this.tempField.setTarget(x, y, false);
                this.tempField.setBase(x, y);
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
                if (this.tempField.isBase(x, y)) this.tempField.setBase(-1, -1);
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

        this.field.setBase(this.tempField.baseX, this.tempField.baseY);

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
        try {
            const maze = parseMaze(content);
            const { width, height } = maze;
            this.applyMaze(maze);
            this.log(`Лабиринт «${filename}» загружен (${width}×${height})`, 'success');
        } catch (error) {
            this.log(error.message, 'error');
        }
    }

    applyMaze({ field, start }) {
        this.stop();
        this.field = field;
        this.robot.field = field;
        this.renderer.field = field;
        Object.assign(this.robot, start);
        this.robot.saveStartPosition();
        if (!this.elements.fieldSize.querySelector(`option[value="${field.size}"]`)) {
            const option = document.createElement('option');
            option.value = String(field.size);
            option.textContent = `${field.size}×${field.size}`;
            this.elements.fieldSize.appendChild(option);
        }
        this.elements.fieldSize.value = String(field.size);
        this.renderer.resize();
        this.updateStatus();
        this.setStatus('Готов к работе', 'ready');
    }

    loadTaskFromLink() {
        try {
            const task = readTaskLink(window.location.href);
            if (!task) return;
            if (task.maze) this.applyMaze(task.maze);
            else this.stop();
            if (task.program !== null) {
                this.editor.setValue(task.program, { resetHistory: true });
            }
            this.setStatus('Готов к работе', 'ready');
            this.log(
                'Задача загружена из ссылки. Нажмите «Выполнить», чтобы запустить программу.',
                'success'
            );
        } catch (error) {
            this.log(`Не удалось загрузить задачу из ссылки: ${error.message}`, 'error');
        }
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
