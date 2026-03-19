export interface IntentDef {
  name: string;
  description: string;
  defaultMethod: string;
  /** How to build the request URL from query params */
  buildUrl?: (provider: { serviceUrl: string; endpointPath: string }, params: Record<string, string>) => { url: string; method: string; body?: string };
}

export const INTENTS: IntentDef[] = [
  {
    name: "web_search",
    description: "Search the web for information",
    defaultMethod: "POST",
    buildUrl: (p, params) => ({
      url: `${p.serviceUrl}${p.endpointPath}`,
      method: "POST",
      body: JSON.stringify({ query: params.q || params.query || "", num_results: parseInt(params.num || "5") }),
    }),
  },
  {
    name: "scrape",
    description: "Extract content from a URL",
    defaultMethod: "POST",
    buildUrl: (p, params) => ({
      url: `${p.serviceUrl}${p.endpointPath}`,
      method: "POST",
      body: JSON.stringify({ url: params.url, formats: ["markdown"] }),
    }),
  },
  {
    name: "llm",
    description: "Query a large language model",
    defaultMethod: "POST",
  },
  {
    name: "image_gen",
    description: "Generate images from text",
    defaultMethod: "POST",
  },
  {
    name: "travel",
    description: "Search flights, hotels, activities",
    defaultMethod: "POST",
  },
  {
    name: "email",
    description: "Send or manage email",
    defaultMethod: "POST",
  },
  {
    name: "social",
    description: "Search social media platforms",
    defaultMethod: "POST",
  },
  {
    name: "enrich",
    description: "Enrich people/company data",
    defaultMethod: "POST",
  },
  {
    name: "maps",
    description: "Geocoding and place search",
    defaultMethod: "POST",
  },
  {
    name: "blockchain",
    description: "Query blockchain data",
    defaultMethod: "POST",
  },
  {
    name: "weather",
    description: "Get weather data",
    defaultMethod: "GET",
  },
  {
    name: "finance",
    description: "SEC filings and financial data",
    defaultMethod: "POST",
  },
];

export function getIntentDef(name: string): IntentDef | undefined {
  return INTENTS.find((i) => i.name === name);
}
