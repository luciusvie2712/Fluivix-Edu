import { describe, expect, test } from "vitest";
import { trustedProxyPeers } from "../../apps/api/src/trusted-proxy";

describe("explicit reverse-proxy trust boundary", () => {
  test("direct deployments ignore forwarding headers by default", () => {
    expect(trustedProxyPeers()).toEqual([]);
    expect(trustedProxyPeers("[]")).toEqual([]);
  });
  test("accepts only explicitly named host peers and canonicalizes IPv6", () => {
    expect(
      trustedProxyPeers('["192.0.2.10/32","2001:0DB8:0:0:0:0:0:1/128"]'),
    ).toEqual(["192.0.2.10/32", "2001:db8::1/128"]);
  });
  test.each([
    "true",
    "1",
    '"loopback"',
    '["uniquelocal"]',
    '["0.0.0.0/0"]',
    '["::/0"]',
    '["10.0.0.0/8"]',
    '["192.0.2.10"]',
    '["proxy.example.test/32"]',
  ])("refuses implicit or broad trust configuration %s", (value) => {
    expect(() => trustedProxyPeers(value)).toThrow(
      "TRUSTED_PROXY_CONFIG_INVALID",
    );
  });
  test("refuses duplicate peers including alternate IPv6 spellings", () => {
    expect(() =>
      trustedProxyPeers('["::1/128","0:0:0:0:0:0:0:1/128"]'),
    ).toThrow("TRUSTED_PROXY_CONFIG_INVALID");
    expect(() =>
      trustedProxyPeers('["192.0.2.10/32","192.0.2.10/32"]'),
    ).toThrow("TRUSTED_PROXY_CONFIG_INVALID");
  });
  test("rejects mapped, scoped and unspecified address ambiguity", () => {
    for (const peer of [
      "::ffff:192.0.2.10/128",
      "fe80::1%eth0/128",
      "::/128",
      "0.0.0.0/32",
      "::1/32",
      "192.0.2.10/128",
    ])
      expect(() => trustedProxyPeers(JSON.stringify([peer]))).toThrow(
        "TRUSTED_PROXY_CONFIG_INVALID",
      );
  });
  test("bounds configuration size and never reflects rejected input", () => {
    expect(() =>
      trustedProxyPeers(
        JSON.stringify(Array.from({ length: 33 }, (_, i) => `192.0.2.${i}/32`)),
      ),
    ).toThrow("TRUSTED_PROXY_CONFIG_INVALID");
    expect(() => trustedProxyPeers("x".repeat(8193))).toThrow(
      "TRUSTED_PROXY_CONFIG_INVALID",
    );
    expect(() => trustedProxyPeers("SENSITIVE_CONFIGURATION_SENTINEL")).toThrow(
      /^TRUSTED_PROXY_CONFIG_INVALID$/,
    );
  });
});
