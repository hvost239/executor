import { COMMANDS, COMMAND_GROUPS, renderSnippet } from '../editor/snippets.js';

export class CommandPalette {
    constructor(editor, getLanguage) {
        this.editor = editor;
        this.getLanguage = getLanguage;
        this.dialog = document.getElementById('commandsDialog');
        this.search = document.getElementById('commandSearch');
        this.category = document.getElementById('commandCategory');
        this.list = document.getElementById('commandList');
        for (const [value, title] of Object.entries(COMMAND_GROUPS)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = title;
            this.category.appendChild(option);
        }
        document.getElementById('commandsBtn').addEventListener('click', () => {
            this.position = editor.snapshot();
            this.search.value = '';
            this.category.value = '';
            this.render();
            this.dialog.showModal();
            this.search.focus();
        });
        document
            .getElementById('closeCommandsBtn')
            .addEventListener('click', () => this.dialog.close());
        this.search.addEventListener('input', () => this.render());
        this.category.addEventListener('change', () => this.render());
        this.dialog.addEventListener('click', (event) => {
            if (event.target === this.dialog) this.dialog.close();
        });
    }

    get isOpen() {
        return this.dialog.open;
    }

    render() {
        this.list.replaceChildren();
        const query = this.search.value.toLowerCase().trim();
        const matches = COMMANDS.filter(
            (command) =>
                (!this.category.value || command.group === this.category.value) &&
                [command.templates.ru, command.templates.en, command.description]
                    .join(' ')
                    .toLowerCase()
                    .includes(query)
        );
        for (const [group, title] of Object.entries(COMMAND_GROUPS)) {
            const items = matches.filter((command) => command.group === group);
            if (!items.length) continue;
            const heading = document.createElement('h4');
            heading.textContent = title;
            this.list.appendChild(heading);
            for (const command of items) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'command-item';
                button.dataset.command = command.id;
                const code = document.createElement('code');
                code.textContent = renderSnippet(command, this.getLanguage()).text.split('\n')[0];
                const hint = document.createElement('span');
                hint.textContent = command.description;
                button.append(code, hint);
                button.addEventListener('click', () => this.insert(command));
                this.list.appendChild(button);
            }
        }
        if (!matches.length) this.list.textContent = 'Команды не найдены.';
    }

    insert(command) {
        const { start, end, value } = this.position;
        const line = value.slice(value.lastIndexOf('\n', start - 1) + 1, start);
        const indent = line.match(/^[ \t]*/)[0];
        const snippet = renderSnippet(command, this.getLanguage(), indent);
        this.dialog.close();
        this.editor.element.setSelectionRange(start, end);
        this.editor.insert(snippet.text, snippet.selection);
    }
}
