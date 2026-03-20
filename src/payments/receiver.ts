import { Mppx, tempo, Transport } from "mppx/server";
import { Credential } from "mppx";

// Base USDC on Base mainnet
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

const RECEIVING_ADDRESS = process.env.RECEIVING_ADDRESS;
const SECRET_KEY = process.env.MPP_SECRET_KEY;

/** Replay protection: seen tx hashes -> timestamp */
const seenTxHashes = new Map<string, number>();
const REPLAY_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REPLAY_MAX_ENTRIES = 10_000;

function evictStaleHashes() {
  if (seenTxHashes.size < REPLAY_MAX_ENTRIES / 2) return;
  const now = Date.now();
  for (const [hash, ts] of seenTxHashes) {
    if (now - ts > REPLAY_TTL_MS) {
      seenTxHashes.delete(hash);
    }
  }
}

/**
 * Check if a tx hash has been seen before. Returns true if replay detected.
 */
export function checkReplay(reference: string): boolean {
  evictStaleHashes();
  if (seenTxHashes.has(reference)) return true;
  if (seenTxHashes.size >= REPLAY_MAX_ENTRIES) {
    // Evict oldest entry
    const oldest = seenTxHashes.keys().next().value!;
    seenTxHashes.delete(oldest);
  }
  seenTxHashes.set(reference, Date.now());
  return false;
}

/**
 * Create the mppx server payment handler.
 * Only call this when PAYMENT_MODE=paid and RECEIVING_ADDRESS is set.
 */
export function createPaymentHandler() {
  if (!RECEIVING_ADDRESS) {
    throw new Error("RECEIVING_ADDRESS is required for paid mode");
  }

  const mppx = Mppx.create({
    methods: [tempo.charge({ recipient: RECEIVING_ADDRESS as `0x${string}`, currency: USDC_ADDRESS, decimals: 6 })],
    secretKey: SECRET_KEY,
  });

  return mppx;
}

/**
 * Extract the pinned provider ID from an incoming Authorization header.
 * Returns null if no Payment credential or no providerId in opaque.
 */
export function extractPinnedProvider(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  try {
    const paymentScheme = Credential.extractPaymentScheme(authHeader);
    if (!paymentScheme) return null;
    const credential = Credential.deserialize(paymentScheme);
    return credential.challenge.opaque?.providerId ?? null;
  } catch {
    return null;
  }
}

export type PaymentHandler = ReturnType<typeof createPaymentHandler>;

/**
 * Create the mppx server payment handler for MCP SDK transport.
 * Only call this when PAYMENT_MODE=paid and RECEIVING_ADDRESS is set.
 */
export function createMcpPaymentHandler() {
  if (!RECEIVING_ADDRESS) {
    throw new Error("RECEIVING_ADDRESS is required for paid mode");
  }

  return Mppx.create({
    methods: [tempo.charge({ recipient: RECEIVING_ADDRESS as `0x${string}`, currency: USDC_ADDRESS, decimals: 6 })],
    secretKey: SECRET_KEY,
    transport: Transport.mcpSdk(),
  });
}

export type McpPaymentHandler = ReturnType<typeof createMcpPaymentHandler>;

/**
 * Extract the pinned provider ID from MCP tool handler extra._meta.
 * Returns null if no credential or no providerId in opaque.
 */
export function extractMcpPinnedProvider(extra: any): string | null {
  try {
    const credential = extra?._meta?.["org.paymentauth/credential"];
    if (!credential) return null;
    return credential.challenge?.opaque?.providerId ?? null;
  } catch {
    return null;
  }
}
