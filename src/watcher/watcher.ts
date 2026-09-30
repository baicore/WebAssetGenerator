import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { glob } from "tinyglobby";
import type { Pipeline } from "../core/pipeline.js";

const IGNORED = ["node_modules", ".git"];

/** Watch the project root recursively; rebuild the transformers whose patterns match. */
export function startWatcher(pipeline: Pipeline): () => void {
    const ctx = pipeline.context;
    const pending = new Set<string>();
    let timer: NodeJS.Timeout | undefined;
    let running = Promise.resolve();

    const flush = () => {
        const files = [...pending];
        pending.clear();
        running = running.then(async () => {
            for (const file of files) {
                for (const t of pipeline.transformers) {
                    const patterns = t.watchPatterns(ctx);
                    const matches = await glob(patterns, { cwd: ctx.root, absolute: true, ignore: ["**/node_modules/**"] });
                    if (!matches.includes(file)) continue;
                    ctx.logger.event("changed", path.relative(ctx.root, file));
                    await pipeline.rebuild(t, file);
                }
            }
        });
    };

    const watcher: FSWatcher = watch(ctx.root, { recursive: true }, (_event, name) => {
        if (!name) return;
        const parts = name.split(path.sep);
        if (parts.some((p) => IGNORED.includes(p) || p.startsWith(".webforge.config."))) return;
        const file = path.join(ctx.root, name);
        if (pipeline.isOutput(file)) return;
        pending.add(file);
        clearTimeout(timer);
        timer = setTimeout(flush, 50);
    });

    return () => {
        clearTimeout(timer);
        watcher.close();
    };
}
