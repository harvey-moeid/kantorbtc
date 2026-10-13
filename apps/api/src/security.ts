const enc = new TextEncoder();
const base64 = (a: Uint8Array) => btoa(String.fromCharCode(...a));
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function hashToken(token: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return Array.from(new Uint8Array(b), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function verifyPassword(
  password: string,
  expected?: string,
): Promise<boolean> {
  if (!expected) return false;
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(password)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const actual = new Uint8Array(actualDigest);
  const configured = new Uint8Array(expectedDigest);
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ configured[i];
  return diff === 0;
}
async function encryptionKey(secret?: string): Promise<CryptoKey> {
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret))
    throw new Error("Kunci enkripsi utama belum dikonfigurasi.");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secret.match(/.{2}/g)!, (n) => parseInt(n, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encrypt(value: string, secret?: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await encryptionKey(secret),
    ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(value),
    );
  return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
export async function decrypt(value: string, secret?: string): Promise<string> {
  const [iv, data] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(iv) },
      await encryptionKey(secret),
      bytes(data),
    ),
  );
}
