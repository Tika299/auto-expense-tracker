import { transactionObservations } from '../database/schema';

export type ObservationSource = 'VIETCOMBANK' | 'MBBANK' | 'MOMO';

export type ObservationChannel = 'ANDROID_NOTIFICATION' | 'EMAIL';

export type ObservationRecord = typeof transactionObservations.$inferSelect;

export type ObservationIdentityInput = {
  userId: string;
  source: ObservationSource;
  channel: ObservationChannel;

  // Chỉ truyền khi nguồn cung cấp ID thực sự ổn định.
  sourceMessageId?: string | null;

  rawText: string;
  observedAt: string;
};

export type ObservationMatchedBy =
  'SOURCE_MESSAGE_ID' | 'PAYLOAD_HASH' | 'NORMALIZED_CONTENT_HASH' | null;

export type ObservationDeduplicationResult = {
  duplicate: boolean;
  matchedBy: ObservationMatchedBy;
  observation: ObservationRecord | null;
  payloadHash: string;
  normalizedContentHash: string;
};

export type TransactionCandidateInput = {
  userId: string;

  source: ObservationSource;
  channel: ObservationChannel;

  amount: number;
  direction: 'IN' | 'OUT';
  transactionTime: Date;

  referenceCode: string | null;
  merchantName: string | null;
  counterpartyAccount: string | null;
};

export type DuplicateCandidate = {
  transactionId: string;
  timeDeltaMs: number;
  merchantMatched: boolean;
  accountMatched: boolean;
  confidence: number;
};

export type TransactionDeduplicationDecision =
  | {
      kind: 'NO_DUPLICATE';
    }
  | {
      kind: 'EXACT_DUPLICATE';
      canonicalTransactionId: string;
      reason: 'REFERENCE_CODE';
      confidence: 100;
    }
  | {
      kind: 'AUTO_MERGE';
      canonicalTransactionId: string;
      reason: 'COUNTERPARTY_ACCOUNT' | 'MERCHANT_NAME';
      confidence: number;
    }
  | {
      kind: 'PENDING_REVIEW';
      reason:
        | 'AMOUNT_TIME_ONLY'
        | 'MULTIPLE_REFERENCE_MATCHES'
        | 'MULTIPLE_FUZZY_MATCHES';
      candidates: DuplicateCandidate[];
    };
