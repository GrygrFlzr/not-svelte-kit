## Current support

-   `@sveltejs/kit:`
    -   `1.0.0-next.32`
    -   `1.0.0-next.33`
    -   `1.0.0-next.34`

# What is this?

Version `1.0.0-next.32` of `@sveltejs/kit` broke a number of things:

-   Doesn't run on Windows because of ESM imports using non-URI paths
-   <del>Breaks with existing adapters</del>
    Fixed in `1.0.0-next.34`
-   Adapt process also doesn't run on Windows
-   Application dependencies are being imported as if they were dependencies of `@sveltejs/kit` (and thus failing)

This is an **UNOFFICIAL** compatibility wrapper around the CLI to work around those issues.

It is intended as a temporary drop-in substitute to the `svelte-kit` CLI.

## Usage

```sh
npm i -D not-svelte-kit
```

Replace executions of `svelte-kit` with `not-svelte-kit` in your `package.json` scripts:

```json
"scripts": {
    "dev": "not-svelte-kit dev",
    "build": "not-svelte-kit build",
    "start": "not-svelte-kit start"
},
```

`npx not-svelte-kit adapt` is also supported.

This bodge brought to you by [SK Incognito](https://discord.gg/j7NhbT2DSY).
