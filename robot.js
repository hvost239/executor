/**
 * Исполнители — Класс Робота и Игрового Поля
 * Робот-машинка, который сажает цветы на грядках
 * =============================================
 */

// Направления движения робота
const Direction = {
    UP: 0,
    RIGHT: 1,
    DOWN: 2,
    LEFT: 3
};

const DirectionNames = {
    [Direction.UP]: 'Вверх',
    [Direction.RIGHT]: 'Вправо',
    [Direction.DOWN]: 'Вниз',
    [Direction.LEFT]: 'Влево'
};

const DirectionDeltas = {
    [Direction.UP]: { dx: 0, dy: -1 },
    [Direction.RIGHT]: { dx: 1, dy: 0 },
    [Direction.DOWN]: { dx: 0, dy: 1 },
    [Direction.LEFT]: { dx: -1, dy: 0 }
};

/**
 * Класс игрового поля
 */
class Field {
    constructor(size = 8) {
        this.size = size;
        this.cells = [];
        this.walls = new Set();
        this.targets = new Set();  // Грядки (где нужно посадить цветы)
        this.painted = new Set();  // Клумбы (где цветы уже посажены)
        this.baseX = -1;
        this.baseY = -1;
        this.init();
    }

    init() {
        this.cells = [];
        for (let y = 0; y < this.size; y++) {
            this.cells[y] = [];
            for (let x = 0; x < this.size; x++) {
                this.cells[y][x] = {
                    x, y,
                    wall: false,
                    target: false,  // Грядка
                    painted: false  // Клумба (цветы посажены)
                };
            }
        }
        this.walls.clear();
        this.targets.clear();
        this.painted.clear();
        this.baseX = -1;
        this.baseY = -1;
    }

    resize(newSize) {
        this.size = newSize;
        this.init();
    }

    getCell(x, y) {
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
            return null;
        }
        return this.cells[y][x];
    }

    setWall(x, y, hasWall) {
        const cell = this.getCell(x, y);
        if (cell) {
            cell.wall = hasWall;
            const key = `${x},${y}`;
            if (hasWall) {
                this.walls.add(key);
            } else {
                this.walls.delete(key);
            }
        }
    }

    isWall(x, y) {
        const cell = this.getCell(x, y);
        return cell ? cell.wall : true; // За границей — стена
    }

    setTarget(x, y, hasTarget) {
        const cell = this.getCell(x, y);
        if (cell) {
            cell.target = hasTarget;
            const key = `${x},${y}`;
            if (hasTarget) {
                this.targets.add(key);
            } else {
                this.targets.delete(key);
            }
        }
    }

    isTarget(x, y) {
        const cell = this.getCell(x, y);
        return cell ? cell.target : false;
    }

    setBase(x, y) {
        this.baseX = x;
        this.baseY = y;
    }

    isBase(x, y) {
        return this.baseX === x && this.baseY === y;
    }

    paint(x, y) {
        const cell = this.getCell(x, y);
        if (cell) {
            cell.painted = true;
            this.painted.add(`${x},${y}`);
        }
    }

    isPainted(x, y) {
        const cell = this.getCell(x, y);
        return cell ? cell.painted : false;
    }

    clearPainted() {
        this.painted.clear();
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                this.cells[y][x].painted = false;
            }
        }
    }

    clear() {
        this.init();
    }

    // Проверка: все ли грядки засажены
    allTargetsPainted() {
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const cell = this.cells[y][x];
                if (cell.target && !cell.painted) {
                    return false;
                }
            }
        }
        return true;
    }
}

/**
 * Класс Робота
 */
class Robot {
    constructor(field) {
        this.field = field;
        this.x = 0;
        this.y = 0;
        this.direction = Direction.RIGHT;
        this.startX = 0;
        this.startY = 0;
        this.startDirection = Direction.RIGHT;
    }

    // Сохранить начальную позицию
    saveStartPosition() {
        this.startX = this.x;
        this.startY = this.y;
        this.startDirection = this.direction;
    }

    // Вернуться на начальную позицию
    reset() {
        this.x = this.startX;
        this.y = this.startY;
        this.direction = this.startDirection;
        this.field.clearPainted();
    }

