import { loadConfig } from "../../config/loader.js";
import { createContext } from "../../core/context.js";
import { Pipeline } from "../../core/pipeline.js";
import { logger } from "../../core/logger.js";
import { startWatcher } from "../../watcher/watcher.js";

export async function devCommand(cwd: string, configPath?: string): Promise<number | undefined> {
    const { root, config } = await loadConfig(cwd, configPath);
    const pipeline = new Pipeline(createContext(root, config));
    logger.heading("webforge dev");
    // Errors in the initial build are reported, but dev mode keeps watching.
    await pipeline.build();
    for (const t of pipeline.transformers) logger.ok(`${t.name} initialized`);
    console.log("\nWatching for changes...\n");
    const stop = startWatcher(pipeline);
    await new Promise<void>((resolve) => {
        for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, resolve);
    });
    stop();
    return 0;
}
