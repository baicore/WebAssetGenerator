import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { WebforgeError } from "../core/errors.js";
import type { WebforgeConfig } from "./types.js";

const CONFIG_NAMES = ["webforge.config.ts", "webforge.config.mts", "webforge.config.js", "webforge.config.mjs"];

export interface LoadedConfig {
    root: string;
    file: string;
    config: WebforgeConfig;
}

export async function loadConfig(cwd: string, explicit?: string): Promise<LoadedConfig> {
    const file = explicit
        ? path.resolve(cwd, explicit)
        : CONFIG_NAMES.map((n) => path.join(cwd, n)).find((f) => existsSync(f));
    if (!file || !existsSync(file)) {
        throw new WebforgeError(
            explicit ? `Config file not found: ${explicit}` : "No webforge.config.ts found",
            explicit ? undefined : `  Looked in ${cwd}`,
        );
    }

    // Bundle the config (own code only, packages stay external) to a temp module next to it.
    const tmp = path.join(path.dirname(file), `.webforge.config.${process.pid}.${Date.now()}.mjs`);
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
        if (err instanceof WebforgeError) throw err;
        const first = (err as { errors?: { text: string }[] }).errors?.[0];
        throw new WebforgeError(`Failed to load ${path.basename(file)}`, `  ${first?.text ?? (err as Error).message}`);
    } finally {
        await rm(tmp, { force: true });
    }
}

function validate(value: unknown, file: string): WebforgeConfig {
    const name = path.basename(file);
    const fail = (msg: string): never => {
        throw new WebforgeError(`Invalid config in ${name}`, `  ${msg}`);
    };
    if (!value || typeof value !== "object") return fail("Expected a default export: export default defineConfig({ ... })");
    const c = value as Record<string, any>;
    for (const key of Object.keys(c)) if (key !== "typescript" && key !== "tailwind") fail(`Unknown option "${key}"`);
    if (c["typescript"]) {
        const t = c["typescript"];
        const okInput = typeof t.input === "string" || (Array.isArray(t.input) && t.input.every((i: unknown) => typeof i === "string"));
        if (!okInput) fail('"typescript.input" must be a string or an array of strings');
        if (typeof t.output !== "string") fail('"typescript.output" must be a string');
    }
    if (c["tailwind"]) {
        if (typeof c["tailwind"].input !== "string") fail('"tailwind.input" must be a string');
        if (typeof c["tailwind"].output !== "string") fail('"tailwind.output" must be a string');
    }
    return c as WebforgeConfig;
}
