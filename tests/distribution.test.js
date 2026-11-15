import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Window } from 'happy-dom';

test('the Pages artifact contains its scripts and styles under the repository URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'executor-pages-'));
    const siteURL = new URL('https://hvost239.github.io/executor/');
    const window = new Window({
        url: siteURL.href,
        settings: {
            disableJavaScriptFileLoading: true,
            disableCSSFileLoading: true,
        },
    });
    try {
        // Only dist is uploaded to Pages: no access to the source tree or node_modules.
        await cp(new URL('../dist/', import.meta.url), directory, { recursive: true });
        window.document.write(await readFile(join(directory, 'index.html'), 'utf8'));
        window.document.close();
        await window.happyDOM.waitUntilComplete();

        assert.ok(window.document.querySelector('script[src]'));
        assert.ok(window.document.querySelector('link[rel="stylesheet"]'));
        for (const node of window.document.querySelectorAll('script[src],link[href]')) {
            const resource = new URL(
                node.getAttribute('src') ?? node.getAttribute('href'),
                siteURL
            );
            assert.equal(resource.origin, siteURL.origin);
            assert.ok(resource.pathname.startsWith(siteURL.pathname));
            const filename = decodeURIComponent(resource.pathname.slice(siteURL.pathname.length));
            const content = await readFile(join(directory, filename), 'utf8');
            assert.ok(content.length, `${filename} must be included in the Pages artifact`);
        }
    } finally {
        await window.happyDOM.close();
        await rm(directory, { recursive: true, force: true });
    }
});