    // Полный сброс
    fullReset() {
        this.x = 0;
        this.y = 0;
        this.direction = Direction.RIGHT;
        this.startX = 0;
        this.startY = 0;
        this.startDirection = Direction.RIGHT;
        this.field.clear();
    }

    // Установить позицию
    setPosition(x, y) {
        if (x >= 0 && x < this.field.size && y >= 0 && y < this.field.size) {
            if (!this.field.isWall(x, y)) {
                this.x = x;
                this.y = y;
                return true;
            }
        }
        return false;
    }

    // Проверка возможности движения
    canMove(direction = this.direction) {
        const delta = DirectionDeltas[direction];
        const newX = this.x + delta.dx;
        const newY = this.y + delta.dy;

        // Проверяем границы
        if (newX < 0 || newX >= this.field.size || newY < 0 || newY >= this.field.size) {
            return false;
        }

        // Проверяем стену
        if (this.field.isWall(newX, newY)) {
            return false;
        }

        // Проверяем клумбу — по ней ходить нельзя (топтать цветы запрещено)
        const cell = this.field.getCell(newX, newY);
        if (cell && cell.painted) {
            return false;
        }

        return true;
    }

    // Движение вперёд
    forward() {
        if (this.canMove()) {
            const delta = DirectionDeltas[this.direction];
            this.x += delta.dx;
            this.y += delta.dy;
            return { success: true, x: this.x, y: this.y };
        }
        return { success: false, error: 'Невозможно двигаться вперёд — препятствие!' };
    }

    // Движение назад
    backward() {
        const backDirection = (this.direction + 2) % 4;
        if (this.canMove(backDirection)) {
            const delta = DirectionDeltas[backDirection];
            this.x += delta.dx;
            this.y += delta.dy;
            return { success: true, x: this.x, y: this.y };
        }
        return { success: false, error: 'Невозможно двигаться назад — препятствие!' };
    }

    // Поворот налево
    turnLeft() {
        this.direction = (this.direction + 3) % 4;
        return { success: true, direction: this.direction };
    }

    // Поворот направо
    turnRight() {
        this.direction = (this.direction + 1) % 4;
        return { success: true, direction: this.direction };
    }

    // Разворот кругом (на 180°)
    turnAround() {
        this.direction = (this.direction + 2) % 4;
        return { success: true, direction: this.direction };
    }

    // Посадить цветы (закрасить грядку)
    paint() {
        this.field.paint(this.x, this.y);
        return { success: true };
    }

    // Проверки состояния
    isWallAhead() {
        return !this.canMove();
    }

    isWallLeft() {
        const leftDirection = (this.direction + 3) % 4;
        return !this.canMove(leftDirection);
    }

    isWallRight() {
        const rightDirection = (this.direction + 1) % 4;
        return !this.canMove(rightDirection);
    }

    isWallBehind() {
        const backDirection = (this.direction + 2) % 4;
        return !this.canMove(backDirection);
    }

    isFreeAhead() {
        return this.canMove();
    }

    isFreeLeft() {
        const leftDirection = (this.direction + 3) % 4;
        return this.canMove(leftDirection);
    }

    isFreeRight() {
        const rightDirection = (this.direction + 1) % 4;
        return this.canMove(rightDirection);
    }

    isFreeBehind() {
        const backDirection = (this.direction + 2) % 4;
        return this.canMove(backDirection);
    }

    isOnTarget() {
        return this.field.isTarget(this.x, this.y);
    }

    isOnBase() {
        return this.field.isBase(this.x, this.y);
    }

    isCellPainted() {
        return this.field.isPainted(this.x, this.y);
    }

    // Получить информацию о положении
    getPosition() {
        return { x: this.x + 1, y: this.y + 1 }; // +1 для человеко-читаемых координат
    }

    getDirectionName() {
        return DirectionNames[this.direction];
    }
}

/**
 * Класс рендерера поля — визуализация в стиле "Исполнители"
 * Машинка-робот, грядки, клумбы с цветами, кирпичные стены
 */
