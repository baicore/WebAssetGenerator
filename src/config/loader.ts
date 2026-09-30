import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { TatyError } from "../core/errors.js";
import type { TatyConfig } from "./types.js";

const CONFIG_NAMES = ["taty.config.ts", "taty.config.mts", "taty.config.js", "taty.config.mjs"];

export interface LoadedConfig {
    root: string;
    file: string;
    config: TatyConfig;
}

export async function loadConfig(cwd: string, explicit?: string): Promise<LoadedConfig> {
    const file = explicit
        ? path.resolve(cwd, explicit)
        : CONFIG_NAMES.map((n) => path.join(cwd, n)).find((f) => existsSync(f));
    if (!file || !existsSync(file)) {
        throw new TatyError(
            explicit ? `Config file not found: ${explicit}` : "No taty.config.ts found",
            explicit ? undefined : `  Looked in ${cwd}`,
        );
    }

    // Bundle the config (own code only, packages stay external) to a temp module next to it.
    const tmp = path.join(path.dirname(file), `.taty.config.${process.pid}.${Date.now()}.mjs`);
    try {
        await build({
            entryPoints: [file],
            outfile: tmp,
            bundle: true,
            packages: "external",
            platform: "node",
            format: "esm",
            logLevel: "silent",
        });
        const mod = (await import(pathToFileURL(tmp).href)) as { default?: unknown };
        return { root: path.dirname(file), file, config: validate(mod.default, file) };
    } catch (err) {
        if (err instanceof TatyError) throw err;
        const first = (err as { errors?: { text: string }[] }).errors?.[0];
        throw new TatyError(`Failed to load ${path.basename(file)}`, `  ${first?.text ?? (err as Error).message}`);
    } finally {
        await rm(tmp, { force: true });
    }
}

type Check = (v: unknown) => boolean;
const str: Check = (v) => typeof v === "string";
const bool: Check = (v) => typeof v === "boolean";
const strOrList: Check = (v) => str(v) || (Array.isArray(v) && v.length > 0 && v.every(str));

/** Per section: option → [check, expected type, required]. */
const SCHEMA: Record<keyof TatyConfig, Record<string, [Check, string, boolean]>> = {
    typescript: {
        input: [strOrList, "a string or an array of strings", true],
        output: [str, "a string", true],
        target: [str, "a string", false],
        sourcemap: [bool, "a boolean", false],
        minify: [bool, "a boolean", false],
        typecheck: [bool, "a boolean", false],
    },
    tailwind: {
        input: [str, "a string", true],
        output: [str, "a string", true],
        minify: [bool, "a boolean", false],
    },
};

function validate(value: unknown, file: string): TatyConfig {
    const fail = (msg: string): never => {
        throw new TatyError(`Invalid config in ${path.basename(file)}`, `  ${msg}`);
    };
    const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
    if (!isObject(value)) return fail("Expected a default export: export default defineConfig({ ... })");

    for (const [section, options] of Object.entries(value)) {
        const schema = SCHEMA[section as keyof TatyConfig];
        if (!schema) fail(`Unknown option "${section}" (expected: ${Object.keys(SCHEMA).join(", ")})`);
        if (options === undefined) continue;
        if (!isObject(options)) return fail(`"${section}" must be an object`);
        for (const key of Object.keys(options)) {
            if (!(key in schema!)) fail(`Unknown option "${section}.${key}"`);
        }
        for (const [key, [check, expected, required]] of Object.entries(schema!)) {
            const v = options[key];
            if (v === undefined ? required : !check(v)) fail(`"${section}.${key}" must be ${expected}`);
        }
    }
    return value as TatyConfig;
}
