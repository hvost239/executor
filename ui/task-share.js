import { createTaskLink } from '../sharing/task-link.js';

/** Keep link generation and clipboard interaction separate from the application controller. */
export class TaskShareDialog {
    constructor({ getTask, onError }) {
        this.dialog = document.getElementById('shareTaskDialog');
        this.link = document.getElementById('taskLink');
        this.status = document.getElementById('shareStatus');
        this.copyButton = document.getElementById('copyTaskLinkBtn');
        document.getElementById('shareTaskBtn').addEventListener('click', () => {
            try {
                this.link.value = createTaskLink(window.location.href, getTask());
                this.status.textContent = '';
                document.getElementById('localShareHint').hidden =
                    window.location.protocol !== 'file:';
                this.dialog.showModal();
                this.selectLink();
            } catch (error) {
                onError(`Не удалось создать ссылку: ${error.message}`);
            }
        });
        document
            .getElementById('closeShareTaskBtn')
            .addEventListener('click', () => this.dialog.close());
        this.dialog.addEventListener('click', (event) => {
            if (event.target === this.dialog) this.dialog.close();
        });
        this.copyButton.addEventListener('click', () => this.copyLink());
    }

    get isOpen() {
        return this.dialog.open;
    }

    selectLink() {
        this.link.focus();
        this.link.select();
    }

    async copyLink() {
        this.copyButton.disabled = true;
        try {
            await navigator.clipboard.writeText(this.link.value);
            this.status.textContent =
                'Ссылка скопирована. Её можно отправить или сохранить в закладках.';
        } catch {
            this.selectLink();
            this.status.textContent = 'Скопируйте выделенную ссылку вручную: Ctrl+C или ⌘C.';
        } finally {
            this.copyButton.disabled = false;
        }
    }
}
