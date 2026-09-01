import type { AppData, Sale } from "../types";

export type PrinterMode = "system" | "usb" | "bluetooth";
export type PaperWidth = "58" | "80";
export interface PrinterSettings {
  mode: PrinterMode;
  paperWidth: PaperWidth;
  copies: number;
  deviceName?: string;
  deviceId?: string;
  usbVendorId?: number;
  usbProductId?: number;
  usbSerialNumber?: string;
}

const STORAGE_KEY = "menengs.receipt-printer.v1";
const encoder = new TextEncoder();
let usbDevice: any = null;
let usbEndpoint: number | null = null;
let bluetoothDevice: any = null;
let bluetoothCharacteristic: any = null;
const statusListeners = new Set<() => void>();
let usbDisconnectListenerInstalled = false;

const emitStatus = () => statusListeners.forEach((listener) => listener());
const withTimeout = async <T,>(operation: Promise<T>, message: string, timeoutMs = 8_000) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
export function subscribePrinterStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

export const defaultPrinterSettings: PrinterSettings = { mode: "system", paperWidth: "58", copies: 1 };

export function loadPrinterSettings(): PrinterSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return { ...defaultPrinterSettings, ...stored, copies: Math.min(3, Math.max(1, Number(stored?.copies || 1))) };
  } catch {
    return defaultPrinterSettings;
  }
}

export function savePrinterSettings(settings: PrinterSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function printerCapabilities() {
  return {
    usb: typeof navigator !== "undefined" && Boolean((navigator as any).usb),
    bluetooth: typeof navigator !== "undefined" && Boolean((navigator as any).bluetooth),
  };
}

export function isPrinterConnected(mode: PrinterMode) {
  if (mode === "usb") return Boolean(usbDevice?.opened && usbEndpoint !== null);
  if (mode === "bluetooth") return Boolean(bluetoothDevice?.gatt?.connected && bluetoothCharacteristic);
  return false;
}

async function openUsbDevice(device: any) {
  const usb = (navigator as any).usb;
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  let selectedInterface: any = null;
  let endpoint: any = null;
  for (const candidate of device.configuration?.interfaces || []) {
    for (const alternate of candidate.alternates || []) {
      const output = alternate.endpoints?.find((item: any) => item.direction === "out");
      if (output) { selectedInterface = candidate; endpoint = output; break; }
    }
    if (endpoint) break;
  }
  if (!selectedInterface || !endpoint) {
    await device.close().catch(() => undefined);
    throw new Error("Printer USB tidak menyediakan jalur cetak yang kompatibel dengan ESC/POS.");
  }
  await device.claimInterface(selectedInterface.interfaceNumber);
  usbDevice = device;
  usbEndpoint = endpoint.endpointNumber;
  if (!usbDisconnectListenerInstalled) {
    usb.addEventListener?.("disconnect", (event: any) => {
      if (event.device === usbDevice) {
        usbDevice = null;
        usbEndpoint = null;
        emitStatus();
      }
    });
    usbDisconnectListenerInstalled = true;
  }
  emitStatus();
  return {
    deviceName: device.productName || device.manufacturerName || "Printer USB",
    usbVendorId: device.vendorId,
    usbProductId: device.productId,
    usbSerialNumber: device.serialNumber || undefined,
  };
}

export async function connectUsbPrinter() {
  const usb = (navigator as any).usb;
  if (!usb) throw new Error("Browser ini belum mendukung koneksi printer USB. Gunakan Chrome/Edge desktop atau mode Sistem.");
  const device = await usb.requestDevice({ filters: [] });
  return openUsbDevice(device);
}

const BLE_PROFILES = [
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", characteristic: "0000ffe1-0000-1000-8000-00805f9b34fb" },
  { service: "000018f0-0000-1000-8000-00805f9b34fb", characteristic: "00002af1-0000-1000-8000-00805f9b34fb" },
];

async function openBluetoothDevice(device: any) {
  const server = await withTimeout(Promise.resolve(device.gatt?.connect()), "Koneksi RPP02N tidak merespons. Matikan lalu hidupkan printer dan coba kembali.");
  if (!server) throw new Error("Printer Bluetooth tidak dapat dihubungkan.");
  for (const profile of BLE_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service);
      const characteristic = await service.getCharacteristic(profile.characteristic);
      bluetoothDevice = device;
      bluetoothCharacteristic = characteristic;
      device.addEventListener?.("gattserverdisconnected", () => {
        bluetoothCharacteristic = null;
        bluetoothDevice = null;
        emitStatus();
      });
      emitStatus();
      return { deviceName: device.name || "Printer Bluetooth", deviceId: device.id };
    } catch {
      // Coba profil BLE ESC/POS umum berikutnya.
    }
  }
  device.gatt?.disconnect();
  throw new Error("Perangkat ditemukan, tetapi tidak memakai profil Bluetooth ESC/POS yang didukung. Gunakan mode Sistem.");
}

