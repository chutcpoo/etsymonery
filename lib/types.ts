export type Channel = "etsy" | "gumroad" | "payhip";

export type EtsyWhoMade = "i_did" | "collective" | "someone_else";

export type EtsyReleaseGate = {
  productionBuildFrozen?: boolean;
  testerPass?: boolean;
  finalQcPass?: boolean;
  productionAuthorized?: boolean;
};

export type EtsyDraftInput = {
  taxonomyId?: number;
  quantity?: number;
  whoMade?: EtsyWhoMade;
  whenMade?: string;
  release?: EtsyReleaseGate;
};

export type ProductPack = {
  productId: string;
  title: string;
  description: string;
  priceUsd: number;
  files: string[];
  channels: Channel[];
  productTruthVerified: boolean;
  tags?: string[];
  etsy?: EtsyDraftInput;
};

export type GateResult = {
  pass: boolean;
  errors: string[];
};

export type EtsyReleaseState =
  | "BLOCKED"
  | "TESTER_PENDING"
  | "QC_PENDING"
  | "PRODUCTION_AUTHORIZATION_PENDING"
  | "PRODUCTION_AUTHORIZED";

export type ChannelPlan = {
  channel: Channel;
  action: "CREATE_DRAFT";
  payload: Record<string, unknown>;
  candidateFingerprint?: string;
  listingFingerprint?: string;
  releaseState?: EtsyReleaseState;
  draftWriteAllowed?: boolean;
  liveWriteAllowed?: boolean;
  assetPersistenceRequired?: boolean;
};

export type PublishPlan = {
  productId: string;
  status: "READY" | "BLOCKED";
  gate: GateResult;
  channels: ChannelPlan[];
  writesEnabled: boolean;
  etsyDraftWritesEnabled: boolean;
};
