# webforge

A lightweight, config-driven CLI build tool for web projects: TypeScript → browser JavaScript (via [esbuild](https://esbuild.github.io)) and Tailwind CSS → CSS (via the Tailwind CLI installed in *your* project).

```bash
npm install -D webforge tailwindcss @tailwindcss/cli
```

`webforge.config.ts`:

```ts
import { defineConfig } from "webforge";

export default defineConfig({
    typescript: { input: "./src/**/*.ts", output: "./dist" },
    tailwind: { input: "./src/styles.css", output: "./dist/styles.css" },
});
```

## Commands

| Command | |
|---|---|
| `webforge build` | Build once; exits with code 1 on errors |
| `webforge dev` | Build, then rebuild on changes |
| `webforge clean` | Delete generated files (never whole directories) |
| `webforge --help` / `--version` | |

`-c, --config <file>` selects a different config file.

## Options

`typescript`: `input` (file or glob(s)), `output` (dir), `target` (default `es2022`), `sourcemap`, `minify`.
`tailwind`: `input`, `output`, `minify`.

The directory structure below the glob's base is preserved (`src/components/button.ts` → `dist/components/button.js`). No bundling.

## Notes

- TypeScript is **transpiled only** (esbuild); it is not type-checked. Run `tsc --noEmit` for type checks.
- In `dev`, deleting a source file does not remove its output; use `webforge clean`.
- Generated files are never written over sources.

## Architecture

```
src/cli        commands
src/config     defineConfig, loader, types
src/core       pipeline, Transformer interface, context, logger
src/transformers  typescript (esbuild), tailwind (CLI)
src/watcher    recursive fs watcher → per-transformer rebuild
```

A transformer implements `build(ctx, changed?)`, `watchPatterns(ctx)` and `outputs(ctx)`; add new ones in `createTransformers` without touching the rest of the core.
