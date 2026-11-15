export function abortError() {
    return new DOMException('Выполнение остановлено', 'AbortError');
}
export function withAbort(promise, signal) {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
        const abort = () => {
            cleanup();
            reject(abortError());
        };
        const cleanup = () => signal.removeEventListener('abort', abort);
        signal.addEventListener('abort', abort, { once: true });
        Promise.resolve(promise).then(
            (value) => {
                cleanup();
                resolve(value);
            },
            (error) => {
                cleanup();
                reject(error);
            }
        );
    });
}
export function delay(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(abortError());
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, milliseconds);
        signal?.addEventListener('abort', abort, { once: true });
    });
}
