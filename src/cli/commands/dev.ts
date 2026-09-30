import { loadConfig } from "../../config/loader.js";
import { createContext } from "../../core/context.js";
import { Pipeline } from "../../core/pipeline.js";
import { logger } from "../../core/logger.js";
import { startWatcher } from "../../watcher/watcher.js";

export async function devCommand(cwd: string, configPath?: string): Promise<number | undefined> {
    const { root, file, config } = await loadConfig(cwd, configPath);
    let pipeline = new Pipeline(createContext(root, config));
    logger.heading("webassetgenerator dev");
    // Errors in the initial build are reported, but dev mode keeps watching.
    await pipeline.build();
    for (const t of pipeline.transformers) logger.ok(`${t.name} initialized`);
    console.log("\nWatching for changes...\n");

    const stop = startWatcher(root, {
        pipeline: () => pipeline,
        configFile: file,
        async onConfigChange() {
            try {
                const reloaded = await loadConfig(cwd, configPath);
                pipeline = new Pipeline(createContext(reloaded.root, reloaded.config));
            } catch (err) {
                logger.error(err); // keep the previous, working config
                return;
            }
            logger.ok("Config reloaded");
            await pipeline.build();
        },
    });
    await new Promise<void>((resolve) => {
        for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, resolve);
    });
    stop();
    return 0;
}
