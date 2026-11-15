import { RobotRuntimeError } from '../language/errors.js';
import { ArrayValue, convert } from './values.js';

/** A call sees its own locals and globals, never the caller's locals. */
export class Environment {
    constructor(parent = null) {
        this.parent = parent;
        this.bindings = new Map();
    }
    define(name, value) {
        this.bindings.set(name, { value });
    }
    find(name, loc) {
        if (this.bindings.has(name)) return this.bindings.get(name);
        if (this.parent) return this.parent.find(name, loc);
        throw new RobotRuntimeError(`переменная «${name}» ещё не инициализирована`, loc);
    }
    has(name) {
        return this.bindings.has(name) || Boolean(this.parent?.has(name));
    }
    get(name, loc) {
        return this.find(name, loc).value;
    }
    set(name, value, loc) {
        const binding = this.find(name, loc);
        if (binding.value instanceof ArrayValue) binding.value.setText(value, loc);
        else binding.value = convert(value, binding.value.type, loc);
    }
    snapshot() {
        return Object.fromEntries(
            [...this.bindings].map(([name, binding]) => [
                name,
                binding.value instanceof ArrayValue ? binding.value.clone() : { ...binding.value },
            ])
        );
    }
}
