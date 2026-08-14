import type {
  HppProductProfile,
  Product,
  StockUnit,
  Variant,
} from "../types";
import { calculateBatchHpp, calculateExcelProductHpp } from "./hpp";

export interface HppPublishCandidate {
  key: string;
  batchId: string;
  packageId: string;
  flavor: string;
  spiceLevel: string;
  packageName: string;
  variantName: string;
  cost: number;
  price: number;
}

export interface HppPublishSummary {
  created: number;
  costChanged: number;
  priceChanged: number;
  archived: number;
  unchanged: number;
}

export const hppPublishKey = (batchId: string, packageId: string) =>
  `${batchId}::${packageId}`;

export const buildHppPublishCandidates = (
  profile: HppProductProfile,
): HppPublishCandidate[] =>
  profile.batches.flatMap((batch) => {
    const batchResult = calculateBatchHpp(batch, profile.masterItems);
    return profile.packages.map((packageOption) => {
      const result = calculateExcelProductHpp(
        batchResult.hppPerWeightUnit,
        packageOption,
        profile.operations,
      );
      return {
        key: hppPublishKey(batch.id, packageOption.id),
        batchId: batch.id,
        packageId: packageOption.id,
        flavor: batch.flavor,
        spiceLevel: batch.spiceLevel,
        packageName: packageOption.name,
        variantName: `${batch.flavor} · ${batch.spiceLevel} · ${packageOption.name}`,
        cost: result.offlineHpp,
        price: result.offlineSellingPrice,
      };
    });
  });

const skuPart = (value: string, length: number) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, length) || "X";

const uniqueSku = (
  profileName: string,
  candidate: HppPublishCandidate,
  reserved: Set<string>,
) => {
  const base = [
    "HPP",
    skuPart(profileName, 7),
    skuPart(candidate.flavor, 5),
    skuPart(candidate.spiceLevel, 4),
    skuPart(candidate.packageName, 6),
  ].join("-");
  let sku = base;
  let sequence = 2;
  while (reserved.has(sku.toLowerCase())) {
    sku = `${base}-${sequence}`;
    sequence += 1;
  }
  reserved.add(sku.toLowerCase());
  return sku;
};

export function buildProductFromHpp({
  profile,
  existingProduct,
  selectedKeys,
  productName,
  category,
  unit,
  imageUrl,
  updateSellingPrices,
  reservedSkus,
  existingVariantKeys = {},
  idFactory,
}: {
  profile: HppProductProfile;
  existingProduct?: Product;
  selectedKeys: Iterable<string>;
  productName: string;
  category: string;
  unit: StockUnit;
  imageUrl?: string;
  updateSellingPrices: boolean;
  reservedSkus: Iterable<string>;
  existingVariantKeys?: Record<string, string>;
  idFactory: (prefix: string) => string;
}): { product: Product; summary: HppPublishSummary } {
  const selected = new Set(selectedKeys);
  const candidates = buildHppPublishCandidates(profile);
  const generatedVariants = (existingProduct?.variants || []).filter(
    (variant) =>
      variant.hppProfileId === profile.id || Boolean(existingVariantKeys[variant.id]),
  );
  const existingByKey = new Map<string, Variant>();
  generatedVariants.forEach((variant) => {
    const key =
      variant.hppBatchId && variant.hppPackageId
        ? hppPublishKey(variant.hppBatchId, variant.hppPackageId)
        : existingVariantKeys[variant.id];
    if (key) existingByKey.set(key, variant);
  });

  const reserved = new Set(
    [...reservedSkus]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean),
  );
  (existingProduct?.variants || []).forEach((variant) => {
    if (variant.sku) reserved.add(variant.sku.trim().toLowerCase());
  });

  const summary: HppPublishSummary = {
    created: 0,
    costChanged: 0,
    priceChanged: 0,
    archived: 0,
    unchanged: 0,
  };
  const nextGenerated: Variant[] = [];

  candidates.forEach((candidate) => {
    const existing = existingByKey.get(candidate.key);
    if (!selected.has(candidate.key)) {
      if (existing) {
        if (existing.active !== false) summary.archived += 1;
        nextGenerated.push({ ...existing, active: false });
      }
      return;
    }

    if (!existing) {
      summary.created += 1;
      nextGenerated.push({
        id: idFactory("v"),
        name: candidate.variantName,
        sku: uniqueSku(profile.name, candidate, reserved),
        packageWeight: candidate.packageName,
        flavor: candidate.flavor,
        spiceLevel: candidate.spiceLevel,
        cost: candidate.cost,
        price: candidate.price,
        resellerPrice: candidate.price,
        minStock: 0,
        active: true,
        hppProfileId: profile.id,
        hppBatchId: candidate.batchId,
        hppPackageId: candidate.packageId,
      });
      return;
    }

    const costChanged = Math.abs(Number(existing.cost) - candidate.cost) > 0.005;
    const priceChanged =
      updateSellingPrices &&
      Math.abs(Number(existing.price) - candidate.price) > 0.005;
    if (costChanged) summary.costChanged += 1;
    if (priceChanged) summary.priceChanged += 1;
    if (!costChanged && !priceChanged && existing.active !== false)
      summary.unchanged += 1;
    nextGenerated.push({
      ...existing,
      name: candidate.variantName,
      packageWeight: candidate.packageName,
      flavor: candidate.flavor,
      spiceLevel: candidate.spiceLevel,
      cost: candidate.cost,
      price: updateSellingPrices ? candidate.price : existing.price,
      active: true,
      hppProfileId: profile.id,
      hppBatchId: candidate.batchId,
      hppPackageId: candidate.packageId,
    });
  });

  const generatedIds = new Set(generatedVariants.map((item) => item.id));
  const preserved = (existingProduct?.variants || []).filter(
    (variant) => !generatedIds.has(variant.id),
  );
  const resolvedImageUrl =
    imageUrl === undefined
      ? existingProduct?.imageUrl
      : imageUrl.trim() || undefined;
  return {
    product: {
      id: existingProduct?.id || idFactory("prod"),
      name: productName.trim(),
      category: category.trim(),
      unit,
      // Publishing an archived linked product is an explicit request to make it
      // saleable again. Keeping it archived would make a successful sync look
      // like it had no effect in the Product & Variant menu.
      active: true,
      imageUrl: resolvedImageUrl,
      variants: [...preserved, ...nextGenerated],
    },
    summary,
  };
}

