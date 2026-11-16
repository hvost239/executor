import { EditHistory } from '../editor/history.js';

export class CodeEditor {
    constructor(element, { onChange, undoButton, redoButton }) {
        this.element = element;
        this.onChange = onChange;
        this.undoButton = undoButton;
        this.redoButton = redoButton;
        this.history = new EditHistory();
        this.language = 'ru';
        this.last = this.snapshot();
        this.pending = null;
        this.composition = null;
        element.addEventListener('beforeinput', (event) => {
            if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
                event.preventDefault();
                this[event.inputType === 'historyUndo' ? 'undo' : 'redo']();
            } else this.pending = this.snapshot();
        });
        element.addEventListener('input', (event) => {
            if (this.composition) return;
            const group = ['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(
                event.inputType
            )
                ? event.inputType
                : null;
            this.history.record(this.pending ?? this.last, this.snapshot(), group);
            this.changed();
        });
        element.addEventListener('compositionstart', () => {
            this.history.breakGroup();
            this.composition = this.snapshot();
        });
        element.addEventListener('compositionend', () => {
            this.history.record(this.composition ?? this.last, this.snapshot());
            this.composition = null;
            this.changed();
        });
        element.addEventListener('keydown', (event) => this.keydown(event));
        for (const type of ['pointerdown', 'blur'])
            element.addEventListener(type, () => this.history.breakGroup());
        undoButton.addEventListener('click', () => this.undo());
        redoButton.addEventListener('click', () => this.redo());
        this.updateButtons();
    }

    snapshot() {
        const e = this.element;
        return {
            value: e.value,
            language: this.language,
            start: e.selectionStart,
            end: e.selectionEnd,
            direction: e.selectionDirection,
            scrollTop: e.scrollTop,
            scrollLeft: e.scrollLeft,
        };
    }

    restore(state, focus = true) {
        const e = this.element;
        e.value = state.value;
        this.language = state.language;
        if (focus) e.focus();
        e.setSelectionRange(state.start, state.end, state.direction);
        e.scrollTop = state.scrollTop;
        e.scrollLeft = state.scrollLeft;
    }

    changed() {
        this.pending = null;
        this.last = this.snapshot();
        this.updateButtons();
        this.onChange();
    }

    updateButtons() {
        this.undoButton.disabled = !this.history.past.length;
        this.redoButton.disabled = !this.history.future.length;
    }

    setValue(value, { resetHistory = false, focus = false, language = this.language } = {}) {
        const before = this.snapshot();
        this.restore(
            { value, language, start: 0, end: 0, direction: 'none', scrollTop: 0, scrollLeft: 0 },
            focus
        );
        if (resetHistory) this.history.clear();
        else this.history.record(before, this.snapshot());
        this.changed();
    }

    insert(text, selection = [text.length, text.length]) {
        const before = this.snapshot();
        this.restore({
            ...before,
            value: before.value.slice(0, before.start) + text + before.value.slice(before.end),
            start: before.start + selection[0],
            end: before.start + selection[1],
            direction: 'none',
        });
        this.history.record(before, this.snapshot());
        this.changed();
    }

    undo() {
        const state = this.history.undo(this.snapshot());
        if (state) {
            this.restore(state);
            this.changed();
        }
    }

    redo() {
        const state = this.history.redo(this.snapshot());
        if (state) {
            this.restore(state);
            this.changed();
        }
    }

    keydown(event) {
        if (event.isComposing || this.composition) return;
        const key = event.code || event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            if (key === 'KeyZ' || key === 'z') {
                event.preventDefault();
                this[event.shiftKey ? 'redo' : 'undo']();
                return;
            }
            if (key === 'KeyY' || key === 'y') {
                event.preventDefault();
                this.redo();
                return;
            }
        }
        if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            this.insert('    ');
            return;
        }
        if (
            [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
                'PageUp',
                'PageDown',
            ].includes(event.key)
        )
            this.history.breakGroup();
    }
}