export async function connectBluetoothPrinter() {
  const bluetooth = (navigator as any).bluetooth;
  if (!bluetooth) throw new Error("Browser ini belum mendukung koneksi printer Bluetooth. Gunakan Chrome Android atau mode Sistem.");
  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_PROFILES.map((profile) => profile.service),
  });
  return openBluetoothDevice(device);
}

export async function reconnectSavedPrinter(settings: PrinterSettings) {
  if (settings.mode === "system" || isPrinterConnected(settings.mode)) return false;
  try {
    if (settings.mode === "usb") {
      const usb = (navigator as any).usb;
      if (!usb?.getDevices || !settings.usbVendorId) return false;
      const devices = await usb.getDevices();
      const device = devices.find((item: any) =>
        item.vendorId === settings.usbVendorId &&
        item.productId === settings.usbProductId &&
        (!settings.usbSerialNumber || item.serialNumber === settings.usbSerialNumber),
      );
      if (!device) return false;
      await openUsbDevice(device);
      return true;
    }
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth?.getDevices || !settings.deviceId) return false;
    const devices = await bluetooth.getDevices();
    const device = devices.find((item: any) => item.id === settings.deviceId);
    if (!device) return false;
    await openBluetoothDevice(device);
    return true;
  } catch {
    return false;
  }
}

export function disconnectPrinter(mode: PrinterMode) {
  if (mode === "usb") {
    if (usbDevice?.close) void Promise.resolve(usbDevice.close()).catch(() => undefined);
    usbDevice = null;
    usbEndpoint = null;
  }
  if (mode === "bluetooth") {
    bluetoothDevice?.gatt?.disconnect?.();
    bluetoothDevice = null;
    bluetoothCharacteristic = null;
  }
  emitStatus();
}

const rupiah = (value: number) => `Rp ${Math.round(Number(value || 0)).toLocaleString("id-ID")}`;
const discountLabel = (sale: Sale) =>
  sale.discountType === "percentage" && Number(sale.discountValue) > 0
    ? `DISKON (${Number(sale.discountValue).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%)`
    : "DISKON";
const safe = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
const saleCode = (sale: Sale) => `TRX-${sale.id.slice(-8).toUpperCase()}`;

function receiptLines(sale: Sale, data: AppData) {
  const variants = Object.fromEntries(data.products.flatMap((product) => product.variants.map((variant) => [variant.id, { ...variant, productName: product.name }] as const)));
  return sale.items.map((item) => {
    const variant = variants[item.variantId];
    const unitPrice = Number(
      item.price ??
        (item.quantity ? Number(item.subtotal || 0) / item.quantity : 0),
    );
    return { name: `${variant?.productName || "Produk"} - ${variant?.name || item.variantId}`, quantity: item.quantity, unitPrice, subtotal: Number(item.subtotal || 0) };
  });
}

