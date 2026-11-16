import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

async function openApp(entry = '../dist/index.html', { url } = {}) {
    // Only our own built application is evaluated; student text is handled by Runtime.
    const pageURL = new URL(entry, import.meta.url);
    const window = new Window({
        url: url ?? pageURL.href,
        settings: {
            enableJavaScriptEvaluation: true,
            suppressInsecureJavaScriptEnvironmentWarning: true,
            disableJavaScriptFileLoading: true,
            disableCSSFileLoading: true,
        },
    });
    // DOM integration test, not a visual renderer: Canvas/layout need explicit stand-ins.
    window.HTMLCanvasElement.prototype.getContext = () =>
        new Proxy(
            {},
            {
                get(target, key) {
                    return target[key] ?? (() => {});
                },
            }
        );
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 600 });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 600 });
    window.document.write(await readFile(pageURL, 'utf8'));
    window.document.close();
    await window.happyDOM.waitUntilComplete();
    for (const script of window.document.querySelectorAll('script[src]')) {
        const scriptURL = new URL(script.getAttribute('src'), pageURL);
        window.eval(await readFile(scriptURL, 'utf8'));
    }
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    const app = window.app;
    app.interpreter.getDelay = () => 0;
    return { window, document: window.document, app, close: () => window.happyDOM.close() };
}
async function settle() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

function typeInEditor(f, text, inputType = 'insertText') {
    const editor = f.app.elements.codeEditor;
    editor.dispatchEvent(
        new f.window.InputEvent('beforeinput', { inputType, data: text, cancelable: true })
    );
    editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new f.window.InputEvent('input', { inputType, data: text }));
}
function shortcut(f, code, options = {}) {
    const event = new f.window.KeyboardEvent('keydown', {
        code,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        ...options,
    });
    f.app.elements.codeEditor.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
}

test('Ctrl/Command undo and redo preserve typing history across Tab and formatting', async () => {
    const f = await openApp();
    try {
        const editor = f.app.elements.codeEditor;
        typeInEditor(f, 'main');
        typeInEditor(f, '{}');
        const tab = new f.window.KeyboardEvent('keydown', {
            key: 'Tab',
            bubbles: true,
            cancelable: true,
        });
        editor.dispatchEvent(tab);
        assert.equal(editor.value, 'main{}    ');
        shortcut(f, 'KeyZ');
        assert.equal(editor.value, 'main{}');
        assert.equal(editor.selectionStart, 6);
        f.app.elements.formatCodeBtn.click();
        assert.equal(editor.value, 'main\n{\n}\n');
        shortcut(f, 'KeyZ', { ctrlKey: false, metaKey: true, key: 'я' });
        assert.equal(editor.value, 'main{}');
        shortcut(f, 'KeyZ');
        assert.equal(editor.value, '');
        shortcut(f, 'KeyZ', { shiftKey: true });
        assert.equal(editor.value, 'main{}');
        shortcut(f, 'KeyY');
        assert.equal(editor.value, 'main\n{\n}\n');
        assert.equal(f.app.elements.lineNumbers.children.length, 4);
    } finally {
        await f.close();
    }
});

test('paste, clear and loading an example are undoable and restore selections', async () => {
    const f = await openApp();
    try {
        const editor = f.app.elements.codeEditor;
        f.app.editor.setValue('main{right;}', { resetHistory: true });
        editor.setSelectionRange(5, 10, 'backward');
        typeInEditor(f, 'left', 'insertFromPaste');
        f.document.getElementById('undoCodeBtn').click();
        assert.equal(editor.value, 'main{right;}');
        assert.equal(editor.selectionStart, 5);
        assert.equal(editor.selectionEnd, 10);
        assert.equal(editor.selectionDirection, 'backward');
        f.document.querySelector('[data-example="square"]').click();
        f.window.confirm = () => true;
        f.app.elements.clearCodeBtn.click();
        shortcut(f, 'KeyZ');
        assert.equal(editor.value, f.app.examples.square);
        shortcut(f, 'KeyZ');
        assert.equal(editor.value, 'main{right;}');
        typeInEditor(f, 'around', 'insertFromPaste');
        assert.equal(f.document.getElementById('redoCodeBtn').disabled, true);
    } finally {
        await f.close();
    }
});

