import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse, pathToFileURL, URLSearchParams } from 'url';
import { EventEmitter } from 'events';
import CheapWatch from 'cheap-watch';
import { scorta } from 'scorta/sync';
import * as ports from 'port-authority';
import sirv from 'sirv';
import amp_validator from 'amphtml-validator';
import { createServer } from 'http';
import snowpack from 'snowpack';
import create_manifest_data from '../../core/create_manifest_data.js';
import { create_app } from '../../core/create_app.js';
import loader from './loader.js';
import { mkdirp } from '@sveltejs/app-utils/files';
import { render } from '../../renderer.js';
import { get_body } from '@sveltejs/app-utils/http';
import { copy_assets } from '../utils.js';
import { sourcemap_stacktrace } from './sourcemap_stacktrace.js';

export function dev(opts) {
    return new Watcher(opts).init();
}

class Watcher extends EventEmitter {
    constructor({ port, config }) {
        super();

        this.cachedir = scorta('svelte');
        this.port = port;
        this.config = config;
        this.update();

        process.env.NODE_ENV = 'development';

        process.on('exit', () => {
            this.close();
        });
    }

    async init() {
        mkdirp('.svelte');

        copy_assets();

        // TODO use import.meta.env.SSR upon resolution of https://github.com/snowpackjs/snowpack/discussions/1889
        // prettier-ignore
        writeFileSync('.svelte/assets/runtime/app/env.js', [
            'export const browser = typeof window !== "undefined";',
            'export const dev = true;',
            `export const amp = ${this.config.amp};`
        ].join('\n'));

        await this.init_filewatcher();
        await this.init_snowpack();
        await this.init_server();

        return this;
    }

    async init_filewatcher() {
        this.cheapwatch = new CheapWatch({
            dir: this.config.files.routes,
            filter: ({ path }) =>
                path.split('/').every((part) => !part.startsWith('_')),
        });

        await this.cheapwatch.init();

        // not sure why TS doesn't understand that CheapWatch extends EventEmitter
        this.cheapwatch.on('+', ({ isNew }) => {
            if (isNew) this.update();
        });

        this.cheapwatch.on('-', () => {
            this.update();
        });
    }

    async init_snowpack() {
        process.env.SVELTE_KIT_APP_DIR = this.config.appDir;

        this.snowpack_port = await ports.find(this.port + 1);
        this.snowpack_config = await snowpack.loadConfiguration(
            {
                devOptions: { port: this.snowpack_port },
            },
            'snowpack.config.cjs'
        );

        this.snowpack_config.mount[resolve('.svelte/assets')] = {
            url: `/${this.config.appDir}/assets`,
            static: false,
            resolve: true,
        };

        this.snowpack_config.mount[resolve(this.config.files.routes)] = {
            url: `/${this.config.appDir}/routes`,
            static: false,
            resolve: true,
        };

        this.snowpack_config.mount[resolve(this.config.files.setup)] = {
            url: `/${this.config.appDir}/setup`,
            static: false,
            resolve: true,
        };

        this.snowpack = await snowpack.startServer({
            config: this.snowpack_config,
            lockfile: null,
        });

        this.load = loader(this.snowpack);
    }

