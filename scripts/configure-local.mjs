import { writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
const destination = new URL("../.dev.vars", import.meta.url);
try {
  await access(destination);
  console.error(".dev.vars sudah ada; pertahankan konfigurasi yang tersedia.");
  process.exit(1);
} catch {}
// Read from stdin without echo; no secrets printed to stdout or saved in tracked files.
if (!stdin.isTTY) {
  console.error(
    "Jalankan secara interaktif di terminal: node scripts/configure-local.mjs",
  );
  process.exit(1);
}
const mutedOutput = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});
const readline = createInterface({
  input: stdin,
  output: mutedOutput,
  terminal: true,
});
const question = "Password admin lokal (minimal 12 karakter): ";
stdout.write(question);
const password = await readline.question("");
stdout.write("\n");
readline.close();
if (password.length < 12) {
  console.error("Password minimal 12 karakter.");
  process.exit(1);
}
await writeFile(
  destination,
  `APP_MODE="demo"\nADMIN_PASSWORD=${JSON.stringify(password)}\nENCRYPTION_KEY="${randomBytes(32).toString("hex")}"\n`,
  { mode: 0o600, flag: "wx" },
);
console.log("Login lokal siap. .dev.vars diabaikan Git; APP_MODE tetap demo.");
