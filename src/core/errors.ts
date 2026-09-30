export interface SourceLocation {
    file: string;
    line?: number;
    column?: number;
}

/** An expected, user-facing failure (bad config, compile error, ...). */
export class TatyError extends Error {
    constructor(
        message: string,
        readonly details?: string,
        readonly location?: SourceLocation,
    ) {
        super(message);
        this.name = "TatyError";
    }
}
