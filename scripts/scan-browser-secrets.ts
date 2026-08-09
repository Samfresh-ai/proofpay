import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const SECRET_PATH = resolve(homedir(), ".local/share/proofpay/coston2-burner-wallets.json");
const SKIP_DIRECTORIES = new Set([".git", ".next", "node_modules"]);

interface SecretFile {
  senderPrivateKey: string;
  recipientPrivateKey: string;
}

async function files(path: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name) || (path.endsWith("contracts") && entry.name === "lib")) continue;
      result.push(...await files(resolve(path, entry.name)));
    } else if (entry.isFile()) {
      result.push(resolve(path, entry.name));
    }
  }
  return result;
}

async function main(): Promise<void> {
  const secret = JSON.parse(await readFile(SECRET_PATH, "utf8")) as SecretFile;
  if (!/^0x[0-9a-f]{64}$/iu.test(secret.senderPrivateKey) || !/^0x[0-9a-f]{64}$/iu.test(secret.recipientPrivateKey)) {
    throw new Error("The owner-only wallet file does not contain the expected key schema.");
  }
  for (const path of await files(ROOT)) {
    const bytes = await readFile(path);
    if (bytes.includes(secret.senderPrivateKey) || bytes.includes(secret.recipientPrivateKey)) {
      throw new Error(`Exact private-key material was found in ${path.replace(`${ROOT}/`, "")}.`);
    }
  }
  console.log("BROWSER_SECRET_SCAN PASS exact private-key values absent from the repository tree");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Browser secret scan failed.");
  process.exitCode = 1;
});
