import { existsSync } from "node:fs";
import path from "node:path";
import { rm } from "node:fs/promises";
import type { WebforgeConfig } from "../config/types.js";
import { typescriptTransformer } from "../transformers/typescript.js";
import { tailwindTransformer } from "../transformers/tailwind.js";
import type { BuildContext } from "./context.js";
import type { BuildResult, Transformer } from "./transformer.js";

export function createTransformers(config: WebforgeConfig): Transformer[] {
    const list: Transformer[] = [];
    if (config.typescript) list.push(typescriptTransformer(config.typescript));
    if (config.tailwind) list.push(tailwindTransformer(config.tailwind));
    return list;
}

const rel = (ctx: BuildContext, p: string) => path.relative(ctx.root, p) || ".";

function report(ctx: BuildContext, results: BuildResult[], written: Set<string>) {
    for (const r of results) written.add(r.output);
    for (const r of results) ctx.logger.event("built", `${rel(ctx, r.source)} → ${rel(ctx, r.output)}`);
}

export class Pipeline {
    /** Files webforge generated itself; the watcher must not treat them as inputs. */
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
        return removed;
    }
}
