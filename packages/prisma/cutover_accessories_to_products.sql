-- =============================================================================
-- cutover_accessories_to_products.sql
-- One-time copy:  public.accessories  ->  catalog.products
--
-- Run AS catalog_app. Needs:
--   * SELECT on public.accessories  (cross-schema read — confirm the grant exists)
--   * INSERT on catalog.products    (you own it, so this is automatic)
--
-- TIMING IS WISDOM'S CALL (handoff C3). This is step 2 of 4:
--   1. products table exists (done)
--   2. this copy  <-- you are here, run WITH Wisdom
--   3. Sales repoints the pricing engine to catalog.products
--   4. public.accessories goes read-only, then is dropped
-- Until step 3, public.accessories is still the source of truth — don't diverge.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING, so re-running won't duplicate.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — PRE-CHECKS. Run these first, review with Wisdom, THEN run the INSERT.
-- -----------------------------------------------------------------------------

-- 0a) Duplicate normalizedCodes would violate the partial UNIQUE index
--     (uq_products_normalized_code_active). Expect ZERO rows:
--   SELECT "normalizedCode", count(*) AS n
--   FROM public.accessories
--   GROUP BY "normalizedCode" HAVING count(*) > 1;

-- 0b) The cost-null rows. Decide WITH Wisdom what these should be
--     (copy as-is? mark inactive until priced?). Expect ~4 rows:
--   SELECT id, "productCode", "normalizedCode", description
--   FROM public.accessories WHERE "costPerUom" IS NULL;

-- -----------------------------------------------------------------------------
-- STEP 1 — THE COPY (transactional, all-or-nothing)
-- Columns not listed take their catalog.products defaults:
--   published = false (draft), margin = 25 (gross-margin %), caseQty = 1,
--   vendorId / typeId / title / dimensions / *Url / notes / archivedAt = NULL.
-- Source createdAt/updatedAt are preserved for provenance.
-- -----------------------------------------------------------------------------
BEGIN;

INSERT INTO catalog.products (
    id, "normalizedCode", "productCode", "costPerUom", uom, "weightLbs", active,
    description, category, "categoryDescription", "commonNames", uses, link,
    "dateLastUpdated", "createdAt", "updatedAt"
)
SELECT
    id, "normalizedCode", "productCode", "costPerUom", uom, "weightLbs", active,
    description, category, "categoryDescription", "commonNames", uses, link,
    "dateLastUpdated", "createdAt", "updatedAt"
FROM public.accessories
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- STEP 2 — VERIFY (counts should match; spot-check a few rows)
-- -----------------------------------------------------------------------------
--   SELECT (SELECT count(*) FROM public.accessories) AS source_rows,
--          (SELECT count(*) FROM catalog.products)    AS target_rows;

-- -----------------------------------------------------------------------------
-- OPTIONAL, ONLY IF WISDOM AGREES — do NOT bake these in by default:
--   -- keep cost-less items out of quoting until they're priced:
--   -- UPDATE catalog.products SET active = false WHERE "costPerUom" IS NULL;
--
--   -- publish currently-active items to Shopify on day one (else they stay draft):
--   -- UPDATE catalog.products SET published = true WHERE active = true;
-- =============================================================================