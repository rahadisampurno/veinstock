import { describe, expect, it } from 'vitest';
import { buildExcelWorkbook } from './exportExcel';

describe('buildExcelWorkbook', () => {
  it('membuat workbook laporan dengan judul, filter, freeze pane, dan format angka', () => {
    const workbook = buildExcelWorkbook([{
      name: 'Ringkasan / Audit',
      columns: [
        { header: 'Metrik', key: 'metrik', width: 24 },
        { header: 'Nilai', key: 'nilai', width: 18 },
        { header: 'Jumlah', key: 'jumlah', width: 12 },
      ],
      data: [['Omzet', 1250000, 12], ['Catatan', '=tidak dieksekusi', 0]],
    }]);

    expect(workbook).toContain('Laporan Menengs · Ringkasan / Audit');
    expect(workbook).toContain('<AutoFilter x:Range="R4C1:R6C3"');
    expect(workbook).toContain('<SplitHorizontal>4</SplitHorizontal>');
    expect(workbook).toContain('<Layout x:Orientation="Landscape"/>');
    expect(workbook).toContain('ss:StyleID="money"><Data ss:Type="Number">1250000');
    expect(workbook).toContain('&apos;=tidak dieksekusi');
    expect(workbook).not.toContain('<Selected/>');
  });
});
