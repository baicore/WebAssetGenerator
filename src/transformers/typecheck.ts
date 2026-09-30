import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type * as TS from "typescript";
import { WebAssetGeneratorError } from "../core/errors.js";

/** The `typescript` package installed in the project, if any — its version is the user's choice. */
export function loadTypeScript(root: string): typeof TS | undefined {
    try {
        return createRequire(path.join(root, "package.json"))("typescript") as typeof TS;
    } catch {
        return undefined;
    }
}

/**
 * Type-checks the configured inputs with the TypeScript compiler (no emit).
 * Parsed library/declaration files are cached between checks, so rechecks in dev mode stay fast.
 */
export class TypeChecker {
    private readonly options: TS.CompilerOptions;
    private readonly cache = new Map<string, { mtime: number; file: TS.SourceFile }>();

    constructor(
        private readonly ts: typeof TS,
        private readonly root: string,
    ) {
        this.options = { ...this.readOptions(), noEmit: true };
    }

    /** Returns an error describing all type errors, or undefined if the files type-check. */
    check(files: string[]): WebAssetGeneratorError | undefined {
        const { ts, root } = this;
        const host = ts.createCompilerHost(this.options);
        const getSourceFile = host.getSourceFile.bind(host);
        host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
            let mtime: number;
            try {
                mtime = statSync(fileName).mtimeMs;
            } catch {
                return getSourceFile(fileName, languageVersion, onError, shouldCreate);
            }
            const hit = this.cache.get(fileName);
            if (hit && hit.mtime === mtime) return hit.file;
            const file = getSourceFile(fileName, languageVersion, onError, shouldCreate);
            if (file) this.cache.set(fileName, { mtime, file });
            return file;
        };

        const program = ts.createProgram(files, this.options, host);
        const diagnostics = ts
            .getPreEmitDiagnostics(program)
            .filter((d) => d.category === ts.DiagnosticCategory.Error);
        if (diagnostics.length === 0) return undefined;

        const blocks = diagnostics.map((d) => {
            const text = `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
            if (!d.file || d.start === undefined) return { file: undefined, text, where: "" };
            const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
            const file = path.relative(root, d.file.fileName);
            return { file, text, where: `${file}:${line + 1}:${character + 1}` };
        });
        const affected = [...new Set(blocks.map((b) => b.file).filter((f) => f !== undefined))];
        const title =
            affected.length === 1
                ? `Failed to compile ${affected[0]}`
                : `Type check failed (${diagnostics.length} errors in ${affected.length} files)`;
        return new WebAssetGeneratorError(
            title,
            blocks.map((b) => (b.where ? `${b.text}\n\n  ${b.where}` : b.text)).join("\n\n"),
        );
    }

    /** Compiler options from the project's tsconfig.json, or browser-oriented defaults. */
    private readOptions(): TS.CompilerOptions {
        const { ts, root } = this;
        const configPath = path.join(root, "tsconfig.json");
        if (!existsSync(configPath)) {
            return {
                strict: true,
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
                skipLibCheck: true,
                isolatedModules: true,
            };
        }
        const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
        const parsed = error ? undefined : ts.parseJsonConfigFileContent(config, ts.sys, root);
        const problem = error ?? parsed?.errors.find(
            // TS18003 "No inputs were found": irrelevant, WebAssetGenerator passes the files itself.
            (e) => e.category === ts.DiagnosticCategory.Error && e.code !== 18003,
        );
        if (problem) {
            throw new WebAssetGeneratorError(
                "Invalid tsconfig.json",
                `  ${ts.flattenDiagnosticMessageText(problem.messageText, "\n")}`,
            );
        }
        return parsed!.options;
    }
}
