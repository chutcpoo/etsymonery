export const ETSY_WRITE_COUNT = 0 as const;

export const ETSY_SUPPORTED_PROVIDER_EVENTS = [
  "order.paid",
  "order.canceled",
  "order.shipped",
  "order.delivered"
] as const;

export type EtsySupportedProviderEvent =
  (typeof ETSY_SUPPORTED_PROVIDER_EVENTS)[number];

export type EtsyCommerceEventType =
  | "ORDER_PAID"
  | "ORDER_CANCELED"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "UNSUPPORTED_EVENT";

export type EtsyProcessingState =
  | "PROCESSING"
  | "PROCESSED"
  | "UNSUPPORTED_EVENT";

export type EtsyVerificationState = "SIGNATURE_VERIFIED";

export type EtsyReadbackState =
  | "PENDING"
  | "VERIFIED"
  | "NOT_AVAILABLE"
  | "FAILED_READ_ONLY";

export type EtsyCommerceEvent = {
  eventId: string;
  provider: "etsy";
  eventType: EtsyCommerceEventType;
  providerEventType: string;
  webhookId: string;
  eventTimestamp: string;
  receivedAt: string;
  payloadSha256: string;
  shopId: number | null;
  receiptId: number | null;
  listingIds: number[];
  processingState: EtsyProcessingState;
  verificationState: EtsyVerificationState;
  readbackState: EtsyReadbackState;
  correlationId: string;
  duplicateCount: number;
  lastDuplicateAt: string | null;
  readbackVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EtsyEventClaimInput = Omit<
  EtsyCommerceEvent,
  | "duplicateCount"
  | "lastDuplicateAt"
  | "readbackVerifiedAt"
  | "createdAt"
  | "updatedAt"
>;

export type EtsyEventClaimResult = {
  claimed: boolean;
  event: EtsyCommerceEvent;
};

export type EtsyEventsHealth = {
  webhookSigningSecretConfigured: boolean;
  lastVerifiedEtsyEvent: string | null;
  eventsReceived: number;
  duplicateDeliveriesSafelyIgnored: number;
  signatureFailures: number;
  readbackFailures: number;
  ETSY_WRITE_COUNT: typeof ETSY_WRITE_COUNT;
};

export type EtsyEventsSnapshot = {
  status: "PASS";
  mode: "READ_ONLY";
  generatedAt: string;
  filters: {
    limit: number;
    eventType: EtsyCommerceEventType | null;
  };
  health: EtsyEventsHealth;
  events: EtsyCommerceEvent[];
  privacy: {
    buyerPiiReturned: false;
    rawPayloadStored: false;
  };
  ETSY_WRITE_COUNT: typeof ETSY_WRITE_COUNT;
};

export const PROVIDER_EVENT_TYPE_MAP: Record<
  EtsySupportedProviderEvent,
  Exclude<EtsyCommerceEventType, "UNSUPPORTED_EVENT">
> = {
  "order.paid": "ORDER_PAID",
  "order.canceled": "ORDER_CANCELED",
  "order.shipped": "ORDER_SHIPPED",
  "order.delivered": "ORDER_DELIVERED"
};

export function normalizeProviderEventType(value: string): EtsyCommerceEventType {
  const providerEventType = value.trim().toLowerCase();
  return (
    PROVIDER_EVENT_TYPE_MAP[providerEventType as EtsySupportedProviderEvent] ??
    "UNSUPPORTED_EVENT"
  );
}

