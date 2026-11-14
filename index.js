/**
 * Host half of the edit-and-resend bundle.
 *
 * The capability lives entirely in the browser: the Client module reads the
 * Conversation view, forks the Session through `ctx.sessions`, and sends the
 * edited text. No Host registration, tool, command, or remote is added, so
 * this half only declares the package to the Loader.
 */

/** No Host-side contribution. */
export function apply() {}
