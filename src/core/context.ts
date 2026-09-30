import type { WebAssetGeneratorConfig } from "../config/types.js";
import { logger, type Logger } from "./logger.js";

export interface BuildContext {
    /** Absolute project root (directory of the config file). */
    root: string;
    config: WebAssetGeneratorConfig;
    logger: Logger;
}

export function createContext(root: string, config: WebAssetGeneratorConfig): BuildContext {
    return { root, config, logger };
}
