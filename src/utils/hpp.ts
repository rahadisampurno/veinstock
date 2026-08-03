import type { HppAdditionalCost, HppMaterial } from "../types";

export const nonNegativeNumber = (value: unknown) => {
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const isDecimalDraft = (value: string) => /^\d*(?:[.,]\d*)?$/.test(value);

export const materialLineCost = (material: Pick<HppMaterial, "quantity" | "unitCost">) =>
  nonNegativeNumber(material.quantity) * nonNegativeNumber(material.unitCost);

export const calculateHppCosts = (
  materials: Array<Pick<HppMaterial, "quantity" | "unitCost">>,
  additionalCosts: Array<Pick<HppAdditionalCost, "amount">>,
  yieldQuantity: unknown,
) => {
  const materialCost = materials.reduce((total, material) => total + materialLineCost(material), 0);
  const additionalCost = additionalCosts.reduce((total, cost) => total + nonNegativeNumber(cost.amount), 0);
  const totalCost = materialCost + additionalCost;
  const yieldAmount = nonNegativeNumber(yieldQuantity);
  return {
    materialCost,
    additionalCost,
    totalCost,
    unitHpp: yieldAmount > 0 ? totalCost / yieldAmount : 0,
  };
};
