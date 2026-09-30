import path from "node:path";
import { glob } from "tinyglobby";

const GLOB_CHARS = /[*?[\]{}()!]/;

/** Directory portion of a pattern before the first glob segment. */
export function globBase(pattern: string): string {
    const parts = pattern.split("/");
    const base: string[] = [];
    for (const part of parts.slice(0, -1)) {
        if (GLOB_CHARS.test(part)) break;
        base.push(part);
    }
    return base.join("/") || (pattern.startsWith("/") ? "/" : ".");
}

/** Resolve patterns to absolute file paths, each paired with its glob base. */
export async function resolveInputs(
    root: string,
    patterns: string[],
    ignore: string[] = [],
): Promise<{ file: string; base: string }[]> {
    const found = new Map<string, string>();
    for (const raw of patterns) {
        const pattern = raw.replaceAll("\\", "/");
        const base = path.resolve(root, globBase(pattern));
        const files = await glob(pattern, {
            cwd: root,
            absolute: true,
            onlyFiles: true,
            ignore: ["**/node_modules/**", ...ignore],
        });
        for (const f of files) if (!found.has(f)) found.set(f, base);
    }
    return [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, base]) => ({ file, base }));
}
