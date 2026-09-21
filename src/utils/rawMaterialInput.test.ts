import { describe, expect, it } from "vitest";
import {
  parseRawMaterialCurrency,
  sanitizeRawMaterialCurrencyInput,
  sanitizeRawMaterialQuantityInput,
} from "./rawMaterialInput";

describe("raw material numeric inputs", () => {
  it("removes words from measured quantities and keeps three decimals", () => {
    expect(sanitizeRawMaterialQuantityInput("12masa bisa,3456kg", false)).toBe(
      "12,345",
    );
  });

  it("allows only whole numbers for countable units", () => {
    expect(sanitizeRawMaterialQuantityInput("12renteng", true)).toBe("12");
    expect(sanitizeRawMaterialQuantityInput("1,5", true)).toBe("1");
  });

  it("removes words and formats Rupiah thousands", () => {
    expect(sanitizeRawMaterialCurrencyInput("Rp 21213123asdasd")).toBe(
      "21.213.123",
    );
    expect(parseRawMaterialCurrency("21.213.123")).toBe(21_213_123);
  });
});
