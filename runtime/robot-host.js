import { RobotRuntimeError } from '../language/errors.js';
import { integer } from './values.js';
import { withAbort, delay } from './cancellation.js';

/** Adapter between language effects and the existing robot/canvas model. */
export class RobotHost {
    constructor(robot, renderer, getDelay, log) {
        this.robot = robot;
        this.renderer = renderer;
        this.getDelay = getDelay;
        this.log = log;
    }
    async execute(event, signal) {
        const { operation, args, loc } = event;
        if (args.length && !['forward', 'backward'].includes(operation))
            throw new RobotRuntimeError(
                'эта команда с параметром доступна только Черепахе или Чертёжнику',
                loc
            );
        this.log(`${event.name}${args.length ? `(${args[0].value})` : ''}`, 'command');
        if (operation === 'forward' || operation === 'backward') {
            const count = integer(args[0], loc);
            for (let i = 0; i < count; i++) {
                if (signal.aborted) return;
                const { x, y } = this.robot;
                if (!this.robot[operation]().success)
                    throw new RobotRuntimeError(
                        'на пути препятствие: стена, клумба или граница поля',
                        loc
                    );
                await withAbort(
                    this.renderer.animateMove(x, y, this.robot.x, this.robot.y, this.getDelay()),
                    signal
                );
                if (signal.aborted) return;
                this.renderer.render();
            }
        } else if (operation === 'paint') {
            if (this.robot.isCellPainted())
                throw new RobotRuntimeError('здесь уже посажены цветы', loc);
            if (!this.robot.isOnTarget()) throw new RobotRuntimeError('здесь нет грядки', loc);
            this.robot.paint();
            this.renderer.render();
            if (this.getDelay()) await delay(this.getDelay() / 2, signal);
        } else {
            const from = this.robot.direction;
            this.robot[{ left: 'turnLeft', right: 'turnRight', around: 'turnAround' }[operation]]();
            await withAbort(
                this.renderer.animateTurn(from, this.robot.direction, this.getDelay()),
                signal
            );
            if (!signal.aborted) this.renderer.render();
        }
    }
}
