import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ExcelSheet {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  data: any[];
}

export const downloadExcel = async (filename: string, sheets: ExcelSheet[]) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VEINSTOCK';
  workbook.created = new Date();

  sheets.forEach(sheetDef => {
    const sheet = workbook.addWorksheet(sheetDef.name, {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] // Freeze header row
    });

    // Add columns
    sheet.columns = sheetDef.columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width || 20
    }));

    // Add data rows
    sheet.addRows(sheetDef.data);

    // Format Header Row
    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' } // Navy / Slate-900
      };
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true,
        size: 12
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    // Format Data Rows
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const key = sheetDef.columns[colNumber - 1].key.toLowerCase();
        
        // Formatting numbers as Rupiah
        if (['price', 'total', 'cost', 'value', 'omset', 'modal', 'totalnilai', 'total nilai', 'harga', 'hargasatuan', 'subtotal', 'nilai'].includes(key) || (typeof cell.value === 'number' && !['jumlah', 'qty', 'kuantitas', 'peringkat'].includes(key))) {
           if (typeof cell.value === 'number') {
              cell.numFmt = '_("Rp"* #,##0_);_("Rp"* \\(#,##0\\);_("Rp"* "-"_);_(@_)';
           }
        } else if (['jumlah', 'qty', 'kuantitas', 'peringkat'].includes(key)) {
           if (typeof cell.value === 'number') {
              cell.numFmt = '#,##0';
           }
        }
        
        cell.alignment = { vertical: 'middle' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });
    });
  });

  // Write buffer and save file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${filename}.xlsx`);
};
