/**
 * The shape congress.gov serves is consistent enough to handle deterministically:
 *
 *   <html><body><pre>
 *   [Congressional Bills 119th Congress]
 *   [From the U.S. Government Publishing Office]
 *   [H.R. 6204 Introduced in House (IH)]
 *
 *   &lt;DOC&gt;
 */

const ENTITY_MAP: Record<string, string> = {
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
};

function decodeHtmlEntities(input: string): string {
    return input.replace(/&(?:lt|gt|amp|quot|apos|nbsp|#39);/g, (m) => ENTITY_MAP[m] ?? m);
}

const WRAPPER_RE = /<html>\s*<body>\s*<pre>([\s\S]*?)<\/pre>\s*<\/body>\s*<\/html>/i;
const PRELUDE_LINE_RE = /^\s*\[[^\]\n]+\]\s*$/;
const SENTINEL_RE = /^\s*(?:<DOC>|<all>|&lt;DOC&gt;|&lt;all&gt;)\s*$/i;

export function cleanBillText(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    let text = raw;


    const wrapperMatch = text.match(WRAPPER_RE);
    if (wrapperMatch) text = wrapperMatch[1];

    // 2. Decode HTML entities so &lt;DOC&gt; becomes <DOC> for the next step.
    text = decodeHtmlEntities(text);

    const lines = text.split("\n");
    const out: string[] = [];
    let inPrelude = true;
    for (const line of lines) {
        if (inPrelude) {
            if (PRELUDE_LINE_RE.test(line)) continue;
            if (line.trim() === "") continue;
            inPrelude = false;
        }
        if (SENTINEL_RE.test(line)) continue;
        out.push(line);
    }

    const collapsed = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return collapsed.length === 0 ? null : collapsed;
}