test('command search inserts at the saved cursor, selects the parameter and undoes in one action', async () => {
    const f = await openApp();
    try {
        const editor = f.app.elements.codeEditor;
        const source = 'main\n{\n    \n}';
        f.app.editor.setValue(source, { resetHistory: true });
        editor.setSelectionRange(11, 11);
        f.document.getElementById('commandsBtn').click();
        const search = f.document.getElementById('commandSearch');
        search.value = 'forward';
        search.dispatchEvent(new f.window.Event('input'));
        assert.equal(f.document.querySelectorAll('.command-item').length, 1);
        const outsideUndo = new f.window.KeyboardEvent('keydown', {
            code: 'KeyZ',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        search.dispatchEvent(outsideUndo);
        assert.equal(outsideUndo.defaultPrevented, false);
        f.document.querySelector('[data-command="вперед"]').click();
        assert.equal(editor.value, 'main\n{\n    вперед(1);\n}');
        assert.equal(editor.value.slice(editor.selectionStart, editor.selectionEnd), '1');
        assert.equal(f.document.activeElement, editor);
        shortcut(f, 'KeyZ');
        assert.equal(editor.value, source);
    } finally {
        await f.close();
    }
});

test('language switching and English templates participate in editor history', async () => {
    const f = await openApp();
    try {
        const source = 'Моя{если(не база) направо; выводстр "направо";}';
        f.app.editor.setValue(source, { resetHistory: true });
        const language = f.app.elements.codeLanguage;
        language.value = 'en';
        language.dispatchEvent(new f.window.Event('change'));
        assert.equal(
            f.app.elements.codeEditor.value,
            'Моя{if(not base) right; println "направо";}'
        );
        shortcut(f, 'KeyZ');
        assert.equal(f.app.elements.codeEditor.value, source);
        assert.equal(language.value, 'ru');
        shortcut(f, 'KeyY');
        assert.equal(language.value, 'en');
        f.app.editor.setValue('main\n{\n    \n}', { resetHistory: true });
        f.app.elements.codeEditor.setSelectionRange(11, 11);
        f.document.getElementById('commandsBtn').click();
        f.document.querySelector('[data-command="пока"]').click();
        assert.equal(
            f.app.elements.codeEditor.value,
            'main\n{\n    while (false)\n    {\n        \n    }\n}'
        );
        f.app.editor.setValue('main{', { language: 'ru' });
        language.value = 'en';
        language.dispatchEvent(new f.window.Event('change'));
        assert.equal(f.app.elements.codeEditor.value, 'main{');
        assert.equal(language.value, 'ru');
    } finally {
        await f.close();
    }
});

test('IME composition is one undo step and editing cancels pending program input', async () => {
    const f = await openApp();
    try {
        const editor = f.app.elements.codeEditor;
        editor.dispatchEvent(new f.window.CompositionEvent('compositionstart'));
        typeInEditor(f, 'т', 'insertCompositionText');
        editor.setSelectionRange(0, 1);
        typeInEditor(f, 'текст', 'insertCompositionText');
        editor.dispatchEvent(new f.window.CompositionEvent('compositionend'));
        shortcut(f, 'KeyZ');
        assert.equal(editor.value, '');
        f.app.editor.setValue('main{int n;input n;}', { resetHistory: true });
        f.app.elements.runBtn.click();
        await settle();
        assert.ok(f.document.querySelector('.program-input'));
        editor.setSelectionRange(editor.value.length, editor.value.length);
        typeInEditor(f, ' ');
        await settle();
        assert.equal(f.app.interpreter.isRunning, false);
        assert.equal(f.document.querySelector('.program-input'), null);
    } finally {
        await f.close();
    }
});

test('URL parameters load a maze and exact program text without running it', async () => {
    const program = 'Программа\n{\n    выводстр "<b>Привет & + # %</b>";\n}';
    const url =
        'https://hvost239.github.io/executor/?' +
        new URLSearchParams({
            maze: '2xb\n.w.\n...',
            program,
        });
    const f = await openApp('../dist/index.html', { url });
    try {
        assert.equal(f.app.elements.codeEditor.value, program);
        assert.equal(f.app.elements.lineNumbers.children.length, 4);
        assert.equal(f.app.field.size, 3);
        assert.equal(f.app.elements.fieldSize.value, '3');
        assert.equal(f.app.field.isTarget(1, 0), true);
        assert.equal(f.app.field.isBase(2, 0), true);
        assert.equal(f.app.robot.startDirection, 1);
        assert.equal(f.app.interpreter.session, null);
        assert.equal(f.document.querySelector('.program-output'), null);
        f.app.elements.runBtn.click();
        await settle();
        assert.equal(
            f.document.querySelector('.program-output').textContent,
            '<b>Привет & + # %</b>\n'
        );
        assert.equal(f.document.querySelector('.program-output b'), null);
    } finally {
        await f.close();
    }
});

test('the Share button creates a reusable snapshot of the task after the robot has moved', async () => {
    const f = await openApp('../dist/index.html', { url: 'https://hvost239.github.io/executor/' });
    let reopened;
    try {
        f.app.parseMazeFile('2xb\n.w.\n...', 'example.maz');
        const program = 'Задача{вперед(1);посади;вперед(1);}';
        f.app.elements.codeEditor.value = program;
        f.app.robot.forward();
        f.app.robot.paint();
        f.app.robot.turnRight();
        f.document.getElementById('shareTaskBtn').click();
        assert.equal(f.document.getElementById('shareTaskDialog').open, true);
        assert.equal(f.document.getElementById('localShareHint').hidden, true);
        const link = f.document.getElementById('taskLink');
        assert.equal(f.document.activeElement, link);
        assert.equal(link.selectionEnd, link.value.length);
        const href = link.value;
        assert.equal(new URL(href).searchParams.get('v'), f.document.documentElement.dataset.build);
        let copied;
        f.window.navigator.clipboard.writeText = async (text) => {
            copied = text;
        };
        f.document.getElementById('copyTaskLinkBtn').click();
        await settle();
        assert.equal(copied, href);
        assert.match(f.document.getElementById('shareStatus').textContent, /скопирована/);
        // Edits after creating the link cannot alter the saved task.
        f.app.elements.codeEditor.value = 'другая{}';
        reopened = await openApp('../dist/index.html', { url: href });
        assert.equal(reopened.app.elements.codeEditor.value, program);
        assert.equal(reopened.app.robot.x, 0);
        assert.equal(reopened.app.robot.y, 0);
        assert.equal(reopened.app.robot.direction, 1);
        assert.equal(reopened.app.field.isTarget(1, 0), true);
        assert.equal(reopened.app.field.isBase(2, 0), true);
        assert.equal(reopened.app.field.painted.size, 0);
        assert.equal(f.app.robot.x, 1);
        assert.equal(f.app.field.isPainted(1, 0), true);
        f.document.getElementById('closeShareTaskBtn').click();
        assert.equal(f.document.getElementById('shareTaskDialog').open, false);
    } finally {
        await reopened?.close();
        await f.close();
    }
});

test('opening another fragment link in the same tab cancels the old run and loads the new program', async () => {
    const f = await openApp('../dist/index.html', { url: 'https://hvost239.github.io/executor/' });
    try {
        f.app.elements.codeEditor.value = 'main{int n;input n;}';
        f.app.elements.runBtn.click();
        await settle();
        assert.ok(f.document.querySelector('.program-input'));
        f.window.location.hash = new URLSearchParams({ program: 'Новая{выводстр 42;}' }).toString();
        f.window.dispatchEvent(new f.window.HashChangeEvent('hashchange'));
        await settle();
        assert.equal(f.app.elements.codeEditor.value, 'Новая{выводстр 42;}');
        assert.equal(f.app.interpreter.isRunning, false);
        assert.equal(f.document.querySelector('.program-input'), null);
        assert.equal(f.app.field.size, 8);
        f.app.elements.runBtn.click();
        await settle();
        assert.equal(f.document.querySelector('.program-output').textContent, '42\n');
    } finally {
        await f.close();
    }
});

test('sharing supports manual copying when clipboard access is unavailable', async () => {
    const f = await openApp();
    try {
        f.document.getElementById('shareTaskBtn').click();
        assert.equal(f.document.getElementById('localShareHint').hidden, false);
        f.window.navigator.clipboard.writeText = async () => {
            throw new Error('denied');
        };
        f.document.getElementById('copyTaskLinkBtn').click();
        await settle();
        const link = f.document.getElementById('taskLink');
        assert.equal(f.document.activeElement, link);
        assert.equal(link.selectionStart, 0);
        assert.equal(link.selectionEnd, link.value.length);
        assert.match(f.document.getElementById('shareStatus').textContent, /вручную/);
        assert.equal(f.document.getElementById('copyTaskLinkBtn').disabled, false);
        // App shortcuts should not run code or reset a task while copying its URL.
        f.document.dispatchEvent(
            new f.window.KeyboardEvent('keydown', { key: 'F5', bubbles: true })
        );
        assert.equal(f.app.interpreter.session, null);
    } finally {
        await f.close();
    }
});

test('a newly shared link replaces an earlier build version while preserving other parameters', async () => {
    const f = await openApp('../dist/index.html', {
        url: 'https://hvost239.github.io/executor/?v=old-build&course=1',
    });
    try {
        f.document.getElementById('shareTaskBtn').click();
        const url = new URL(f.document.getElementById('taskLink').value);
        assert.equal(url.searchParams.get('v'), f.document.documentElement.dataset.build);
        assert.notEqual(url.searchParams.get('v'), 'old-build');
        assert.equal(url.searchParams.get('course'), '1');
        assert.ok(new URLSearchParams(url.hash.slice(1)).has('maze'));
    } finally {
        await f.close();
    }
});

test('an invalid task link shows an error and leaves the initial editor and field intact', async () => {
    const url =
        'https://hvost239.github.io/executor/?' +
        new URLSearchParams({
            maze: 'bad maze',
            program: 'поврежденная задача{}',
        });
    const f = await openApp('../dist/index.html', { url });
    try {
        assert.equal(f.app.field.size, 8);
        assert.equal(f.app.elements.codeEditor.value, '');
        assert.match(f.app.elements.consoleOutput.textContent, /Не удалось загрузить задачу/);
        assert.equal(f.app.elements.runBtn.disabled, false);
    } finally {
        await f.close();
    }
});

test('Save Code downloads original .prg bytes and leaves the editor untouched', async () => {
    const f = await openApp();
    try {
        const source = 'Решение\n{\n    выводстр "Привет, ёж!";\n}';
        f.app.elements.codeEditor.value = source;
        let savedBlob, savedName, savedURL;
        const revoked = [];
        f.window.URL.createObjectURL = (blob) => {
            savedBlob = blob;
            return 'blob:program-file';
        };
        f.window.URL.revokeObjectURL = (url) => revoked.push(url);
        f.window.HTMLAnchorElement.prototype.click = function () {
            savedName = this.download;
            savedURL = this.href;
        };
        f.document.getElementById('saveCodeBtn').click();
        assert.equal(f.document.getElementById('saveProgramDialog').open, true);
        assert.equal(f.document.getElementById('programFilename').value, 'Решение.prg');
        f.document
            .getElementById('saveProgramForm')
            .dispatchEvent(new f.window.Event('submit', { cancelable: true }));
        assert.equal(savedName, 'Решение.prg');
        assert.equal(savedURL, 'blob:program-file');
        const bytes = new Uint8Array(await savedBlob.arrayBuffer());
        assert.equal(new TextDecoder('windows-1251').decode(bytes), source.replace(/\n/g, '\r\n'));
        assert.equal(f.app.elements.codeEditor.value, source);
        assert.equal(f.document.querySelector('a[download]'), null);
        f.window.dispatchEvent(new f.window.Event('pagehide'));
        assert.deepEqual(revoked, ['blob:program-file']);
        f.document.getElementById('closeSaveProgramBtn').click();
        assert.equal(f.document.getElementById('saveProgramDialog').open, false);
    } finally {
        await f.close();
    }
});

test('save shortcut opens the dialog and UTF-8 can save text unsupported by the original format', async () => {
    const f = await openApp();
    try {
        const source = 'Робот{выводстр "🤖";}';
        f.app.elements.codeEditor.value = source;
        let savedBlob;
        f.window.URL.createObjectURL = (blob) => {
            savedBlob = blob;
            return 'blob:unicode-file';
        };
        f.window.URL.revokeObjectURL = () => {};
        f.window.HTMLAnchorElement.prototype.click = () => {};
        const shortcut = new f.window.KeyboardEvent('keydown', {
            code: 'KeyS',
            metaKey: true,
            bubbles: true,
            cancelable: true,
        });
        f.app.elements.codeEditor.dispatchEvent(shortcut);
        assert.equal(shortcut.defaultPrevented, true);
        assert.equal(f.document.getElementById('saveProgramDialog').open, true);
        const submit = () =>
            f.document
                .getElementById('saveProgramForm')
                .dispatchEvent(new f.window.Event('submit', { cancelable: true }));
        submit();
        assert.equal(savedBlob, undefined);
        assert.match(f.document.getElementById('saveProgramStatus').textContent, /Выберите UTF-8/);
        f.document.getElementById('programEncoding').value = 'utf-8';
        submit();
        assert.equal(new TextDecoder().decode(await savedBlob.arrayBuffer()), source);
        assert.equal(f.app.elements.codeEditor.value, source);
    } finally {
        await f.close();
    }
});

test('Format button and keyboard shortcut update the editor and line numbers', async () => {
    const f = await openApp();
    try {
        const editor = f.app.elements.codeEditor;
        editor.value = 'main{println "Привет";}';
        f.app.elements.formatCodeBtn.click();
        assert.equal(editor.value, 'main\n{\n    println "Привет";\n}\n');
        assert.equal(f.app.elements.lineNumbers.children.length, 5);
        assert.equal(f.document.activeElement, editor);
        editor.value = 'main{println 1+2;}';
        editor.dispatchEvent(
            new f.window.KeyboardEvent('keydown', {
                key: 'F',
                code: 'KeyF',
                altKey: true,
                shiftKey: true,
                bubbles: true,
                cancelable: true,
            })
        );
        assert.equal(editor.value, 'main\n{\n    println 1 + 2;\n}\n');
        f.app.elements.runBtn.click();
        await settle();
        assert.equal(f.document.querySelector('.program-output').textContent, '3\n');
    } finally {
        await f.close();
    }
});
test('Format preserves invalid text and cannot modify an active program', async () => {
    const f = await openApp();
    try {
        const editor = f.app.elements.codeEditor;
        editor.value = 'main { println "not closed';
        f.app.elements.formatCodeBtn.click();
        assert.equal(editor.value, 'main { println "not closed');
        assert.match(f.app.elements.consoleOutput.textContent, /Не удалось отформатировать/);
        editor.value = 'main{int x;input x;}';
        f.app.elements.runBtn.click();
        await settle();
        assert.equal(f.app.elements.formatCodeBtn.disabled, true);
        f.app.formatEditor();
        assert.equal(editor.value, 'main{int x;input x;}');
        f.app.elements.stopBtn.click();
        await settle();
        assert.equal(f.app.elements.formatCodeBtn.disabled, false);
        f.app.elements.formatCodeBtn.click();
        assert.equal(editor.value, 'main\n{\n    int x;\n    input x;\n}\n');
    } finally {
        await f.close();
    }
});

test('offline bundle initializes through the actual HTML and runs through the Run button', async () => {
    const f = await openApp();
    try {
        assert.ok(f.app);
        for (const node of f.document.querySelectorAll('script[src],link[href]'))
            assert.doesNotMatch(
                node.getAttribute('src') ?? node.getAttribute('href'),
                /^(https?:)?\/\//
            );
        f.app.elements.codeEditor.value =
            'main { println fact(5); } int fact(int n) { if(n<=1) return 1; return n*fact(n-1); }';
        f.app.elements.runBtn.click();
        await settle();
        assert.equal(f.document.querySelector('.program-output').textContent, '120\n');
        assert.equal(f.app.elements.statusMessage.textContent, 'Выполнено!');
        assert.equal(f.app.elements.runBtn.disabled, false);
    } finally {
        await f.close();
    }
});
for (const entry of ['../index.html', '../dist/index.html']) {
    test(`${entry} initializes and loads a maze through the file input`, async () => {
        const f = await openApp(entry);
        try {
            assert.ok(f.app);
            const input = f.app.elements.mazeFileInput;
            let pickerClicks = 0;
            input.addEventListener('click', () => pickerClicks++);
            f.app.elements.loadMazeBtn.click();
            assert.equal(pickerClicks, 1);

            const file = new f.window.File(['...\r\n.B.\r\n.w.\r\n'], 'sample.maz');
            for (let attempt = 0; attempt < 2; attempt++) {
                const previousField = f.app.field;
                const selection = new f.window.DataTransfer();
                selection.items.add(file);
                input.files = selection.files;
                input.dispatchEvent(new f.window.Event('change', { bubbles: true }));
                await f.window.happyDOM.waitUntilComplete();
                assert.notEqual(f.app.field, previousField);
                assert.equal(f.app.field.size, 3);
                assert.equal(f.app.field.isWall(1, 2), true);
                assert.equal(f.app.robot.isOnBase(), true);
                assert.equal(f.app.robot.field, f.app.field);
                assert.equal(f.app.renderer.field, f.app.field);
                assert.match(f.app.elements.consoleOutput.textContent, /sample\.maz.*загружен/);
                assert.equal(input.value, ''); // The same file can be selected again.
            }
        } finally {
            await f.close();
        }
    });
}
test('console input submits a value, preserves output fragments and cancels on Stop', async () => {
    const f = await openApp();
    try {
        f.app.elements.codeEditor.value = 'main { int n; print "n="; input n; coutln << n*2; }';
        f.app.elements.runBtn.click();
        await settle();
        let form = f.document.querySelector('.program-input');
        assert.ok(form);
        assert.equal(f.app.elements.runBtn.disabled, true);
        // Clearing diagnostics must not remove the pending input form.
        f.app.elements.clearConsoleBtn.click();
        assert.ok(form.isConnected);
        form.querySelector('input').value = '7';
        form.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
        await settle();
        assert.equal(f.document.querySelector('.program-output').textContent, '14\n');
        f.app.elements.runBtn.click();
        await settle();
        assert.ok(f.document.querySelector('.program-input'));
        f.app.elements.stopBtn.click();
        await settle();
        assert.equal(f.document.querySelector('.program-input'), null);
        assert.equal(f.app.elements.runBtn.disabled, false);
        assert.equal(f.app.elements.statusMessage.textContent, 'Остановлено');
    } finally {
        await f.close();
    }
});
test('maze import and applying the editor preserve the base', async () => {
    const f = await openApp();
    try {
        f.app.parseMazeFile('...\r\n.B.\r\n...\r\n', 'sample.maz');
        f.app.elements.editFieldBtn.click();
        f.app.elements.applyFieldBtn.click();
        assert.equal(f.app.field.isBase(1, 1), true);
        assert.equal(f.app.robot.isOnBase(), true);
    } finally {
        await f.close();
    }
});
test('Step errors retain the error status instead of claiming success', async () => {
    const f = await openApp();
    try {
        f.app.elements.codeEditor.value = 'main { посади; }';
        f.app.elements.stepBtn.click();
        await settle();
        assert.equal(f.app.elements.statusMessage.textContent, 'Ошибка!');
        assert.match(f.app.elements.consoleOutput.textContent, /нет грядки/);
    } finally {
        await f.close();
    }
});
