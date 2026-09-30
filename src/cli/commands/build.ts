import { loadConfig } from "../../config/loader.js";
import { createContext } from "../../core/context.js";
import { Pipeline } from "../../core/pipeline.js";
import { WebAssetGeneratorError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export async function buildCommand(cwd: string, configPath?: string): Promise<number> {
    const { root, config } = await loadConfig(cwd, configPath);
    const pipeline = new Pipeline(createContext(root, config));
    const start = performance.now();
    const failed = await pipeline.build();
    if (failed > 0) {
        logger.error(new WebAssetGeneratorError(`Build failed (${failed} transformer${failed > 1 ? "s" : ""} with errors)`));
        return 1;
    }
    logger.ok(`Build complete in ${Math.round(performance.now() - start)}ms`);
    return 0;
}
