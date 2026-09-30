import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { transform, type TransformFailure } from "esbuild";
import type { TypeScriptOptions } from "../config/types.js";
import type { BuildContext } from "../core/context.js";
import { WebforgeError } from "../core/errors.js";
import { matchInput, resolveInputs } from "../core/paths.js";
import type { BuildResult, Transformer } from "../core/transformer.js";
import { loadTypeScript, TypeChecker } from "./typecheck.js";

const EXT_MAP: Record<string, { out: string; loader: "ts" | "tsx" }> = {
    ".ts": { out: ".js", loader: "ts" },
    ".tsx": { out: ".js", loader: "tsx" },
    ".mts": { out: ".mjs", loader: "ts" },
    ".cts": { out: ".cjs", loader: "ts" },
};

const patterns = (o: TypeScriptOptions) => (Array.isArray(o.input) ? o.input : [o.input]);

async function inputs(ctx: BuildContext, o: TypeScriptOptions) {
    const all = await resolveInputs(ctx.root, patterns(o));
    return all.filter(({ file }) => isSource(ctx, o, file));
}

function isSource(ctx: BuildContext, o: TypeScriptOptions, file: string): boolean {
    const outDir = path.resolve(ctx.root, o.output);
    return path.extname(file) in EXT_MAP && !/\.d\.[cm]?ts$/.test(file) && !file.startsWith(outDir + path.sep);
}

function outputPath(ctx: BuildContext, o: TypeScriptOptions, file: string, base: string): string {
    const ext = path.extname(file);
    const rel = path.relative(base, file);
    const out = path.join(path.resolve(ctx.root, o.output), rel.slice(0, -ext.length) + EXT_MAP[ext]!.out);
    if (out === file) throw new WebforgeError(`Refusing to overwrite source file ${path.relative(ctx.root, file)}`);
    return out;
}

async function compile(ctx: BuildContext, o: TypeScriptOptions, file: string, base: string): Promise<BuildResult> {
    const rel = path.relative(ctx.root, file);
    const output = outputPath(ctx, o, file, base);
    const source = await readFile(file, "utf8");
    try {
        const result = await transform(source, {
            loader: EXT_MAP[path.extname(file)]!.loader,
            sourcefile: rel,
            format: "esm",
            target: o.target ?? "es2022",
            minify: o.minify ?? false,
            sourcemap: o.sourcemap ? "external" : false,
        });
        await mkdir(path.dirname(output), { recursive: true });
        let code = result.code;
        if (o.sourcemap) {
            code += `//# sourceMappingURL=${path.basename(output)}.map\n`;
            await writeFile(output + ".map", result.map);
        }
        await writeFile(output, code);
    } catch (err) {
        const first = (err as TransformFailure).errors?.[0];
        if (!first) throw err;
        throw new WebforgeError(
            `Failed to compile ${rel}`,
            `  ${first.text}`,
            { file: rel, line: first.location?.line, column: first.location ? first.location.column + 1 : undefined },
        );
    }
    return { source: file, output };
}

export function typescriptTransformer(o: TypeScriptOptions): Transformer {
    let checker: TypeChecker | undefined | null; // null: type checking disabled

    function typeChecker(ctx: BuildContext): TypeChecker | null {
        if (checker !== undefined) return checker;
        if (o.typecheck === false) return (checker = null);
        const ts = loadTypeScript(ctx.root);
        if (!ts) {
            if (o.typecheck === true) {
                throw new WebforgeError(
                    "Type checking requires TypeScript",
                    "  Install it in your project: npm install -D typescript",
                );
            }
            ctx.logger.info("TypeScript not installed in the project, skipping type checks");
            return (checker = null);
        }
        return (checker = new TypeChecker(ts, ctx.root));
    }

    /** Type errors block emitting, so dist/ never contains code that failed the check. */
    async function check(ctx: BuildContext) {
        const tc = typeChecker(ctx);
        if (!tc) return;
        const error = tc.check((await inputs(ctx, o)).map((i) => i.file));
        if (error) throw error;
    }

    return {
        name: "TypeScript",

        async build(ctx, changed) {
            if (changed) {
                const base = matchInput(ctx.root, patterns(o), changed);
                if (!base || !isSource(ctx, o, changed)) return [];
                if (!existsSync(changed)) {
                    // Source deleted: its output must go too.
                    const output = outputPath(ctx, o, changed, base);
                    await rm(output, { force: true });
                    await rm(output + ".map", { force: true });
                    await check(ctx);
                    return [{ source: changed, output, removed: true }];
                }
                await check(ctx);
                return [await compile(ctx, o, changed, base)];
            }
            const files = await inputs(ctx, o);
            if (files.length === 0) {
                ctx.logger.info(`No TypeScript files matched ${patterns(o).join(", ")}`);
                return [];
            }
            await check(ctx);
            // Compile in parallel; on failure report the first error in file order (deterministic).
            const settled = await Promise.allSettled(files.map(({ file, base }) => compile(ctx, o, file, base)));
            const failure = settled.find((r) => r.status === "rejected");
            if (failure) throw failure.reason;
            return settled.map((r) => (r as PromiseFulfilledResult<BuildResult>).value);
        },

        watchPatterns: () => patterns(o),

        async outputs(ctx) {
            const out: string[] = [];
            for (const { file, base } of await inputs(ctx, o)) {
                const js = outputPath(ctx, o, file, base);
                out.push(js, js + ".map");
            }
            return out;
        },
    };
}
