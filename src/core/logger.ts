import { WebforgeError } from "./errors.js";

const useColor = process.stdout.isTTY && !process.env["NO_COLOR"];
const paint = (code: number) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = paint(2);
const green = paint(32);
const red = paint(31);
const bold = paint(1);

const time = () => new Date().toTimeString().slice(0, 8);

export interface Logger {
    info(message: string): void;
    ok(message: string): void;
    event(verb: string, message: string): void;
    error(err: unknown): void;
    heading(message: string): void;
}

export const logger: Logger = {
    info: (m) => console.log(m),
    heading: (m) => console.log(bold(m) + "\n"),
    ok: (m) => console.log(`${green("✓")} ${m}`),
    event: (verb, m) => console.log(`${dim(time())}  ${verb.padEnd(7)} ${m}`),
    error(err) {
        if (err instanceof WebforgeError) {
            console.error(`${red("✗")} ${err.message}`);
            if (err.details) console.error(`\n${err.details}`);
            if (err.location) {
                const { file, line, column } = err.location;
                const pos = line !== undefined ? `:${line}${column !== undefined ? `:${column}` : ""}` : "";
                console.error(`\n  ${file}${pos}`);
            }
            console.error();
        } else {
            console.error(`${red("✗")} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
        }
    },
};
