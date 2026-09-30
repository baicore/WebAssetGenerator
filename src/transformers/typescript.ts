import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { transform, type TransformFailure } from "esbuild";
import type { TypeScriptOptions } from "../config/types.js";
import type { BuildContext } from "../core/context.js";
import { WebforgeError } from "../core/errors.js";
import { resolveInputs } from "../core/paths.js";
import type { BuildResult, Transformer } from "../core/transformer.js";

const EXT_MAP: Record<string, { out: string; loader: "ts" | "tsx" }> = {
    ".ts": { out: ".js", loader: "ts" },
    ".tsx": { out: ".js", loader: "tsx" },
    ".mts": { out: ".mjs", loader: "ts" },
    ".cts": { out: ".cjs", loader: "ts" },
};

const patterns = (o: TypeScriptOptions) => (Array.isArray(o.input) ? o.input : [o.input]);

async function inputs(ctx: BuildContext, o: TypeScriptOptions) {
    const outDir = path.resolve(ctx.root, o.output);
    const all = await resolveInputs(ctx.root, patterns(o));
    return all.filter(({ file }) => {
        const ext = path.extname(file);
        return ext in EXT_MAP && !/\.d\.[cm]?ts$/.test(file) && !file.startsWith(outDir + path.sep);
    });
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
    return {
        name: "TypeScript",

        async build(ctx, changed) {
            const files = await inputs(ctx, o);
            if (changed) {
                const hit = files.find((f) => f.file === changed);
                if (hit) return [await compile(ctx, o, hit.file, hit.base)];
                return []; // not (or no longer) an input
            }
            const results: BuildResult[] = [];
            for (const { file, base } of files) results.push(await compile(ctx, o, file, base));
            if (results.length === 0) ctx.logger.info(`No TypeScript files matched ${patterns(o).join(", ")}`);
            return results;
        },

        watchPatterns: (ctx) => patterns(o).map((p) => path.resolve(ctx.root, p)),

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
