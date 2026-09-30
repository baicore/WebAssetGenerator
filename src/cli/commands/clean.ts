import path from "node:path";
import { loadConfig } from "../../config/loader.js";
import { createContext } from "../../core/context.js";
import { Pipeline } from "../../core/pipeline.js";
import { logger } from "../../core/logger.js";

export async function cleanCommand(cwd: string, configPath?: string): Promise<number> {
    const { root, config } = await loadConfig(cwd, configPath);
    const removed = await new Pipeline(createContext(root, config)).clean();
    for (const f of removed) logger.event("removed", path.relative(root, f));
    logger.ok("Clean complete");
    return 0;
}
