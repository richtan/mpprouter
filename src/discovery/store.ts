import type { Service, Endpoint } from "./loader.js";
import { getKnownPrice } from "./known-prices.js";

export interface Provider {
  serviceId: string;
  serviceName: string;
  serviceUrl: string;
  endpoint: Endpoint;
  /** Price in USD. null = dynamic/unknown pricing */
  priceUsd: number | null;
}

export interface IntentProviders {
  intent: string;
  providers: Provider[];
}

export class ServiceStore {
  private intentMap = new Map<string, Provider[]>();
  private services: Service[] = [];

  constructor(services: Service[]) {
    this.services = services;
    this.buildIndex();
  }

  private buildIndex() {
    for (const svc of this.services) {
      for (const ep of svc.endpoints) {
        const intents = matchIntents(svc, ep);
        for (const intent of intents) {
          if (!this.intentMap.has(intent)) {
            this.intentMap.set(intent, []);
          }
          const priceUsd = parsePrice(ep.payment) ?? getKnownPrice(svc.id, ep.path);
          this.intentMap.get(intent)!.push({
            serviceId: svc.id,
            serviceName: svc.name,
            serviceUrl: svc.service_url,
            endpoint: ep,
            priceUsd,
          });
        }
      }
    }

    // Deduplicate: keep cheapest endpoint per service per intent
    for (const [intent, providers] of this.intentMap) {
      const byService = new Map<string, Provider>();
      for (const p of providers) {
        const existing = byService.get(p.serviceId);
        if (!existing) {
          byService.set(p.serviceId, p);
        } else if (p.priceUsd !== null && (existing.priceUsd === null || p.priceUsd < existing.priceUsd)) {
          byService.set(p.serviceId, p);
        }
      }
      this.intentMap.set(intent, Array.from(byService.values()));
    }

    // Sort each intent's providers by price (cheapest first, nulls last)
    for (const [, providers] of this.intentMap) {
      providers.sort((a, b) => {
        if (a.priceUsd === null && b.priceUsd === null) return 0;
        if (a.priceUsd === null) return 1;
        if (b.priceUsd === null) return -1;
        return a.priceUsd - b.priceUsd;
      });
    }
  }

  getProviders(intent: string): Provider[] {
    return this.intentMap.get(intent) ?? [];
  }

  getCheapest(intent: string): Provider | null {
    const providers = this.getProviders(intent);
    return providers[0] ?? null;
  }

  getAllIntents(): string[] {
    return Array.from(this.intentMap.keys()).sort();
  }

  getAllProviders(): IntentProviders[] {
    return this.getAllIntents().map((intent) => ({
      intent,
      providers: this.getProviders(intent),
    }));
  }

  getServiceCount(): number {
    return this.services.length;
  }

  getServices(): Service[] {
    return this.services;
  }

  /** Find which intent + providers could serve a given URL */
  findByUrl(url: string): { intent: string; provider: Provider } | null {
    for (const [intent, providers] of this.intentMap) {
      for (const p of providers) {
        if (url.startsWith(p.serviceUrl)) {
          return { intent, provider: p };
        }
      }
    }
    return null;
  }
}

function parsePrice(payment: Endpoint["payment"]): number | null {
  if (!payment || !payment.amount) return null;
  const amount = parseInt(payment.amount, 10);
  const decimals = payment.decimals ?? 6;
  return amount / Math.pow(10, decimals);
}

/**
 * Map a service + endpoint to intent names based on path patterns and service categories.
 */
