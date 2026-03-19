/**
 * Known prices for MPP services, gathered from documentation and dry runs.
 * Format: serviceId -> endpointPattern -> price in USD
 *
 * These are used when the service directory doesn't include pricing
 * (which is the case for all services currently — pricing is dynamic via 402).
 */
export const KNOWN_PRICES: Record<string, Record<string, number>> = {
  // Web search
  parallel: {
    "/api/search": 0.01,
    "/api/extract": 0.01,
    "/api/task": 0.05,
  },
  serpapi: {
    "/search": 0.04,
  },
  perplexity: {
    "/perplexity/search": 0.01,
  },
  exa: {
    "/search": 0.005,
    "/contents": 0.005,
    "/findSimilar": 0.005,
  },
  firecrawl: {
    "/v1/search": 0.052,
    "/v1/scrape": 0.002,
    "/v1/crawl": 0.01,
    "/v1/map": 0.005,
  },
  stableenrich: {
    // Exa via StableEnrich
    "/api/exa/search": 0.04,
    "/api/exa/contents": 0.04,
    // Firecrawl via StableEnrich
    "/api/firecrawl/search": 0.04,
    "/api/firecrawl/scrape": 0.04,
    // Serper via StableEnrich
    "/api/serper/search": 0.04,
    "/api/serper/news": 0.04,
    "/api/serper/images": 0.04,
    // Apollo
    "/api/apollo/people-search": 0.04,
    "/api/apollo/org-search": 0.04,
    "/api/apollo/enrich-person": 0.04,
    "/api/apollo/enrich-org": 0.04,
    // Reddit
    "/api/reddit/search": 0.04,
    // Google Maps
    "/api/google-maps/text-search/full": 0.08,
    "/api/google-maps/text-search/partial": 0.04,
  },
  browserbase: {
    "/search": 0.01,
  },
  clado: {
    "/clado/search": 0.01,
    "/clado/deep-research": 0.10,
  },

  // LLM
  anthropic: {
    "/v1/messages": 0.003,
  },
  openai: {
    "/v1/chat/completions": 0.003,
  },
  openrouter: {
    "/api/v1/chat/completions": 0.003,
  },
  gemini: {
    // Variable
  },

  // Travel
  stabletravel: {
    "/api/flights/search": 0.04,
    "/api/hotels/search": 0.04,
    "/api/activities/search": 0.04,
    "/api/transfers/search": 0.04,
  },

  // Social
  stablesocial: {
    "/api/tiktok/search": 0.04,
    "/api/instagram/search": 0.04,
    "/api/facebook/search": 0.04,
    "/api/reddit/search": 0.04,
  },

  // Image
  stablestudio: {},
  fal: {},
  "stability-ai": {},

  // Scraping
  oxylabs: {},
  "browser-use": {},
};

/**
 * Look up a known price for a service + endpoint path.
 * Returns null if unknown.
 */
export function getKnownPrice(serviceId: string, endpointPath: string): number | null {
  const svcPrices = KNOWN_PRICES[serviceId];
  if (!svcPrices) return null;

  // Exact match
  if (endpointPath in svcPrices) return svcPrices[endpointPath];

  // Partial match (endpoint might have params like :id)
  for (const [pattern, price] of Object.entries(svcPrices)) {
    if (endpointPath.startsWith(pattern)) return price;
  }

  return null;
}
