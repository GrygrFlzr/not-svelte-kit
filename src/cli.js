import { existsSync } from 'fs';
import sade from 'sade';
import colors from 'kleur';
import { adapt, build, dev, load_config, start } from './api/index.js';

const pkg = {
    version: '1.0.0-next.32',
};

function get_config() {
    try {
        return load_config();
    } catch (error) {
        let message = error.message;

        if (error.code === 'MODULE_NOT_FOUND') {
            if (existsSync('svelte.config.js')) {
                // TODO this is temporary, for the benefit of early adopters
                message =
                    'You must rename svelte.config.js to svelte.config.cjs, and snowpack.config.js to snowpack.config.cjs';
            } else {
                message = 'Missing svelte.config.cjs';
            }
        } else if (error.name === 'SyntaxError') {
            message = 'Malformed svelte.config.cjs';
        }

        console.error(colors.bold().red(message));
        console.error(colors.grey(error.stack));
        process.exit(1);
    }
}

function handle_error(error) {
    console.log(colors.bold().red(`> ${error.message}`));
    console.log(colors.gray(error.stack));
    process.exit(1);
}

async function launch(port) {
    const { exec } = await import('child_process');
    exec(
        `${
            process.platform == 'win32' ? 'start' : 'open'
        } http://localhost:${port}`
    );
}

const prog = sade('not-svelte-kit').version(pkg.version);

prog.command('dev')
    .describe('Start a development server')
    .option('-p, --port', 'Port', 3000)
    .option('-o, --open', 'Open a browser tab', false)
    .action(async ({ port, open }) => {
        process.env.NODE_ENV = 'development';
        const config = await get_config();

        // const { dev } = await import('./api/dev');

        try {
            const watcher = await dev({ port, config });

            watcher.on('stdout', (data) => {
                process.stdout.write(data);
            });

            watcher.on('stderr', (data) => {
                process.stderr.write(data);
            });

            console.log(
                colors
                    .bold()
                    .cyan(`> Listening on http://localhost:${watcher.port}`)
            );
            if (open) launch(watcher.port);
        } catch (error) {
            handle_error(error);
        }
    });

prog.command('build')
    .describe('Create a production build of your app')
    .action(async () => {
        process.env.NODE_ENV = 'production';
        const config = await get_config();

        // const { build } = await import('./api/build');

        try {
            await build(config);
        } catch (error) {
            handle_error(error);
        }
    });

prog.command('start')
    .describe('Serve an already-built app')
    .option('-p, --port', 'Port', 3000)
    .option('-o, --open', 'Open a browser tab', false)
    .action(async ({ port, open }) => {
        process.env.NODE_ENV = 'production';
        const config = await get_config();

        // const { start } = await import('./api/start');

        try {
            await start({ port, config });

            console.log(
                colors.bold().cyan(`> Listening on http://localhost:${port}`)
            );
            if (open) if (open) launch(port);
        } catch (error) {
            handle_error(error);
        }
    });

prog.command('adapt')
    .describe('Customise your production build for different platforms')
    .option('--verbose', 'Log more stuff', false)
    .action(async ({ verbose }) => {
        process.env.NODE_ENV = 'production';
        const config = get_config();

        // const { adapt } = await import('./api/adapt');

        try {
            await adapt(config, { verbose });
        } catch (error) {
            handle_error(error);
        }
    });

prog.parse(process.argv, { unknown: (arg) => `Unknown option: ${arg}` });
