import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

async function openApp(entry = '../dist/index.html') {
    // Only our own built application is evaluated; student text is handled by Runtime.
    const pageURL = new URL(entry, import.meta.url);
    const window = new Window({
        url: pageURL.href,
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
