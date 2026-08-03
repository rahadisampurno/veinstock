import { describe, expect, it } from "vitest";
import { calculateHppCosts, isDecimalDraft, materialLineCost, nonNegativeNumber, normalizeDecimalDraft } from "./hpp";

describe("HPP calculations", () => {
  it("calculates a material line using decimal quantities", () => {
    expect(materialLineCost({ quantity: 1.5, unitCost: 100_000 })).toBe(150_000);
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
    )).toEqual({ materialCost: 155_000, additionalCost: 10_000, totalCost: 165_000, unitHpp: 33_000 });
  });

  it("normalizes invalid and negative inputs to zero", () => {
    expect(calculateHppCosts([{ quantity: -1, unitCost: 100_000 }], [{ amount: -10 }], 0)).toEqual({
      materialCost: 0,
      additionalCost: 0,
      totalCost: 0,
      unitHpp: 0,
    });
  });
});
