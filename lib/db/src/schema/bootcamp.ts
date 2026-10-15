import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const contents = pgTable(
  "contents",
  {
    id: text("id").primaryKey().notNull(),
    kind: text("kind").notNull(),
    slug: text("slug"),
    title: text("title").notNull(),
    bodyHtml: text("body_html").notNull().default(""),
    category: text("category").notNull().default(""),
    publication: text("publication").notNull().default("draft"),
    pinned: smallint("pinned").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    revision: integer("revision").notNull().default(1),
  },
  (table) => [
    uniqueIndex("contents_kind_slug_unique").on(table.kind, table.slug),
    index("contents_public_list").on(
      table.kind,
      table.publication,
      table.pinned,
      table.sortOrder,
      table.publishedAt,
      table.id,
    ),
    index("contents_category").on(table.kind, table.publication, table.category),
    check(
      "contents_id_uuid_check",
      sql`${table.id} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    ),
    check(
      "contents_kind_check",
      sql`${table.kind} IN ('notice', 'curriculum', 'activity', 'resource', 'faq', 'page')`,
    ),
    check(
      "contents_slug_check",
      sql`${table.slug} IS NULL OR ${table.slug} ~ '^[a-z0-9-]{1,100}$'`,
    ),
    check(
      "contents_title_check",
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 200`,
    ),
    check("contents_category_check", sql`char_length(${table.category}) <= 100`),
    check(
      "contents_publication_check",
      sql`${table.publication} IN ('draft', 'public', 'private')`,
    ),
    check("contents_pinned_check", sql`${table.pinned} IN (0, 1)`),
    check("contents_sort_order_check", sql`${table.sortOrder} >= 0`),
    check("contents_revision_check", sql`${table.revision} >= 1`),
    check(
      "contents_slug_required_check",
      sql`${table.kind} NOT IN ('curriculum', 'activity', 'page') OR ${table.slug} IS NOT NULL`,
    ),
    check(
      "contents_page_slug_check",
      sql`${table.kind} != 'page' OR ${table.slug} IN ('overview', 'organization', 'cooperation', 'location', 'guide', 'home')`,
    ),
  ],
);

export const programDetails = pgTable(
  "program_details",
  {
    contentId: text("content_id")
      .primaryKey()
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    level: text("level").notNull().default(""),
    audience: text("audience").notNull().default(""),
    delivery: text("delivery").notNull().default(""),
    completionRequirements: text("completion_requirements")
      .notNull()
      .default(""),
  },
);

export const resourceDetails = pgTable(
  "resource_details",
  {
    contentId: text("content_id")
      .primaryKey()
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    audience: text("audience").notNull().default(""),
    requiredDocuments: text("required_documents").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    deadlineText: text("deadline_text").notNull().default(""),
    submissionMethod: text("submission_method").notNull().default(""),
    destination: text("destination").notNull().default(""),
    contact: text("contact").notNull().default(""),
    applicableYear: integer("applicable_year"),
  },
  (table) => [
    check(
      "resource_details_year_check",
      sql`${table.applicableYear} IS NULL OR ${table.applicableYear} BETWEEN 1900 AND 9999`,
    ),
  ],
);

