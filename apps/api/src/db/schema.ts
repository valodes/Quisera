import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    username: text('username'),
    email: text('email').notNull(),
    emailVerified: integer('emailVerified', { mode: 'boolean' })
      .notNull()
      .default(false),
    image: text('image'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
    role: text('role').notNull().default('user'),
    banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
    banReason: text('banReason'),
    banExpires: integer('banExpires', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('user_email_unique').on(table.email),
    uniqueIndex('user_username_unique').on(table.username),
  ],
)

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonatedBy'),
  },
  (table) => [
    uniqueIndex('session_token_unique').on(table.token),
    index('session_user_id_idx').on(table.userId),
  ],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: integer('accessTokenExpiresAt', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_unique').on(
      table.providerId,
      table.accountId,
    ),
  ],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const rateLimit = sqliteTable(
  'rateLimit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: integer('lastRequest').notNull(),
  },
  (table) => [uniqueIndex('rate_limit_key_unique').on(table.key)],
)

export const recipe = sqliteTable(
  'recipe',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: ['house', 'quitoque'] })
      .notNull()
      .default('house'),
    title: text('title').notNull(),
    description: text('description'),
    photoKey: text('photo_key').unique(),
    photoMimeType: text('photo_mime_type'),
    photoUrl: text('photo_url'),
    photoThumbnailUrl: text('photo_thumbnail_url'),
    totalMinutes: integer('total_minutes'),
    difficulty: text('difficulty'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('recipe_source_created_idx').on(
      table.source,
      table.createdAt,
      table.id,
    ),
    index('recipe_title_idx').on(table.title),
  ],
)

export const deliveryCycle = sqliteTable(
  'delivery_cycle',
  {
    id: text('id').primaryKey(),
    externalOrderId: text('external_order_id').notNull(),
    deliveryDate: text('delivery_date').notNull(),
    periodStartDate: text('period_start_date'),
    periodEndDate: text('period_end_date'),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    recipesSyncedAt: integer('recipes_synced_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('delivery_cycle_external_order_unique').on(
      table.externalOrderId,
    ),
    index('delivery_cycle_date_idx').on(table.deliveryDate, table.id),
  ],
)

export const deliverySelection = sqliteTable(
  'delivery_selection',
  {
    id: text('id').primaryKey(),
    deliveryCycleId: text('delivery_cycle_id')
      .notNull()
      .references(() => deliveryCycle.id, { onDelete: 'restrict' }),
    sourceItemId: text('source_item_id').notNull(),
    sourceProductId: text('source_product_id').notNull(),
    sourcePosition: integer('source_position').notNull(),
    occurrence: integer('occurrence').notNull(),
    quantity: integer('quantity').notNull(),
    isAvailable: integer('is_available', { mode: 'boolean' })
      .notNull()
      .default(true),
    title: text('title').notNull(),
    description: text('description'),
    photoUrl: text('photo_url'),
    photoThumbnailUrl: text('photo_thumbnail_url'),
    totalMinutes: integer('total_minutes'),
    nutriScore: text('nutri_score'),
    carbonScore: text('carbon_score'),
    ingredientsJson: text('ingredients_json').notNull().default('[]'),
    stepsJson: text('steps_json').notNull().default('[]'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('delivery_selection_source_occurrence_unique').on(
      table.deliveryCycleId,
      table.sourceItemId,
      table.occurrence,
    ),
    index('delivery_selection_cycle_order_idx').on(
      table.deliveryCycleId,
      table.sourcePosition,
      table.occurrence,
    ),
  ],
)

export const plannedMeal = sqliteTable(
  'planned_meal',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    period: text('period', { enum: ['lunch', 'dinner'] }).notNull(),
    category: text('category', {
      enum: ['quitoque', 'home', 'restaurant'],
    }).notNull(),
    origin: text('origin', { enum: ['manual', 'automatic'] })
      .notNull()
      .default('manual'),
    deliveryCycleId: text('delivery_cycle_id').references(
      () => deliveryCycle.id,
      { onDelete: 'restrict' },
    ),
    deliverySelectionId: text('delivery_selection_id').references(
      () => deliverySelection.id,
      { onDelete: 'restrict' },
    ),
    homeRecipeId: text('home_recipe_id').references(() => recipe.id, {
      onDelete: 'restrict',
    }),
    restaurantName: text('restaurant_name'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('planned_meal_slot_unique').on(table.date, table.period),
    uniqueIndex('planned_meal_selection_unique').on(table.deliverySelectionId),
    index('planned_meal_cycle_idx').on(
      table.deliveryCycleId,
      table.date,
      table.period,
    ),
    index('planned_meal_home_recipe_idx').on(table.homeRecipeId),
  ],
)

export const recipeExternalReference = sqliteTable(
  'recipe_external_reference',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .unique()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['quitoque'] }).notNull(),
    externalId: text('external_id').notNull(),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('recipe_external_source_id_unique').on(
      table.source,
      table.externalId,
    ),
  ],
)

export const recipeIngredient = sqliteTable(
  'recipe_ingredient',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    quantity: text('quantity'),
    unit: text('unit'),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('recipe_ingredient_position_unique').on(
      table.recipeId,
      table.position,
    ),
  ],
)

export const recipeStep = sqliteTable(
  'recipe_step',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    instructions: text('instructions').notNull(),
  },
  (table) => [
    uniqueIndex('recipe_step_position_unique').on(
      table.recipeId,
      table.position,
    ),
  ],
)

export const recipeTag = sqliteTable(
  'recipe_tag',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['category', 'tag'] }).notNull(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
  },
  (table) => [
    uniqueIndex('recipe_tag_kind_name_unique').on(
      table.kind,
      table.normalizedName,
    ),
    index('recipe_tag_name_idx').on(table.normalizedName),
  ],
)

export const recipeTagAssignment = sqliteTable(
  'recipe_tag_assignment',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => recipeTag.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.tagId] })],
)

export const recipeMetric = sqliteTable(
  'recipe_metric',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    unit: text('unit'),
    provenance: text('provenance'),
    method: text('method'),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('recipe_metric_key_unique').on(table.recipeId, table.key),
  ],
)

export const recipeFavorite = sqliteTable(
  'recipe_favorite',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.recipeId] }),
    index('recipe_favorite_recipe_idx').on(table.recipeId, table.userId),
  ],
)

export const recipeSyncState = sqliteTable('recipe_sync_state', {
  source: text('source', { enum: ['quitoque'] }).primaryKey(),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }).notNull(),
  lastAdded: integer('last_added').notNull(),
  lastUpdated: integer('last_updated').notNull(),
})

export const household = sqliteTable('household', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const householdMember = sqliteTable(
  'household_member',
  {
    householdId: text('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] })
      .notNull()
      .default('member'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.userId] }),
    uniqueIndex('household_member_user_unique').on(table.userId),
    index('household_member_household_idx').on(table.householdId),
  ],
)

export const householdInvitation = sqliteTable(
  'household_invitation',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    invitedName: text('invited_name'),
    tokenHash: text('token_hash').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'revoked'] })
      .notNull()
      .default('pending'),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('household_invitation_token_unique').on(table.tokenHash),
    index('household_invitation_household_status_idx').on(
      table.householdId,
      table.status,
    ),
  ],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  recipe,
  recipeExternalReference,
  recipeIngredient,
  recipeStep,
  recipeTag,
  recipeTagAssignment,
  recipeMetric,
  recipeFavorite,
  recipeSyncState,
  deliveryCycle,
  deliverySelection,
  plannedMeal,
  household,
  householdMember,
  householdInvitation,
  userRelations,
  sessionRelations,
  accountRelations,
}
