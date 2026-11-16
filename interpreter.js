import { compile } from './language/compiler.js';
import { diagnostic, RobotRuntimeError } from './language/errors.js';
import { Runtime } from './runtime/runtime.js';
import { RobotHost } from './runtime/robot-host.js';
import { delay, withAbort } from './runtime/cancellation.js';

/** Execution controller. Both Run and Step consume exactly the same VM generator. */
export class Interpreter {
    constructor(robot, renderer, options = {}) {
        this.robot = robot;
        this.renderer = renderer;
        this.options = options;
        this.speed = 5;
        this.isRunning = false;
        this.isPaused = false;
        this.session = null;
        this.lastResult = null;
        this.currentLine = 0;
        this.onLog = null;
        this.onError = null;
        this.onLineChange = null;
        this.onComplete = null;
        this.onStatusChange = null;
        this.onOutput = null;
        this.onInput = null;
        this.onClearOutput = null;
        this.onVariables = null;
        this.host = new RobotHost(
            robot,
            renderer,
            () => this.getDelay(),
            (message, type) => this.log(message, type)
        );
    }
    setSpeed(speed) {
        this.speed = Math.max(1, Math.min(10, speed));
    }
    getDelay() {
        return Math.max(50, 600 - this.speed * 55);
    }
    log(message, type = 'info') {
        this.onLog?.(message, type);
    }
    compile(code) {
        return compile(code);
    }
    createSession(code) {
        const program = compile(code);
        this.robot.reset();
        this.renderer.render();
        const runtime = new Runtime(program, { ...this.options, robot: this.robot });
        const iterator = runtime.run();
        this.lastResult = null;
        this.isPaused = false;
        const session = {
            code,
            runtime,
            iterator,
            abort: new AbortController(),
            current: iterator.next(),
        };
        this.session = session;
        return session;
    }
    async effect(event, session) {
        const signal = session.abort.signal;
        switch (event.effect) {
            case 'robot':
                return this.host.execute(event, signal);
            case 'output':
                this.onOutput ? this.onOutput(event.text) : this.log(event.text, 'output');
                return;
            case 'clear':
                this.onClearOutput?.();
                return;
            case 'input':
                if (!this.onInput)
                    throw new RobotRuntimeError('источник ввода не подключён', event.loc);
                this.onStatusChange?.('waiting-input', { name: event.name });
                try {
                    return await withAbort(
                        this.onInput({ name: event.name, dataType: event.dataType, signal }),
                        signal
                    );
                } finally {
                    if (this.session === session && !signal.aborted)
                        this.onStatusChange?.('running');
                }
            case 'graphics':
                throw new RobotRuntimeError(
                    `команда «${event.name}» требует исполнителя Черепаха или Чертёжник`,
                    event.loc
                );
            default:
                throw new RobotRuntimeError('неизвестный эффект выполнения', event.loc);
        }
    }
    showStep(step) {
        if (!step || step.kind !== 'step') return;
        this.currentLine = step.loc.line;
        this.onLineChange?.(step.loc.line);
        if (this.onVariables) this.onVariables(step.environment.snapshot());
    }
    async advance(session) {
        if (session.current.done) return false;
        this.showStep(session.current.value);
        session.current = session.iterator.next();
        while (!session.current.done && session.current.value.kind === 'effect') {
            const event = session.current.value;
            let result;
            try {
                result = await this.effect(event, session);
            } catch (error) {
                if (error.line == null) {
                    error.line = event.loc.line;
                    error.column = event.loc.column;
                }
                throw error;
            }
            if (session.abort.signal.aborted || this.session !== session) return false;
            session.current = session.iterator.next(result);
        }
        this.showStep(session.current.value);
        return !session.current.done;
    }
    complete(session) {
        if (this.session !== session || session.abort.signal.aborted) return;
        const success =
            !session.runtime.robotUsed ||
            (this.robot.isOnBase() && this.robot.field.allTargetsPainted());
        const reason = success ? 'completed' : 'incomplete';
        this.lastResult = { success, reason };
        this.session = null;
        this.isRunning = false;
        if (success) this.log('Программа успешно завершена.', 'success');
        else
            this.log(
                this.robot.isOnBase() ? 'Не все грядки засажены.' : 'Робот не вернулся на базу.',
                'warning'
            );
        this.onComplete?.(success, this.lastResult);
        this.onStatusChange?.(reason);
    }
    fail(error, session) {
        if (session && (session.abort.signal.aborted || this.session !== session)) return;
        this.session = null;
        this.isRunning = false;
        this.lastResult = { success: false, reason: 'error', error };
        if (error.line != null) this.onLineChange?.(error.line);
        this.onError?.(diagnostic(error));
        this.onComplete?.(false, this.lastResult);
        this.onStatusChange?.('error');
    }
    async execute(code) {
        if (this.isRunning) return;
        let session;
        try {
            if (this.session && this.session.code !== code) this.stop();
            session = this.session ?? this.createSession(code);
            this.isRunning = true;
            this.onStatusChange?.('running');
            let count = 0;
            while (
                this.session === session &&
                !session.abort.signal.aborted &&
                (await this.advance(session))
            ) {
                while (this.isPaused && !session.abort.signal.aborted)
                    await delay(50, session.abort.signal);
                // Give the browser a task boundary even for empty/computational loops.
                if (++count % 128 === 0) await delay(0, session.abort.signal);
            }
            this.complete(session);
        } catch (error) {
            this.fail(error, session);
        }
        return this.lastResult;
    }
    async step(code) {
        if (this.isRunning) return true;
        let session;
        try {
            if (this.session && this.session.code !== code) this.stop();
            session = this.session ?? this.createSession(code);
            this.isRunning = true;
            this.onStatusChange?.('running');
            const more = await this.advance(session);
            if (this.session !== session || session.abort.signal.aborted) return false;
            if (more) {
                this.isRunning = false;
                this.onStatusChange?.('paused');
            } else this.complete(session);
            return more;
        } catch (error) {
            this.fail(error, session);
            return false;
        }
    }
    stop() {
        this.session?.abort.abort();
        this.session = null;
        this.renderer.stopAnimation();
        this.isRunning = false;
        this.isPaused = false;
        this.lastResult = { success: false, reason: 'stopped' };
        this.onStatusChange?.('stopped');
    }
    reset() {
        this.stop();
        this.robot.reset();
        this.renderer.render();
    }
    togglePause() {
        this.isPaused = !this.isPaused;
    }
}
