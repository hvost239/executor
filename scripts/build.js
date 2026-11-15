import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
    entryPoints: ['app.js'],
    bundle: true,
    format: 'iife',
    target: ['es2022'],
    outfile: 'dist/bundle.js',
    sourcemap: true,
    legalComments: 'eof',
});
await copyFile('styles.css', 'dist/styles.css');
// The root page uses dist/bundle.js; the portable distribution keeps it beside the HTML.
const html = await readFile('index.html', 'utf8');
await writeFile('dist/index.html', html.replace('src="dist/bundle.js"', 'src="bundle.js"'));
const packages = [
    'chevrotain',
    '@chevrotain/gast',
    '@chevrotain/utils',
    '@chevrotain/regexp-to-ast',
    '@chevrotain/cst-dts-gen',
    '@chevrotain/types',
];
const notices = await Promise.all(
    packages.map(
        async (name) => `${name}\n${await readFile(`node_modules/${name}/LICENSE.txt`, 'utf8')}`
    )
);
await writeFile('dist/THIRD_PARTY_LICENSES.txt', notices.join('\n\n'));
console.log('Готово: откройте index.html или dist/index.html в браузере. Сервер не нужен.');
