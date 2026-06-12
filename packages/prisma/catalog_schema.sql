-- =============================================================================
-- catalog_schema.sql  —  Outsource Catalog domain (US Frame Factory shared DB)
--
-- Creates the catalog tables inside the dedicated `catalog` schema.
-- Forward-only and idempotent: safe to run more than once (CREATE ... IF NOT
-- EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS). It does NOT drop or
-- alter anything outside `catalog`, and never touches public / production_*.
--
-- Conventions honored:
--   * snake_case tables, camelCase (quoted) columns        — matches public.accessories
--   * money is DECIMAL/numeric, never float                — costPerUom(14,4), weightLbs(12,4)
--   * soft delete via nullable archivedAt + filtering      — never hard DELETE
--   * ids are application-generated CUIDs (Prisma @default(cuid(2)));
--     the cutover copies accessories' existing cuid ids verbatim. No DB-side
--     id default on purpose, so it stays consistent + Prisma-introspects clean.
--   * audit logging uses the SHARED public.audit_log — no catalog audit table here.
--
-- Apply manually (never `prisma migrate dev` / `reset`). If Prisma is your
-- client, run `prisma db pull` afterward to sync the model, or generate an
-- equivalent migration and `migrate resolve --applied` to baseline.
--
-- ASSUMPTIONS made to keep the cutover safe — confirm with Wisdom (see footer).
-- =============================================================================

--CREATE SCHEMA IF NOT EXISTS catalog;