    async init_server() {
        const {
            exports: { set_paths },
        } = await this.load(
            `/${this.config.appDir}/assets/runtime/internal/singletons.js`
        );
        set_paths(this.config.paths);

        const static_handler = sirv(this.config.files.assets, {
            dev: true,
        });

        const validator =
            this.config.amp && (await amp_validator.getInstance());

        this.server = createServer(async (req, res) => {
            if (req.url === '/' && req.headers.upgrade === 'websocket') {
                return this.snowpack.handleRequest(req, res);
            }

            const parsed = parse(req.url);

            static_handler(req, res, async () => {
                try {
                    await this.snowpack.handleRequest(req, res, {
                        handleError: false,
                    });
                    return;
                } catch (err) {
                    if (err.message !== 'NOT_FOUND') {
                        this.snowpack.sendResponseError(req, res, 500);
                        return;
                    }
                }

                if (req.url === '/favicon.ico') return;

                const template = readFileSync(
                    this.config.files.template,
                    'utf-8'
                );

                let setup;

                try {
                    setup = (
                        await this.load(`/${this.config.appDir}/setup/index.js`)
                    ).exports;
                } catch (err) {
                    if (err.code !== 'NOT_FOUND') throw err;
                    setup = {};
                }

                let root;

                try {
                    root = (
                        await this.load(
                            `/${this.config.appDir}/assets/generated/root.svelte.js`
                        )
                    ).exports.default;
                } catch (e) {
                    res.statusCode = 500;
                    res.end(e.stack);
                    return;
                }

                const body = await get_body(req);

                const rendered = await render(
                    {
                        headers: req.headers,
                        method: req.method,
                        path: parsed.pathname,
                        query: new URLSearchParams(parsed.query),
                        body,
                    },
                    {
                        paths: this.config.paths,
                        template: ({ head, body }) => {
                            let rendered = template
                                .replace('%svelte.head%', () => head)
                                .replace('%svelte.body%', () => body);

                            if (this.config.amp) {
                                const result = validator.validateString(
                                    rendered
                                );

                                if (result.status !== 'PASS') {
                                    const lines = rendered.split('\n');

                                    const escape = (str) =>
                                        str
                                            .replace(/&/g, '&amp;')
                                            .replace(/</g, '&lt;')
                                            .replace(/>/g, '&gt;');

                                    rendered = `<!doctype html>
										<head>
											<meta charset="utf-8" />
											<meta name="viewport" content="width=device-width, initial-scale=1" />
											<style>
												body {
													font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
													color: #333;
												}

												pre {
													background: #f4f4f4;
													padding: 1em;
													overflow-x: auto;
												}
											</style>
										</head>
										<h1>AMP validation failed</h1>

										${result.errors
                                            .map(
                                                (error) => `
											<h2>${error.severity}</h2>
											<p>Line ${error.line}, column ${error.col}: ${error.message} (<a href="${
                                                    error.specUrl
                                                }">${error.code}</a>)</p>
											<pre>${escape(lines[error.line - 1])}</pre>
										`
                                            )
                                            .join('\n\n')}
									`;
                                }
                            }

                            return rendered.replace(
                                '</head>',
                                `
									<script>window.HMR_WEBSOCKET_URL = \`ws://\${location.hostname}:${this.snowpack_port}\`;</script>
									<script type="module" src="/_snowpack/hmr-client.js"></script>
									<script type="module" src="/_snowpack/hmr-error-overlay.js"></script>
								</head>`.replace(/^\t{6}/gm, '')
                            );
                        },
                        manifest: this.manifest,
                        target: this.config.target,
                        entry: 'assets/runtime/internal/start.js',
                        dev: true,
                        amp: this.config.amp,
                        root,
                        setup,
                        only_prerender: false,
                        start_global: this.config.startGlobal,
                        app_dir: this.config.appDir,
                        host: this.config.host,
                        host_header: this.config.hostHeader,
                        get_stack: (error) =>
                            sourcemap_stacktrace(
                                error.stack,
                                async (address) => {
                                    if (existsSync(address)) {
                                        // it's a filepath
                                        return readFileSync(address, 'utf-8');
                                    }

                                    try {
                                        const {
                                            contents,
                                        } = await this.snowpack.loadUrl(
                                            address,
                                            {
                                                isSSR: true,
                                                encoding: 'utf8',
                                            }
                                        );
                                        return contents;
                                    } catch {
                                        // fail gracefully
                                    }
                                }
                            ),
                        get_static_file: (file) =>
                            readFileSync(join(this.config.files.assets, file)),
                        get_amp_css: (url) =>
                            this.snowpack
                                .loadUrl(url, { encoding: 'utf-8' })
                                .then(({ contents }) => contents),
                    }
                );

                if (rendered) {
                    res.writeHead(rendered.status, rendered.headers);
                    res.end(rendered.body);
                } else {
                    res.statusCode = 404;
                    res.end('Not found');
                }
            });
        });

        this.server.listen(this.port);
    }

    update() {
        const manifest_data = create_manifest_data(this.config);

        create_app({
            manifest_data,
            output: '.svelte/assets',
        });

        const common_css_deps = new Set();

        this.manifest = {
            assets: manifest_data.assets,
            layout: async () => {
                const { exports, css } = await this.load(
                    manifest_data.layout.url
                );
                css.forEach((dep) => common_css_deps.add(dep));
                return exports;
            },
            error: async () => {
                const { exports, css } = await this.load(
                    manifest_data.error.url
                );
                css.forEach((dep) => common_css_deps.add(dep));
                return exports;
            },
            pages: manifest_data.pages.map((data) => {
                // This is a bit of a hack, but it means we can inject the correct <link>
                // elements without needing to do any analysis before loading
                const css_deps = new Set();

                return {
                    pattern: data.pattern,
                    params: get_params(data.params),
                    parts: data.parts.map(({ url }) => async () => {
                        const { exports, css } = await this.load(url);
                        common_css_deps.forEach((url) => css_deps.add(url));
                        css.forEach((url) => css_deps.add(url));
                        return exports;
                    }),
                    get css() {
                        return Array.from(css_deps);
                    },
                    js: [],
                };
            }),
            endpoints: manifest_data.endpoints.map((data) => ({
                pattern: data.pattern,
                params: get_params(data.params),
                load: () => this.load(data.url).then(({ exports }) => exports),
            })),
        };
    }

    close() {
        if (this.closed) return;
        this.closed = true;

        this.server.close();
        this.cheapwatch.close();
        return this.snowpack.shutdown();
    }
}

// given an array of params like `['x', 'y', 'z']` for
// src/routes/[x]/[y]/[z]/svelte, create a function
// that turns a RexExpMatchArray into ({ x, y, z })
function get_params(array) {
    return (match) => {
        const params = {};
        array.forEach((key, i) => {
            if (key.startsWith('...')) {
                params[key.slice(3)] = decodeURIComponent(match[i + 1]).split(
                    '/'
                );
            } else {
                params[key] = decodeURIComponent(match[i + 1]);
            }
        });
        return params;
    };
}
