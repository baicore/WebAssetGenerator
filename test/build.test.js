import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(repo, "bin/webassetgenerator.js");

function project(files) {
    const dir = mkdtempSync(path.join(tmpdir(), "webassetgenerator-"));
    mkdirSync(path.join(dir, "node_modules/@tailwindcss"), { recursive: true });
    symlinkSync(repo, path.join(dir, "node_modules/webassetgenerator"));
    symlinkSync(path.join(repo, "node_modules/tailwindcss"), path.join(dir, "node_modules/tailwindcss"));
    symlinkSync(path.join(repo, "node_modules/@tailwindcss/cli"), path.join(dir, "node_modules/@tailwindcss/cli"));
    symlinkSync(path.join(repo, "node_modules/typescript"), path.join(dir, "node_modules/typescript"));
    writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
    for (const [name, content] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        writeFileSync(path.join(dir, name), content);
    }
    return dir;
}
const run = (dir, ...args) => spawnSync("node", [bin, ...args], { cwd: dir, encoding: "utf8" });

const config = `import { defineConfig } from "webassetgenerator";
export default defineConfig({
  typescript: { input: "./src/**/*.ts", output: "./dist" },
  tailwind: { input: "./src/styles.css", output: "./dist/styles.css" },
});`;
const tsOnly = config.replace(/  tailwind:.*\n/, "");

test("build preserves structure and generates CSS", () => {
    const dir = project({
        "webassetgenerator.config.ts": config,
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
    assert.ok(!existsSync(path.join(dir, "dist")), "clean removes the emptied output directories");
});

test("compile errors give a non-zero exit code", () => {
    const dir = project({
        "webassetgenerator.config.ts": tsOnly,
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

test("type errors fail the build and are reported with code and location", () => {
    const dir = project({
        "webassetgenerator.config.ts": tsOnly,
        "src/main.ts": "let n: number = 1;\nn = 'x';\nexport {};",
    });
    const r = run(dir, "build");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Failed to compile src\/main\.ts/);
    assert.match(r.stderr, /TS2322: Type 'string' is not assignable to type 'number'\./);
    assert.match(r.stderr, /src\/main\.ts:2:1/);
    assert.ok(!existsSync(path.join(dir, "dist/main.js")), "nothing is emitted on type errors");
});

test("typecheck: false skips the type check", () => {
    const dir = project({
        "webassetgenerator.config.ts": tsOnly.replace('output: "./dist" }', 'output: "./dist", typecheck: false }'),
        "src/main.ts": "let n: number = 1;\nn = 'x';\nexport {};",
    });
    assert.equal(run(dir, "build").status, 0);
});

test("invalid config options are rejected", () => {
    const dir = project({
        "webassetgenerator.config.ts": tsOnly.replace('output: "./dist" }', 'output: "./dist", minfy: true }'),
    });
    const r = run(dir, "build");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unknown option "typescript\.minfy"/);
});

async function waitFor(predicate, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 50));
    }
    assert.fail("timed out");
}

test("dev rebuilds changed files and removes outputs of deleted ones", async () => {
    const dir = project({ "webassetgenerator.config.ts": tsOnly, "src/main.ts": "export const a = 1;" });
    const child = spawn("node", [bin, "dev"], { cwd: dir });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    try {
        await waitFor(() => log.includes("Watching for changes"));
        writeFileSync(path.join(dir, "src/extra.ts"), "export const b: number = 2;");
        await waitFor(() => existsSync(path.join(dir, "dist/extra.js")));
        rmSync(path.join(dir, "src/extra.ts"));
        await waitFor(() => !existsSync(path.join(dir, "dist/extra.js")));
        assert.match(log, /removed\s+dist\/extra\.js/);
    } finally {
        child.kill();
    }
});