function matchIntents(svc: Service, ep: Endpoint): string[] {
  const intents: string[] = [];
  const path = ep.path.toLowerCase();
  const id = svc.id.toLowerCase();
  const desc = (ep.description || "").toLowerCase();

  // Web search
  if (
    (path.includes("/search") || path.includes("/query")) &&
    !path.includes("flight") &&
    !path.includes("hotel") &&
    !path.includes("activit") &&
    !path.includes("transfer") &&
    !path.includes("tiktok") &&
    !path.includes("instagram") &&
    !path.includes("facebook") &&
    !path.includes("reddit") &&
    !path.includes("apollo") &&
    !path.includes("whitepages") &&
    !path.includes("google-maps") &&
    !path.includes("maps/place") &&
    !path.includes("places/v1") &&
    !path.includes("token") &&
    !path.includes("hunter") &&
    !path.includes("edgar") &&
    !path.includes("diffbot") &&
    !path.includes("stability") &&
    !path.includes("kicksdb")
  ) {
    // General web search providers
    if (
      id === "parallel" ||
      id === "serpapi" ||
      id === "perplexity" ||
      id === "clado" ||
      (id === "exa" && path.includes("/search")) ||
      (id === "firecrawl" && path.includes("/search")) ||
      (id === "stableenrich" && (path.includes("/exa/") || path.includes("/firecrawl/"))) ||
      (id === "browserbase" && path.includes("/search"))
    ) {
      intents.push("web_search");
    }
  }

  // Scraping / extraction
  if (
    path.includes("/extract") ||
    path.includes("/scrape") ||
    path.includes("/crawl") ||
    (id === "firecrawl" && (path.includes("/v1/scrape") || path.includes("/v1/crawl") || path.includes("/v1/map"))) ||
    (id === "oxylabs") ||
    (id === "browser-use")
  ) {
    intents.push("scrape");
  }

  // LLM / AI models
  if (
    path.includes("/v1/messages") ||
    path.includes("/chat/completions") ||
    path.includes("/v1/completions") ||
    (id === "anthropic") ||
    (id === "openai") ||
    (id === "openrouter") ||
    (id === "gemini" && (path.includes("/generate") || path.includes("/models")))
  ) {
    if (!intents.includes("llm")) intents.push("llm");
  }

  // Image generation
  if (
    (id === "fal") ||
    (id === "stablestudio") ||
    (id === "stability-ai" && !path.includes("search")) ||
    (id === "replicate")
  ) {
    intents.push("image_gen");
  }

  // Travel
  if (
    path.includes("/flights") ||
    path.includes("/hotels") ||
    path.includes("/activit") ||
    path.includes("/transfers") ||
    id === "stabletravel" ||
    id === "aviationstack" ||
    id === "flightapi" ||
    id === "goflightlabs"
  ) {
    intents.push("travel");
  }

  // Email
  if (id === "agentmail" || id === "stableemail") {
    intents.push("email");
  }

  // Social media
  if (
    id === "stablesocial" ||
    path.includes("/tiktok") ||
    path.includes("/instagram") ||
    path.includes("/facebook") ||
    path.includes("/reddit")
  ) {
    intents.push("social");
  }

  // People / company enrichment
  if (
    path.includes("/apollo") ||
    path.includes("/enrich") ||
    path.includes("/whitepages") ||
    id === "hunter" ||
    id === "prospect-butcher" ||
    id === "builtwith" ||
    id === "diffbot"
  ) {
    intents.push("enrich");
  }

  // Maps / geo
  if (
    path.includes("/google-maps") ||
    path.includes("/maps/place") ||
    path.includes("/places/v1") ||
    id === "googlemaps" ||
    id === "mapbox"
  ) {
    intents.push("maps");
  }

  // Blockchain / crypto
  if (
    id === "allium" ||
    id === "codex" ||
    id === "dune" ||
    id === "alchemy" ||
    id === "rpc"
  ) {
    intents.push("blockchain");
  }

  // Storage
  if (id === "storage" || id === "codestorage" || id === "stableupload") {
    intents.push("storage");
  }

  // Compute
  if (id === "modal" || id === "judge0") {
    intents.push("compute");
  }

  // Music
  if (id === "suno") {
    intents.push("music");
  }

  // Weather
  if (id === "openweather") {
    intents.push("weather");
  }

  // SEO
  if (id === "spyfu") {
    intents.push("seo");
  }

  // Finance / SEC
  if (id === "edgar" || id === "edgar-search") {
    intents.push("finance");
  }

  // OCR / document
  if (id === "mathpix") {
    intents.push("ocr");
  }

  // Captcha
  if (id === "twocaptcha") {
    intents.push("captcha");
  }

  // Carbon offset
  if (id === "stripe-climate") {
    intents.push("carbon");
  }

  // Phone
  if (id === "stablephone") {
    intents.push("phone");
  }

  // Postal
  if (id === "postalform") {
    intents.push("postal");
  }

  // Real estate
  if (id === "rentcast") {
    intents.push("realestate");
  }

  return intents;
}
