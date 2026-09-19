export type Channel = "etsy" | "gumroad" | "payhip";

export type EtsyWhoMade = "i_did" | "collective" | "someone_else";

export type AuthoritativeArtifactIdentity = {
  driveId: string;
  sha256: string;
  fileName?: string;
  altText?: string;
};

export type AuthoritativeCandidateBinding = {
  schemaVersion: "1.0.0";
  candidateId: string;
  candidateFingerprint: string;
  listingFingerprint: string;
  productId: string;
  buyerWorkbook: AuthoritativeArtifactIdentity;
  gallery: AuthoritativeArtifactIdentity[];
  video: AuthoritativeArtifactIdentity;
  testerPassFingerprint: string;
  finalQcPassFingerprint: string;
  listingSettings: Record<string, unknown>;
};

export type EtsyReleaseGate = {
  productionBuildFrozen?: boolean;
  testerPass?: boolean;
  finalQcPass?: boolean;
  productionAuthorized?: boolean;
  authoritativeCandidate?: AuthoritativeCandidateBinding;
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
  candidateId?: string;
  authoritativeCandidateBound?: boolean;
  authoritativeCandidate?: AuthoritativeCandidateBinding;
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