export function receiptHtml(sale: Sale, data: AppData, settings: PrinterSettings) {
  const business = data.business;
  const location = data.locations.find((item) => item.id === sale.locationId);
  const cashier = data.users.find((item) => item.id === sale.cashierId)?.name || "Staf Menengs";
  const width = settings.paperWidth === "80" ? "80mm" : "58mm";
  const lines = receiptLines(sale, data);
  const discountAmount = Number(sale.discountAmount || 0);
  const grossTotal = Number(
    sale.grossTotal ??
      (lines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0) ||
        sale.total + discountAmount),
  );
  return `<!doctype html><html><head><meta charset="utf-8"><title>Struk ${safe(saleCode(sale))}</title><style>
    @page{size:${width} auto;margin:3mm}*{box-sizing:border-box}body{width:${width};margin:0 auto;padding:2mm;font:11px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;color:#000}h1{font-size:16px;margin:0 0 3px;text-align:center}header{text-align:center}.logo{max-width:28mm;max-height:18mm;object-fit:contain}.muted{font-size:10px}.rule{border-top:1px dashed #000;margin:7px 0}.meta,.total-row,.line-head{display:flex;justify-content:space-between;gap:8px}.items{width:100%;border-collapse:collapse}.items td{padding:2px 0;vertical-align:top}.items td:last-child{text-align:right;white-space:nowrap}.item-name{max-width:${settings.paperWidth === "80" ? "53mm" : "34mm"}}.grand{font-size:13px;font-weight:700}.footer{text-align:center;margin-top:9px}.no-print{margin:12px auto;display:block}@media print{.no-print{display:none}body{padding:0}}
  </style></head><body><header>${business?.logoUrl ? `<img class="logo" src="${safe(business.logoUrl)}" alt="">` : ""}<h1>${safe(business?.name || "Menengs")}</h1><div class="muted">${safe(location?.name || "Lokasi usaha")}</div>${business?.address || location?.address ? `<div class="muted">${safe(business?.address || location?.address)}</div>` : ""}${business?.phone ? `<div class="muted">${safe(business.phone)}</div>` : ""}</header><div class="rule"></div><div class="meta"><span>No. Struk</span><b>${safe(saleCode(sale))}</b></div><div class="meta"><span>Tanggal</span><span>${safe(new Date(sale.createdAt).toLocaleString("id-ID"))}</span></div><div class="meta"><span>Kasir</span><span>${safe(cashier)}</span></div><div class="meta"><span>Pembayaran</span><span>${safe(sale.payment)}</span></div><div class="rule"></div><table class="items">${lines.map((line) => `<tr><td class="item-name">${safe(line.name)}<br><span class="muted">${line.quantity} × ${rupiah(line.unitPrice)}</span></td><td>${rupiah(line.subtotal)}</td></tr>`).join("")}</table><div class="rule"></div>${discountAmount > 0 ? `<div class="total-row"><span>SUBTOTAL</span><span>${rupiah(grossTotal)}</span></div><div class="total-row"><span>${safe(discountLabel(sale))}</span><span>−${rupiah(discountAmount)}</span></div>` : ""}<div class="total-row grand"><span>TOTAL</span><span>${rupiah(sale.total)}</span></div>${sale.note ? `<div class="rule"></div><b>CATATAN PESANAN</b><div>${safe(sale.note)}</div>` : ""}<div class="rule"></div><div class="footer">Terima kasih<br><span class="muted">Barang yang sudah dibeli mengikuti kebijakan retur toko.</span></div></body></html>`;
}

function escposReceipt(sale: Sale, data: AppData, settings: PrinterSettings) {
  const columns = settings.paperWidth === "80" ? 48 : 32;
  const leftRight = (left: string, right: string) => `${left.slice(0, Math.max(1, columns - right.length - 1))}${" ".repeat(Math.max(1, columns - Math.min(left.length, columns - right.length - 1) - right.length))}${right}\n`;
  const business = data.business;
  const location = data.locations.find((item) => item.id === sale.locationId);
  const cashier = data.users.find((item) => item.id === sale.cashierId)?.name || "Staf Menengs";
  const lines = receiptLines(sale, data);
  const discountAmount = Number(sale.discountAmount || 0);
  const grossTotal = Number(
    sale.grossTotal ??
      (lines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0) ||
        sale.total + discountAmount),
  );
  let text = `${business?.name || "MENENGS"}\n${location?.name || "Lokasi usaha"}\n${business?.address || location?.address || ""}\n${business?.phone || ""}\n${"-".repeat(columns)}\n`;
  text += `No: ${saleCode(sale)}\n${new Date(sale.createdAt).toLocaleString("id-ID")}\nKasir: ${cashier}\nBayar: ${sale.payment}\n${"-".repeat(columns)}\n`;
  for (const line of lines) text += `${line.name}\n${leftRight(`${line.quantity} x ${rupiah(line.unitPrice)}`, rupiah(line.subtotal))}`;
  text += `${"-".repeat(columns)}\n`;
  if (discountAmount > 0) {
    text += leftRight("SUBTOTAL", rupiah(grossTotal));
    text += leftRight(discountLabel(sale), `-${rupiah(discountAmount)}`);
  }
  text += leftRight("TOTAL", rupiah(sale.total));
  if (sale.note) text += `${"-".repeat(columns)}\nCATATAN PESANAN\n${sale.note}\n`;
  text += `${"-".repeat(columns)}\nTerima kasih\n\n\n`;
  return new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x01, ...encoder.encode(text), 0x1d, 0x56, 0x00]);
}

