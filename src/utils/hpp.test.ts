import { describe, expect, it } from "vitest";
import {
  calculateBatchHpp,
  calculateExcelProductHpp,
  calculateHppCosts,
  duplicateHppProductProfile,
  effectiveMaterialUnitCost,
  isDecimalDraft,
  materialLineCost,
  nonNegativeNumber,
  normalizeDecimalDraft,
} from "./hpp";

describe("HPP calculations", () => {
  it("calculates a material line using decimal quantities", () => {
    expect(materialLineCost({ quantity: 1.5, unitCost: 100_000 })).toBe(150_000);
  });

  it("derives material unit cost from purchase price and purchase content", () => {
    expect(effectiveMaterialUnitCost({ unitCost: 0, purchaseQuantity: 1_000, purchaseCost: 37_250 })).toBe(37.25);
    expect(materialLineCost({ quantity: 85, unitCost: 0, purchaseQuantity: 1_000, purchaseCost: 37_250 })).toBe(3_166.25);
  });

  it("keeps valid decimal drafts and accepts Indonesian decimal commas", () => {
    expect(isDecimalDraft("1.")).toBe(true);
    expect(isDecimalDraft("1,5")).toBe(true);
    expect(isDecimalDraft("1.2.3")).toBe(false);
    expect(nonNegativeNumber("1,5")).toBe(1.5);
  });

  it("removes leading zeroes without breaking decimal values", () => {
    expect(normalizeDecimalDraft("02222")).toBe("2222");
    expect(normalizeDecimalDraft("000")).toBe("0");
    expect(normalizeDecimalDraft("00.5")).toBe("0.5");
    expect(normalizeDecimalDraft("0,5")).toBe("0,5");
    expect(normalizeDecimalDraft("1.")).toBe("1.");
  });

  it("calculates subtotals and HPP per yield", () => {
    expect(calculateHppCosts(
      [{ quantity: 1.5, unitCost: 100_000 }, { quantity: 0.25, unitCost: 20_000 }],
      [{ amount: 10_000 }],
      5,
    )).toEqual({ materialCost: 155_000, additionalCost: 10_000, totalCost: 165_000, grossYieldAmount: 5, netYieldAmount: 5, wasteAmount: 0, unitHpp: 33_000 });
  });

  it("accounts for production waste and per-unit packaging costs", () => {
    const result = calculateHppCosts(
      [{ quantity: 3_600, unitCost: 32 }],
      [{ amount: 1_500, allocation: "per_batch" }, { amount: 400, allocation: "per_unit" }],
      24,
      10,
    );
    expect(result.materialCost).toBe(115_200);
    expect(result.additionalCost).toBe(10_140);
    expect(result.totalCost).toBe(125_340);
    expect(result.grossYieldAmount).toBe(24);
    expect(result.netYieldAmount).toBeCloseTo(21.6);
    expect(result.wasteAmount).toBeCloseTo(2.4);
    expect(result.unitHpp).toBeCloseTo(5_802.78, 2);
  });

  it("normalizes invalid and negative inputs to zero", () => {
    expect(calculateHppCosts([{ quantity: -1, unitCost: 100_000 }], [{ amount: -10 }], 0)).toEqual({
      materialCost: 0,
      additionalCost: 0,
      totalCost: 0, grossYieldAmount: 0, netYieldAmount: 0, wasteAmount: 0,
      unitHpp: 0,
    });
  });

  it("matches the Excel batch formula for Daun Jeruk Level 0", () => {
    const masters = [
      { id: "main", name: "Mie Kremes", unit: "Gram", unitCost: 32 },
      { id: "leaf", name: "Daun Jeruk", unit: "Gram", unitCost: 110 },
      { id: "oil", name: "Minyak Bawang", unit: "Gram", unitCost: 28.44 },
    ];
    const result = calculateBatchHpp({ ingredients: [
      { id: "1", masterItemId: "main", quantity: 3600 },
      { id: "2", masterItemId: "leaf", quantity: 70 },
      { id: "3", masterItemId: "oil", quantity: 210 },
    ] }, masters);
    expect(result.batchWeight).toBe(3880);
    expect(result.batchCost).toBeCloseTo(128872.4);
    expect(result.hppPerWeightUnit).toBeCloseTo(33.214536082474226);
  });

  it("matches Excel offline, online, and TikTok product formulas", () => {
    const result = calculateExcelProductHpp(33.214536082474226,
      { id: "150", name: "150 gram", contentWeight: 150, packagingCost: 400, targetProfit: 3000 },
      { packingCost: 1000, employeeCost: 500, onlineAdsCost: 2000, tiktokAdditionalCost: 1250, tiktokNetRate: 0.7 });
    expect(result.productCost).toBeCloseTo(4982.180412371134);
    expect(result.offlineHpp).toBeCloseTo(6882.180412371134);
    expect(result.offlineSellingPrice).toBeCloseTo(9882.18041237113);
    expect(result.onlineHpp).toBeCloseTo(8882.18041237113);
    expect(result.onlineSellingPrice).toBeCloseTo(11882.18041237113);
    expect(result.tiktokSellingPrice).toBeCloseTo(18760.257731958758);
  });

  it("duplicates an HPP product with independent IDs and no variant links", () => {
    let sequence = 0;
    const createId = (prefix: string) => `${prefix}-${++sequence}`;
    const source = {
      id: "profile-source",
      name: "Mie Kremes",
      productId: "product-source",
      masterItems: [
        { id: "master-source", name: "Mie", unit: "Gram", unitCost: 32.25 },
      ],
      packages: [
        { id: "pack-source", name: "150 gram", contentWeight: 150, packagingCost: 400, targetProfit: 3000 },
      ],
      operations: {
        packingCost: 1000,
        employeeCost: 500,
        onlineAdsCost: 2000,
        tiktokAdditionalCost: 1250,
        tiktokNetRate: 0.7,
      },
      batches: [
        {
          id: "batch-source",
          productId: "product-source",
          name: "Balado - Pedas",
          flavor: "Balado",
          spiceLevel: "Pedas",
          ingredients: [
            { id: "ingredient-source", masterItemId: "master-source", quantity: 125.5 },
          ],
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
      ],
      updatedAt: "2026-08-13T00:00:00.000Z",
    };
    const recipes = [
      {
        id: "recipe-source",
        variantId: "variant-source",
        variantIds: ["variant-source"],
        batchId: "batch-source",
        packageId: "pack-source",
        name: "Balado Pedas 150 gram",
        yieldQuantity: 1,
        yieldUnit: "Pcs",
        materials: [],
        additionalCosts: [],
        targetMargin: 35,
        updatedAt: "2026-08-13T00:00:00.000Z",
      },
    ];

    const duplicated = duplicateHppProductProfile(
      source,
      recipes,
      "Mie Kremes - Salinan",
      createId,
      "2026-08-14T00:00:00.000Z",
    );

    expect(duplicated.profile.name).toBe("Mie Kremes - Salinan");
    expect(duplicated.profile.productId).toBeUndefined();
    expect(duplicated.profile.id).not.toBe(source.id);
    expect(duplicated.profile.masterItems[0].id).not.toBe("master-source");
    expect(duplicated.profile.packages[0].id).not.toBe("pack-source");
    expect(duplicated.profile.batches[0].id).not.toBe("batch-source");
    expect(duplicated.profile.batches[0].ingredients[0].masterItemId).toBe(
      duplicated.profile.masterItems[0].id,
    );
    expect(duplicated.profile.batches[0].ingredients[0].quantity).toBe(125.5);
    expect(duplicated.recipes).toHaveLength(1);
    expect(duplicated.recipes[0].variantId).toBeUndefined();
    expect(duplicated.recipes[0].variantIds).toEqual([]);
    expect(duplicated.recipes[0].batchId).toBe(duplicated.profile.batches[0].id);
    expect(duplicated.recipes[0].packageId).toBe(duplicated.profile.packages[0].id);
  });
});