-- ---------------------------------------------------------------------------
-- shared updatedAt trigger: keeps "updatedAt" correct for ALL write paths
-- (raw SQL or Prisma). CREATE OR REPLACE makes it idempotent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION catalog.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Managed lists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog.vendors (
    id          TEXT PRIMARY KEY,                 -- app-supplied CUID
    name        TEXT UNIQUE NOT NULL,
    "archivedAt" TIMESTAMP(3),                    -- archive a whole vendor line
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.product_types (
    id          TEXT PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.tags (
    id          TEXT PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- products  — extends the public.accessories shape + catalog-tool fields.
-- price-each / case-price are NOT stored: computed from costPerUom x margin
-- (so a catalog edit can never retroactively change a frozen order).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog.products (
    id                    TEXT PRIMARY KEY,        -- app-supplied CUID (cutover copies accessories.id)

    -- ===== C2 READ-CONTRACT (keep names + meanings + types STABLE) =====
    "normalizedCode"      TEXT NOT NULL,           -- pricing-engine lookup key
    "productCode"         TEXT NOT NULL,           -- human SKU
    "costPerUom"          DECIMAL(14,4),           -- unit cost (NULLABLE: some source rows have no cost)
    uom                   TEXT NOT NULL,           -- unit of measure
    "weightLbs"           DECIMAL(12,4),           -- unit weight (nullable in source)
    active                BOOLEAN NOT NULL DEFAULT true,   -- sellable / quotable
    published             BOOLEAN NOT NULL DEFAULT false,  -- published to Shopify (draft by default)
    -- ==================================================================

    -- carried over from accessories so the cutover is lossless
    description           TEXT,
    category              TEXT,                    -- OPEN Q: fold into product_types?
    "categoryDescription" TEXT,
    "commonNames"         TEXT,
    uses                  TEXT,
    link                  TEXT,
    "dateLastUpdated"     TIMESTAMP(3),            -- source-provided last-updated

    -- catalog-tool additions
    title                 TEXT,                    -- Shopify export "Title"
    margin                DECIMAL(5,2) NOT NULL DEFAULT 25,  -- GROSS-MARGIN percent (default 25.00); see COMMENT below
    "caseQty"             INTEGER NOT NULL DEFAULT 1,
    dimensions            TEXT,
    "imageUrl"            TEXT,
    "manufacturerUrl"     TEXT,
    "submittalUrl"        TEXT,
    notes                 TEXT,

    -- managed-list relations (nullable so the accessories cutover can run first,
    -- then backfill; tighten to NOT NULL later once every row is mapped)
    "vendorId"            TEXT REFERENCES catalog.vendors(id)       ON DELETE RESTRICT,
    "typeId"              TEXT REFERENCES catalog.product_types(id) ON DELETE RESTRICT,

    -- soft delete / archive
    "archivedAt"          TIMESTAMP(3),

    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- product_tags  — many-to-many join (products <-> tags)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog.product_tags (
    "productId" TEXT NOT NULL REFERENCES catalog.products(id) ON DELETE CASCADE,
    "tagId"     TEXT NOT NULL REFERENCES catalog.tags(id)     ON DELETE CASCADE,
    PRIMARY KEY ("productId", "tagId")
);

-- ---------------------------------------------------------------------------
-- Ingest staging (CSV + PDF) — persists across sessions, so real tables.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog.ingest_batches (
    id             TEXT PRIMARY KEY,
    source         TEXT NOT NULL CHECK (source IN ('csv','pdf')),
    "vendorId"     TEXT REFERENCES catalog.vendors(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'open',     -- open | committed | discarded
    "columnMapping" JSONB,                           -- CSV header -> catalog field
    "fileRef"      TEXT,                              -- storage path / reference
    "createdById"  TEXT,                              -- auth uid of the admin
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.ingest_rows (
    id                TEXT PRIMARY KEY,
    "batchId"         TEXT NOT NULL REFERENCES catalog.ingest_batches(id) ON DELETE CASCADE,
    "rawData"         JSONB,                          -- original parsed/extracted row
    "mappedData"      JSONB,                          -- mapped to catalog fields
    status            TEXT NOT NULL DEFAULT 'pending',-- pending | approved | rejected | committed
    "matchedProductId" TEXT REFERENCES catalog.products(id) ON DELETE SET NULL,
    resolution        TEXT,                           -- overwrite | merge | skip (on conflict)
    diff              JSONB,                          -- side-by-side vs matched product
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes (read-contract + foreign keys + common filters)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_normalized_code_active ON catalog.products ("normalizedCode") WHERE "archivedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_product_code    ON catalog.products ("productCode");
CREATE INDEX IF NOT EXISTS idx_products_vendor_id       ON catalog.products ("vendorId");
CREATE INDEX IF NOT EXISTS idx_products_type_id         ON catalog.products ("typeId");
CREATE INDEX IF NOT EXISTS idx_products_archived_at     ON catalog.products ("archivedAt");
CREATE INDEX IF NOT EXISTS idx_product_tags_tag_id      ON catalog.product_tags ("tagId");
CREATE INDEX IF NOT EXISTS idx_ingest_rows_batch_id     ON catalog.ingest_rows ("batchId");
CREATE INDEX IF NOT EXISTS idx_ingest_rows_status       ON catalog.ingest_rows (status);

-- normalizedCode uniqueness is enforced for ACTIVE rows only (archivedAt IS NULL):
-- exactly one live product per pricing-engine lookup key, while archived rows may
-- reuse a code. (Source data confirmed clean at review, so locked in now.)

-- ---------------------------------------------------------------------------
-- updatedAt triggers (idempotent: drop-if-exists then create)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_vendors_updated_at       ON catalog.vendors;
CREATE TRIGGER trg_vendors_updated_at       BEFORE UPDATE ON catalog.vendors       FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

DROP TRIGGER IF EXISTS trg_product_types_updated_at ON catalog.product_types;
CREATE TRIGGER trg_product_types_updated_at BEFORE UPDATE ON catalog.product_types FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at      ON catalog.products;
CREATE TRIGGER trg_products_updated_at      BEFORE UPDATE ON catalog.products      FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

DROP TRIGGER IF EXISTS trg_ingest_batches_updated_at ON catalog.ingest_batches;
CREATE TRIGGER trg_ingest_batches_updated_at BEFORE UPDATE ON catalog.ingest_batches FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

DROP TRIGGER IF EXISTS trg_ingest_rows_updated_at    ON catalog.ingest_rows;
CREATE TRIGGER trg_ingest_rows_updated_at    BEFORE UPDATE ON catalog.ingest_rows    FOR EACH ROW EXECUTE FUNCTION catalog.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contract documentation (in-DB), harmless to re-run
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN catalog.products."normalizedCode" IS 'C2 read-contract: pricing-engine lookup key';
COMMENT ON COLUMN catalog.products."productCode"    IS 'C2 read-contract: human SKU';
COMMENT ON COLUMN catalog.products."costPerUom"     IS 'C2 read-contract: unit cost, DECIMAL(14,4), NULLABLE (some source rows have no cost)';
COMMENT ON COLUMN catalog.products.uom              IS 'C2 read-contract: unit of measure';
COMMENT ON COLUMN catalog.products."weightLbs"      IS 'C2 read-contract: unit weight, DECIMAL(12,4)';
COMMENT ON COLUMN catalog.products.active           IS 'C2 read-contract: sellable / quotable';
COMMENT ON COLUMN catalog.products.published        IS 'C2 read-contract: published to Shopify';
COMMENT ON COLUMN catalog.products.margin           IS 'GROSS-MARGIN percent (default 25.00). Price each = costPerUom / (1 - margin/100). NOT markup.';

-- =============================================================================
-- DECISIONS (confirmed with Wisdom at review) + remaining open items:
--   1. margin = GROSS-MARGIN percent, DECIMAL(5,2), default 25. Price each =
--      costPerUom / (1 - margin/100). NOT markup. [CONFIRMED]
--   2. costPerUom is NULLABLE — some source rows have no cost; what to do with
--      those rows is a data decision, not a constraint default. [CONFIRMED]
--   3. normalizedCode has a partial UNIQUE index WHERE archivedAt IS NULL — one
--      live row per lookup key; archived rows may reuse a code. [CONFIRMED]
--   4. vendorId / typeId NULLABLE for now (cutover-safe); tighten after backfill. [OPEN]
--   5. published defaults FALSE (draft); cutover decides accessories' value. [OPEN]
--   6. category/categoryDescription kept on products (lossless); folding into
--      product_types is a later decision. [OPEN]
--   7. timestamps TIMESTAMP(3) without tz (matches accessories + Prisma default).
--
-- RUN AS the catalog_app role (which owns the catalog schema) — NOT postgres —
-- so table ownership + cross-schema read grants wire up correctly for Sales.
-- =============================================================================