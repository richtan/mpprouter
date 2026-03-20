/** Markup percentage on top of upstream cost */
const MARKUP_PERCENT = parseFloat(process.env.MARKUP_PERCENT || "20");

/** Minimum markup per request in USD — must cover gas */
const MARKUP_MIN = parseFloat(process.env.MARKUP_MIN || "0.002");

/** Default charge when upstream price is unknown (conservatively high) */
const MARKUP_DEFAULT = parseFloat(process.env.MARKUP_DEFAULT || "0.05");

/**
 * Calculate what to charge the caller in USD.
 * If upstream price is unknown, charges MARKUP_DEFAULT.
 */
export function calculateChargeUsd(upstreamPriceUsd: number | null): number {
  if (upstreamPriceUsd === null) {
    return MARKUP_DEFAULT;
  }
  const markup = Math.max(upstreamPriceUsd * (MARKUP_PERCENT / 100), MARKUP_MIN);
  return upstreamPriceUsd + markup;
}

/**
 * Convert USD to the string amount expected by mppx charge().
 * mppx internally calls parseUnits(amount, decimals), so the amount
 * should be in human-readable units (e.g., "0.007" for $0.007 USDC).
 */
export function usdToTokenAmount(usd: number): string {
  return usd.toString();
}

/**
 * Get the markup (revenue) from a transaction.
 */
export function getMarkupUsd(upstreamPriceUsd: number | null, chargedUsd: number): number {
  if (upstreamPriceUsd === null) {
    // Conservative: assume upstream cost is the default charge minus min markup
    return MARKUP_MIN;
  }
  return chargedUsd - upstreamPriceUsd;
}

export { MARKUP_DEFAULT };
