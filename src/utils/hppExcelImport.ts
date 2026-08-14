import type ExcelJS from "exceljs";
import type {
  HppBatch,
  HppMasterItem,
  HppOperationalDefaults,
  HppPackageOption,
  HppProductProfile,
} from "../types";

const valueOf = (cell: ExcelJS.Cell) => {
  const value: any = cell.value;
  if (value && typeof value === "object" && "result" in value)
    return value.result;
  if (value && typeof value === "object" && "richText" in value)
    return value.richText.map((item: any) => item.text).join("");
  return value ?? "";
};
const textOf = (cell: ExcelJS.Cell) => String(valueOf(cell) ?? "").trim();
const numberOf = (cell: ExcelJS.Cell) => Number(valueOf(cell)) || 0;
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const id = (prefix: string, name: string, index: number) =>
  `${prefix}-${slug(name) || index}-${Date.now()}-${index}`;

export interface HppExcelImportResult {
  profile: HppProductProfile;
  sourceSheets: string[];
  calculationRows: number;
}

export async function parseHppExcel(file: File): Promise<HppExcelImportResult> {
  const { default: ExcelJSRuntime } = await import("exceljs");
  const workbook = new ExcelJSRuntime.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const master = workbook.worksheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === "master input",
  );
  const batchSheet = workbook.worksheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === "perhitungan batch",
  );
  if (!master || !batchSheet)
    throw new Error(
      "Sheet ‘Master Input’ dan ‘Perhitungan Batch’ wajib tersedia.",
    );

  const title = textOf(master.getCell("A1"));
  const name =
    title.replace(/^MASTER\s+HPP\s+[^-]*-\s*/i, "").trim() ||
    file.name.replace(/\.xlsx?$/i, "");
  const masterItems: HppMasterItem[] = [];
  const mainName =
    textOf(master.getCell("A5"))
      .replace(/^Harga\s+/i, "")
      .replace(/\s*\/\s*gram.*$/i, "")
      .trim() || name;
  masterItems.push({
    id: id("master", mainName, 0),
    name: mainName,
    unit: "Gram",
    unitCost: numberOf(master.getCell("B5")),
  });
  for (let row = 10; row <= master.rowCount; row += 1) {
    const materialName = textOf(master.getCell(row, 1));
    const unitCost = numberOf(master.getCell(row, 2));
    if (materialName && unitCost >= 0)
      masterItems.push({
        id: id("master", materialName, row),
        name: materialName,
        unit: "Gram",
        unitCost,
      });
  }

  const packages: HppPackageOption[] = [];
  for (let row = 5; row <= master.rowCount; row += 1) {
    const packageName = textOf(master.getCell(row, 5));
    const contentWeight = numberOf(master.getCell(row, 6));
    if (packageName.toLowerCase() === "operasional") break;
    if (packageName && contentWeight > 0)
      packages.push({
        id: id("pack", packageName, row),
        name: packageName,
        contentWeight,
        packagingCost: numberOf(master.getCell(row, 7)),
        targetProfit: numberOf(master.getCell(row, 8)),
      });
  }
  const operations: HppOperationalDefaults = {
    packingCost: numberOf(master.getCell("F12")),
    employeeCost: numberOf(master.getCell("F13")),
    onlineAdsCost: numberOf(master.getCell("B7")),
    tiktokAdditionalCost: numberOf(master.getCell("F14")),
    tiktokNetRate: numberOf(master.getCell("F16")) || 0.7,
  };

  const findMaster = (needle: string, flavor: string) => {
    const normalized = needle.toLowerCase();
    if (normalized.includes("bahan utama")) return masterItems[0];
    if (
      normalized.includes("bumbu rasa") ||
      normalized.includes("daun jeruk")
    ) {
      return (
        masterItems.find((item) =>
          item.name.toLowerCase().includes(flavor.toLowerCase()),
        ) ||
        masterItems.find((item) =>
          item.name.toLowerCase().includes("bumbu " + flavor.toLowerCase()),
        ) ||
        masterItems.find((item) =>
          item.name.toLowerCase().includes("daun jeruk"),
        )
      );
    }
    const aliases = normalized.includes("cabai")
      ? ["cabai"]
      : normalized.includes("minyak bawang")
        ? ["minyak bawang"]
        : normalized.includes("chili oil")
          ? ["chili oil"]
          : normalized.includes("atom")
            ? ["atom"]
            : [normalized.replace(/\s*\(.*$/, "")];
    return masterItems.find((item) =>
      aliases.some((alias) => item.name.toLowerCase().includes(alias)),
    );
  };
  const batches: HppBatch[] = [];
  for (let row = 2; row <= batchSheet.rowCount; row += 1) {
    const flavor = textOf(batchSheet.getCell(row, 1));
    const spiceLevel = textOf(batchSheet.getCell(row, 2));
    if (!flavor || !spiceLevel) continue;
    const ingredients = [];
    for (let column = 3; column <= 8; column += 1) {
      const quantity = numberOf(batchSheet.getCell(row, column));
      const masterItem = findMaster(
        textOf(batchSheet.getCell(1, column)),
        flavor,
      );
      if (masterItem && quantity >= 0)
        ingredients.push({
          id: id("ingredient", `${row}-${column}`, column),
          masterItemId: masterItem.id,
          quantity,
        });
    }
    batches.push({
      id: id("batch", `${flavor}-${spiceLevel}`, row),
      name: `${flavor} - ${spiceLevel}`,
      flavor,
      spiceLevel,
      ingredients,
      updatedAt: new Date().toISOString(),
    });
  }
  if (!masterItems.length || !packages.length || !batches.length)
    throw new Error(
      "Data Master Input, kemasan, atau batch tidak berhasil dibaca.",
    );
  const profileId = id("hpp-profile", name, 1);
  batches.forEach((batch) => {
    batch.productId = profileId;
  });
  return {
    profile: {
      id: profileId,
      name,
      masterItems,
      packages,
      operations,
      batches,
      updatedAt: new Date().toISOString(),
    },
    sourceSheets: workbook.worksheets.map((sheet) => sheet.name),
    calculationRows: batches.length * packages.length,
  };
}
