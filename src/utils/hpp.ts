import type {
  HppAdditionalCost,
  HppBatch,
  HppMasterItem,
  HppMaterial,
  HppOperationalDefaults,
  HppPackageOption,
  HppProductProfile,
  HppRecipe,
} from "../types";

export const nonNegativeNumber = (value: unknown) => {
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const isDecimalDraft = (value: string) => /^\d*(?:[.,]\d*)?$/.test(value);

export const normalizeDecimalDraft = (value: string) => {
  if (!value) return "";
  const separatorIndex = value.search(/[.,]/);
  const integerPart = separatorIndex >= 0 ? value.slice(0, separatorIndex) : value;
  const separatorAndFraction = separatorIndex >= 0 ? value.slice(separatorIndex) : "";
  const normalizedInteger = (integerPart || "0").replace(/^0+(?=\d)/, "");
  return `${normalizedInteger}${separatorAndFraction}`;
};

export const effectiveMaterialUnitCost = (material: Pick<HppMaterial, "unitCost" | "purchaseQuantity" | "purchaseCost">) => {
  const purchaseQuantity = nonNegativeNumber(material.purchaseQuantity);
  const purchaseCost = nonNegativeNumber(material.purchaseCost);
  return purchaseQuantity > 0 && purchaseCost > 0 ? purchaseCost / purchaseQuantity : nonNegativeNumber(material.unitCost);
};

export const materialLineCost = (material: Pick<HppMaterial, "quantity" | "unitCost" | "purchaseQuantity" | "purchaseCost">) =>
  nonNegativeNumber(material.quantity) * effectiveMaterialUnitCost(material);

export const calculateHppCosts = (
  materials: Array<Pick<HppMaterial, "quantity" | "unitCost" | "purchaseQuantity" | "purchaseCost">>,
  additionalCosts: Array<Pick<HppAdditionalCost, "amount" | "allocation">>,
  yieldQuantity: unknown,
  wastePercent: unknown = 0,
) => {
  const materialCost = materials.reduce((total, material) => total + materialLineCost(material), 0);
  const grossYieldAmount = nonNegativeNumber(yieldQuantity);
  const normalizedWaste = Math.min(100, nonNegativeNumber(wastePercent));
  const netYieldAmount = grossYieldAmount * (1 - normalizedWaste / 100);
  const additionalCost = additionalCosts.reduce((total, cost) => total + nonNegativeNumber(cost.amount) * (cost.allocation === "per_unit" ? netYieldAmount : 1), 0);
  const totalCost = materialCost + additionalCost;
  return {
    materialCost,
    additionalCost,
    totalCost,
    grossYieldAmount,
    netYieldAmount,
    wasteAmount: grossYieldAmount - netYieldAmount,
    unitHpp: netYieldAmount > 0 ? totalCost / netYieldAmount : 0,
  };
};

export const calculateBatchHpp = (batch: Pick<HppBatch, "ingredients">, masters: HppMasterItem[]) => {
  const masterMap = new Map(masters.map(item => [item.id, item]));
  const ingredientCosts = batch.ingredients.map(ingredient => {
    const master = masterMap.get(ingredient.masterItemId);
    const quantity = nonNegativeNumber(ingredient.quantity);
    const unitCost = nonNegativeNumber(master?.unitCost);
    return { ...ingredient, name: master?.name || "Bahan tidak ditemukan", unit: master?.unit || "", unitCost, totalCost: quantity * unitCost };
  });
  const batchWeight = ingredientCosts.reduce((total, item) => total + item.quantity, 0);
  const batchCost = ingredientCosts.reduce((total, item) => total + item.totalCost, 0);
  return { ingredientCosts, batchWeight, batchCost, hppPerWeightUnit: batchWeight > 0 ? batchCost / batchWeight : 0 };
};

export const calculateExcelProductHpp = (
  hppPerWeightUnit: unknown,
  packageOption: HppPackageOption,
  operations: HppOperationalDefaults,
) => {
  const productCost = nonNegativeNumber(packageOption.contentWeight) * nonNegativeNumber(hppPerWeightUnit);
  const offlineHpp = productCost + nonNegativeNumber(packageOption.packagingCost) + nonNegativeNumber(operations.packingCost) + nonNegativeNumber(operations.employeeCost);
  const offlineSellingPrice = offlineHpp + nonNegativeNumber(packageOption.targetProfit);
  const onlineHpp = offlineHpp + nonNegativeNumber(operations.onlineAdsCost);
  const onlineSellingPrice = onlineHpp + nonNegativeNumber(packageOption.targetProfit);
  const tiktokNetRate = Math.min(1, nonNegativeNumber(operations.tiktokNetRate));
  const tiktokSellingPrice = tiktokNetRate > 0
    ? (onlineHpp + nonNegativeNumber(packageOption.targetProfit) + nonNegativeNumber(operations.tiktokAdditionalCost)) / tiktokNetRate
    : 0;
  return { productCost, offlineHpp, offlineSellingPrice, onlineHpp, onlineSellingPrice, tiktokSellingPrice };
};

export const duplicateHppProductProfile = (
  source: HppProductProfile,
  recipes: HppRecipe[],
  name: string,
  createId: (prefix: string) => string,
  updatedAt = new Date().toISOString(),
) => {
  const masterIdMap = new Map(
    source.masterItems.map((item) => [item.id, createId("master")]),
  );
  const packageIdMap = new Map(
    source.packages.map((item) => [item.id, createId("pack")]),
  );
  const batchIdMap = new Map(
    source.batches.map((item) => [item.id, createId("batch")]),
  );

  const profile: HppProductProfile = {
    ...source,
    id: createId("hpp-profile"),
    name: name.trim(),
    productId: undefined,
    masterItems: source.masterItems.map((item) => ({
      ...item,
      id: masterIdMap.get(item.id)!,
    })),
    packages: source.packages.map((item) => ({
      ...item,
      id: packageIdMap.get(item.id)!,
    })),
    operations: { ...source.operations },
    batches: source.batches.map((batch) => ({
      ...batch,
      id: batchIdMap.get(batch.id)!,
      productId: undefined,
      ingredients: batch.ingredients.map((ingredient) => ({
        ...ingredient,
        id: createId("ingredient"),
        masterItemId:
          masterIdMap.get(ingredient.masterItemId) || ingredient.masterItemId,
      })),
      updatedAt,
    })),
    updatedAt,
  };

  const duplicatedRecipes = recipes
    .filter((item) => Boolean(item.batchId && batchIdMap.has(item.batchId)))
    .map((item) => ({
      ...item,
      id: createId("hpp"),
      name: `${item.name} - Salinan`,
      variantId: undefined,
      variantIds: [],
      batchId: item.batchId ? batchIdMap.get(item.batchId) : undefined,
      packageId: item.packageId
        ? packageIdMap.get(item.packageId)
        : undefined,
      materials: item.materials.map((material) => ({
        ...material,
        id: createId("mat"),
      })),
      additionalCosts: item.additionalCosts.map((cost) => ({
        ...cost,
        id: createId("cost"),
      })),
      updatedAt,
    }));

  return { profile, recipes: duplicatedRecipes };
};
