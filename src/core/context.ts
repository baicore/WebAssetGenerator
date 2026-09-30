import type { TatyConfig } from "../config/types.js";
import { logger, type Logger } from "./logger.js";

export interface BuildContext {
    /** Absolute project root (directory of the config file). */
    root: string;
    config: TatyConfig;
    logger: Logger;
}

export function createContext(root: string, config: TatyConfig): BuildContext {
    return { root, config, logger };
}
