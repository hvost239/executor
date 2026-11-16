import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { KEYWORDS } from './keywords.js';
import { BUILTIN_NAMES, KEYWORD_NAMES } from './vocabulary.js';
import { builtins } from '../runtime/builtins.js';

/** Replace language tokens, retaining all source gaps, comments, strings and declared names. */
export function translateCode(source, language) {
    if (!['ru', 'en'].includes(language)) throw new Error('Неизвестный язык команд');
    const tokens = new Lexer().tokenize(source);
    if (!tokens.length) return source;
    const program = new Parser().parse(tokens);
    const declared = new Set();
    const preserveCalls = new Set();
    function collect(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Procedure') {
            declared.add(node.name);
            node.parameters.forEach((parameter) => declared.add(parameter.name));
        }
        if (node.type === 'Declaration')
            node.declarations.forEach((item) => declared.add(item.name));
        if (node.type === 'Call') {
            const target = BUILTIN_NAMES.get(node.name)?.[language];
            // Some original aliases also accept graphical arguments, unlike Robot commands.
            if (target && !builtins.get(target).arity.includes(node.arguments.length))
                preserveCalls.add(node.loc.offset);
        }
        for (const [key, child] of Object.entries(node)) {
            if (key === 'loc') continue;
            if (Array.isArray(child)) child.forEach(collect);
            else if (child && typeof child === 'object') collect(child);
        }
    }
    program.items.forEach(collect);
    let result = '',
        offset = 0;
    for (const token of tokens) {
        let replacement = token.image;
        if (token.tokenType.name === 'Identifier') {
            if (!declared.has(token.image) && !preserveCalls.has(token.startOffset))
                replacement = BUILTIN_NAMES.get(token.image)?.[language] ?? replacement;
        } else {
            const names = KEYWORD_NAMES[KEYWORDS.get(token.image.toLowerCase())];
            if (names) replacement = names[language === 'ru' ? 0 : 1];
        }
        result += source.slice(offset, token.startOffset) + replacement;
        offset = token.endOffset + 1;
    }
    return result + source.slice(offset);
}
