/** Explicit, fail-closed single-shop mode. Never infers permission from tokens. */
export function privateSingleShopId() {
  if (process.env.ETSY_PRIVATE_SINGLE_SHOP_READ_ENABLED !== "true") return null;
  const configured = Number(process.env.ETSY_SHOP_ID);
  const approved = Number(process.env.ETSY_READ_APPROVED_SHOP_ID);
  if (!Number.isSafeInteger(configured) || configured < 1 || configured !== approved) return null;
  return configured;
}
