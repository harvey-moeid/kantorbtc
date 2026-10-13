import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashToken, verifyPassword } from "./security";
import { safeWebhook } from "./notifications";
describe("credentials and authentication", () => {
  it("checks the configured plain password exactly", async () => {
    expect(
      await verifyPassword("local-test-password", "local-test-password"),
    ).toBe(true);
    expect(await verifyPassword("wrong", "local-test-password")).toBe(false);
    expect(
      await verifyPassword(" local-test-password", "local-test-password"),
    ).toBe(false);
    expect(
      await verifyPassword("local-test-password", "local-test-password "),
    ).toBe(false);
  });
  it("rejects missing or empty password configuration", async () => {
    expect(await verifyPassword("anything")).toBe(false);
    expect(await verifyPassword("", "")).toBe(false);
  });
  it("encrypts with unique nonce and recovers plaintext", async () => {
    const key = "ab".repeat(32),
      a = await encrypt("test-fixture-value", key),
      b = await encrypt("test-fixture-value", key);
    expect(a).not.toEqual(b);
    expect(a).not.toContain("test-fixture-value");
    expect(await decrypt(a, key)).toBe("test-fixture-value");
  });
  it("rejects a different encryption key", async () => {
    const a = await encrypt("fixture", "ab".repeat(32));
    await expect(decrypt(a, "cd".repeat(32))).rejects.toThrow();
  });
  it("refuses a missing encryption key", async () => {
    await expect(encrypt("fixture")).rejects.toThrow();
  });
  it("hashes session tokens", async () => {
    expect(await hashToken("fixture")).toHaveLength(64);
  });
  it.each([
    "http://discord.com/api/webhooks/1/key",
    "https://example.com/api/webhooks/1/key",
    "https://discord.com.evil.test/api/webhooks/1/key",
    "https://user:pass@discord.com/api/webhooks/1/key",
    "https://discord.com:443/api/webhooks/1/key?x=1",
    "https://discord.com/api/users",
  ])("refuses webhook SSRF vector %s", (value) =>
    expect(safeWebhook(value)).toBe(false),
  );
  it("accepts a standard Discord webhook without invoking it", () =>
    expect(
      safeWebhook("https://discord.com/api/webhooks/123456789/fixture-key_abc"),
    ).toBe(true));
});
