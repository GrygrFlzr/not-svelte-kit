import { mkdirSync, statSync, readdirSync, copyFileSync } from 'fs';
import { basename, join, dirname } from 'path';

function mkdirp(dir) {
    try {
        mkdirSync(dir, { recursive: true });
    } catch (e) {
        if (e.code === 'EEXIST') return;
        throw e;
    }
}

function copy(from, to, filter = () => true) {
    if (!filter(basename(from))) return [];

    const files = [];
    const stats = statSync(from);

    if (stats.isDirectory()) {
        readdirSync(from).forEach((file) => {
            files.push(...copy(join(from, file), join(to, file)));
        });
    } else {
        mkdirp(dirname(to));
        copyFileSync(from, to);
        files.push(to);
    }

    return files;
}

export { copy, mkdirp };
