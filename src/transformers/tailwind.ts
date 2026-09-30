import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { TailwindOptions } from "../config/types.js";
import { WebAssetGeneratorError } from "../core/errors.js";
import type { Transformer } from "../core/transformer.js";

/** Locate the Tailwind CLI installed in the *project*, so its version is under the user's control. */
function resolveCli(root: string): string {
    const require = createRequire(path.join(root, "package.json"));
    let pkgPath: string;
    try {
        pkgPath = require.resolve("@tailwindcss/cli/package.json");
    } catch {
        throw new WebAssetGeneratorError(
            "Tailwind CLI not found",
            "  Install it in your project: npm install -D tailwindcss @tailwindcss/cli",
        );
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { bin?: string | Record<string, string> };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["tailwindcss"];
    if (!bin) throw new WebAssetGeneratorError("Could not determine the Tailwind CLI entry point");
    return path.resolve(path.dirname(pkgPath), bin);
}

function run(cli: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) return resolve();
            const details = stderr
                .replace(/\x1b\[[0-9;]*m/g, "")
                .split("\n")
                .filter((l) => l.trim() && !/^≈ tailwindcss/.test(l) && !/^Done in/.test(l))
                .map((l) => `  ${l}`)
                .join("\n");
            reject(new WebAssetGeneratorError("Failed to build Tailwind CSS", details));
        });
    });
}

export function tailwindTransformer(o: TailwindOptions): Transformer {
    return {
        name: "Tailwind",

        async build(ctx) {
            const input = path.resolve(ctx.root, o.input);
            const output = path.resolve(ctx.root, o.output);
            if (input === output) throw new WebAssetGeneratorError("Tailwind input and output must differ");
            if (!existsSync(input)) throw new WebAssetGeneratorError(`Tailwind input not found: ${o.input}`);
            await mkdir(path.dirname(output), { recursive: true });
            const args = ["-i", input, "-o", output];
            if (o.minify) args.push("--minify");
            await run(resolveCli(ctx.root), args, ctx.root);
            return [{ source: input, output }];
        },

        // Tailwind scans templates for class names, so markup and scripts matter too.
        watchPatterns: () => [o.input, "**/*.{html,js,jsx,ts,tsx,vue,svelte,md}"],

        async outputs(ctx) {
            return [path.resolve(ctx.root, o.output)];
        },
    };
}
