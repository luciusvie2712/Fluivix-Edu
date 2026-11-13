import { isIP } from "node:net";

function invalid(): never {
  // Configuration can contain arbitrary operator input. Do not echo it.
  throw new Error("TRUSTED_PROXY_CONFIG_INVALID");
}

/** Explicit single-host peers only; forwarded headers remain untrusted by default. */
export function trustedProxyPeers(value = "[]"): readonly string[] {
  if (value.length > 8192) return invalid();
  let peers: unknown;
  try {
    peers = JSON.parse(value);
  } catch {
    return invalid();
  }
  if (!Array.isArray(peers) || peers.length > 32) return invalid();
  const canonical: string[] = [];
  for (const peer of peers) {
    if (typeof peer !== "string" || peer.length > 128) return invalid();
    const parts = peer.split("/");
    if (parts.length !== 2) return invalid();
    const [address, mask] = parts;
    if (!address || address.includes("%")) return invalid();
    const family = isIP(address);
    if (!family || mask !== (family === 4 ? "32" : "128")) return invalid();
    const normalized =
      family === 6
        ? new URL(`http://[${address}]/`).hostname.slice(1, -1)
        : address;
    // Use native IPv4 notation for mapped addresses so duplicate aliases cannot
    // accidentally broaden the peer list or confuse deployment review.
    if (
      normalized.startsWith("::ffff:") ||
      normalized === "::" ||
      normalized === "0.0.0.0"
    )
      return invalid();
    const cidr = normalized + "/" + mask;
    if (canonical.includes(cidr)) return invalid();
    canonical.push(cidr);
  }
  return Object.freeze(canonical);
}
