/** One history for typing and application edits; each entry also restores the selection. */
export class EditHistory {
    constructor(limit = 100) {
        this.limit = limit;
        this.clear();
    }

    clear() {
        this.past = [];
        this.future = [];
    }

    breakGroup() {
        if (this.past.length) this.past.at(-1).group = null;
    }

    record(before, after, group = null, time = Date.now()) {
        if (before.value === after.value) return;
        let last = this.past.at(-1);
        if (last && last.after.value !== before.value) {
            this.clear();
            last = null;
        }
        const merge =
            group &&
            last?.group === group &&
            time - last.time < 750 &&
            before.start === before.end &&
            last.after.start === before.start &&
            last.after.end === before.end;
        if (merge) Object.assign(last, { after, time });
        else this.past.push({ before, after, group, time });
        if (this.past.length > this.limit) this.past.shift();
        this.future = [];
    }

    undo(current) {
        this.breakGroup();
        const entry = this.past.at(-1);
        if (!entry || entry.after.value !== current.value) return null;
        this.past.pop();
        entry.after = current;
        this.future.push(entry);
        return entry.before;
    }

    redo(current) {
        const entry = this.future.at(-1);
        if (!entry || entry.before.value !== current.value) return null;
        this.future.pop();
        entry.before = current;
        this.past.push(entry);
        return entry.after;
    }
}