async function writeBluetooth(bytes: Uint8Array) {
  if (!bluetoothCharacteristic || !bluetoothDevice?.gatt?.connected) throw new Error("Printer Bluetooth belum terhubung.");
  // Printer thermal murah umumnya memakai MTU BLE 23 byte (payload 20 byte).
  // Paket 180 byte dapat resolve di browser tetapi diam-diam dibuang printer.
  for (let offset = 0; offset < bytes.length; offset += 20) {
    const chunk = bytes.slice(offset, offset + 20);
    if (bluetoothCharacteristic.properties?.writeWithoutResponse && bluetoothCharacteristic.writeValueWithoutResponse) {
      await withTimeout(bluetoothCharacteristic.writeValueWithoutResponse(chunk), "RPP02N tidak merespons data cetak.");
    } else if (bluetoothCharacteristic.properties?.write && bluetoothCharacteristic.writeValueWithResponse) {
      await withTimeout(bluetoothCharacteristic.writeValueWithResponse(chunk), "RPP02N tidak merespons data cetak.");
    } else if (bluetoothCharacteristic.writeValue) {
      await withTimeout(bluetoothCharacteristic.writeValue(chunk), "RPP02N tidak merespons data cetak.");
    } else {
      throw new Error("Printer Bluetooth tidak menyediakan jalur tulis yang didukung.");
    }
    // RPP02N membutuhkan waktu memproses setiap paket sebelum paket berikutnya.
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
}

async function writeUsb(bytes: Uint8Array) {
  if (!usbDevice?.opened || usbEndpoint === null) throw new Error("Printer USB belum terhubung.");
  const result = await usbDevice.transferOut(usbEndpoint, bytes);
  if (!result || result.status !== "ok" || (Number.isFinite(result.bytesWritten) && result.bytesWritten < bytes.byteLength)) {
    throw new Error("Printer USB menolak atau tidak menerima seluruh data struk.");
  }
}

export async function directPrintSale(sale: Sale, data: AppData, settings: PrinterSettings) {
  const bytes = escposReceipt(sale, data, settings);
  for (let copy = 0; copy < settings.copies; copy += 1) {
    if (settings.mode === "usb") {
      await writeUsb(bytes);
    } else if (settings.mode === "bluetooth") {
      await writeBluetooth(bytes);
    } else {
      throw new Error("Mode printer langsung belum dipilih.");
    }
  }
}

export function systemPrintSale(sale: Sale, data: AppData, settings: PrinterSettings) {
  // Cetak dari iframe pada halaman aktif. Tablet tidak lagi dipindahkan ke tab
  // kosong setelah transaksi disimpan.
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const printWindow = frame.contentWindow;
  if (!printWindow) {
    frame.remove();
    throw new Error("Pratinjau cetak tidak dapat disiapkan di browser ini.");
  }
  printWindow.document.open();
  printWindow.document.write(receiptHtml(sale, data, settings));
  printWindow.document.close();
  let printed = false;
  const printWhenReady = () => {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => frame.remove(), 1_000);
  };
  if (printWindow.document.readyState === "complete") window.setTimeout(printWhenReady, 150);
  else {
    printWindow.addEventListener?.("load", printWhenReady, { once: true });
    window.setTimeout(printWhenReady, 1_200);
  }
}

export async function testDirectPrinter(settings: PrinterSettings) {
  const test = encoder.encode("\x1b@\x1ba\x01MENENGS\nPrinter terhubung\nTes cetak berhasil\n\n\n\x1dV\x00");
  if (settings.mode === "usb") {
    if (!usbDevice?.opened || usbEndpoint === null) throw new Error("Hubungkan printer USB terlebih dahulu.");
    await writeUsb(test);
  } else if (settings.mode === "bluetooth") {
    await writeBluetooth(test);
  } else {
    throw new Error("Tes koneksi langsung hanya tersedia untuk USB/Bluetooth.");
  }
}
