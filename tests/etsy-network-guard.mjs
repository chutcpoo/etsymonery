// Test doubles replace fetch after this preload. An unmocked Etsy request must
// fail before reaching the network, including accidental credential refresh.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "etsy.com" || url.hostname.endsWith(".etsy.com")) {
    throw new Error(`TEST_LIVE_ETSY_NETWORK_FORBIDDEN:${init?.method ?? "GET"}`);
  }
  return originalFetch(input, init);
};
