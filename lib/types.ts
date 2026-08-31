export type Channel = "etsy" | "gumroad" | "payhip";

export type ProductPack = {
  productId: string;
  title: string;
  description: string;
  priceUsd: number;
  files: string[];
  channels: Channel[];
  productTruthVerified: boolean;
  tags?: string[];
};

export type GateResult = {
  pass: boolean;
  errors: string[];
};

export type ChannelPlan = {
  channel: Channel;
  action: "CREATE_DRAFT";
  payload: Record<string, unknown>;
};

export type PublishPlan = {
  productId: string;
  status: "READY" | "BLOCKED";
  gate: GateResult;
  channels: ChannelPlan[];
  writesEnabled: boolean;
};
