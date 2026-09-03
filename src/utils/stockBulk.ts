export type OptionalBulkValue = number | undefined | null;

export type ProductVariantBulkValues = Partial<
  Record<
    | "cost"
    | "price"
    | "onlineCost"
    | "onlinePrice"
    | "resellerPrice"
    | "minStock"
    | "initialStock",
    number
  >
>;

export const applyProductVariantBulkValues = <
  T extends { id: string | number },
>(
  variants: T[],
  targetVariantIds: Iterable<string | number>,
  values: ProductVariantBulkValues,
): T[] => {
  const targets = new Set(targetVariantIds);
  const updates = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as ProductVariantBulkValues;

  return variants.map((variant) =>
    targets.has(variant.id) ? ({ ...variant, ...updates } as T) : variant,
  );
};

export const parseOptionalBulkQuantity = (
  draft: string,
): OptionalBulkValue => {
  const value = String(draft || "").trim();
  if (!value) return undefined;
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
};

export const parseOptionalBulkCost = (draft: string): OptionalBulkValue => {
  const value = String(draft || "").trim();
  if (!value) return undefined;
  const cost = Number(value);
  return Number.isInteger(cost) && cost >= 0 ? cost : null;
};

export const applyReceiptBulkValues = <
  T extends { quantity: number; unitCost: number },
>(
  items: Record<string, T>,
  quantity: number | undefined,
  unitCost: number | undefined,
  targetVariantIds: Iterable<string> = Object.keys(items),
): Record<string, T> => {
  const targets = new Set(targetVariantIds);
  return Object.fromEntries(
    Object.entries(items).map(([variantId, item]) => [
      variantId,
      targets.has(variantId)
        ? {
            ...item,
            quantity: quantity ?? item.quantity,
            unitCost: unitCost ?? item.unitCost,
          }
        : item,
    ]),
  );
};

export const applyTransferBulkQuantity = <T extends { quantity: number }>(
  items: Record<string, T>,
  quantity: number,
  targetVariantIds: Iterable<string> = Object.keys(items),
): Record<string, T> => {
  const targets = new Set(targetVariantIds);
  return Object.fromEntries(
    Object.entries(items).map(([variantId, item]) => [
      variantId,
      targets.has(variantId) ? { ...item, quantity } : item,
    ]),
  );
};
