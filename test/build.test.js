import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(repo, "bin/webforge.js");

function project(files) {
    const dir = mkdtempSync(path.join(tmpdir(), "webforge-"));
    mkdirSync(path.join(dir, "node_modules/@tailwindcss"), { recursive: true });
    symlinkSync(repo, path.join(dir, "node_modules/webforge"));
    symlinkSync(path.join(repo, "node_modules/tailwindcss"), path.join(dir, "node_modules/tailwindcss"));
    symlinkSync(path.join(repo, "node_modules/@tailwindcss/cli"), path.join(dir, "node_modules/@tailwindcss/cli"));
    writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
    for (const [name, content] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        writeFileSync(path.join(dir, name), content);
    }
    return dir;
}
const run = (dir, ...args) => spawnSync("node", [bin, ...args], { cwd: dir, encoding: "utf8" });

const config = `import { defineConfig } from "webforge";
export default defineConfig({
  typescript: { input: "./src/**/*.ts", output: "./dist" },
  tailwind: { input: "./src/styles.css", output: "./dist/styles.css" },
});`;

test("build preserves structure and generates CSS", () => {
    const dir = project({
        "webforge.config.ts": config,
        "src/main.ts": "export const a: number = 1;",
        "src/components/button.ts": "export const b: string = 'x';",
        "src/styles.css": '@import "tailwindcss";',
        "index.html": '<div class="p-4"></div>',
    });
    const r = run(dir, "build");
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(path.join(dir, "dist/main.js"), "utf8"), /const a = 1/);
    assert.ok(existsSync(path.join(dir, "dist/components/button.js")));
    assert.match(readFileSync(path.join(dir, "dist/styles.css"), "utf8"), /\.p-4/);
    assert.equal(run(dir, "clean").status, 0);
    assert.ok(!existsSync(path.join(dir, "dist/main.js")));
});

test("compile errors give a non-zero exit code", () => {
    const dir = project({
        "webforge.config.ts": config.replace(/tailwind:.*\n/, ""),
        "src/bad.ts": "const x: number = ;",
    });
    const r = run(dir, "build");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Failed to compile src\/bad\.ts/);
});

test("--version and --help", () => {
    assert.match(run(repo, "--version").stdout, /^\d+\.\d+\.\d+/);
    assert.match(run(repo, "--help").stdout, /Usage:/);
});
