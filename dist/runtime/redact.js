const LABELS = [
    "authorization", "proxy-authorization", "api[_-]?key", "apikey",
    "access[_-]?token", "auth[_-]?token", "refresh[_-]?token", "id[_-]?token",
    "token", "password", "passwd", "secret", "client[_-]?secret", "private[_-]?key",
].join("|");
const PREFIXES = [
    "github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_",
    "glpat-", "glsa_", "gldt-", "npm_", "pypi-", "hf_",
    "xoxb-", "xoxp-", "xoxa-", "xoxr-", "xoxs-", "xapp-",
    "shpat_", "shpss_", "sk-ant-", "sk_live_", "sk_test_", "sk-", "AIza", "AKIA", "ASIA",
].join("|");
const RULES = [
    { pattern: new RegExp(`((?:${LABELS})\\s*[:=]\\s*(?:[Bb]earer\\s+)?)("[^"]*"|'[^']*'|[^\\s,"'}]+)`, "gi"), replace: "$1[REDACTED]" },
    { pattern: /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]+@/g, replace: "$1[REDACTED]@" },
    { pattern: new RegExp(`(?:${PREFIXES})[A-Za-z0-9_-]{8,}`, "g"), replace: "[REDACTED]" },
    { pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/g, replace: "Bearer [REDACTED]" },
];
export function redactSecrets(text) {
    let result = text;
    for (const rule of RULES)
        result = result.replace(rule.pattern, rule.replace);
    return result;
}
/** Redacts the whole buffer first, so a secret split across chunks is still whole when matched. */
export function redactLogTail(raw, cap) {
    const redacted = redactSecrets(raw);
    if (raw.length <= cap)
        return redacted;
    const tail = redacted.slice(-cap);
    const firstBreak = tail.indexOf("\n");
    return firstBreak >= 0 ? tail.slice(firstBreak + 1) : tail;
}
