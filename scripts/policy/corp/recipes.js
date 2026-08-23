// @ts-check
/**
 * Corp round recipes as data.
 *
 * These are the manual's tested numbers (200+ headless runs) expressed in the
 * recipe DSL: docs/specs/recipe-dsl.md
 *
 * NOTHING HERE IS LOGIC. The engine interprets these; see the DSL spec.
 * Every numeric field is a TARGET, never an increment.
 */

const ALL_CITIES = [
  "Sector-12", "Aevum", "Chongqing", "New Tokyo", "Ishima", "Volhaven",
];

/**
 * Round 1 — Agriculture only.
 * Expected offer WITH custom Smart Supply: 540-560b (mean 551.164b).
 */
export const ROUND_1 = {
  name: "round1",
  expectedOffer: { min: 540e9, max: 560e9, mean: 551.164e9 },
  requiresCustomSmartSupply: true,
  steps: [
    { kind: "division", name: "Agriculture", industry: "Agriculture",
      cities: ALL_CITIES, warehouses: true, degrade: "block" },

    { kind: "officeSize", division: "Agriculture", cities: "all",
      size: 4, degrade: "block" },

    { kind: "jobs", division: "Agriculture", cities: "all",
      jobs: { "Research & Development": 4 } },

    { kind: "waitFor", what: "researchPoints", division: "Agriculture",
      atLeast: 55 },

    // Must happen BEFORE boost materials.
    { kind: "jobs", division: "Agriculture", cities: "all",
      jobs: { Operations: 1, Engineer: 1, Business: 1, Management: 1 } },

    { kind: "upgrade", name: "Smart Factories", level: 2,  degrade: "partial" },
    { kind: "upgrade", name: "Smart Storage",   level: 8,  degrade: "partial" },
    { kind: "warehouse", division: "Agriculture", cities: "all",
      level: 5, degrade: "partial", expectSize: 900 },
    { kind: "advert", division: "Agriculture", level: 2, degrade: "partial" },

    // ALWAYS LAST. Quantities are TOTALS AFTER BUYING, and are the optimizer's
    // output for expectSize=900. If the warehouse ended up smaller (degraded
    // run), the engine must re-run the boost optimizer against actual space.
    { kind: "boost", division: "Agriculture", cities: "all",
      targets: { "AI Cores": 1562, "Hardware": 1791,
                 "Real Estate": 98470, "Robots": 0 },
      refitIfSpaceDiffers: true },
  ],
};

/**
 * Round 1 fallback — using the purchased "Smart Supply" unlock (25e9).
 * Expected offer: 335-346b (mean 340.413b). ~38% worse. Avoid.
 */
export const ROUND_1_BUILTIN_SMART_SUPPLY = {
  name: "round1-builtin",
  expectedOffer: { min: 335e9, max: 346e9, mean: 340.413e9 },
  requiresCustomSmartSupply: false,
  steps: [
    { kind: "division", name: "Agriculture", industry: "Agriculture",
      cities: ALL_CITIES, warehouses: true, degrade: "block" },
    { kind: "unlock", name: "Smart Supply", degrade: "block" },
    { kind: "officeSize", division: "Agriculture", cities: "all",
      size: 4, degrade: "block" },
    { kind: "jobs", division: "Agriculture", cities: "all",
      jobs: { "Research & Development": 4 } },
    { kind: "waitFor", what: "researchPoints", division: "Agriculture",
      atLeast: 55 },
    { kind: "jobs", division: "Agriculture", cities: "all",
      jobs: { Operations: 1, Engineer: 1, Business: 1, Management: 1 } },
    { kind: "upgrade", name: "Smart Storage", level: 3, degrade: "partial" },
    { kind: "warehouse", division: "Agriculture", cities: "all",
      level: 4, degrade: "partial", expectSize: 520 },
    { kind: "advert", division: "Agriculture", level: 2, degrade: "partial" },
    { kind: "boost", division: "Agriculture", cities: "all",
      targets: { "AI Cores": 777, "Hardware": 919,
                 "Real Estate": 60794, "Robots": 0 },
      refitIfSpaceDiffers: true },
  ],
};

/**
 * Round 2 — add Chemical as a support division.
 * REQUIRES >= 490b at entry. Expected offer: 14.145-14.871t (mean 14.521t).
 *
 * Single recipe, but note the natural phase break at the waitFor: everything
 * before it is construction, everything after is the pre-offer setup.
 */
export const ROUND_2 = {
  name: "round2",
  requiresFunds: 490e9,
  expectedOffer: { min: 14.145e12, max: 14.871e12, mean: 14.521e12 },
  steps: [
    // ---- phase 1: construction ----
    { kind: "unlock", name: "Export", degrade: "block" },

    { kind: "officeSize", division: "Agriculture", cities: "all",
      size: 8, degrade: "partial" },
    { kind: "jobs", division: "Agriculture", cities: "all",
      jobs: { "Research & Development": 8 } },

    { kind: "division", name: "Chemical", industry: "Chemical",
      cities: ALL_CITIES, warehouses: true, degrade: "block" },
    // Chemical office stays at its initial size of 3. Do NOT upgrade.
    { kind: "jobs", division: "Chemical", cities: "all",
      jobs: { "Research & Development": 3 } },

    // Register these before any Tobacco route in round 3 — export order is FIFO.
    { kind: "export", from: "Agriculture", to: "Chemical",
      material: "Plants", amount: "(IPROD+IINV/10)*(-1)", degrade: "block" },
    { kind: "export", from: "Chemical", to: "Agriculture",
      material: "Chemicals", amount: "(IPROD+IINV/10)*(-1)", degrade: "block" },

    { kind: "upgrade", name: "Smart Storage",   level: 25, degrade: "partial" },
    { kind: "upgrade", name: "Smart Factories", level: 17, degrade: "partial" },

    { kind: "warehouse", division: "Agriculture", cities: "all",
      level: 17, degrade: "partial", expectSize: 5950 },
    // Small but NOT skippable - Chemical must produce enough high-quality
    // Chemicals or Agriculture's output quality collapses via PURCHASE dilution.
    { kind: "warehouse", division: "Chemical", cities: "all",
      level: 2, degrade: "partial", expectSize: 700 },

    { kind: "advert", division: "Agriculture", level: 8, degrade: "partial" },
    // NO Advert for Chemical. NO Wilson this round.

    { kind: "waitFor", what: "researchPoints", division: "Agriculture", atLeast: 700 },
    { kind: "waitFor", what: "researchPoints", division: "Chemical",    atLeast: 390 },

    // ---- phase 2: pre-offer setup ----
    { kind: "jobs", division: "Agriculture", cities: "all",
      jobs: { Operations: 3, Engineer: 1, Business: 2, Management: 2 } },
    { kind: "jobs", division: "Chemical", cities: "all",
      jobs: { Operations: 1, Engineer: 1, Business: 1 } },

    { kind: "boost", division: "Agriculture", cities: "all",
      targets: { "AI Cores": 9081, "Hardware": 10146,
                 "Real Estate": 459400, "Robots": 1416 },
      refitIfSpaceDiffers: true },
    { kind: "boost", division: "Chemical", cities: "all",
      targets: { "AI Cores": 1717, "Hardware": 3194,
                 "Real Estate": 54917, "Robots": 54 },
      refitIfSpaceDiffers: true },
  ],
};
