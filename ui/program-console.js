import { abortError } from '../runtime/cancellation.js';

/** Text streams and cancellable input, independent of the application's diagnostic log. */
export class ProgramConsole {
    constructor(container, inputContainer) {
        this.container = container;
        this.inputContainer = inputContainer;
        this.output = document.createElement('pre');
        this.output.className = 'program-output';
        this.output.setAttribute('aria-label', 'Вывод программы');
    }
    write(text) {
        if (!this.output.isConnected) this.container.appendChild(this.output);
        this.output.textContent += text;
        this.container.scrollTop = this.container.scrollHeight;
    }
    clear() {
        this.output.textContent = '';
    }
    read({ name, dataType, signal }) {
        if (signal.aborted) return Promise.reject(abortError());
        return new Promise((resolve, reject) => {
            const form = document.createElement('form');
            form.className = 'program-input';
            const label = document.createElement('label');
            label.textContent = `Введите ${name} (${{ int: 'целое число', float: 'число', logical: 'истина/ложь', char: 'символ', string: 'строка' }[dataType]}): `;
            const input = document.createElement('input');
            input.type = 'text';
            input.autocomplete = 'off';
            label.appendChild(input);
            const button = document.createElement('button');
            button.type = 'submit';
            button.className = 'btn btn-secondary';
            button.textContent = 'Ввести';
            form.append(label, button);
            this.inputContainer.appendChild(form);
            this.inputContainer.hidden = false;
            const cleanup = () => {
                form.remove();
                this.inputContainer.hidden = !this.inputContainer.childElementCount;
                signal.removeEventListener('abort', abort);
            };
            const abort = () => {
                cleanup();
                reject(abortError());
            };
            signal.addEventListener('abort', abort, { once: true });
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                const value = input.value;
                cleanup();
                resolve(value);
            });
            input.focus();
            this.container.scrollTop = this.container.scrollHeight;
        });
    }
}
