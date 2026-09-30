import { existsSync } from "node:fs";
import path from "node:path";
import { readdir, rm, rmdir } from "node:fs/promises";
import type { WebAssetGeneratorConfig } from "../config/types.js";
import { typescriptTransformer } from "../transformers/typescript.js";
import { tailwindTransformer } from "../transformers/tailwind.js";
import type { BuildContext } from "./context.js";
import type { BuildResult, Transformer } from "./transformer.js";

export function createTransformers(config: WebAssetGeneratorConfig): Transformer[] {
    const list: Transformer[] = [];
    if (config.typescript) list.push(typescriptTransformer(config.typescript));
    if (config.tailwind) list.push(tailwindTransformer(config.tailwind));
    return list;
}

const rel = (ctx: BuildContext, p: string) => path.relative(ctx.root, p) || ".";

function report(ctx: BuildContext, results: BuildResult[], written: Set<string>) {
    for (const r of results) written.add(r.output);
    for (const r of results) {
        if (r.removed) ctx.logger.event("removed", rel(ctx, r.output));
        else ctx.logger.event("built", `${rel(ctx, r.source)} → ${rel(ctx, r.output)}`);
    }
}

export class Pipeline {
    /** Files WebAssetGenerator generated itself; the watcher must not treat them as inputs. */
    private readonly written = new Set<string>();

    constructor(
        readonly context: BuildContext,
        readonly transformers: Transformer[] = createTransformers(context.config),
    ) {}

    /** Run every transformer once. Returns the number of failed transformers. */
    async build(): Promise<number> {
        let failed = 0;
        for (const t of this.transformers) {
            try {
                report(this.context, await t.build(this.context), this.written);
            } catch (err) {
                failed++;
                this.context.logger.error(err);
            }
        }
        return failed;
    }

    /** Rebuild whatever depends on the changed `file` with one transformer. */
    async rebuild(t: Transformer, file: string): Promise<boolean> {
        try {
            report(this.context, await t.build(this.context, file), this.written);
            return true;
        } catch (err) {
            this.context.logger.error(err);
            return false;
        }
    }

    isOutput(file: string): boolean {
        if (this.written.has(file)) return true;
        const ts = this.context.config.typescript;
        return !!ts && file.startsWith(path.resolve(this.context.root, ts.output) + path.sep);
    }

    async clean(): Promise<string[]> {
        const removed: string[] = [];
        for (const t of this.transformers) {
            for (const file of await t.outputs(this.context)) {
                if (!existsSync(file)) continue;
                await rm(file);
                removed.push(file);
            }
        }
        await removeEmptyDirs(this.context.root, removed);
        return removed;
    }
}

/** Remove directories left empty by `clean`, walking up from each removed file — never the root itself. */
async function removeEmptyDirs(root: string, removed: string[]) {
    const dirs = [...new Set(removed.map((f) => path.dirname(f)))].sort((a, b) => b.length - a.length);
    for (let dir of dirs) {
        while (dir.startsWith(root + path.sep) && existsSync(dir) && (await readdir(dir)).length === 0) {
            await rmdir(dir);
            dir = path.dirname(dir);
        }
    }
}
