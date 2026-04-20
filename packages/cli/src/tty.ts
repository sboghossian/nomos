/**
 * Tiny ANSI helper — no chalk, no dep. Auto-disables when stdout is not a TTY.
 */

const isTty = process.stdout.isTTY === true && !process.env["NO_COLOR"];
const wrap = (open: string, close: string) => (s: string) =>
  isTty ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const italic = wrap("3", "23");
export const underline = wrap("4", "24");

export const red = wrap("31", "39");
export const green = wrap("32", "39");
export const yellow = wrap("33", "39");
export const blue = wrap("34", "39");
export const magenta = wrap("35", "39");
export const cyan = wrap("36", "39");
export const gray = wrap("90", "39");
