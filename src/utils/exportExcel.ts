import { saveAs } from 'file-saver';

export interface ExcelSheet {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  data: any[];
}

const exportedAt = () => new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta',
}).format(new Date());

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
export const buildExcelWorkbook = (sheets: ExcelSheet[]) => `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#163244"/><Alignment ss:Vertical="Top"/><Borders/></Style>
  <Style ss:ID="title"><Font ss:FontName="Arial" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#075875" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center"/></Style>
  <Style ss:ID="meta"><Font ss:FontName="Arial" ss:Size="9" ss:Color="#5E7587"/><Alignment ss:Horizontal="Left" ss:Vertical="Center"/></Style>
  <Style ss:ID="header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#079BC3" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#08799A"/></Borders></Style>
  <Style ss:ID="text"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2EDF2"/></Borders></Style>
  <Style ss:ID="money"><Alignment ss:Horizontal="Right" ss:Vertical="Top"/><NumberFormat ss:Format="&quot;Rp&quot; #,##0;[Red]-&quot;Rp&quot; #,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2EDF2"/></Borders></Style>
  <Style ss:ID="number"><Alignment ss:Horizontal="Right" ss:Vertical="Top"/><NumberFormat ss:Format="#,##0;[Red]-#,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2EDF2"/></Borders></Style>
  <Style ss:ID="percent"><Alignment ss:Horizontal="Right" ss:Vertical="Top"/><NumberFormat ss:Format="0.0%;[Red]-0.0%"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2EDF2"/></Borders></Style>
 </Styles>
 ${sheets.map((sheet, sheetIndex) => {
   const rows = sheet.data.map((row) => `<Row>${sheet.columns.map((column, columnIndex) => {
     const value = Array.isArray(row) ? row[columnIndex] : row?.[column.key];
     const key = column.key.toLowerCase();
     const isQuantity = ['jumlah', 'qty', 'kuantitas', 'peringkat', 'saldo', 'minimum'].includes(key);
     const isMoney = ['price', 'total', 'cost', 'value', 'omset', 'modal', 'totalnilai', 'harga', 'hargasatuan', 'subtotal', 'nilai', 'diskon', 'penjualanbersih', 'hppsatuan', 'totalhpp', 'labakotor'].includes(key);
     const isPercent = ['persen', 'persentase', 'margin'].includes(key);
     const styleId = typeof value === 'number' ? (isQuantity ? 'number' : isMoney ? 'money' : isPercent ? 'percent' : 'number') : 'text';
     const style = ` ss:StyleID="${styleId}"`;
     const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String';
     const cellValue = type === 'Number' ? value : safeCellValue(value);
     return `<Cell${style}><Data ss:Type="${type}">${escapeXml(cellValue)}</Data></Cell>`;
   }).join('')}</Row>`).join('');
   const columnCount = Math.max(1, sheet.columns.length);
   const lastRow = Math.max(4, sheet.data.length + 4);
   return `<Worksheet ss:Name="${escapeXml(safeSheetName(sheet.name, sheetIndex))}"><Names><NamedRange ss:Name="_FilterDatabase" ss:RefersTo="='${escapeXml(safeSheetName(sheet.name, sheetIndex))}'!R4C1:R${lastRow}C${columnCount}" ss:Hidden="1"/></Names><Table>${sheet.columns.map(column => `<Column ss:AutoFitWidth="0" ss:Width="${Math.min(210, Math.max(70, (column.width || 20) * 7))}"/>`).join('')}<Row ss:Height="34"><Cell ss:StyleID="title" ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">Laporan Menengs · ${escapeXml(sheet.name)}</Data></Cell></Row><Row ss:Height="20"><Cell ss:StyleID="meta" ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">Dibuat ${escapeXml(exportedAt())} WIB · Data mengikuti filter pada aplikasi</Data></Cell></Row><Row ss:Height="8"/><Row ss:StyleID="header" ss:Height="30">${sheet.columns.map(column => `<Cell><Data ss:Type="String">${escapeXml(column.header)}</Data></Cell>`).join('')}</Row>${rows}</Table><AutoFilter x:Range="R4C1:R${lastRow}C${columnCount}" xmlns="urn:schemas-microsoft-com:office:excel"/><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><DoNotDisplayGridlines/><PageSetup><Layout x:Orientation="Landscape"/><Header x:Margin="0.3"/><Footer x:Margin="0.3"/></PageSetup><FitToPage/><Print><FitWidth>1</FitWidth><FitHeight>0</FitHeight><ValidPrinterInfo/><HorizontalResolution>600</HorizontalResolution><VerticalResolution>600</VerticalResolution></Print></WorksheetOptions></Worksheet>`;
 }).join('')}
</Workbook>`;

export const downloadExcel = async (filename: string, sheets: ExcelSheet[]) => {
  const workbook = buildExcelWorkbook(sheets);

  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
  saveAs(blob, `${filename}.xls`);
};
