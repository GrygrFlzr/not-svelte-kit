import colors from 'kleur';
import { pathToFileURL } from 'url';
import { join } from 'path';
import { importMetaResolve } from 'import-meta-resolve';
import Builder from './Builder.js';

// adapt is not exposed by the API
// gotta use this bodge instead
const adapt_path = join(
    process.cwd(),
    'node_modules',
    '@sveltejs',
    'kit',
    'dist',
    'index6.js'
);
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
 * @param {Promise<Record<string, any>>} config
 * @param {{ verbose: boolean }}
 */
export async function adapt(config, { verbose }) {
    const { l: logger } = await import(pathToFileURL(utils_path));
    // const { adapt: kit_adapt } = await import(pathToFileURL(adapt_path));
    // const resolved_config = await config;
    // return await kit_adapt(resolved_config, { verbose });
    const resolved_config = await config;
    const [adapter, options] = resolved_config.adapter;

    if (!adapter) {
        throw new Error('No adapter specified');
    }

    const log = logger({ verbose });

    console.log(colors.bold().cyan(`\n> Using ${adapter}`));

    const builder = new Builder({
        generated_files: '.svelte/build/optimized',
        config: resolved_config,
        log,
    });

    const resolved = await importMetaResolve(
        join(adapter, 'index.js'),
        process.cwd() //pathToFileURL(process.cwd())
    );
    const { default: fn } = await import(resolved);
    await fn(builder, options);

    log.success('done');
}