class FieldRenderer {
    constructor(canvas, field, robot) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.field = field;
        this.robot = robot;
        this.cellSize = 50;
        this.animationFrame = null;

        // Цветовая палитра в стиле Исполнителей
        this.colors = {
            // Поле
            tile: '#d4b896',           // Песочная плитка
            tileDark: '#c4a882',       // Тёмная плитка
            tileLight: '#e4c8a6',      // Светлая плитка
            grid: '#a08060',           // Линии сетки

            // Грядка (нужно посадить цветы)
            garden: '#8b5a2b',         // Коричневая земля
            gardenDark: '#6b4423',     // Тёмная земля

            // Клумба (цветы посажены)
            flowerbed: '#228b22',      // Зелёная трава
            flowerbedLight: '#32cd32', // Светлая трава
            flowerPink: '#ffb6c1',     // Розовые цветы
            flowerWhite: '#fffacd',    // Белые цветы
            flowerCenter: '#ffd700',   // Серединка цветка

            // Стена
            brick: '#b22222',          // Кирпич
            brickDark: '#8b0000',      // Тёмный кирпич
            brickLight: '#cd5c5c',     // Светлый кирпич
            mortar: '#d3d3d3',         // Цемент

            // База
            baseBlue: '#1e3a5f',       // Синий фон знака
            baseWhite: '#ffffff',      // Белая буква P

            // Робот-машинка
            robotBody: '#1e90ff',      // Синий корпус
            robotDark: '#0066cc',      // Тёмно-синий
            robotLight: '#4169e1',     // Светло-синий
            robotWindow: '#87ceeb',    // Окна
            robotWheel: '#2f2f2f',     // Колёса
            robotYellow: '#ffd700',    // Жёлтые детали (фары)
        };

