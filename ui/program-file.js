import {
    encodeProgramFile,
    programFilename,
    suggestProgramFilename,
} from '../files/program-file.js';

export class ProgramFileDialog {
    constructor({ getSource }) {
        this.getSource = getSource;
        this.dialog = document.getElementById('saveProgramDialog');
        this.filename = document.getElementById('programFilename');
        this.encoding = document.getElementById('programEncoding');
        this.status = document.getElementById('saveProgramStatus');
        this.downloadURL = null;
        document.getElementById('saveCodeBtn').addEventListener('click', () => this.open());
        document
            .getElementById('closeSaveProgramBtn')
            .addEventListener('click', () => this.dialog.close());
        document.getElementById('saveProgramForm').addEventListener('submit', (event) => {
            event.preventDefault();
            this.save();
        });
        this.dialog.addEventListener('click', (event) => {
            if (event.target === this.dialog) this.dialog.close();
        });
        // Keep the URL alive until the browser has consumed the download, then release it.
        window.addEventListener('pagehide', () => this.releaseDownload());
    }

    get isOpen() {
        return this.dialog.open;
    }

    open() {
        this.filename.value = suggestProgramFilename(this.getSource());
        this.encoding.value = 'windows-1251';
        this.status.textContent = '';
        this.dialog.showModal();
        this.filename.focus();
        this.filename.select();
    }

    releaseDownload() {
        if (this.downloadURL) URL.revokeObjectURL(this.downloadURL);
        this.downloadURL = null;
    }

    save() {
        try {
            const bytes = encodeProgramFile(this.getSource(), this.encoding.value);
            const filename = programFilename(this.filename.value);
            const file = new Blob([bytes], { type: `text/plain;charset=${this.encoding.value}` });
            this.releaseDownload();
            this.downloadURL = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = this.downloadURL;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            this.status.textContent = `Файл «${filename}» передан браузеру для сохранения.`;
        } catch (error) {
            this.status.textContent = `Не удалось сохранить код: ${error.message}`;
        }
    }
}
