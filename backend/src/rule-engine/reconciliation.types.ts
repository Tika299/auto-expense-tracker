import type {
  ObservationChannel,
  ObservationSource,
} from './deduplication.types';

export type ReconciliationInput = {
  userId: string;
  walletId: string;

  source: ObservationSource;
  channel: ObservationChannel;

  amount: number;
  direction: 'IN' | 'OUT';
  transactionTime: Date;

  referenceCode: string | null;
  counterpartyAccount: string | null;
};

export type InternalTransferCandidate = {
  transactionId: string;
  walletId: string;

  source: ObservationSource;
  channel: ObservationChannel;

  timeDeltaMs: number;

  referenceMatched: boolean;
  accountMatched: boolean;

  confidence: number;
};

export type ReconciliationDecision =
  | {
      kind: 'NO_MATCH';
    }
  | {
      kind: 'AUTO_CONFIRMED';

      reason: 'STRONG_INTERNAL_TRANSFER_MATCH';

      candidate: InternalTransferCandidate;
    }
  | {
      kind: 'PENDING_REVIEW';

      reason:
        | 'AMOUNT_TIME_OPPOSITE_DIRECTION'
        | 'MULTIPLE_INTERNAL_TRANSFER_CANDIDATES';

      candidates: InternalTransferCandidate[];
    };