        this.resize();
    }

    resize() {
        const container = this.canvas.parentElement;
        const maxSize = Math.min(container.clientWidth - 40, container.clientHeight - 40);
        this.cellSize = Math.floor(maxSize / this.field.size);

        const size = this.cellSize * this.field.size;
        this.canvas.width = size;
        this.canvas.height = size;

        this.render();
    }

    render() {
        const { ctx, cellSize, field, robot, colors } = this;
        const size = cellSize * field.size;

        // Очистка
        ctx.fillStyle = colors.tile;
        ctx.fillRect(0, 0, size, size);

        // Отрисовка клеток
        for (let y = 0; y < field.size; y++) {
            for (let x = 0; x < field.size; x++) {
                const px = x * cellSize;
                const py = y * cellSize;
                const cell = field.getCell(x, y);

                if (cell.wall) {
                    // Кирпичная стена
                    this.drawBrickWall(px, py, cellSize);
                } else if (cell.painted) {
                    // Клумба с цветами
                    this.drawFlowerbed(px, py, cellSize);
                } else if (cell.target) {
                    // Грядка (земля)
                    this.drawGarden(px, py, cellSize);
                } else if (field.isBase(x, y)) {
                    // База
                    this.drawTile(px, py, cellSize);
                    this.drawBase(px, py, cellSize);
                } else {
                    // Свободная плитка
                    this.drawTile(px, py, cellSize);
                }

                // Сетка
                ctx.strokeStyle = colors.grid;
                ctx.lineWidth = 1;
                ctx.strokeRect(px, py, cellSize, cellSize);
            }
        }

        // Отрисовка робота
        this.drawRobot(robot.x * cellSize, robot.y * cellSize, robot.direction);
    }

    // Песочная плитка
    drawTile(px, py, size) {
        const { ctx, colors } = this;

        // Основной цвет
        ctx.fillStyle = colors.tile;
        ctx.fillRect(px, py, size, size);

        // Текстура плитки
        ctx.fillStyle = colors.tileDark;
        ctx.fillRect(px, py, size, 2);
        ctx.fillRect(px, py, 2, size);

        ctx.fillStyle = colors.tileLight;
        ctx.fillRect(px + size - 2, py, 2, size);
        ctx.fillRect(px, py + size - 2, size, 2);
    }

    // Грядка (коричневая земля)
    drawGarden(px, py, size) {
        const { ctx, colors } = this;

        // Основной цвет земли
        ctx.fillStyle = colors.garden;
        ctx.fillRect(px + 2, py + 2, size - 4, size - 4);

        // Текстура борозд
        ctx.strokeStyle = colors.gardenDark;
        ctx.lineWidth = 2;
        for (let i = 0; i < size - 4; i += 8) {
            ctx.beginPath();
            ctx.moveTo(px + 4, py + 4 + i);
            ctx.lineTo(px + size - 4, py + 4 + i);
            ctx.stroke();
        }
    }

    // Клумба с цветами
    drawFlowerbed(px, py, size) {
        const { ctx, colors } = this;

        // Зелёный фон (трава)
        ctx.fillStyle = colors.flowerbed;
        ctx.fillRect(px + 2, py + 2, size - 4, size - 4);

        // Текстура травы
        ctx.fillStyle = colors.flowerbedLight;
        for (let i = 0; i < 5; i++) {
            const gx = px + 4 + Math.random() * (size - 10);
            const gy = py + 4 + Math.random() * (size - 10);
            ctx.fillRect(gx, gy, 3, 6);
        }

        // Цветы (2x2 сетка)
        const flowerSize = size / 5;
        const positions = [
            [px + size * 0.25, py + size * 0.25],
            [px + size * 0.75, py + size * 0.25],
            [px + size * 0.25, py + size * 0.75],
            [px + size * 0.75, py + size * 0.75]
        ];

        positions.forEach(([fx, fy], i) => {
            this.drawFlower(fx, fy, flowerSize, i % 2 === 0 ? colors.flowerPink : colors.flowerWhite);
        });
    }

    // Отдельный цветок
    drawFlower(cx, cy, size, petalColor) {
        const { ctx, colors } = this;

        // Лепестки
        ctx.fillStyle = petalColor;
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const px = cx + Math.cos(angle) * size * 0.4;
            const py = cy + Math.sin(angle) * size * 0.4;
            ctx.beginPath();
            ctx.arc(px, py, size * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }

        // Серединка
        ctx.fillStyle = colors.flowerCenter;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }

    // Кирпичная стена
    drawBrickWall(px, py, size) {
        const { ctx, colors } = this;

        // Фон цемента
        ctx.fillStyle = colors.mortar;
        ctx.fillRect(px, py, size, size);

        const brickHeight = size / 4;
        const brickWidth = size / 2;
        const gap = 2;

        ctx.fillStyle = colors.brick;

        for (let row = 0; row < 4; row++) {
            const offset = (row % 2) * (brickWidth / 2);
            for (let col = -1; col < 3; col++) {
                const bx = px + col * brickWidth + offset + gap / 2;
                const by = py + row * brickHeight + gap / 2;
                const bw = brickWidth - gap;
                const bh = brickHeight - gap;

                if (bx < px + size && bx + bw > px) {
                    const clippedX = Math.max(bx, px);
                    const clippedW = Math.min(bx + bw, px + size) - clippedX;

                    // Основной кирпич
                    ctx.fillStyle = colors.brick;
                    ctx.fillRect(clippedX, by, clippedW, bh);

                    // Блик сверху
                    ctx.fillStyle = colors.brickLight;
                    ctx.fillRect(clippedX, by, clippedW, 2);

                    // Тень снизу
                    ctx.fillStyle = colors.brickDark;
                    ctx.fillRect(clippedX, by + bh - 2, clippedW, 2);
                }
            }
        }
    }

    // База (знак P)
    drawBase(px, py, size) {
        const { ctx, colors } = this;
        const margin = size * 0.15;
        const signSize = size - margin * 2;

        // Синий фон знака
        ctx.fillStyle = colors.baseBlue;
        ctx.beginPath();
        ctx.roundRect(px + margin, py + margin, signSize, signSize, 6);
        ctx.fill();

        // Белая рамка
        ctx.strokeStyle = colors.baseWhite;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(px + margin + 3, py + margin + 3, signSize - 6, signSize - 6, 4);
        ctx.stroke();

        // Буква P
        ctx.fillStyle = colors.baseWhite;
        ctx.font = `bold ${signSize * 0.6}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', px + size / 2, py + size / 2 + 2);
    }

    // Робот-машинка
    drawRobot(px, py, direction) {
        const { ctx, cellSize, colors } = this;
        const cx = px + cellSize / 2;
        const cy = py + cellSize / 2;
        const size = cellSize * 0.8;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(direction * Math.PI / 2);

        const w = size * 0.7;  // Ширина машинки
        const h = size * 0.9;  // Длина машинки

        // Тень
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(2, 2, w / 2 + 2, h / 2 + 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Колёса
        ctx.fillStyle = colors.robotWheel;
        const wheelW = w * 0.2;
        const wheelH = h * 0.25;
        // Задние колёса
        ctx.fillRect(-w / 2 - wheelW / 2, h * 0.25 - wheelH / 2, wheelW, wheelH);
        ctx.fillRect(w / 2 - wheelW / 2, h * 0.25 - wheelH / 2, wheelW, wheelH);
        // Передние колёса
        ctx.fillRect(-w / 2 - wheelW / 2, -h * 0.3 - wheelH / 2, wheelW, wheelH);
        ctx.fillRect(w / 2 - wheelW / 2, -h * 0.3 - wheelH / 2, wheelW, wheelH);

        // Корпус машинки
        ctx.fillStyle = colors.robotBody;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, 8);
        ctx.fill();

        // Передняя часть (капот)
        ctx.fillStyle = colors.robotDark;
        ctx.beginPath();
        ctx.roundRect(-w / 2 + 3, -h / 2, w - 6, h * 0.3, [6, 6, 0, 0]);
        ctx.fill();

        // Окно/кабина
        ctx.fillStyle = colors.robotWindow;
        ctx.beginPath();
        ctx.roundRect(-w / 3, -h * 0.15, w * 0.66, h * 0.35, 4);
        ctx.fill();

        // Блик на окне
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.roundRect(-w / 3 + 2, -h * 0.15 + 2, w * 0.3, h * 0.15, 2);
        ctx.fill();

        // Фары (спереди)
        ctx.fillStyle = colors.robotYellow;
        ctx.beginPath();
        ctx.arc(-w / 3, -h / 2 + 8, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w / 3, -h / 2 + 8, 4, 0, Math.PI * 2);
        ctx.fill();

        // Стоп-сигналы (сзади)
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(-w / 4, h / 2 - 6, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w / 4, h / 2 - 6, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // Анимация движения робота
    async animateMove(fromX, fromY, toX, toY, duration = 200) {
        return new Promise(resolve => {
            const startTime = performance.now();
            const startPx = fromX * this.cellSize;
            const startPy = fromY * this.cellSize;
            const endPx = toX * this.cellSize;
            const endPy = toY * this.cellSize;

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Easing
                const eased = 1 - Math.pow(1 - progress, 3);

                const currentPx = startPx + (endPx - startPx) * eased;
                const currentPy = startPy + (endPy - startPy) * eased;

                this.render();
                this.drawRobot(currentPx, currentPy, this.robot.direction);

                if (progress < 1) {
                    this.animationFrame = requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };

            this.animationFrame = requestAnimationFrame(animate);
        });
    }

    // Анимация поворота
    async animateTurn(fromDirection, toDirection, duration = 150) {
        return new Promise(resolve => {
            const startTime = performance.now();
            const px = this.robot.x * this.cellSize;
            const py = this.robot.y * this.cellSize;

            let diff = toDirection - fromDirection;
            if (diff > 2) diff -= 4;
            if (diff < -2) diff += 4;

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 2);

                const currentDirection = fromDirection + diff * eased;

                this.render();
                this.drawRobot(px, py, currentDirection);

                if (progress < 1) {
                    this.animationFrame = requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };

            this.animationFrame = requestAnimationFrame(animate);
        });
    }

    stopAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
}

// Экспорт
window.Direction = Direction;
window.DirectionNames = DirectionNames;
window.Field = Field;
window.Robot = Robot;
window.FieldRenderer = FieldRenderer;
