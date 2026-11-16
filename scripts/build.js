import { build } from 'esbuild';
import { createHash } from 'node:crypto';
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
const files = ['index.html', 'docs.html', 'styles.css', 'docs.css', 'dist/bundle.js'];
const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
// The same inputs produce the same version; every changed page, style or script invalidates it.
const version = createHash('sha256').update(JSON.stringify(contents)).digest('hex').slice(0, 16);
function versionPage(html) {
    return html
        .replace('<html lang="ru"', `<html lang="ru" data-build="${version}"`)
        .replace('src="dist/bundle.js"', `src="bundle.js?v=${version}"`)
        .replace('href="styles.css"', `href="styles.css?v=${version}"`)
        .replace('href="docs.css"', `href="docs.css?v=${version}"`);
}
// Stable local filenames keep both file:// entry points portable; deployed URLs carry a version.
await Promise.all([
    writeFile('dist/index.html', versionPage(contents[0])),
    writeFile('dist/docs.html', versionPage(contents[1])),
    ...['styles.css', 'docs.css'].map((file) => copyFile(file, `dist/${file}`)),
]);
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
