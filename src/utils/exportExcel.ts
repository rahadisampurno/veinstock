import { saveAs } from 'file-saver';

export interface ExcelSheet {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  data: any[];
}

const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const safeCellValue = (value: unknown) => {
  const text = String(value ?? '');
  // Prevent formula execution when a spreadsheet is opened in Excel or similar tools.
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const safeSheetName = (name: string, index: number) => {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet ${index + 1}`;
};

/**
 * Exports SpreadsheetML, a native multi-sheet Excel workbook format supported by
 * Microsoft Excel, LibreOffice, and Google Sheets—without a server-side ZIP stack.
 */
export const downloadExcel = async (filename: string, sheets: ExcelSheet[]) => {
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#172033" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  <Style ss:ID="money"><NumberFormat ss:Format="&quot;Rp&quot;#,##0"/></Style>
  <Style ss:ID="number"><NumberFormat ss:Format="#,##0"/></Style>
 </Styles>
 ${sheets.map((sheet, sheetIndex) => {
   const rows = sheet.data.map((row) => `<Row>${sheet.columns.map((column, columnIndex) => {
     const value = Array.isArray(row) ? row[columnIndex] : row?.[column.key];
     const key = column.key.toLowerCase();
     const isQuantity = ['jumlah', 'qty', 'kuantitas', 'peringkat'].includes(key);
     const isMoney = ['price', 'total', 'cost', 'value', 'omset', 'modal', 'totalnilai', 'harga', 'hargasatuan', 'subtotal', 'nilai'].includes(key);
     const style = typeof value === 'number' ? (isQuantity ? ' ss:StyleID="number"' : isMoney ? ' ss:StyleID="money"' : '') : '';
     const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String';
     const cellValue = type === 'Number' ? value : safeCellValue(value);
     return `<Cell${style}><Data ss:Type="${type}">${escapeXml(cellValue)}</Data></Cell>`;
   }).join('')}</Row>`).join('');
   return `<Worksheet ss:Name="${escapeXml(safeSheetName(sheet.name, sheetIndex))}"><Table>${sheet.columns.map(column => `<Column ss:Width="${Math.max(60, (column.width || 20) * 7)}"/>`).join('')}<Row ss:StyleID="header">${sheet.columns.map(column => `<Cell><Data ss:Type="String">${escapeXml(column.header)}</Data></Cell>`).join('')}</Row>${rows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;
 }).join('')}
</Workbook>`;

  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
  saveAs(blob, `${filename}.xls`);
};
