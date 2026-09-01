import { describe, expect, it } from "vitest";
import {
  applyReceiptBulkValues,
  applyTransferBulkQuantity,
  parseOptionalBulkCost,
  parseOptionalBulkQuantity,
} from "./stockBulk";

describe("stock bulk updates", () => {
  it("parses only valid optional quantities and costs", () => {
    expect(parseOptionalBulkQuantity("")).toBeUndefined();
    expect(parseOptionalBulkQuantity("20")).toBe(20);
    expect(parseOptionalBulkQuantity("0")).toBeNull();
    expect(parseOptionalBulkQuantity("1.5")).toBeNull();
    expect(parseOptionalBulkCost("")).toBeUndefined();
    expect(parseOptionalBulkCost("6704")).toBe(6704);
    expect(parseOptionalBulkCost("-1")).toBeNull();
  });

  it("applies receipt fields independently to every selected variant", () => {
    const items = {
      a: { quantity: 1, unitCost: 6704 },
      b: { quantity: 2, unitCost: 6825 },
    };

    expect(applyReceiptBulkValues(items, 20, undefined)).toEqual({
      a: { quantity: 20, unitCost: 6704 },
      b: { quantity: 20, unitCost: 6825 },
    });
    expect(applyReceiptBulkValues(items, undefined, 7000)).toEqual({
      a: { quantity: 1, unitCost: 7000 },
      b: { quantity: 2, unitCost: 7000 },
    });
  });

  it("updates only selected variants inside the active filter scope", () => {
    const items = {
      baladoA: { quantity: 20, unitCost: 6704 },
      baladoB: { quantity: 20, unitCost: 6825 },
      kejuA: { quantity: 1, unitCost: 7000 },
      kejuB: { quantity: 1, unitCost: 7100 },
    };

    expect(
      applyReceiptBulkValues(items, 10, undefined, ["kejuA", "kejuB"]),
    ).toEqual({
      baladoA: { quantity: 20, unitCost: 6704 },
      baladoB: { quantity: 20, unitCost: 6825 },
      kejuA: { quantity: 10, unitCost: 7000 },
      kejuB: { quantity: 10, unitCost: 7100 },
    });
  });

  it("applies transfer quantity to every selected variant", () => {
    expect(
      applyTransferBulkQuantity(
        { a: { quantity: 1 }, b: { quantity: 2 } },
        5,
      ),
    ).toEqual({ a: { quantity: 5 }, b: { quantity: 5 } });
    expect(
      applyTransferBulkQuantity(
        { balado: { quantity: 20 }, keju: { quantity: 1 } },
        10,
        ["keju"],
      ),
    ).toEqual({ balado: { quantity: 20 }, keju: { quantity: 10 } });
  });
});
