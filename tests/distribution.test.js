import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Window } from 'happy-dom';

test('the Pages artifact contains both pages and their local links, scripts and styles', async () => {
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
        let version;
        // Only dist is uploaded to Pages: no access to the source tree or node_modules.
        await cp(new URL('../dist/', import.meta.url), directory, { recursive: true });
        for (const page of ['index.html', 'docs.html']) {
            const pageURL = new URL(page, siteURL);
            window.document.open();
            window.document.write(await readFile(join(directory, page), 'utf8'));
            window.document.close();
            await window.happyDOM.waitUntilComplete();
            const pageVersion = window.document.documentElement.dataset.build;
            assert.match(pageVersion, /^[a-f0-9]{16}$/);
            if (version) assert.equal(pageVersion, version);
            version = pageVersion;

            if (page === 'index.html') assert.ok(window.document.querySelector('script[src]'));
            assert.ok(window.document.querySelector('link[rel="stylesheet"]'));
            for (const node of window.document.querySelectorAll('script[src],link[href],a[href]')) {
                const resource = new URL(
                    node.getAttribute('src') ?? node.getAttribute('href'),
                    pageURL
                );
                // Links to the original author's site need not be bundled; assets must be local.
                if (node.tagName === 'A' && resource.origin !== siteURL.origin) continue;
                if (node.tagName !== 'A') {
                    assert.equal(
                        resource.searchParams.get('v'),
                        version,
                        'each script and stylesheet must bypass assets cached from a previous deployment'
                    );
                }
                assert.equal(resource.origin, siteURL.origin);
                assert.ok(resource.pathname.startsWith(siteURL.pathname));
                const filename = decodeURIComponent(
                    resource.pathname.slice(siteURL.pathname.length)
                );
                const content = await readFile(join(directory, filename), 'utf8');
                assert.ok(content.length, `${filename} must be included in the Pages artifact`);
                if (filename === page && resource.hash) {
                    assert.ok(
                        window.document.getElementById(decodeURIComponent(resource.hash.slice(1))),
                        `${page}: missing anchor ${resource.hash}`
                    );
                }
            }
        }
    } finally {
        await window.happyDOM.close();
        await rm(directory, { recursive: true, force: true });
    }
});