export const contactDetails = pgTable("contact_details", {
  contentId: text("content_id")
    .primaryKey()
    .notNull()
    .references(() => contents.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  note: text("note").notNull().default(""),
});

export const contentRelations = pgTable(
  "content_relations",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.targetId] }),
    index("content_relations_target").on(table.targetId),
    check("content_relations_sort_check", sql`${table.sortOrder} >= 0`),
    check("content_relations_distinct_check", sql`${table.sourceId} != ${table.targetId}`),
  ],
);

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey().notNull(),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mediaType: text("media_type").notNull(),
    extension: text("extension").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("files_storage_key_unique").on(table.storageKey),
    check(
      "files_id_uuid_check",
      sql`${table.id} ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    ),
    check(
      "files_storage_key_check",
      sql`char_length(${table.storageKey}) BETWEEN 1 AND 240 AND ${table.storageKey} ~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_.-]+)*$' AND ${table.storageKey} !~ '(^|/)(\\.|\\.\\.)(/|$)'`,
    ),
    check(
      "files_original_name_check",
      sql`char_length(btrim(${table.originalName})) BETWEEN 1 AND 255 AND position('/' in ${table.originalName}) = 0 AND position(chr(92) in ${table.originalName}) = 0`,
    ),
    check(
      "files_media_type_check",
      sql`char_length(btrim(${table.mediaType})) BETWEEN 1 AND 200`,
    ),
    check(
      "files_extension_check",
      sql`${table.extension} IN ('hwp', 'hwpx', 'pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp')`,
    ),
    check("files_size_check", sql`${table.size} >= 0`),
    check(
      "files_sha256_check",
      sql`${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const contentFiles = pgTable(
  "content_files",
  {
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    role: text("role").notNull().default("attachment"),
    sortOrder: integer("sort_order").notNull().default(0),
    altText: text("alt_text").notNull().default(""),
  },
  (table) => [
    primaryKey({ columns: [table.contentId, table.fileId, table.role] }),
    index("content_files_file").on(table.fileId),
    check(
      "content_files_role_check",
      sql`${table.role} IN ('attachment', 'body', 'home')`,
    ),
    check("content_files_sort_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const homeItems = pgTable(
  "home_items",
  {
    section: text("section").notNull(),
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.section, table.contentId] }),
    index("home_items_content").on(table.contentId),
    check(
      "home_items_section_check",
      sql`${table.section} IN ('featured', 'notice', 'program', 'resource')`,
    ),
    check("home_items_sort_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const contentLinks = pgTable(
  "content_links",
  {
    id: text("id").primaryKey().notNull(),
    contentId: text("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("content_links_content").on(table.contentId),
    check(
      "content_links_label_check",
      sql`char_length(btrim(${table.label})) BETWEEN 1 AND 200`,
    ),
    check(
      "content_links_url_check",
      sql`char_length(${table.url}) <= 2048 AND (${table.url} LIKE 'https://%' OR ${table.url} LIKE 'http://%')`,
    ),
    check("content_links_sort_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const admins = pgTable(
  "admins",
  {
    id: text("id").primaryKey().notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    enabled: smallint("enabled").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("admins_username_lower_unique").on(sql`lower(${table.username})`),
    check(
      "admins_username_check",
      sql`char_length(btrim(${table.username})) BETWEEN 3 AND 100 AND ${table.username} = btrim(${table.username})`,
    ),
    check("admins_password_hash_check", sql`char_length(${table.passwordHash}) > 0`),
    check("admins_enabled_check", sql`${table.enabled} IN (0, 1)`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey().notNull(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    csrfSecret: text("csrf_secret").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("sessions_admin").on(table.adminId),
    index("sessions_expires").on(table.expiresAt),
    check("sessions_token_hash_check", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("sessions_csrf_check", sql`char_length(${table.csrfSecret}) > 0`),
  ],
);

export const seedRuns = pgTable(
  "seed_runs",
  {
    key: text("key").primaryKey().notNull(),
    checksum: text("checksum").notNull(),
    appliedAt: text("applied_at").notNull(),
  },
  (table) => [
    check("seed_runs_checksum_check", sql`${table.checksum} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const preAuthSessions = pgTable(
  "pre_auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey().notNull(),
    csrfSecret: text("csrf_secret").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("pre_auth_sessions_expires").on(table.expiresAt),
    check(
      "pre_auth_token_hash_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "pre_auth_csrf_check",
      sql`${table.csrfSecret} ~ '^[A-Za-z0-9_-]{43}$'`,
    ),
  ],
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    keyHash: text("key_hash").primaryKey().notNull(),
    attempts: integer("attempts").notNull(),
    resetAt: text("reset_at").notNull(),
  },
  (table) => [
    index("auth_rate_limits_reset").on(table.resetAt),
    check("auth_rate_limits_key_hash_check", sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
    check("auth_rate_limits_attempts_check", sql`${table.attempts} >= 1`),
  ],
);

export const fileUploadIntents = pgTable(
  "file_upload_intents",
  {
    id: text("id").primaryKey().notNull(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    declaredSize: integer("declared_size").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("file_upload_intents_storage_key_unique").on(table.storageKey),
    index("file_upload_intents_admin").on(table.adminId),
    index("file_upload_intents_expiry").on(table.expiresAt),
    check("file_upload_intents_size_check", sql`${table.declaredSize} > 0`),
  ],
);
