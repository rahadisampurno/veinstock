import { describe, expect, it } from "vitest";
import type { HppProductProfile, Product } from "../types";
import {
  buildHppPublishCandidates,
  buildProductFromHpp,
  hppPublishKey,
} from "./hppProductPublish";

const profile: HppProductProfile = {
  id: "profile-mie",
  name: "Mie Kremes",
  masterItems: [
    { id: "mie", name: "Mie", unit: "Gram", unitCost: 32 },
    { id: "bumbu", name: "Balado", unit: "Gram", unitCost: 38.5 },
  ],
  packages: [
    {
      id: "pack-150",
      name: "150 gram",
      contentWeight: 150,
      packagingCost: 400,
      targetProfit: 3_000,
    },
    {
      id: "pack-250",
      name: "250 gram",
      contentWeight: 250,
      packagingCost: 500,
      targetProfit: 5_000,
    },
  ],
  operations: {
    packingCost: 1_000,
    employeeCost: 500,
    onlineAdsCost: 2_000,
    tiktokAdditionalCost: 1_250,
    tiktokNetRate: 0.7,
  },
  batches: [
    {
      id: "batch-balado",
      name: "Balado - Pedas",
      flavor: "Balado",
      spiceLevel: "Pedas",
      ingredients: [
        { id: "line-mie", masterItemId: "mie", quantity: 3_600 },
        { id: "line-bumbu", masterItemId: "bumbu", quantity: 350 },
      ],
      updatedAt: "2026-08-14T00:00:00.000Z",
    },
  ],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

describe("HPP Product & Variant publisher", () => {
  it("builds one candidate for every batch and package combination", () => {
    const candidates = buildHppPublishCandidates(profile);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      key: hppPublishKey("batch-balado", "pack-150"),
      variantName: "Balado · Pedas · 150 gram",
      flavor: "Balado",
      spiceLevel: "Pedas",
      packageName: "150 gram",
    });
    expect(candidates[0].cost).toBeGreaterThan(0);
    expect(candidates[0].price).toBeGreaterThan(candidates[0].cost);
  });

  it("creates only selected variants with explicit HPP links", () => {
    let sequence = 0;
    const selectedKey = hppPublishKey("batch-balado", "pack-150");
    const result = buildProductFromHpp({
      profile,
      selectedKeys: [selectedKey],
      productName: "Mie Kremes",
      category: "Makanan",
      unit: "Pcs",
      imageUrl: "https://example.com/mie.webp",
      updateSellingPrices: true,
      reservedSkus: ["HPP-MIE-KRE-BALAD-PEDA-150-GR"],
      idFactory: (prefix) => `${prefix}-${++sequence}`,
    });

    expect(result.summary.created).toBe(1);
    expect(result.product.active).toBe(true);
    expect(result.product.imageUrl).toBe("https://example.com/mie.webp");
    expect(result.product.variants).toHaveLength(1);
    expect(result.product.variants[0]).toMatchObject({
      active: true,
      hppProfileId: "profile-mie",
      hppBatchId: "batch-balado",
      hppPackageId: "pack-150",
    });
    expect(result.product.variants[0].sku).not.toBe(
      "HPP-MIE-KRE-BALAD-PEDA-150-GR",
    );
  });

  it("preserves identity and selling price while updating cost and archiving deselected variants", () => {
    const candidates = buildHppPublishCandidates(profile);
    const existingProduct: Product = {
      id: "product-mie",
      name: "Mie Lama",
      category: "Snack",
      unit: "Pack",
      active: false,
      imageUrl: "https://example.com/mie-lama.webp",
      variants: candidates.map((candidate, index) => ({
        id: `variant-${index + 1}`,
        name: candidate.variantName,
        sku: `SKU-${index + 1}`,
        cost: 1,
        price: 99_000 + index,
        resellerPrice: 88_000,
        minStock: 5,
        active: true,
        hppProfileId: profile.id,
        hppBatchId: candidate.batchId,
        hppPackageId: candidate.packageId,
      })),
    };

    const result = buildProductFromHpp({
      profile,
      existingProduct,
      selectedKeys: [candidates[0].key],
      productName: "Mie Kremes Baru",
      category: "Makanan",
      unit: "Pcs",
      updateSellingPrices: false,
      reservedSkus: [],
      idFactory: (prefix) => `${prefix}-new`,
    });

    const active = result.product.variants.find(
      (variant) => variant.id === "variant-1",
    );
    const archived = result.product.variants.find(
      (variant) => variant.id === "variant-2",
    );
    expect(result.product.active).toBe(true);
    expect(result.product.imageUrl).toBe(
      "https://example.com/mie-lama.webp",
    );
    expect(active).toMatchObject({
      sku: "SKU-1",
      price: 99_000,
      minStock: 5,
      active: true,
    });
    expect(active?.cost).toBeCloseTo(candidates[0].cost);
    expect(archived?.active).toBe(false);
    expect(result.summary.costChanged).toBe(1);
    expect(result.summary.priceChanged).toBe(0);
    expect(result.summary.archived).toBe(1);
  });
});
