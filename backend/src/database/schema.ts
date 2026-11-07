import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const transactionDirection = pgEnum('transaction_direction', [
  'IN',
  'OUT',
]);

export const transactionOrigin = pgEnum('transaction_origin', [
  'MANUAL',
  'PARSER',
]);

export const observationSource = pgEnum('observation_source', [
  'VIETCOMBANK',
  'MBBANK',
  'MOMO',
]);

export const observationChannel = pgEnum('observation_channel', [
  'ANDROID_NOTIFICATION',
  'EMAIL',
]);

export const observationStatus = pgEnum('observation_status', [
  'PENDING',
  'PARSED',
  'REJECTED',
  'DUPLICATE',
  'PENDING_REVIEW',
]);

export const walletType = pgEnum('wallet_type', ['BANK', 'EWALLET', 'CASH']);

export const categoryScope = pgEnum('category_scope', ['IN', 'OUT', 'BOTH']);

export const transactionKind = pgEnum('transaction_kind', [
  'NORMAL',
  'INTERNAL_TRANSFER',
]);

export const transactionReviewStatus = pgEnum('transaction_review_status', [
  'CONFIRMED',
  'PENDING_REVIEW',
  'EXCLUDED',
]);

export const categorizationSource = pgEnum('categorization_source', [
  'MANUAL',
  'USER_RULE',
  'DEFAULT_KEYWORD',
  'NONE',
]);

export const transactionLinkType = pgEnum('transaction_link_type', [
  'POSSIBLE_DUPLICATE',
  'INTERNAL_TRANSFER',
]);

export const transactionLinkStatus = pgEnum('transaction_link_status', [
  'AUTO_CONFIRMED',
  'PENDING_REVIEW',
  'USER_CONFIRMED',
  'USER_REJECTED',
]);

export const categorizationMatchField = pgEnum('categorization_match_field', [
  'MERCHANT_NAME',
  'COUNTERPARTY_ACCOUNT',
]);

export const categorizationOperator = pgEnum('categorization_operator', [
  'EXACT',
  'CONTAINS',
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp('updated_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    type: walletType('type').notNull(),
    currency: text('currency').default('VND').notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('wallets_user_name_uidx').on(table.userId, table.name),
    index('wallets_user_id_idx').on(table.userId),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    scope: categoryScope('scope').default('BOTH').notNull(),
    icon: text('icon'),
    color: text('color'),
    isArchived: boolean('is_archived').default(false).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('categories_user_name_uidx').on(table.userId, table.name),
    index('categories_user_id_idx').on(table.userId),
  ],
);

export const categorizationRules = pgTable(
  'categorization_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),

    matchField: categorizationMatchField('match_field').notNull(),
    operator: categorizationOperator('operator').notNull(),

    pattern: text('pattern').notNull(),

    priority: integer('priority').default(100).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('categorization_rules_user_match_uidx').on(
      table.userId,
      table.matchField,
      table.operator,
      table.pattern,
    ),

    index('categorization_rules_user_active_priority_idx').on(
      table.userId,
      table.isActive,
      table.priority,
    ),

    index('categorization_rules_category_idx').on(table.categoryId),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),

    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),

    amount: bigint('amount', { mode: 'number' }).notNull(),
    direction: transactionDirection('direction').notNull(),

    kind: transactionKind('kind').default('NORMAL').notNull(),

    reviewStatus: transactionReviewStatus('review_status')
      .default('CONFIRMED')
      .notNull(),

    transactionTime: timestamp('transaction_time', {
      withTimezone: true,
    }).notNull(),

    referenceCode: text('reference_code'),
    merchantName: text('merchant_name'),
    counterpartyAccount: text('counterparty_account'),

    categorizationSource: categorizationSource('categorization_source')
      .default('NONE')
      .notNull(),

    matchedRuleId: uuid('matched_rule_id').references(
      () => categorizationRules.id,
      {
        onDelete: 'set null',
      },
    ),
    note: text('note'),

    origin: transactionOrigin('origin').notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('transactions_user_time_idx').on(table.userId, table.transactionTime),
    index('transactions_wallet_time_idx').on(
      table.walletId,
      table.transactionTime,
    ),
    index('transactions_category_idx').on(table.categoryId),
    index('transactions_reference_idx').on(table.referenceCode),
    index('transactions_user_match_idx').on(
      table.userId,
      table.amount,
      table.direction,
      table.transactionTime,
    ),

    index('transactions_review_status_idx').on(table.reviewStatus),

    index('transactions_kind_idx').on(table.kind),

    index('transactions_matched_rule_idx').on(table.matchedRuleId),
  ],
);

export const transactionLinks = pgTable(
  'transaction_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    primaryTransactionId: uuid('primary_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),

    relatedTransactionId: uuid('related_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),

    linkType: transactionLinkType('link_type').notNull(),

    status: transactionLinkStatus('status').default('PENDING_REVIEW').notNull(),

    // Sử dụng thang điểm 0–100.
    confidence: integer('confidence').default(0).notNull(),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    resolvedAt: timestamp('resolved_at', {
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex('transaction_links_pair_type_uidx').on(
      table.primaryTransactionId,
      table.relatedTransactionId,
      table.linkType,
    ),

    index('transaction_links_user_status_idx').on(table.userId, table.status),

    index('transaction_links_primary_idx').on(table.primaryTransactionId),

    index('transaction_links_related_idx').on(table.relatedTransactionId),
  ],
);

export const transactionObservations = pgTable(
  'transaction_observations',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    walletId: uuid('wallet_id').references(() => wallets.id, {
      onDelete: 'set null',
    }),

    transactionId: uuid('transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),

    source: observationSource('source').notNull(),
    channel: observationChannel('channel').notNull(),

    sourceMessageId: text('source_message_id'),

    rawText: text('raw_text').notNull(),

    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),

    payloadHash: text('payload_hash').notNull(),

    normalizedContentHash: text('normalized_content_hash'),

    observedAt: timestamp('observed_at', {
      withTimezone: true,
    }).notNull(),

    status: observationStatus('status').default('PENDING').notNull(),

    parserRule: text('parser_rule'),
    parseErrorCode: text('parse_error_code'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('observations_user_hash_uidx').on(
      table.userId,
      table.payloadHash,
    ),
    uniqueIndex('observations_source_message_uidx').on(
      table.userId,
      table.source,
      table.channel,
      table.sourceMessageId,
    ),

    index('observations_normalized_hash_time_idx').on(
      table.userId,
      table.normalizedContentHash,
      table.observedAt,
    ),
    index('observations_user_time_idx').on(table.userId, table.observedAt),
    index('observations_status_idx').on(table.status),
    index('observations_transaction_idx').on(table.transactionId),
  ],
);
