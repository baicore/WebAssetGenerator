# WebAssetGenerator

A lightweight, config-driven CLI build tool for web projects: TypeScript → browser JavaScript (via [esbuild](https://esbuild.github.io)) and Tailwind CSS → CSS (via the Tailwind CLI installed in *your* project).

```bash
npm install -D webassetgenerator typescript tailwindcss @tailwindcss/cli
```

`typescript`, `tailwindcss` and `@tailwindcss/cli` come from *your* project, so you control their versions.

`webassetgenerator.config.ts`:

```ts
import { defineConfig } from "webassetgenerator";

export default defineConfig({
    typescript: { input: "./src/**/*.ts", output: "./dist" },
    tailwind: { input: "./src/styles.css", output: "./dist/styles.css" },
});
```

## Commands

| Command | |
|---|---|
| `webassetgenerator build` | Build once; exits with code 1 on errors |
| `webassetgenerator dev` | Build, then rebuild on changes |
| `webassetgenerator clean` | Delete generated files (never whole directories) |
| `webassetgenerator --help` / `--version` | |

`wag` is a short alias for `webassetgenerator` (e.g. `wag build`).

`-c, --config <file>` selects a different config file.

## Options

`typescript`: `input` (file or glob(s)), `output` (dir), `target` (default `es2022`), `sourcemap`, `minify`, `typecheck` (default: on if `typescript` is installed).
`tailwind`: `input`, `output`, `minify`.

The directory structure below the glob's base is preserved (`src/components/button.ts` → `dist/components/button.js`). No bundling.

## Type checking

TypeScript is transpiled file by file with esbuild. Before emitting, WebAssetGenerator type-checks the inputs with the project's `typescript` package, using its `tsconfig.json` if present (otherwise strict, browser-oriented defaults). Type errors fail the build and nothing is emitted:

```text
✗ Failed to compile src/main.ts

TS2322: Type 'string' is not assignable to type 'number'.

  src/main.ts:12:5
```

Disable with `typecheck: false`.

## Dev mode

- Only the affected transformer rebuilds; changed TypeScript files are recompiled individually.
- Deleting a source file removes its output.
- Changing `webassetgenerator.config.ts` reloads the config and rebuilds (an invalid config is reported and the previous one stays active).

## Notes

- Generated files are never written over sources.
- Config options are validated; typos such as `minfy` are reported.

## Architecture

```
src/cli        commands
src/config     defineConfig, loader, types
src/core       pipeline, Transformer interface, context, logger
src/transformers  typescript (esbuild), tailwind (CLI)
src/watcher    recursive fs watcher → per-transformer rebuild
```

A transformer implements `build(ctx, changed?)`, `watchPatterns(ctx)` and `outputs(ctx)`; add new ones in `createTransformers` without touching the rest of the core.
