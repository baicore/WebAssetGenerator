export interface TypeScriptOptions {
    /** File, or glob pattern(s), of the TypeScript sources. */
    input: string | string[];
    /** Output directory. The directory structure below the glob base is preserved. */
    output: string;
    /** esbuild target, e.g. "es2022". Defaults to "es2022". */
    target?: string;
    /** Emit external `.js.map` files. */
    sourcemap?: boolean;
    /** Minify the emitted JavaScript. */
    minify?: boolean;
}

export interface TailwindOptions {
    /** CSS entry file, e.g. `./src/styles.css`. */
    input: string;
    /** Output CSS file. */
    output: string;
    /** Minify the emitted CSS. */
    minify?: boolean;
}

export interface WebforgeConfig {
    typescript?: TypeScriptOptions;
    tailwind?: TailwindOptions;
}
