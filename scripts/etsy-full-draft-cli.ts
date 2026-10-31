/** Manual Node runner for the protected staged route (no Vercel required).
 * Usage: node --import tsx scripts/etsy-full-draft-cli.ts path/to/request.json
 * Credentials come from environment only. Never store keys in request JSON.
 */
import { readFile } from "node:fs/promises";
import { POST } from "../app/api/etsy/full-draft/route";

async function main() {
  if (process.argv.length !== 3) {
    throw new Error("USAGE: node --import tsx scripts/etsy-full-draft-cli.ts request.json");
  }
  const secret = process.env.ETSY_DRAFT_WRITE_TOKEN?.trim();
  if (!secret) throw new Error("OPERATOR_AUTH_NOT_CONFIGURED");
  const raw = await readFile(process.argv[2], "utf8");
  if (Buffer.byteLength(raw, "utf8") > 250_000) throw new Error("REQUEST_TOO_LARGE");
  JSON.parse(raw);
  const request = new Request("http://127.0.0.1/api/etsy/full-draft", {
    method: "POST", headers: {"content-type": "application/json",
      "x-autodigitalpublisher-write-token": secret}, body: raw
  });
  const response = await POST(request);
  process.stdout.write(JSON.stringify({
    httpStatus: response.status, response: await response.json()
  }) + "\n");
  if (!response.ok) process.exitCode = 1;
}
main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({
    status: "BLOCKED", error: error instanceof Error ? error.message : "UNKNOWN_ERROR"
  }) + "\n");
  process.exitCode = 1;
});
