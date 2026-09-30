import { readFileSync } from "node:fs";
import { logger } from "../core/logger.js";
import { buildCommand } from "./commands/build.js";
import { cleanCommand } from "./commands/clean.js";
import { devCommand } from "./commands/dev.js";

const HELP = `WebAssetGenerator — lightweight, config-driven build tool

Usage:
  webassetgenerator <command> [options]
  wag <command> [options]   (short alias)

Commands:
  build     Build the project once
  dev       Build and rebuild on file changes
  clean     Remove generated build files

Options:
  -c, --config <file>   Path to the config file (default: webassetgenerator.config.ts)
  -h, --help            Show this help
  -v, --version         Show the version
`;

function version(): string {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
    return pkg.version;
}

async function main(argv: string[]): Promise<number | undefined> {
    let config: string | undefined;
    const rest: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === "-c" || a === "--config") config = argv[++i];
        else rest.push(a);
    }
    const [command] = rest;

    if (rest.includes("--version") || rest.includes("-v")) { console.log(version()); return 0; }
    if (!command || rest.includes("--help") || rest.includes("-h")) { console.log(HELP); return 0; }

    const cwd = process.cwd();
    switch (command) {
        case "build": return buildCommand(cwd, config);
        case "dev": return devCommand(cwd, config);
        case "clean": return cleanCommand(cwd, config);
        default:
            console.error(`Unknown command "${command}"\n\n${HELP}`);
            return 1;
    }
}

main(process.argv.slice(2)).then(
    (code) => process.exit(code ?? 0),
    (err) => {
        logger.error(err);
        process.exit(1);
    },
);
