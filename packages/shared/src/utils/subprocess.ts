// Generic subprocess port. Used by the bill-references worker today (Python
// extractor) and likely useful for any future pipeline that needs to spawn
// a sidecar process with stdin payload + stdout response.
//
// The port (SubprocessRunner) is intentionally minimal: one-shot run with a
// string payload, returns stdout / stderr / exitCode. No streaming yet —
// batch sizes in the pipeline stay below the point where streaming helps.

export interface SubprocessResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

export interface SubprocessRunner {
    run(input: string): Promise<SubprocessResult>;
}

/**
 * Bun.spawn-backed runner. Use spawn (not exec) so the input is piped to
 * stdin without going through a shell argument or temp file; exec also
 * buffers the entire stdout in one go anyway, and Bun's native spawn is
 * the faster path.
 *
 * stdin: piped, written in one shot then closed.
 * stdout/stderr: piped, drained to strings via Response — fine for batch
 * outputs under a few hundred KB.
 */
export function makeBunSubprocessRunner(cmd: string[]): SubprocessRunner {
    return {
        async run(input: string) {
            const proc = Bun.spawn(cmd, {
                stdin: "pipe",
                stdout: "pipe",
                stderr: "pipe",
            });
            proc.stdin.write(input);
            proc.stdin.end();
            const [stdout, stderr] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
            ]);
            const exitCode = await proc.exited;
            return { stdout, stderr, exitCode };
        },
    };
}
