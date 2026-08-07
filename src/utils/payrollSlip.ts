import type { AppData, Payroll } from "../types";

const safe = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
const rupiah = (value: number) => `Rp ${Math.round(Number(value || 0)).toLocaleString("id-ID")}`;
const periodLabel = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
};
const slipCode = (payroll: Payroll) => `SLIP-${payroll.period.replace("-", "")}-${payroll.id.slice(-6).toUpperCase()}`;
const paidAtLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}, ${date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false })} WIB`;
};

export function payrollSlipHtml(payroll: Payroll, data: AppData) {
  const employee = (data.employees || []).find((item) => item.id === payroll.employeeId);
  const account = data.users.find((item) => item.id === employee?.userId);
  const location = data.locations.find((item) => item.id === employee?.locationId);
  const business = data.business;
  const amount = Number(payroll.grossAmount || 0);
  const employeeName = payroll.employeeName || account?.name || "Karyawan";
  const position = payroll.positionSnapshot || employee?.position || "-";
  const locationName = payroll.locationNameSnapshot || location?.name || "-";
  const businessContact = [business?.address, business?.phone, business?.email].filter(Boolean).map(safe).join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safe(slipCode(payroll))}</title><style>
    @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;background:#fff;color:#132337;font:12px/1.45 Arial,sans-serif}.slip{width:100%;max-width:186mm;margin:0 auto;border:1px solid #aebdc6}.head{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:15px;padding:17px 20px;border-bottom:4px solid #087fa9}.logo{width:52px;height:52px;object-fit:contain;border:1px solid #d7e1e6;border-radius:7px}.logo-fallback{display:grid;place-items:center;width:52px;height:52px;border:2px solid #083b5b;border-radius:7px;color:#083b5b;font-size:18px;font-weight:800}.brand h1{margin:0;color:#083b5b;font-size:20px;line-height:1.2}.brand p{margin:3px 0 0;max-width:390px;color:#607483;font-size:10px}.document-title{text-align:right}.document-title strong{display:block;color:#083b5b;font-size:17px;letter-spacing:.05em}.document-title span{display:block;margin-top:3px;color:#607483;font-size:10px}.body{padding:18px 20px 14px}.summary{display:grid;grid-template-columns:1fr 1fr;gap:0 30px;padding:4px 0 13px;border-bottom:1px solid #bfcdd4}.summary p,.amount-row{display:flex;justify-content:space-between;gap:12px;margin:0;padding:6px 0;border-bottom:1px solid #e1e8ec}.summary span,.amount-row span{color:#607483}.summary b{text-align:right}.paid{display:inline-block;padding:1px 8px;border:1px solid #177245;border-radius:999px;color:#177245;font-size:10px;letter-spacing:.04em}.section-title{margin:15px 0 6px;color:#083b5b;font-size:10px;letter-spacing:.11em}.amount-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #bccbd3}.amount-section{padding:7px 13px 10px}.amount-section+ .amount-section{border-left:1px solid #bccbd3}.amount-section h3{margin:0 0 3px;color:#607483;font-size:10px;letter-spacing:.06em}.amount-row.subtotal{border-bottom:0;padding-top:9px;color:#132337}.amount-row.subtotal span{color:#132337}.total{display:flex;align-items:center;justify-content:space-between;margin-top:9px;padding:11px 14px;border:2px solid #083b5b;color:#083b5b;font-size:16px}.total span{font-size:12px;font-weight:700;letter-spacing:.04em}.note{margin-top:12px;padding:9px 11px;border-left:3px solid #b98220;background:#fff;color:#5f4b25;font-size:10px}.note p{margin:0}.note p+p{margin-top:4px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:65px;margin-top:26px;text-align:center}.signature-space{height:48px}.signature-name{border-top:1px solid #526a7a;padding-top:5px;font-weight:700}.signatures small{color:#607483}.verification{margin-top:20px;padding-top:8px;border-top:1px dashed #aebdc6;color:#607483;font-size:9px;text-align:center}.footer{display:flex;justify-content:space-between;gap:20px;padding:9px 20px;border-top:1px solid #d5e0e5;color:#607483;font-size:9px}.footer span:last-child{text-align:right}@media print{body{font-size:11px}.slip{break-inside:avoid}}
  </style></head><body><main class="slip"><header class="head">${business?.logoUrl ? `<img class="logo" src="${safe(business.logoUrl)}" alt="Logo ${safe(business?.name || "usaha")}">` : `<div class="logo-fallback">${safe((business?.name || "M").slice(0, 2).toUpperCase())}</div>`}<div class="brand"><h1>${safe(business?.name || "Menengs")}</h1>${businessContact ? `<p>${businessContact}</p>` : `<p>Dokumen penggajian resmi perusahaan</p>`}</div><div class="document-title"><strong>SLIP GAJI</strong><span>${safe(slipCode(payroll))}</span></div></header><section class="body"><div class="summary"><div><p><span>Nama karyawan</span><b>${safe(employeeName)}</b></p><p><span>Jabatan</span><b>${safe(position)}</b></p><p><span>Lokasi kerja</span><b>${safe(locationName)}</b></p></div><div><p><span>Periode</span><b>${safe(periodLabel(payroll.period))}</b></p><p><span>Tanggal dibayar</span><b>${safe(paidAtLabel(payroll.paidAt))}</b></p><p><span>Status</span><b class="paid">LUNAS</b></p></div></div><h2 class="section-title">RINCIAN PEMBAYARAN</h2><div class="amount-grid"><section class="amount-section"><h3>PENGHASILAN</h3><p class="amount-row"><span>Gaji pokok</span><b>${rupiah(amount)}</b></p><p class="amount-row subtotal"><span>Subtotal penghasilan</span><b>${rupiah(amount)}</b></p></section><section class="amount-section"><h3>POTONGAN</h3><p class="amount-row"><span>Potongan gaji</span><b>${rupiah(0)}</b></p><p class="amount-row subtotal"><span>Total potongan</span><b>${rupiah(0)}</b></p></section></div><div class="total"><span>TOTAL DITERIMA</span><b>${rupiah(amount)}</b></div><aside class="note"><p><b>Informasi kasbon:</b> Kasbon dicatat terpisah dan tidak dipotong otomatis dari pembayaran ini.</p>${payroll.note ? `<p><b>Catatan pembayaran:</b> ${safe(payroll.note)}</p>` : ""}</aside><div class="signatures"><section><div class="signature-space"></div><div class="signature-name">${safe(business?.ownerName || "Owner")}</div><small>Owner / Penanggung jawab</small></section><section><div class="signature-space"></div><div class="signature-name">${safe(employeeName)}</div><small>Penerima</small></section></div><p class="verification">Slip ini dibuat secara elektronik oleh sistem dan sah sebagai bukti pembayaran setelah dikonfirmasi oleh pihak terkait.</p></section><footer class="footer"><span>${safe(business?.name || "Menengs")}</span><span>Nomor dokumen: ${safe(slipCode(payroll))}</span></footer></main></body></html>`;
}

export function printPayrollSlip(payroll: Payroll, data: AppData, reservedWindow?: Window | null) {
  const printWindow = reservedWindow || window.open("", "_blank");
  if (!printWindow) throw new Error("Izinkan popup browser agar slip gaji dapat dicetak.");
  printWindow.document.open();
  printWindow.document.write(payrollSlipHtml(payroll, data));
  printWindow.document.close();
  printWindow.focus();
  let printed = false;
  const printWhenReady = () => {
    if (printed) return;
    printed = true;
    printWindow.print();
  };
  if (printWindow.document.readyState === "complete") window.setTimeout(printWhenReady, 150);
  else {
    printWindow.addEventListener?.("load", printWhenReady, { once: true });
    window.setTimeout(printWhenReady, 1_200);
  }
}
