import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseHppExcel } from "./hppExcelImport";
import { calculateBatchHpp, calculateExcelProductHpp } from "./hpp";
import ExcelJS from "exceljs";

describe("import HPP Excel Menengs", () => {
  it("mengimpor master, batch, kemasan, dan menghasilkan angka yang sama", async () => {
    const bytes = await readFile(
      "/Users/telkomdev-rahadi/Downloads/HPP_Mie_Kremes_Menengs_New.xlsx",
    );
    const file = new File([bytes], "HPP_Mie_Kremes_Menengs_New.xlsx");
    const imported = await parseHppExcel(file);
    expect(imported.profile.name).toBe("MIE KREMES");
    expect(imported.profile.masterItems).toHaveLength(10);
    expect(imported.profile.packages).toHaveLength(5);
    expect(imported.profile.batches).toHaveLength(24);
    expect(imported.calculationRows).toBe(120);
    const batch = calculateBatchHpp(
      imported.profile.batches[0],
      imported.profile.masterItems,
    );
    expect(batch.batchWeight).toBe(3880);
    expect(batch.batchCost).toBeCloseTo(128872.4, 4);
    const product = calculateExcelProductHpp(
      batch.hppPerWeightUnit,
      imported.profile.packages[0],
      imported.profile.operations,
    );
    expect(product.offlineHpp).toBeCloseTo(6882.180412371134, 4);
    expect(product.tiktokSellingPrice).toBeCloseTo(18760.257731958758, 4);
  });

  it("merekonsiliasi seluruh 24 batch dan 120 HPP produk terhadap nilai Excel", async () => {
    const path =
      "/Users/telkomdev-rahadi/Downloads/HPP_Mie_Kremes_Menengs_New.xlsx";
    const bytes = await readFile(path);
    const imported = await parseHppExcel(
      new File([bytes], "HPP_Mie_Kremes_Menengs_New.xlsx"),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const cellNumber = (sheet: ExcelJS.Worksheet, address: string) => {
      const value: any = sheet.getCell(address).value;
      return (
        Number(
          value && typeof value === "object" && "result" in value
            ? value.result
            : value,
        ) || 0
      );
    };
    const batchSheet = workbook.getWorksheet("Perhitungan Batch")!;
    imported.profile.batches.forEach((batch, index) => {
      const result = calculateBatchHpp(batch, imported.profile.masterItems);
      const row = index + 2;
      expect(result.batchWeight).toBeCloseTo(
        cellNumber(batchSheet, `I${row}`),
        8,
      );
      expect(result.batchCost).toBeCloseTo(
        cellNumber(batchSheet, `P${row}`),
        8,
      );
      expect(result.hppPerWeightUnit).toBeCloseTo(
        cellNumber(batchSheet, `Q${row}`),
        8,
      );
    });
    const productSheet = workbook.getWorksheet("HPP Mie Kremes")!;
    let row = 2;
    imported.profile.batches.forEach((batch) => {
      const batchResult = calculateBatchHpp(
        batch,
        imported.profile.masterItems,
      );
      imported.profile.packages.forEach((packageOption) => {
        const result = calculateExcelProductHpp(
          batchResult.hppPerWeightUnit,
          packageOption,
          imported.profile.operations,
        );
        expect(result.productCost).toBeCloseTo(
          cellNumber(productSheet, `F${row}`),
          8,
        );
        expect(result.offlineHpp).toBeCloseTo(
          cellNumber(productSheet, `J${row}`),
          8,
        );
        expect(result.offlineSellingPrice).toBeCloseTo(
          cellNumber(productSheet, `L${row}`),
          8,
        );
        expect(result.onlineHpp).toBeCloseTo(
          cellNumber(productSheet, `N${row}`),
          8,
        );
        expect(result.onlineSellingPrice).toBeCloseTo(
          cellNumber(productSheet, `O${row}`),
          8,
        );
        expect(result.tiktokSellingPrice).toBeCloseTo(
          cellNumber(productSheet, `R${row}`),
          8,
        );
        row += 1;
      });
    });
    expect(row).toBe(122);
  });
});
