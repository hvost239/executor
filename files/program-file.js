import { Lexer } from '../language/lexer.js';
import { Parser } from '../language/parser.js';

const windows1251Bytes = new Map();
const decoder = new TextDecoder('windows-1251');
for (let byte = 0; byte < 256; byte++) {
    const character = decoder.decode(Uint8Array.of(byte));
    if (character !== '\uFFFD') windows1251Bytes.set(character, byte);
}

export function programFilename(name) {
    const safe = name
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/[. ]+$/g, '');
    const stem = safe.replace(/\.prg$/i, '') || 'program';
    // Windows reserves these filenames even when an extension is present.
    const prefix = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? '_' : '';
    return `${prefix}${stem}.prg`;
}

export function suggestProgramFilename(source) {
    try {
        const program = new Parser().parse(new Lexer().tokenize(source));
        return programFilename(program.procedures[0].name);
    } catch {
        return 'program.prg';
    }
}

/** Original .prg files are plain Windows-1251 text with CRLF and no BOM. */
export function encodeProgramFile(source, encoding = 'windows-1251') {
    const text = source.replace(/\r\n|\r|\n/g, '\r\n');
    if (encoding === 'utf-8') return new TextEncoder().encode(text);
    if (encoding !== 'windows-1251') throw new Error('Неизвестная кодировка программы');
    const bytes = [];
    for (const character of text) {
        const byte = windows1251Bytes.get(character);
        if (byte === undefined) {
            throw new Error(
                `Символ «${character}» не входит в Windows-1251. Выберите UTF-8, чтобы сохранить его.`
            );
        }
        bytes.push(byte);
    }
    return Uint8Array.from(bytes);
}
