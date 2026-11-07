export type CategorizationInput = {
  userId: string;

  direction: 'IN' | 'OUT';
  kind: 'NORMAL' | 'INTERNAL_TRANSFER';
  reviewStatus: 'CONFIRMED' | 'PENDING_REVIEW';

  merchantName: string | null;
  counterpartyAccount: string | null;

  /**
   * Nội dung notification/email giúp từ điển mặc định
   * nhận diện được nhiều trường hợp hơn merchantName.
   */
  rawText?: string | null;
};

export type CategorizationDecision =
  | {
      categoryId: string;
      source: 'USER_RULE';
      matchedRuleId: string;
    }
  | {
      categoryId: string;
      source: 'DEFAULT_KEYWORD';
      matchedRuleId: null;
    }
  | {
      categoryId: null;
      source: 'NONE';
      matchedRuleId: null;
    };
