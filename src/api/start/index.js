import * as fs from 'fs';
import * as http from 'http';
import { parse, pathToFileURL, URLSearchParams } from 'url';
import sirv from 'sirv';
import { join } from 'path';

// import { get_body } from '@sveltejs/app-utils/http';
// app-utils is not exposed by the API
const http_utils_path = join(
    process.cwd(),
    'node_modules',
    '@sveltejs',
    'kit',
    'dist',
    'index5.js'
);

const mutable = (dir) =>
    sirv(dir, {
        etag: true,
        maxAge: 0,
    });

export async function start({ port, config }) {
    // this is EXTREMELY fragile
    const { g: get_body } = await import(pathToFileURL(http_utils_path));

    // const app_file = resolve('.svelte/build/optimized/server/app.js');
    // const app = await import(app_file);
    const app_file_url = join(
        process.cwd(),
        '.svelte',
        'build',
        'optimized',
        'server',
        'app.js' // not cjs, for some reason?
    );
    const app = await import(pathToFileURL(app_file_url));

    const static_handler = fs.existsSync(config.files.assets)
        ? mutable(config.files.assets)
        : (_req, _res, next) => next();

    const assets_handler = sirv('.svelte/build/optimized/client', {
        maxAge: 31536000,
        immutable: true,
    });

    return new Promise((fulfil) => {
        const server = http.createServer((req, res) => {
            const parsed = parse(req.url || '');

            assets_handler(req, res, () => {
                static_handler(req, res, async () => {
                    const rendered = await app.render(
                        {
                            method: req.method,
                            headers: req.headers,
                            path: parsed.pathname,
                            body: await get_body(req),
                            query: new URLSearchParams(parsed.query || ''),
                        },
                        {
                            paths: {
                                base: '',
                                assets: '/.',
                            },
                            get_stack: (error) => error.stack, // TODO should this return a sourcemapped stacktrace?
                            get_static_file: (file) =>
                                fs.readFileSync(
                                    join(config.files.assets, file)
                                ),
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
        });

        server.listen(port, () => {
            fulfil(server);
        });

        return server;
    });
}
