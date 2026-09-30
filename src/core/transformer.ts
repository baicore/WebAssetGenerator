import type { BuildContext } from "./context.js";

/** One processed file: absolute paths. */
export interface BuildResult {
    source: string;
    output: string;
    /** The source was deleted, so its output was removed. */
    removed?: boolean;
}

export interface Transformer {
    name: string;

    /**
     * Build all outputs, or — when `changed` is given (absolute path) — only what
     * depends on that file. `changed` may point to a file that no longer exists.
     */
    build(context: BuildContext, changed?: string): Promise<BuildResult[]>;

    /** Glob patterns / files, relative to the project root, whose changes should trigger `build` in dev mode. */
    watchPatterns(context: BuildContext): string[];

    /** Absolute paths of generated files that `clean` may delete. */
    outputs(context: BuildContext): Promise<string[]>;
}
