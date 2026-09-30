import type { WebforgeConfig } from "../config/types.js";
import { logger, type Logger } from "./logger.js";

export interface BuildContext {
    /** Absolute project root (directory of the config file). */
    root: string;
    config: WebforgeConfig;
    logger: Logger;
}

export function createContext(root: string, config: WebforgeConfig): BuildContext {
    return { root, config, logger };
}
