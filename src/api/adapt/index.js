import colors from 'kleur';
import { pathToFileURL } from 'url';
import { join } from 'path';
import Builder from './Builder.js';
import { createRequire } from 'module';

// utils is not exposed by the API
// gotta use this bodge instead
const utils_path = join(
    process.cwd(),
    'node_modules',
    '@sveltejs',
    'kit',
    'dist',
    'utils.js'
);

/**
 *
 * @param {Promise<Record<string, any>>} config_promise
 * @param {{ verbose: boolean }}
 */
export async function adapt(config_promise, { verbose }) {
    const { l: logger } = await import(pathToFileURL(utils_path));
    const config = await config_promise;
    if (!config.adapter) {
        throw new Error('No adapter specified');
    }

    const [adapter, options] = config.adapter;

    if (!adapter) {
        throw new Error('No adapter specified');
    }

    const log = logger({ verbose });

    console.log(colors.bold().cyan(`\n> Using ${adapter}`));

    const builder = new Builder({
        generated_files: '.svelte/build/optimized',
        config: config,
        log,
    });

    const require = createRequire(import.meta.url);
    const resolved = require.resolve(adapter, pathToFileURL(process.cwd()));
    const { default: fn } = await import(pathToFileURL(resolved));
    await fn(builder, options);

    log.success('done');
}