export const existingHppVariantKey = (variant: Variant) =>
  variant.hppBatchId && variant.hppPackageId
    ? hppPublishKey(variant.hppBatchId, variant.hppPackageId)
    : "";

export const isCandidatePublished = (
  candidate: HppPublishCandidate,
  variants: Variant[],
) =>
  variants.some(
    (variant) =>
      existingHppVariantKey(variant) === candidate.key && variant.active !== false,
  );

export const candidateExists = (
  key: string,
  profile: HppProductProfile,
) => buildHppPublishCandidates(profile).some((candidate) => candidate.key === key);

export const candidateForVariant = (
  variant: Variant,
  profile: HppProductProfile,
) => {
  const key = existingHppVariantKey(variant);
  return key
    ? buildHppPublishCandidates(profile).find((candidate) => candidate.key === key)
    : undefined;
};

export const candidateByKey = (
  key: string,
  profile: HppProductProfile,
) => buildHppPublishCandidates(profile).find((candidate) => candidate.key === key);

export const publishedCandidateKeys = (
  profile: HppProductProfile,
  product?: Product,
) =>
  new Set(
    (product?.variants || [])
      .filter(
        (variant) =>
          variant.hppProfileId === profile.id && variant.active !== false,
      )
      .map(existingHppVariantKey)
      .filter(Boolean),
  );

export const candidateLookup = (profile: HppProductProfile) =>
  new Map(buildHppPublishCandidates(profile).map((item) => [item.key, item]));

export const variantLookupByHppKey = (profile: HppProductProfile, product?: Product) =>
  new Map(
    (product?.variants || [])
      .filter((variant) => variant.hppProfileId === profile.id)
      .map((variant) => [existingHppVariantKey(variant), variant] as const)
      .filter(([key]) => Boolean(key)),
  );

export const allHppVariantKeys = (profile: HppProductProfile) =>
  buildHppPublishCandidates(profile).map((candidate) => candidate.key);

export const activeGeneratedVariantCount = (
  profile: HppProductProfile,
  product?: Product,
) =>
  (product?.variants || []).filter(
    (variant) =>
      variant.hppProfileId === profile.id && variant.active !== false,
  ).length;

export const archivedGeneratedVariantCount = (
  profile: HppProductProfile,
  product?: Product,
) =>
  (product?.variants || []).filter(
    (variant) => variant.hppProfileId === profile.id && variant.active === false,
  ).length;

export const publishCandidateCount = (profile: HppProductProfile) =>
  profile.batches.length * profile.packages.length;

export const hasPublishableHpp = (profile: HppProductProfile) =>
  profile.batches.length > 0 &&
  profile.packages.length > 0 &&
  buildHppPublishCandidates(profile).every(
    (candidate) => candidate.cost >= 0 && candidate.price > 0,
  );
