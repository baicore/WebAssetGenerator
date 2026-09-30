import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { normalizePattern, toPosixRelative } from "../core/paths.js";
import type { Pipeline } from "../core/pipeline.js";
import type { Transformer } from "../core/transformer.js";

const IGNORED = ["node_modules", ".git"];

export interface WatchOptions {
    /** The current pipeline; may be swapped out, e.g. after a config reload. */
    pipeline(): Pipeline;
    /** Absolute path of the config file. */
    configFile: string;
    onConfigChange(): Promise<void>;
}

/**
 * Watch the project root recursively and rebuild the transformers whose patterns match.
 * Events are debounced and processed strictly one batch after another.
 */
export function startWatcher(root: string, options: WatchOptions): () => void {
    const pending = new Set<string>();
    const matchers = new WeakMap<Transformer, (rel: string) => boolean>();
    let timer: NodeJS.Timeout | undefined;
    let running = Promise.resolve();

    const matcher = (t: Transformer) => {
        let m = matchers.get(t);
        if (!m) {
            m = picomatch(t.watchPatterns(options.pipeline().context).map(normalizePattern));
            matchers.set(t, m);
        }
        return m;
    };

    const handle = async (files: string[]) => {
        if (files.includes(options.configFile)) {
            options.pipeline().context.logger.event("changed", path.relative(root, options.configFile));
            await options.onConfigChange(); // rebuilds everything, so the other changes are covered
            return;
        }
        const pipeline = options.pipeline();
        for (const file of files) {
            const rel = toPosixRelative(root, file);
            const affected = pipeline.transformers.filter((t) => matcher(t)(rel));
            if (affected.length === 0) continue;
            pipeline.context.logger.event("changed", rel);
            for (const t of affected) await pipeline.rebuild(t, file);
        }
    };

    const watcher: FSWatcher = watch(root, { recursive: true }, (_event, name) => {
        if (!name) return;
        const parts = name.split(path.sep);
        if (parts.some((p) => IGNORED.includes(p) || p.startsWith(".webassetgenerator.config."))) return;
        const file = path.join(root, name);
        if (options.pipeline().isOutput(file)) return;
        pending.add(file);
        clearTimeout(timer);
        timer = setTimeout(() => {
            const files = [...pending].sort();
            pending.clear();
            running = running.then(() => handle(files));
        }, 50);
    });

    return () => {
        clearTimeout(timer);
        watcher.close();
    };
}
