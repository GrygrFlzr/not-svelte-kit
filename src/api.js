import * as api from '@sveltejs/kit/api';
import { load_config } from './load_config/index.js';

/**********************************
 * Replicate @sveltejs/kit exports
 **********************************/

/**
 * @async
 * @type {(config: Record<string, any>) => void}
 */
const build = api.build;

/**
 * @type {(opts: { port: any, config: any }) => Promise<unknown>}
 */
const dev = api.dev;

/**
 * @async
 * @type {({
 *  paths,
 *  target,
 *  host,
 *  session,
 *  preloaded,
 *  error,
 *  status,
 * }) => void}
 */
const start = api.start;

export { build, dev, load_config, start };
