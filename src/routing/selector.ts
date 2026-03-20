import type { Provider } from "../discovery/store.js";
import type { ServiceStore } from "../discovery/store.js";

export interface Selection {
  chosen: Provider;
  alternatives: Provider[];
  savedVsNext: number | null;
}

/** Recent failures: serviceId -> timestamp of last failure */
const recentFailures = new Map<string, number>();
const FAILURE_COOLDOWN_MS = 60_000; // Skip failed providers for 1 min

export function markFailed(serviceId: string) {
  recentFailures.set(serviceId, Date.now());
}

export function selectProvider(intent: string, store: ServiceStore, pinnedProviderId?: string | null): Selection | null {
  const providers = store.getProviders(intent);
  if (providers.length === 0) return null;

  const now = Date.now();

  // If a provider is pinned (from a previous 402 round-trip), prefer it
  if (pinnedProviderId) {
    const pinned = providers.find((p) => p.serviceId === pinnedProviderId);
    if (pinned) {
      const failedAt = recentFailures.get(pinned.serviceId);
      const isAvailable = !failedAt || now - failedAt > FAILURE_COOLDOWN_MS;
      if (isAvailable) {
        const others = providers.filter((p) => p.serviceId !== pinnedProviderId);
        return {
          chosen: pinned,
          alternatives: others,
          savedVsNext: computeSavings(pinned, others[0]),
        };
      }
    }
    // Pinned provider unavailable — fall through to normal selection
    // (will cause amount mismatch and a new 402)
  }

  // Filter out recently failed providers
  const available = providers.filter((p) => {
    const failedAt = recentFailures.get(p.serviceId);
    if (!failedAt) return true;
    if (now - failedAt > FAILURE_COOLDOWN_MS) {
      recentFailures.delete(p.serviceId);
      return true;
    }
    return false;
  });

  if (available.length === 0) {
    // All failed recently — try them all anyway
    return {
      chosen: providers[0],
      alternatives: providers.slice(1),
      savedVsNext: computeSavings(providers[0], providers[1]),
    };
  }

  return {
    chosen: available[0],
    alternatives: available.slice(1),
    savedVsNext: computeSavings(available[0], available[1]),
  };
}

function computeSavings(chosen: Provider, next?: Provider): number | null {
  if (!next) return null;
  if (chosen.priceUsd === null || next.priceUsd === null) return null;
  return next.priceUsd - chosen.priceUsd;
}
