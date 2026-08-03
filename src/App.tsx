import { Children, isValidElement, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveUserScope, authorizeAction, type ActionType } from "./utils/rbac";
import { getOperationalNotifications, type OperationalNotification } from "./utils/operationalNotifications";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  Archive,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  Bell,
  CalendarDays,
  Boxes,
  Check,
  Camera,
  ClipboardCheck,
  Calculator,
  Download,
  History,
  Info,
  LayoutDashboard,
  KeyRound,
  Menu,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Trash2,
  Users,
  Eye,
  EyeOff,
  Warehouse,
  X,
  LifeBuoy,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock3,
  MapPin,
  WalletCards,
  Truck
} from "lucide-react";
import { sections, popularArticles } from "./data/helpData";
import { downloadExcel } from "./utils/exportExcel";
import { downloadPDF } from "./utils/exportPdf";
import type {
  AppData,
  Channel,
  HppAdditionalCost,
  HppMaterial,
  HppRecipe,
  MarketplaceConfig,
  Product,
  Sale,
  SessionUser,
  StockUnit,
  Variant,
} from "./types";
import { createEmptyData, getBalance, newId, normalizeData, seedData } from "./store";
import "./App.css";

type Page =
  | "dashboard"
  | "products"
  | "locations"
  | "receipts"
  | "stock"
  | "transfers"
  | "sales"
  | "shipping"
  | "returns"
  | "opname"
  | "history"
  | "reports"
  | "business"
  | "users"
  | "help"
  | "analytics"
  | "employees"
  | "attendance"
  | "loans"
  | "pricing"
  | "suppliers";

const normalizeNumberInput = (input: HTMLInputElement) => {
  input.value = input.value.replace(/^0+(?=\d)/, "");
  return input.value;
};

/**
 * Ikon navigasi Menengs dibuat khusus sebagai SVG inline agar konsisten dengan
 * karakter brand dan tetap tajam pada rail kecil maupun menu desktop.
 */
const SidebarGlyph = ({ name, active = false }: { name: string; active?: boolean }) => {
  const props = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  let art: ReactElement;
  switch (name) {
    case "dashboard": art = <><rect {...props} x="3" y="3" width="7" height="7" rx="1.4"/><rect {...props} x="14" y="3" width="7" height="7" rx="1.4"/><rect {...props} x="3" y="14" width="7" height="7" rx="1.4"/><rect {...props} x="14" y="14" width="7" height="7" rx="1.4"/></>; break;
    case "analytics": case "reports": art = <><path {...props} d="M4 19.5V5.5M4 19.5h16"/><path {...props} d="m7 15 4-4 3 2 5-6"/><circle {...props} cx="19" cy="7" r="1"/></>; break;
    case "products": art = <><path {...props} d="m4 8 8-4 8 4v9l-8 4-8-4z"/><path {...props} d="m4 8 8 4 8-4M12 12v9"/></>; break;
    case "locations": art = <><path {...props} d="M4 10h16v10H4zM3 10l2-5h14l2 5"/><path {...props} d="M7 20v-5h4v5M15 14h2"/></>; break;
    case "pricing": art = <><rect {...props} x="5" y="3" width="14" height="18" rx="2"/><path {...props} d="M8 7h8M8 11h2m4 0h2M8 15h2m4 0h2M8 18h2m4 0h2"/></>; break;
    case "suppliers": case "employees": case "users": art = <><circle {...props} cx="12" cy="8" r="3"/><path {...props} d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5"/><path {...props} d="M4 10.5a3 3 0 0 1 1.3-2.5M20 10.5A3 3 0 0 0 18.7 8"/></>; break;
    case "receipts": art = <><path {...props} d="M5 4h14v16H5z"/><path {...props} d="M12 7v7m0 0-3-3m3 3 3-3M8 18h8"/></>; break;
    case "stock": art = <><path {...props} d="m4 8 8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4"/></>; break;
    case "transfers": art = <><path {...props} d="M5 8h12l-3-3m3 3-3 3M19 16H7l3 3m-3-3 3-3"/></>; break;
    case "opname": art = <><rect {...props} x="5" y="4" width="14" height="17" rx="2"/><path {...props} d="M9 4.5h6v2H9zM8 12l2.1 2.1L16 8.5M9 17h6"/></>; break;
    case "history": art = <><path {...props} d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path {...props} d="M4 4v4.5h4.5M12 7v5l3 2"/></>; break;
    case "sales": art = <><path {...props} d="M4 5h2l1.5 10.5h9.8L19 9H7"/><circle {...props} cx="9" cy="19" r="1.3"/><circle {...props} cx="17" cy="19" r="1.3"/></>; break;
    case "returns": art = <><path {...props} d="M19 8a7 7 0 1 0 1 6"/><path {...props} d="m19 4v4h-4"/></>; break;
    case "attendance": art = <><circle {...props} cx="12" cy="12" r="8"/><path {...props} d="M12 7v5l3 2"/></>; break;
    case "loans": art = <><rect {...props} x="3" y="6" width="18" height="13" rx="2"/><path {...props} d="M3 10h18M16 15h2"/></>; break;
    case "business": art = <><path {...props} d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle {...props} cx="12" cy="12" r="3.5"/></>; break;
    case "help": art = <><circle {...props} cx="12" cy="12" r="8"/><path {...props} d="M9.6 9.3a2.6 2.6 0 1 1 4.3 2c-.9.7-1.9 1.2-1.9 2.7M12 17h.01"/></>; break;
    default: art = <><path {...props} d="M5 5h14v14H5z"/><path {...props} d="M8 12h8"/></>;
  }
  return <svg className={`sidebar-glyph${active ? " active" : ""}`} viewBox="0 0 24 24" aria-hidden="true">{art}</svg>;
};

const money = (n?: number | null) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const qty = (n?: number | null, unit?: StockUnit) =>
  `${(n || 0).toLocaleString("id-ID")} ${unit === "pcs" ? "pcs" : unit || "unit"}`;
const jakartaDateKey = (value: Date | string | number = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const detectShippingCarrier = (trackingNumber:string) => {
  const value = String(trackingNumber || "").trim().toUpperCase().replace(/[\s._-]/g, "");
  if (/^SPX/.test(value)) return "SPX Express";
  if (/^(JNT|JT|JP|EZ)[A-Z0-9]{6,}$/.test(value)) return "J&T Express";
  if (/^JNE[A-Z0-9]{6,}$/.test(value)) return "JNE";
  if (/^(SICEPAT|SCP|SC)[A-Z0-9]{6,}$/.test(value)) return "SiCepat";
  if (/^(ANTERAJA|AJ)[A-Z0-9]{6,}$/.test(value)) return "AnterAja";
  if (/^(NINJA|NV)[A-Z0-9]{6,}$/.test(value)) return "Ninja Xpress";
  return null;
};
const shiftDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const startOfWeekKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return shiftDateKey(dateKey, -offset);
};
const startOfMonthKey = (dateKey: string) => `${dateKey.slice(0, 7)}-01`;
const startOfYearKey = (dateKey: string) => `${dateKey.slice(0, 4)}-01-01`;
const isPositiveNumber = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const minimumFor = (variant: Variant | undefined, locationId: string) =>
  variant?.minStockByLocation?.[locationId] ?? variant?.minStock ?? 0;

type ToastTone = "success" | "error" | "info";
type NotificationIntent = {
  modal: "receipt" | "transfer";
  locationId: string;
  variantId: string;
  sourceLocationId?: string;
};
const eanLeft = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const eanRight = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const eanParity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
const barcodeModules = (barcode?: string) => {
  if (!/^\d{13}$/.test(String(barcode || ""))) return "";
  const digits = String(barcode).split("").map(Number);
  let modules = "101";
  for (let index = 1; index <= 6; index += 1) {
    const bits = eanLeft[digits[index]];
    modules += eanParity[digits[0]][index - 1] === "L" ? bits : bits.split("").map(bit => bit === "1" ? "0" : "1").reverse().join("");
  }
  modules += "01010";
  for (let index = 7; index <= 12; index += 1) modules += eanRight[digits[index]];
  return `${modules}101`;
};
const BarcodeGraphic = ({ value, label, compact = false }: { value?: string; label?: string; compact?: boolean }) => {
  const modules = barcodeModules(value);
  if (!modules) return <span className="barcode-pending">{value ? `Barcode: ${value}` : "Barcode akan dibuat saat disimpan"}</span>;
  const bars: ReactElement[] = [];
  let start = 0;
  while (start < modules.length) {
    if (modules[start] === "0") { start += 1; continue; }
    let end = start + 1;
    while (modules[end] === "1") end += 1;
    bars.push(<rect key={start} x={start} y={0} width={end - start} height={compact ? 28 : 38} fill="currentColor" />);
    start = end;
  }
  return <div className={`barcode-graphic${compact ? " compact" : ""}`} aria-label={`Barcode ${value}`}>
    {label && <small>{label}</small>}
    <svg viewBox={`0 0 ${modules.length} ${compact ? 28 : 38}`} role="img" aria-hidden="true" preserveAspectRatio="none">{bars}</svg>
    <code>{value}</code>
  </div>;
};
const printBarcodeLabel = (productName: string, variantName: string, barcode?: string) => {
  const modules = barcodeModules(barcode);
  if (!modules) return;
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
  const bars = [...modules].map((bit, index) => bit === "1" ? `<rect x="${index}" y="0" width="1" height="44"/>` : "").join("");
  const printable = window.open("", "_blank", "noopener,noreferrer,width=420,height=320");
  if (!printable) return;
  printable.document.write(`<!doctype html><html><head><title>Label barcode</title><style>body{font-family:Arial,sans-serif;margin:24px;text-align:center;color:#172033}h1{font-size:18px;margin:0 0 5px}p{margin:0 0 18px;color:#536274}svg{display:block;width:100%;height:100px;color:#000}code{letter-spacing:3px;font-size:16px}</style></head><body><h1>${escapeHtml(productName)}</h1><p>${escapeHtml(variantName)}</p><svg viewBox="0 0 ${modules.length} 44" preserveAspectRatio="none">${bars}</svg><code>${escapeHtml(String(barcode))}</code><script>window.onload=()=>window.print()</script></body></html>`);
  printable.document.close();
};
const findVariantByBarcode = (variants: any[], rawValue: string) => {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return undefined;
  return variants.find((variant: any) => variant?.barcode?.toLowerCase() === value || variant?.sku?.toLowerCase() === value);
};

/** Kamera dipakai hanya setelah tombol Scan ditekan. Komponen ini dipakai pada
 * seluruh alur stok agar hasil scan selalu mengarah ke varian yang sama. */
function BarcodeScanControl({ onDetected, label = "Scan", className = "" }: { onDetected: (value: string) => boolean | Promise<boolean>; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectedRef = useRef(onDetected);
  const applyRef = useRef<(value: string) => Promise<boolean>>(async () => false);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  const stop = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOpen(false);
  };
  const beep = () => {
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const play = () => [1420, 2020].forEach((frequency, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + index * .065;
      oscillator.type = "square"; oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.035, start + .004); gain.gain.exponentialRampToValueAtTime(.0001, start + .055);
      oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + .07);
    });
    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined); else play();
  };
  const apply = async (value: string) => {
    const found = await onDetectedRef.current(value);
    if (!found) { setFeedback("Barcode atau SKU tidak ditemukan pada data yang dapat digunakan di menu ini."); return false; }
    beep(); setFeedback("Barcode berhasil dipindai."); stop(); return true;
  };
  useEffect(() => { applyRef.current = apply; });
  const start = async () => {
    setFeedback("");
    if (!navigator.mediaDevices?.getUserMedia) { setFeedback("Kamera tidak tersedia. Gunakan scanner Bluetooth atau masukkan barcode/SKU."); return; }
    if (!(window as any).BarcodeDetector) { setFeedback("Chrome di perangkat ini belum mendukung pembacaan barcode kamera. Gunakan scanner Bluetooth atau masukkan barcode/SKU."); return; }
    try {
      // Harus langsung dari klik pengguna agar Chrome Android dapat meminta izin.
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      setOpen(true);
    } catch (error: any) {
      const message: Record<string, string> = {
        NotAllowedError: "Izin kamera ditolak. Izinkan Kamera untuk situs ini di Chrome lalu muat ulang halaman.",
        NotFoundError: "Kamera tidak ditemukan pada perangkat ini.",
        NotReadableError: "Kamera sedang dipakai aplikasi lain. Tutup aplikasi Kamera lalu coba lagi.",
      };
      setFeedback(message[error?.name] || "Kamera tidak dapat dibuka. Coba lagi atau gunakan scanner Bluetooth.");
      stop();
    }
  };
  useEffect(() => {
    if (!open || !streamRef.current) return;
    let cancelled = false, timer: number | undefined;
    const run = async () => {
      try {
        if (videoRef.current) { videoRef.current.srcObject = streamRef.current; await videoRef.current.play(); }
        const Detector = (window as any).BarcodeDetector;
        const preferred = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"];
        const supported = typeof Detector.getSupportedFormats === "function" ? await Detector.getSupportedFormats() : preferred;
        const formats = preferred.filter(format => supported.includes(format));
        const detector = formats.length ? new Detector({ formats }) : new Detector();
        timer = window.setInterval(async () => {
          const video = videoRef.current;
          if (cancelled || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          try { const code = (await detector.detect(video))[0]?.rawValue; if (code) await applyRef.current(code); } catch { /* frame belum siap */ }
        }, 260);
      } catch { setFeedback("Pemindai tidak dapat dijalankan. Gunakan scanner Bluetooth atau masukkan barcode/SKU."); stop(); }
    };
    void run();
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [open]);
  useEffect(() => () => stop(), []);
  return <div className={`barcode-scan-control ${className}`}>
    <button type="button" className="barcode-scan-button" onClick={() => void start()}><Camera size={17} />{label}</button>
    {feedback && <small className="barcode-scan-feedback" role="status">{feedback}</small>}
    {open && <div className="pos-camera-scanner"><video ref={videoRef} muted playsInline aria-label="Pratinjau kamera pemindai barcode" /><div><span>Arahkan kamera ke barcode produk</span><button type="button" onClick={stop}><X size={16} /> Tutup</button></div></div>}
  </div>;
}

function ContinuousResiScanner({ onDetected }: { onDetected: (value: string) => Promise<{ ok: boolean; message: string }> }) {
  const [open, setOpen] = useState(false), [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string }>({ tone: "info", message: "Tekan Mulai scan sekali, lalu arahkan resi secara bergantian." });
  const [manual, setManual] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null), streamRef = useRef<MediaStream | null>(null), fallbackControlsRef = useRef<{ stop: () => void } | null>(null), busyRef = useRef(false), recentRef = useRef(new Map<string, number>());
  const stop = useCallback(() => { fallbackControlsRef.current?.stop(); fallbackControlsRef.current = null; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; setOpen(false); }, []);
  const sound = useCallback((ok: boolean) => {
    const Context = window.AudioContext || (window as any).webkitAudioContext; if (!Context) return;
    const context = new Context(), oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = "square"; oscillator.frequency.value = ok ? 1650 : 280; gain.gain.value = .035; oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + (ok ? .08 : .2));
    if (context.state === "suspended") void context.resume();
  }, []);
  const record = useCallback(async (raw: string) => {
    const value = raw.trim().toUpperCase(); if (!value || busyRef.current) return;
    const last = recentRef.current.get(value) || 0; if (Date.now() - last < 2500) return;
    recentRef.current.set(value, Date.now()); busyRef.current = true;
    try { const result = await onDetected(value); sound(result.ok); navigator.vibrate?.(result.ok ? 80 : [120, 70, 120]); setFeedback({ tone: result.ok ? "success" : "error", message: result.message }); }
    finally { busyRef.current = false; }
  }, [onDetected, sound]);
  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setFeedback({ tone: "error", message: "Kamera tidak tersedia. Gunakan input resi manual." });
    try { streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); setOpen(true); }
    catch { setFeedback({ tone: "error", message: "Kamera tidak dapat dibuka. Periksa izin kamera pada browser." }); }
  };
  useEffect(() => {
    if (!open || !streamRef.current) return; let cancelled = false, timer: number | undefined;
    void (async () => {
      if (videoRef.current) { videoRef.current.srcObject = streamRef.current; await videoRef.current.play(); }
      const Detector = (window as any).BarcodeDetector;
      if (Detector) {
        const supported = typeof Detector.getSupportedFormats === "function" ? await Detector.getSupportedFormats() : [];
        const wanted = ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "data_matrix"].filter(format => !supported.length || supported.includes(format));
        const detector = wanted.length ? new Detector({ formats: wanted }) : new Detector();
        timer = window.setInterval(async () => { if (cancelled || busyRef.current || !videoRef.current || videoRef.current.readyState < 2) return; try { const code = (await detector.detect(videoRef.current))[0]?.rawValue; if (code) await record(code); } catch { /* frame berikutnya */ } }, 220);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        fallbackControlsRef.current = await reader.decodeFromStream(streamRef.current!, videoRef.current || undefined, result => { const code = result?.getText(); if (code) void record(code); });
      }
    })().catch(() => setFeedback({ tone: "error", message: "Pemindai kamera gagal dijalankan." }));
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [open, record]);
  useEffect(() => () => stop(), [stop]);
  return <div className="continuous-resi-scanner">
    <div className={`continuous-scan-status ${feedback.tone}`} role="status"><span className="scan-status-dot"/><b>{feedback.message}</b></div>
    {open ? <div className="continuous-camera"><video ref={videoRef} muted playsInline/><div className="scan-reticle"><span>Arahkan barcode resi ke area ini</span></div><button type="button" onClick={stop}><X/> Selesai scan</button></div> : <button type="button" className="primary continuous-start" onClick={() => void start()}><Camera/> Mulai scan kontinu</button>}
    <form className="manual-resi" onSubmit={event => { event.preventDefault(); void record(manual); setManual(""); }}><input value={manual} onChange={event => setManual(event.target.value)} placeholder="Atau masukkan nomor resi manual"/><button className="secondary" disabled={!manual.trim()}>Catat resi</button></form>
  </div>;
}
// Transfer lama belum memiliki kode dokumen. Baris yang lahir dalam proses
// batch yang sama memakai timestamp ID yang sama, sehingga tetap dapat
// ditampilkan sebagai satu dokumen tanpa mengubah histori aslinya.
const transferGroupKey = (transfer: any) => {
  if (transfer.transferCode) return transfer.transferCode;
  const timestamp = /^trf-(\d+)-/i.exec(transfer.id || "")?.[1];
  return timestamp ? `legacy:${transfer.fromId}:${transfer.toId}:${timestamp}` : transfer.id;
};
const transferDisplayCode = (transfer: any) => {
  if (transfer.transferCode) return transfer.transferCode;
  const timestamp = /^trf-(\d+)-/i.exec(transfer.id || "")?.[1];
  return timestamp ? `TRF-${timestamp.slice(-6)}` : transfer.id;
};
// Riwayat lama menyimpan satu baris per varian tanpa kode dokumen. ID-nya
// tetap menyertakan timestamp proses yang sama, sehingga dapat disatukan saat
// ditampilkan tanpa memigrasikan data yang sudah ada.
const receiptGroupKey = (receipt: any) => {
  if (receipt.receiptCode) return receipt.receiptCode;
  const timestamp = /^rcv-(\d+)-/i.exec(receipt.id || "")?.[1];
  return timestamp ? `legacy:${receipt.locationId}:${timestamp}` : receipt.id;
};
const receiptDisplayCode = (receipt: any) => {
  if (receipt.receiptCode) return receipt.receiptCode.toUpperCase();
  const timestamp = /^rcv-(\d+)-/i.exec(receipt.id || "")?.[1];
  return timestamp ? `RCV-${timestamp.slice(-6)}` : receipt.id;
};
const savedSessionKey = "veinstock_saved_session";

const readSession = () => {
  const current = sessionStorage.getItem(savedSessionKey);
  const saved = localStorage.getItem(savedSessionKey);
  try {
    const session = JSON.parse(current || saved || "null") as {
      user: SessionUser;
      token: string;
    } | null;
    if (session?.user && session.token) return session;

    // Pertahankan sesi dari versi aplikasi sebelumnya saat pengguna memperbarui aplikasi.
    const legacyUser = sessionStorage.getItem("veinstock_user");
    const legacyToken = sessionStorage.getItem("veinstock_token");
    return legacyUser && legacyToken
      ? { user: JSON.parse(legacyUser) as SessionUser, token: legacyToken }
      : null;
  } catch {
    return null;
  }
};

function App() {
  // Data transaksi selalu dimuat dari server setelah autentikasi. localStorage
  // tidak lagi dipakai sebagai sumber data operasional.
  const [data, setDataState] = useState<AppData>(() => normalizeData(seedData));
  useEffect(() => {
    const preventLeadingZeroes = (event: Event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === "number") normalizeNumberInput(input);
    };
    document.addEventListener("input", preventLeadingZeroes, true);
    return () => document.removeEventListener("input", preventLeadingZeroes, true);
  }, []);
  const [authUser, setAuthUser] = useState<SessionUser | null>(
    () => readSession()?.user || null,
  );
  const [token, setToken] = useState<string | null>(() => readSession()?.token || null);
  const [hydrated, setHydrated] = useState(false);
  const [page, setPageState] = useState<Page>("dashboard");
  const [helpSection, setHelpSection] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(false);
  // Desktop menggunakan rail ringkas secara konsisten; panel lengkap muncul
  // saat pointer berada di rail sehingga tidak membutuhkan tombol ciutkan.
  const desktopSidebar = false;
  // Preview saat pointer berada di rail. Ini tidak mengubah preferensi
  // collapse yang disimpan pengguna.
  const [sidebarHoverPreview, setSidebarHoverPreview] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth <= 1024);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [modal, setModalState] = useState<string | null>(null);
  const [notificationIntent, setNotificationIntent] = useState<NotificationIntent | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [confirm, setConfirm] = useState<{ message: string, onConfirm: () => void | Promise<void> } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const serverVersion = useRef(0);
  const dataRef = useRef(data);
  const toastTimer = useRef<number | null>(null);
  const historyReady = useRef(false);
  const restoringHistory = useRef(false);
  const showToast = (message: string, tone: ToastTone) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 4_000);
  };
  // Menahan pembaruan dari perangkat lain saat Owner masih memiliki perubahan
  // lokal yang belum selesai dikirim ke server.
  const hasPendingLocalChanges = useRef(false);
  const user = authUser;
  const historyUrlForPage = (nextPage: Page) => `${window.location.pathname}${window.location.search}#${nextPage}`;
  const setPage = (nextPage: Page) => {
    if (nextPage === page) {
      setSidebar(false);
      return;
    }
    setPageState(nextPage);
    setSidebar(false);
    setUserMenuOpen(false);
    if (historyReady.current && !restoringHistory.current) {
      window.history.pushState({ menengs: true, page: nextPage, modal: false }, "", historyUrlForPage(nextPage));
    }
  };
  const setModal = (nextModal: string | null) => {
    if (nextModal === modal) return;
    if (nextModal === null) {
      setModalState(null);
      if (modal && historyReady.current && window.history.state?.menengs && window.history.state?.modal) {
        window.history.back();
      }
      return;
    }
    setModalState(nextModal);
    setUserMenuOpen(false);
    if (historyReady.current && !restoringHistory.current) {
      window.history.pushState({ menengs: true, page, modal: true }, "", historyUrlForPage(page));
    }
  };
  useEffect(() => {
    const knownPages = new Set<Page>(["dashboard", "products", "locations", "receipts", "stock", "transfers", "sales", "shipping", "returns", "opname", "history", "reports", "business", "users", "help", "analytics", "employees", "attendance", "loans", "pricing", "suppliers"]);
    const currentHash = window.location.hash.slice(1) as Page;
    const initialPage = knownPages.has(currentHash) ? currentHash : page;
    if (initialPage !== page) setPageState(initialPage);
    if (!window.history.state?.menengs) {
      window.history.replaceState({ menengs: true, page: initialPage, modal: false }, "", historyUrlForPage(initialPage));
    }
    historyReady.current = true;
    const onPopState = (event: PopStateEvent) => {
      const state = event.state;
      restoringHistory.current = true;
      setModalState(null);
      setSidebar(false);
      setUserMenuOpen(false);
      if (state?.menengs && knownPages.has(state.page)) setPageState(state.page);
      window.setTimeout(() => { restoringHistory.current = false; }, 0);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  // Riwayat UI cukup dipasang sekali; nilai halaman selanjutnya ditangani event popstate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const updateViewport = () => setIsMobileViewport(window.innerWidth <= 1024);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const applyLocalData = (update: AppData | ((current: AppData) => AppData)) => {
    const nextData = typeof update === "function" ? update(dataRef.current) : update;
    dataRef.current = nextData;
    setDataState(nextData);
  };
  useEffect(() => {
    if (!token || !user) {
      setHydrated(false);
      return;
    }
    setHydrated(false);
    fetch("/api/state", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          sessionStorage.removeItem(savedSessionKey);
          localStorage.removeItem(savedSessionKey);
          sessionStorage.removeItem("veinstock_user");
          sessionStorage.removeItem("veinstock_token");
          setAuthUser(null);
          setToken(null);
          return null;
        }
        if (!r.ok) throw new Error("network");
        return r.json();
      })
      .then((result) => {
        if (!result) return;
        serverVersion.current = result.version || 0;
        if (result.data) {
          applyLocalData(normalizeData(result.data));
        } else
          applyLocalData(
            user.organizationId === "org-meneng"
              ? seedData
              : createEmptyData(user.organizationName, user),
          );
        setHydrated(true);
      })
      .catch(() => {
        sessionStorage.removeItem(savedSessionKey);
        localStorage.removeItem(savedSessionKey);
        setAuthUser(null);
        setToken(null);
        showToast("Server tidak dapat dihubungi. Data operasional tidak dibuka dari cache.", "error");
      });
    // Identitas profil tidak boleh memicu hydrate ulang; data tenant hanya berubah saat token/organisasi berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.organizationId]);
  useEffect(() => {
    if (!token || !hydrated) return;

    const refreshFromServer = async () => {
      if (hasPendingLocalChanges.current) return;
      try {
        const response = await fetch("/api/state", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!result.data || Number(result.version) <= serverVersion.current) return;

        serverVersion.current = Number(result.version);
        dataRef.current = normalizeData(result.data);
        setDataState(dataRef.current);
        showToast("Data operasional telah diperbarui.", "info");
      } catch {
    // Koneksi yang putus tidak boleh mengganggu pekerjaan pengguna.
      }
    };

    const refreshWhenVisible = () => {
      if (!document.hidden) void refreshFromServer();
    };
    const interval = window.setInterval(refreshFromServer, 5_000);
    window.addEventListener("focus", refreshFromServer);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshFromServer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [token, user?.organizationId, hydrated]);
  useEffect(() => {
    if (user?.role === "employee") setPage("attendance");
    // Akun karyawan selalu dimulai dari absensi setelah identitas berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);
  useEffect(() => {
    if (modal !== "receipt" && modal !== "transfer") setNotificationIntent(null);
  }, [modal]);
  const variantMap = useMemo(
    () =>
      Object.fromEntries(
        data.products.flatMap((p) =>
          p.variants.map((v) => [
            v.id,
            { ...v, unit: p.unit, productName: p.name },
          ]),
        ),
      ),
    [data.products],
  );
  const locationMap = useMemo(
    () => Object.fromEntries(data.locations.map((l) => [l.id, l])),
    [data.locations],
  );
  const notify = (message: string, tone?: ToastTone) => {
    const inferredTone = tone || (/gagal|tidak dapat|tidak tersedia|ditolak|tidak valid|belum tersimpan|hubungi/i.test(message) ? "error" : "success");
    showToast(message, inferredTone);
  };
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);
  // Perintah transaksi kritis (POS, transfer, penerimaan) dihitung oleh server
  // dari state terbaru. Frontend tidak lagi mengirim snapshot organisasi untuk
  // ketiga alur tersebut, sehingga refresh/perangkat lain tidak dapat menimpa
  // stok yang baru saja berubah.
  const runCommand = async (path: string, payload: object, method: "POST" | "PATCH" = "POST") => {
    if (!token) throw new Error("Sesi tidak ditemukan. Silakan masuk kembali.");
    hasPendingLocalChanges.current = true;
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Transaksi tidak dapat disimpan");
      serverVersion.current = Number(result.version || serverVersion.current);
      const latest = await fetch("/api/state", { headers: { Authorization: `Bearer ${token}` } });
      if (!latest.ok) throw new Error("Transaksi tersimpan, tetapi data terbaru gagal dimuat. Muat ulang halaman.");
      const current = await latest.json();
      serverVersion.current = Number(current.version || serverVersion.current);
      dataRef.current = normalizeData(current.data);
      setDataState(dataRef.current);
      return current.data;
    } finally {
      hasPendingLocalChanges.current = false;
    }
  };

  // Gunakan can() ketika izin dibaca saat render. checkAuth() hanya untuk
  // interaksi pengguna karena ia menampilkan toast saat akses ditolak.
  const can = (action: ActionType, locationId?: string) =>
    authorizeAction(user, action, locationId).allowed;
  const checkAuth = (action: ActionType, locationId?: string) => {
    const auth = authorizeAction(user, action, locationId);
    if (!auth.allowed) notify(auth.reason || "Akses ditolak");
    return auth.allowed;
  };
  const authenticate = async (endpoint: string, payload: object, remember = false) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Autentikasi gagal");
    setHydrated(false);
    setAuthUser(result.user);
    setToken(result.token);
    const session = JSON.stringify({ user: result.user, token: result.token });
    sessionStorage.setItem(savedSessionKey, session);
    sessionStorage.removeItem("veinstock_user");
    sessionStorage.removeItem("veinstock_token");
    if (remember) localStorage.setItem(savedSessionKey, session);
    else localStorage.removeItem(savedSessionKey);
    notify(
      endpoint === "/api/login"
        ? "Berhasil masuk ke Dashboard"
        : "Pendaftaran berhasil, selamat datang di Menengs!"
    );
  };
  const login = (email: string, password: string, remember: boolean) =>
    authenticate("/api/login", { email, password }, remember);
  const addUser = async (payload: any) => {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(result.message || "Gagal menambah pengguna");
    applyLocalData((current) => ({
      ...current,
      users: [...current.users, { ...result.user, avatarUrl: payload.avatarUrl }],
    }));
    setModal(null);
    notify("Pengguna berhasil ditambahkan dan sudah dapat masuk");
  };
  const createEmployeeAccount = async (payload: any) => {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Akses karyawan tidak dapat dibuat");
    return result.user;
  };
  const updateUser = async (id: string, payload: any) => {
    const response = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(result.message || "Gagal memperbarui pengguna");
    const linkedEmployee = (dataRef.current.employees || []).find((employee:any) => employee.userId === id);
    if (linkedEmployee && payload.role) {
      await runCommand(`/api/commands/employees/${linkedEmployee.id}`, { employee: { ...linkedEmployee, position: accessRoleLabel(payload.role) } }, "PATCH");
    }
    applyLocalData((current) => ({
      ...current,
      users: current.users.map((item) =>
        item.id === id ? { ...item, ...result.user, avatarUrl: payload.avatarUrl ?? item.avatarUrl } : item,
      ),
    }));
    if (user?.id === id) {
      const updated = {
        ...user,
        ...result.user,
        avatarUrl: payload.avatarUrl ?? user.avatarUrl,
        organizationName: user.organizationName,
      };
      setAuthUser(updated);
      const currentSession = readSession();
      if (currentSession) {
        const session = JSON.stringify({ ...currentSession, user: updated });
        sessionStorage.setItem(savedSessionKey, session);
        if (localStorage.getItem(savedSessionKey)) localStorage.setItem(savedSessionKey, session);
      }
    }
    setModal(null);
    notify("Profil pengguna berhasil diperbarui");
  };
  const uploadImage = async (file: File) => {
    const body = new FormData();
    body.append("image", file);
    const response = await fetch("/api/uploads/image", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Gagal mengunggah gambar");
    notify(
      `Gambar dioptimalkan dari ${Math.round(result.originalBytes / 1024)} KB menjadi ${Math.round(result.bytes / 1024)} KB`,
    );
    return result.url as string;
  };
  const logout = async () => {
    setAuthUser(null);
    setToken(null);
    setHydrated(false);
    setPage("dashboard");
    sessionStorage.removeItem(savedSessionKey);
    localStorage.removeItem(savedSessionKey);
    sessionStorage.removeItem("veinstock_user");
    sessionStorage.removeItem("veinstock_token");
  };
  const cancelTransaction = async (kind: string, id: string, reason: string) => {
    try {
      await runCommand("/api/commands/cancel", { kind, id, reason });
      setModal(null);
      notify("Transaksi dibatalkan. Histori dan alasan koreksi tetap tersimpan.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Transaksi tidak dapat dibatalkan");
    }
  };

  const scope = useMemo(() => resolveUserScope(user), [user]);
  const operationalNotifications = useMemo(
    () => getOperationalNotifications(data, variantMap, locationMap, scope),
    [data, variantMap, locationMap, scope],
  );
  const pendingTransferNotifications = operationalNotifications.filter((item) => item.tone === "info").length;
  if (!user || !token) return <Login onLogin={login} />;
  if (!hydrated)
    return (
      <div className="loading-page">
        <div className="brand-mark"><img src="/menengs-icon-192.png" alt="Logo Menengs" /></div>
        <b>Memuat ruang usaha {user.organizationName}…</b>
      </div>
    );

  const navGroups = [
    {
      group: "Utama",
      items: [
        ["dashboard", "Dashboard", LayoutDashboard],
        ["analytics", "Analitik Bisnis", TrendingUp]
      ]
    },
    {
      group: "Master Data",
      items: [
        ["products", "Produk & Varian", Archive],
        ["locations", "Lokasi Usaha", Store],
        ["pricing", "HPP & Marketplace", Calculator],
        ["suppliers", "Supplier", Users]
      ]
    },
    {
      group: "Inventaris",
      items: [
        ["receipts", "Stok Masuk", ArrowDownToLine],
        ["stock", "Stok per Lokasi", Boxes],
        ["transfers", "Transfer Stok", ArrowRightLeft],
        ["opname", "Stok Opname", ClipboardCheck],
        ["history", "Riwayat Stok", History]
      ]
    },
    {
      group: "Transaksi",
      items: [
        ["sales", "Penjualan", ShoppingCart],
        ["shipping", "Pengiriman Pesanan", Truck],
        ["returns", "Retur", RotateCcw]
      ]
    },
    {
      group: "Karyawan",
      items: [
        ["employees", "Tim & Akses", Users],
        ["attendance", "Kehadiran", Clock3],
        ["loans", "Kasbon & Penggajian", WalletCards]
      ]
    },
    {
      group: "Laporan",
      items: [
        ["reports", "Laporan", BarChart3]
      ]
    },
    {
      group: "Pengaturan",
      items: [
        ["business", "Profil Usaha", Settings],
        ["help", "Pusat Bantuan", LifeBuoy]
      ]
    }
  ] as const;
  const titles: Record<Page, string> = {
    dashboard: "Dashboard Operasional",
    products: "Produk & Varian",
    locations: "Lokasi Usaha",
    receipts: "Stok Masuk",
    stock: "Stok per Lokasi",
    transfers: "Transfer Stok",
    sales: "Penjualan Multi-Kanal",
    shipping: "Pengiriman Pesanan",
    returns: "Retur Barang",
    opname: "Stock Opname & Penyesuaian",
    history: "Histori Pergerakan Stok",
    reports: "Laporan Usaha",
    business: "Profil Bisnis & Organisasi",
    users: "Tim & Akses",
    analytics: "Analisis Kinerja Bisnis",
    employees: "Tim & Akses",
    attendance: "Kehadiran Karyawan",
    loans: "Kasbon & Penggajian",
    pricing: "Kalkulator HPP & Marketplace",
    suppliers: "Master Supplier",
    help: "Pusat Bantuan Menengs",
  };
  const allowed = (p: Page) => {
    if (scope.role === "employee") return p === "attendance" || p === "help";
    if (p === "dashboard" || p === "help") return true;
    if (p === "business") return scope.role === "owner";
    if (p === "users") return scope.permissions.has("user.view");
    if (p === "locations" || p === "products" || p === "suppliers") return scope.permissions.has("location.view") || scope.permissions.has("product.view");
    if (p === "receipts" || p === "returns") return scope.permissions.has("stock.in") || scope.permissions.has("stock.out");
    if (p === "sales") return scope.permissions.has("sale.view");
    if (p === "shipping") return scope.permissions.has("shipping.view");
    if (p === "stock" || p === "history") return scope.permissions.has("stock.view");
    if (p === "transfers") return scope.permissions.has("transfer.create") || scope.permissions.has("transfer.send") || scope.permissions.has("transfer.receive");
    if (p === "opname") return scope.permissions.has("stock.opname");
    if (p === "reports" || p === "analytics" || p === "pricing") return scope.permissions.has("report.view");
    if (p === "attendance") return true;
    if (p === "employees" || p === "loans") return scope.role === "owner";
    return false;
  };
  const visibleNavItems = navGroups.reduce<Array<[Page, string]>>((items, group) => {
    group.items.forEach(([id, label]) => {
      if (allowed(id as Page)) items.push([id as Page, label]);
    });
    return items;
  }, []);
  const layoutSidebarVariant = isMobileViewport ? "drawer" : desktopSidebar ? "expanded" : "collapsed";
  const sidebarVariant = isMobileViewport
    ? "drawer"
    : desktopSidebar || sidebarHoverPreview
      ? "expanded"
      : "collapsed";

  return (
    <div className={`app-shell sidebar-is-${layoutSidebarVariant}`}>
      {isMobileViewport && sidebar && (
        <div className="sidebar-overlay" onClick={() => setSidebar(false)}></div>
      )}
      <aside
        className={`sidebar sidebar-${sidebarVariant}${sidebarHoverPreview && !desktopSidebar ? " sidebar-preview" : ""}${sidebar ? " open" : ""}`}
        onMouseEnter={() => {
          if (!isMobileViewport && !desktopSidebar) setSidebarHoverPreview(true);
        }}
        onMouseLeave={() => {
          if (!isMobileViewport && !desktopSidebar) setSidebarHoverPreview(false);
        }}
      >
        {sidebarVariant === "collapsed" ? (
          <div className="sidebar-rail" aria-label="Navigasi cepat">
            <button className="rail-logo" title="Beranda Menengs" onClick={() => setPage("dashboard")}>
              <img src="/menengs-icon-192.png" alt="Menengs" />
            </button>
            <span className="rail-divider" />
            <div className="rail-nav">
              {visibleNavItems.map(([id, label]) => (
                <button key={`rail-${id}`} className={page === id ? "active" : ""} title={label} aria-label={label} onClick={() => setPage(id)}>
                  <SidebarGlyph name={id} active={page === id} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="sidebar-panel">
          <div className="brand">
            <div className="brand-mark"><img src="/menengs-icon-192.png" alt="Logo Menengs" /></div>
            <div>
              <strong>MENENGS</strong>
              <small>Snack selalu ngangenin.</small>
            </div>
            <button className="icon-btn close-mobile" aria-label="Tutup menu" onClick={() => setSidebar(false)}><X size={20} /></button>
          </div>
          <div className="workspace">
            <span>RUANG KERJA</span>
            <b>{user.organizationName}</b>
            <small><SidebarGlyph name="locations" /> {data.locations.filter((l) => l.active).length} lokasi aktif</small>
          </div>
          <nav>
            {navGroups.map((group, idx) => {
              const allowedItems = group.items.filter(([id]) => allowed(id as Page));
              if (allowedItems.length === 0) return null;
              return (
                <div key={idx} className="nav-group-wrapper">
                  <div className="nav-group-title">{group.group}</div>
                  {allowedItems.map(([id, label]) => (
                    <button key={id as string} className={page === id ? "active" : ""} onClick={() => { setPage(id as Page); setSidebar(false); }}>
                      <SidebarGlyph name={id as string} active={page === id} />
                      <span>{label as string}</span>
                      {id === "transfers" && pendingTransferNotifications > 0 && <em>{pendingTransferNotifications}</em>}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
        </div>
        )}
      </aside>
      <main>
        <header>
          {isMobileViewport && (
            <button
              className="icon-btn menu-btn"
              aria-label="Buka menu navigasi"
              onClick={() => setSidebar(true)}
            >
              <Menu />
            </button>
          )}
          <div>
            <small>{user.organizationName.toUpperCase()} / OPERASIONAL</small>
            <h1>{titles[page]}</h1>
          </div>
          <div className="header-actions">
            <button
              className="icon-btn notification"
              aria-label="Notifikasi operasional"
              onClick={() => setModal("notifications")}
            >
              <Bell />
              {operationalNotifications.length > 0 && <i />}
            </button>
            <div className="date-chip">
              Hari ini
              <br />
              <b>
                {new Date().toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </b>
            </div>
            <div 
              className="header-user" 
              tabIndex={0} 
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setUserMenuOpen(false);
              }}
              style={{ position: 'relative', cursor: 'pointer', outline: 'none' }}
            >
              <div className="avatar">{user.avatarUrl||(user.role==='owner'&&data.business?.logoUrl)?<img src={user.avatarUrl||data.business?.logoUrl} alt={user.name}/>:user.name.slice(0, 2).toUpperCase()}</div>
              <div onClick={() => setUserMenuOpen(!userMenuOpen)}>
                <b style={{fontWeight: 700}}>Hai, {user.name}</b>
              </div>
              <button className="icon-btn" aria-label="Menu Pengguna" onClick={() => setUserMenuOpen(!userMenuOpen)}>
                <Menu size={18} />
              </button>
              
              {userMenuOpen && (
                <div className="user-dropdown">
                  {user.role === 'owner' && (
                    <button onClick={() => { setModal('business'); setUserMenuOpen(false); }}>Edit Profile Usaha</button>
                  )}
                  <button onClick={() => { setModal('change-password'); setUserMenuOpen(false); }}>Ganti Password</button>
                  <button onClick={() => { logout(); setUserMenuOpen(false); }} style={{color: 'var(--red)'}}>Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="content">
          {page === "dashboard" && (
            <Dashboard
              data={data}
              variants={variantMap}
              locations={locationMap}
              setPage={setPage}
              organizationName={data.business?.name || "Usaha Anda"}
              canEdit={can('sale.create')}
              canSetup={can('product.create')}
              role={user.role}
              outletId={user.outletId}
            />
          )}
          {page === "products" && (
            <Products
              data={data}
              locationId={scope.scopeType === "specific" ? user.outletId : undefined}
              canCreate={can('product.create')}
              canEdit={can('product.update')}
              open={() => checkAuth('product.create') && setModal("product")}
              edit={(productId: string) => checkAuth('product.update') && setModal(`product:${productId}`)}
              exportProducts={() => setModal("product-export")}
            />
          )}
          {page === "locations" && (
            <LocationsPage
              data={data}
              open={() => checkAuth('location.create') && setModal("location")}
              edit={(id: string) => checkAuth('location.update') && setModal(`location:${id}`)}
            />
          )}
          {page === "receipts" && can('stock.in') && (
            <ReceiptsPage
              data={data}
              variants={variantMap}
              locations={locationMap}
              open={() => {
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false)))
                  return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('stock.in')) setModal("receipt");
              }}
              edit={(id: string) => checkAuth('stock.in') && setModal(`receipt:${id}`)}
              cancel={(id: string) => checkAuth('stock.in') && setModal(`cancel:receipt:${id}`)}
              detail={(id: string) => setModal(`receipt-detail:${id}`)}
            />
          )}
          {page === "stock" && (
            <Stock 
              data={data} 
              updateMinimum={(variantId: string, locationId: string, minimum: number) => runCommand(`/api/commands/variants/${variantId}/minimums/${locationId}`, { minimum }, "PATCH")}
              variants={variantMap}
              role={user.role}
              outletId={user.outletId} 
            />
          )}
          {page === "transfers" && (
            <Transfers
              data={data}
              runCommand={runCommand}
              uploadImage={uploadImage}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
              open={() => {
                if (data.locations.filter((l) => l.active).length < 2)
                  return notify("Tambahkan minimal dua lokasi aktif terlebih dahulu");
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false)))
                  return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('transfer.create')) setModal("transfer");
              }}
              notify={notify}
              user={user.name}
              cancel={(id: string) => checkAuth('transfer.cancel') && setModal(`cancel:transfer:${id}`)}
              detail={(id: string) => setModal(`transfer-detail:${id}`)}
              helpAction={() => { setHelpSection("transfer"); setPage("help"); }}
            />
          )}
          {page === "sales" && (
            <Sales
              data={data}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
              open={() => {
                if (!data.locations.some((l) => l.active)) return notify("Tambahkan lokasi aktif terlebih dahulu");
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false))) return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('sale.create')) setModal("sale");
              }}
              cancel={(id: string) => checkAuth('sale.void') && setModal(`cancel:sale:${id}`)}
              detail={(id: string) => setModal(`sale-detail:${id}`)}
              canCancel={true}
            />
          )}
          {page === "shipping" && (
            <ShippingPage
              data={data}
              user={user}
              runCommand={runCommand}
              uploadImage={uploadImage}
              notify={notify}
            />
          )}
          {page === "returns" && (
            <ReturnsPage
              data={data}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
              open={() => {
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false)))
                  return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('stock.in')) setModal("return");
              }}
              cancel={(id: string) => checkAuth('stock.in') && setModal(`cancel:return:${id}`)}
              detail={(id: string) => setModal(`return-detail:${id}`)}
            />
          )}
          {page === "opname" && (
            <Opname
              data={data}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
              open={() => {
                if (!data.locations.some((l) => l.active)) return notify("Tambahkan lokasi aktif terlebih dahulu");
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false))) return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('stock.opname')) setModal("opname");
              }}
              notify={notify}
              user={user.name}
              edit={(id: string) => checkAuth('stock.opname') && setModal(`opname:${id}`)}
              cancel={(id: string) => checkAuth('stock.opname') && setModal(`cancel:opname:${id}`)}
              detail={(id: string) => setModal(`opname-detail:${id}`)}
              canCorrect={can('stock.adjust')}
            />
          )}
          {page === "history" && (
            <HistoryPage
              data={data}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
            />
          )}
          {page === "reports" && (
            <Reports
              data={data}
              variants={variantMap}
              locations={locationMap}
              notify={notify}
              role={user.role}
              outletId={user.outletId}
            />
          )}
          {page === "pricing" && <HppMarketplaceCalculator data={data} runCommand={runCommand} notify={notify} />}
          {page === "suppliers" && <SuppliersPage data={data} open={() => setModal("supplier")} edit={(id:string) => setModal(`supplier:${id}`)} />}
          {page === "business" && (
            <BusinessPage data={data} open={() => setModal("business")} />
          )}
          {(page === "employees" || page === "users") && <EmployeesPage data={data} locations={locationMap} open={() => setModal("user")} editAccess={(id:string) => setModal(`user:${id}`)} editEmployee={(id:string) => setModal(`employee:${id}`)} completeEmployee={(userId:string) => setModal(`employee-link:${userId}`)} />}
          {page === "attendance" && <AttendancePage data={data} user={user} runCommand={runCommand} notify={notify} />}
          {page === "loans" && <LoansPage data={data} locations={locationMap} open={() => setModal("loan")} openPayrollPayment={(employeeId:string) => setModal(`payroll:${employeeId}`)} confirmInstallment={(loan:any, employeeName:string) => setConfirm({ message: `Tandai 1 cicilan kasbon ${employeeName} sebesar ${money(loan.installmentAmount)} sebagai sudah dibayar? Tindakan ini akan memperbarui sisa cicilan.`, onConfirm: async () => { try { await runCommand(`/api/commands/loans/${loan.id}/installments`, {}); setConfirm(null); notify("Satu cicilan kasbon berhasil ditandai dibayar."); } catch (error:any) { notify(error.message || "Cicilan kasbon gagal diperbarui."); } } })} />}
          {page === "help" && <HelpPage initialSection={helpSection} clearInitialSection={() => setHelpSection(null)} />}
          {page === "analytics" && <AnalyticsPage data={data} />}
        </div>
      </main>
      {modal === "employee" && <EmployeeModal data={data} close={() => setModal(null)} createAccount={createEmployeeAccount} save={async (employee: any) => { await runCommand("/api/commands/employees", { employee }); setModal(null); notify(employee.locationId ? "Akun dan penugasan karyawan berhasil disimpan." : "Akun karyawan berhasil dibuat. Tetapkan lokasi kerja sebelum absensi dapat dilakukan."); }} />}
      {modal?.startsWith("employee-link:") && (() => { const initialUserId = modal.slice("employee-link:".length); return data.users.some((item:any) => item.id === initialUserId) ? <EmployeeModal data={data} initialUserId={initialUserId} close={() => setModal(null)} save={async (employee:any) => { await runCommand("/api/commands/employees", { employee }); setModal(null); notify("Data kerja staf berhasil dilengkapi dan sudah masuk penggajian."); }} /> : null; })()}
      {modal?.startsWith("employee:") && (() => { const employee = (data.employees || []).find((item:any) => item.id === modal.slice("employee:".length)); return employee ? <EmployeeModal data={data} employee={employee} close={() => setModal(null)} save={async (next:any) => { await runCommand(`/api/commands/employees/${next.id}`, { employee: next }, "PATCH"); setModal(null); notify(next.locationId ? "Penugasan karyawan berhasil diperbarui." : "Karyawan belum ditugaskan ke lokasi kerja."); }} /> : null; })()}
      {modal === "loan" && <LoanModal data={data} close={() => setModal(null)} save={async (loan: any) => { await runCommand("/api/commands/loans", { loan }); setModal(null); notify("Kasbon berhasil dicatat sebagai pengingat owner."); }} />}
      {modal === "supplier" && <SupplierModal close={() => setModal(null)} save={async (supplier:any) => { await runCommand("/api/commands/suppliers", { supplier }); setModal(null); notify("Supplier berhasil disimpan."); }} />}
      {modal?.startsWith("supplier:") && (() => { const supplier = (data.suppliers || []).find((item:any) => item.id === modal.slice("supplier:".length)); return supplier ? <SupplierModal supplier={supplier} close={() => setModal(null)} save={async (next:any) => { await runCommand(`/api/commands/suppliers/${next.id}`, { supplier: next }, "PATCH"); setModal(null); notify("Supplier berhasil diperbarui."); }} /> : null; })()}
      {modal?.startsWith("payroll:") && (() => {
        const employee = (data.employees || []).find((item:any) => item.id === modal.slice("payroll:".length));
        const account = employee && data.users.find((item:any) => item.id === employee.userId);
        return employee ? <PayrollPaymentModal employee={employee} employeeName={account?.name || "Karyawan"} close={() => setModal(null)} uploadImage={uploadImage} save={async (proofUrl?:string, note?:string) => {
          await runCommand("/api/commands/payrolls", { payroll: { id: newId("payroll"), employeeId: employee.id, period: jakartaDateKey().slice(0, 7), grossAmount: employee.monthlySalary, status: "paid", paidAt: new Date().toISOString(), proofUrl, note } });
          setModal(null); notify("Pembayaran gaji berhasil dicatat.");
        }} /> : null;
      })()}
      {modal === "product" && (
        <ProductModal
          user={user}
              locations={data.locations.filter((loc: any) => user?.role === "owner" || user?.role === "admin" || loc.id === ((user as any)?.outlet_id || user?.outletId))}
          close={() => setModal(null)}
          uploadImage={uploadImage}
          save={async (p: Product, initialStocks?: any[]) => {
            try {
              await runCommand("/api/commands/products", { product: p, initialStocks });
              setModal(null);
              notify("Produk dan varian berhasil ditambahkan");
            } catch (error) { notify(error instanceof Error ? error.message : "Produk tidak dapat disimpan"); }
          }}
        />
      )}
      {modal === "product-export" && (
        <ProductExportModal data={data} close={() => setModal(null)} notify={notify} />
      )}
      {modal?.startsWith("product:") &&
        (() => {
          const [, productId] = modal.split(":"),
            product = data.products.find((item) => item.id === productId);
          return product ? (
            <ProductModal
              user={user}
                  locations={data.locations.filter((loc: any) => user?.role === "owner" || user?.role === "admin" || loc.id === ((user as any)?.outlet_id || user?.outletId))}
              product={product}
              close={() => setModal(null)}
              uploadImage={uploadImage}
              onDelete={() => {
                setConfirm({
                  message: "Arsipkan produk ini? Produk tidak lagi bisa dipilih untuk transaksi baru, tetapi histori penjualan dan stok tetap aman.",
                  onConfirm: async () => {
                    try {
                      await runCommand(`/api/commands/products/${product.id}`, { product: { ...product, active: false, variants: product.variants.map((v: any) => ({ ...v, active: false })) } }, "PATCH");
                      setModal(null); notify("Produk diarsipkan. Histori transaksi tetap tersimpan.");
                    } catch (error) { notify(error instanceof Error ? error.message : "Produk tidak dapat diarsipkan"); }
                    setConfirm(null);
                  }
                });
              }}
              save={async (updated: Product) => {
                try { await runCommand(`/api/commands/products/${updated.id}`, { product: updated }, "PATCH"); setModal(null); notify("Produk dan varian berhasil diperbarui"); }
                catch (error) { notify(error instanceof Error ? error.message : "Produk tidak dapat diperbarui"); }
              }}
            />
          ) : null;
        })()}
      {modal === "location" && (
        <LocationModal
          close={() => setModal(null)}
          save={async (name: string, type: "warehouse" | "outlet", address: string, active: boolean, isCentralWarehouse: boolean) => {
            const key = name.toLowerCase().trim() + '|' + type;
            if (data.locations.some(l => (l.name.toLowerCase().trim() + '|' + l.type) === key)) {
              notify("Terdapat lokasi dengan nama dan jenis yang sama (duplikat)");
              throw new Error("Duplicate");
            }
            const newLocation = { id: newId("loc"), name, type, address, active, isCentralWarehouse };
            try {
              await runCommand("/api/commands/locations", { location: newLocation });
              setModal(null);
              notify("Lokasi usaha berhasil ditambahkan");
            } catch (err: any) {
              notify(err.message || "Gagal menyimpan lokasi");
              throw err;
            }
          }}
        />
      )}
      {modal?.startsWith("location:") &&
        (() => {
          const selected = data.locations.find(
            (x) => x.id === modal.split(":")[1],
          );
          return selected ? (
            <LocationModal
              location={selected}
              close={() => setModal(null)}
              onDelete={() => {
                setConfirm({
                  message: "Nonaktifkan lokasi ini? Histori dan saldo lama tetap tersimpan untuk audit, tetapi lokasi tidak dapat dipakai transaksi baru.",
                  onConfirm: async () => {
                    try { await runCommand(`/api/commands/locations/${selected.id}`, { location: { ...selected, active: false } }, "PATCH"); setModal(null); notify("Lokasi dinonaktifkan. Histori transaksi tetap tersimpan."); }
                    catch (error) { notify(error instanceof Error ? error.message : "Lokasi tidak dapat dinonaktifkan"); }
                    setConfirm(null);
                  }
                });
              }}
              save={async (
                name: string,
                type: "warehouse" | "outlet",
                address: string,
                active: boolean,
                isCentralWarehouse: boolean,
              ) => {
                try { await runCommand(`/api/commands/locations/${selected.id}`, { location: { ...selected, name, type, address, active, isCentralWarehouse } }, "PATCH"); setModal(null); notify("Lokasi usaha berhasil diperbarui"); }
                catch (error) { notify(error instanceof Error ? error.message : "Lokasi tidak dapat diperbarui"); throw error; }
              }}
            />
          ) : null;
        })()}
      {(modal === "receipt" || (modal?.startsWith("receipt:") && !modal.startsWith("cancel:"))) && (
        (() => {
          const receipt = modal !== "receipt" ? data.receipts?.find((r: any) => r.id === modal.split(":")[1]) : undefined;
          return (
            <ReceiptModal
              data={data}
              receipt={receipt}
              uploadImage={uploadImage}
              prefillLocationId={notificationIntent?.modal === "receipt" ? notificationIntent.locationId : undefined}
              prefillVariantId={notificationIntent?.modal === "receipt" ? notificationIntent.variantId : undefined}
              close={() => setModal(null)}
              save={async (form: any) => {
                if (!form.items || form.items.length === 0) return notify("Pilih minimal satu varian");
                for (const item of form.items) {
                   if (!isPositiveNumber(item.quantity) || !Number.isFinite(item.unitCost) || item.unitCost < 0)
                     return notify("Jumlah dan harga modal stok masuk harus valid");
                }

                // Edit historis masih memakai jalur kompatibilitas sampai API
                // revisi dokumen tersedia; pencatatan baru selalu command DB.
                if (!receipt) {
                  try {
                    await runCommand("/api/commands/receipts", form);
                    setModal(null);
                    notify("Stok masuk berhasil dicatat");
                  } catch (error) {
                    notify(error instanceof Error ? error.message : "Stok masuk tidak dapat disimpan");
                  }
                  return;
                }
                try {
                  await runCommand(`/api/commands/receipts/${receipt.id}`, form, "PATCH");
                  setModal(null);
                  notify("Stok masuk berhasil diperbarui");
                } catch (error) {
                  notify(error instanceof Error ? error.message : "Stok masuk tidak dapat diperbarui");
                }
                return;
              }}
            />
          );
        })()
      )}
      {modal === "return" && (
        <ReturnModal
          data={data}
          uploadImage={uploadImage}
          close={() => setModal(null)}
          save={async (form: any) => {
            if (!form.reason?.trim() || form.items.length === 0)
              return notify("Pilih produk dan isi alasan retur dengan benar");
            
            try {
              await runCommand("/api/commands/returns", form);
              setModal(null);
              notify("Retur berhasil dicatat dan saldo stok telah diperbarui");
            } catch (error) {
              notify(error instanceof Error ? error.message : "Retur tidak dapat disimpan");
            }
          }}
        />
      )}
      {modal === "business" && (
        <BusinessModal
          data={data}
          close={() => setModal(null)}
          uploadImage={uploadImage}
          save={async (profile: any) => {
            const res = await fetch('/api/organization', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(profile)
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.message || 'Gagal menyimpan profil usaha');
            }
            // Update user organizationName if ownerName changed
            setAuthUser((u: any) => ({ ...u, organizationName: profile.name }));
            applyLocalData((d) => ({ ...d, business: profile }));
            setModal(null);
            notify("Profil usaha berhasil diperbarui");
          }}
        />
      )}
      {modal === "user" && (
        <UserModal data={data} close={() => setModal(null)} save={addUser} uploadImage={uploadImage}/>
      )}
      {modal?.startsWith("user:") &&
        (() => {
          const stored = data.users.find(
              (item) => item.id === modal.split(":")[1],
            ),
            selected = stored?.id === user.id ? { ...stored, ...user } : stored;
          return selected ? (
            <UserModal
              data={data}
              user={selected}
              uploadImage={uploadImage}
              close={() => setModal(null)}
              onDelete={selected.id !== user.id ? () => {
                setConfirm({
                  message: "Nonaktifkan akun ini? Akun tidak dapat masuk lagi, tetapi histori aktivitasnya tetap dapat diaudit.",
                  onConfirm: async () => {
                    await updateUser(selected.id, {
                      name: selected.name,
                      email: selected.email,
                      role: selected.role,
                      outletId: selected.outletId,
                      active: false,
                    });
                    setConfirm(null);
                    notify("Akun dinonaktifkan. Histori aktivitas tetap tersimpan.");
                  }
                });
              } : undefined}
              save={(payload: object) => updateUser(selected.id, payload)}
            />
          ) : null;
        })()}
      {modal === "transfer" && (
        <TransferModal
          data={data}
          uploadImage={uploadImage}
          close={() => setModal(null)}
          fixedFrom={user.role === "pic" ? user.outletId : undefined}
          initialFrom={notificationIntent?.modal === "transfer" ? notificationIntent.sourceLocationId : undefined}
          initialTo={notificationIntent?.modal === "transfer" ? notificationIntent.locationId : undefined}
          initialVariantId={notificationIntent?.modal === "transfer" ? notificationIntent.variantId : undefined}
          save={async (f: string, t: string, items: { variantId: string, quantity: number }[], sendProofUrl?: string) => {
            if (f === t || items.length === 0)
              return notify("Pilih lokasi berbeda dan minimal satu produk");
            try {
              await runCommand("/api/commands/transfers", { fromId: f, toId: t, items, sendProofUrl });
              setModal(null);
              notify("Transfer dibuat dan menunggu konfirmasi outlet");
            } catch (error) {
              notify(error instanceof Error ? error.message : "Transfer tidak dapat disimpan");
            }
          }}
        />
      )}
      {modal === "sale" && (
        <SaleModal
          data={data}
          fixedLocation={['pic', 'cashier'].includes(user.role) ? user.outletId : undefined}
          close={() => setModal(null)}
          save={async (
            loc: string,
            channel: Channel,
            cart: Array<{variantId: string, quantity: number}>,
            payment: string
          ) => {
            if (!cart.some(item => isPositiveNumber(item.quantity))) return notify("Tidak ada produk valid di keranjang");
            try {
              await runCommand("/api/commands/sales", { locationId: loc, channel, items: cart, payment });
              setModal(null);
              notify("Penjualan tersimpan dan stok otomatis berkurang");
            } catch (error) {
              notify(error instanceof Error ? error.message : "Penjualan tidak dapat disimpan");
            }
          }}
        />
      )}
      {modal?.startsWith("opname") && (
        <OpnameModal
          data={data}
          item={
            modal.split(":")[1]
              ? data.stockCounts.find((x: any) => x.id === modal.split(":")[1])
              : null
          }
          fixedLocation={user.role === "pic" ? user.outletId : undefined}
          close={() => setModal(null)}
          save={async (loc: string, items: { variantId: string, actualQty: number, reason: string }[]) => {
            if (items.length === 0)
              return notify("Isi stok fisik dan alasan opname dengan benar");
            
            const isEdit = modal.includes(":");
            if (isEdit) {
              const id = modal.split(":")[1];
              const oldItem = data.stockCounts.find((x: any) => x.id === id);
              if (!oldItem) return;
              const item = items[0]; // when editing, we only edit one item
              try {
                await runCommand(`/api/commands/opnames/${id}`, { locationId: loc, items: [item] }, "PATCH");
                setModal(null);
                notify("Stock opname berhasil diperbarui");
              } catch (error) {
                notify(error instanceof Error ? error.message : "Stock opname tidak dapat diperbarui");
              }
            } else {
              try {
                await runCommand("/api/commands/opnames", { locationId: loc, items });
                setModal(null);
                notify("Stock opname berhasil dicatat");
              } catch (error) {
                notify(error instanceof Error ? error.message : "Stock opname tidak dapat disimpan");
              }
            }
          }}
        />
      )}
      {modal?.startsWith("cancel:") && (
        <CancelModal
          close={() => setModal(null)}
          save={(reason: string) => {
            const [, kind, ...idParts] = modal.split(":");
            const id = idParts.join(":");
            cancelTransaction(kind, id, reason);
          }}
        />
      )}
      {modal?.startsWith("transfer-detail:") && (
        <TransferDetail
          items={data.transfers.filter((x) => transferGroupKey(x) === modal.slice("transfer-detail:".length))}
          business={data.business}
          variants={variantMap}
          locations={locationMap}
          close={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal?.startsWith("receipt-detail:") && (
        <ReceiptDetail
          items={(data.receipts || []).filter((x: any) => receiptGroupKey(x) === modal.slice("receipt-detail:".length))}
          variants={variantMap}
          locations={locationMap}
          close={() => setModal(null)}
        />
      )}
      {modal?.startsWith("sale-detail:") && (
        <SaleDetail
          item={data.sales.find((x) => x.id === modal.split(":")[1])}
          variants={variantMap}
          locations={locationMap}
          close={() => setModal(null)}
        />
      )}
      {modal?.startsWith("opname-detail:") && (
        <OpnameDetail item={data.stockCounts.find((x: any) => x.id === modal.slice("opname-detail:".length))} variants={variantMap} locations={locationMap} close={() => setModal(null)} />
      )}
      {modal?.startsWith("return-detail:") && (
        <ReturnDetail item={(data.returns || []).find((x: any) => x.id === modal.slice("return-detail:".length))} variants={variantMap} locations={locationMap} close={() => setModal(null)} />
      )}
      {modal === "notifications" && (
        <Notifications
          items={operationalNotifications}
          close={() => setModal(null)}
          act={(item) => {
            if (item.action === "open-transfer-inbox") {
              setModalState(null);
              setPageState("transfers");
              window.history.replaceState({ menengs: true, page: "transfers", modal: false }, "", historyUrlForPage("transfers"));
              return;
            }
            if (item.action === "create-restock-transfer" && item.locationId && item.variantId) {
              setNotificationIntent({ modal: "transfer", locationId: item.locationId, variantId: item.variantId, sourceLocationId: item.sourceLocationId });
              setModalState("transfer");
              return;
            }
            if (item.action === "create-stock-receipt" && item.locationId && item.variantId) {
              setNotificationIntent({ modal: "receipt", locationId: item.locationId, variantId: item.variantId });
              setModalState("receipt");
              return;
            }
            setModalState(null);
            setPageState("stock");
            window.history.replaceState({ menengs: true, page: "stock", modal: false }, "", historyUrlForPage("stock"));
          }}
        />
      )}
      {modal === "change-password" && (
        <ChangePasswordModal
          token={token}
          close={() => setModal(null)}
          notify={notify}
        />
      )}
      {confirm && (
        <div className="modal-backdrop" style={{ zIndex: 100 }}>
          <div className="modal" style={{ width: '400px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Konfirmasi</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>{confirm.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" className="secondary" disabled={confirming} onClick={() => setConfirm(null)}>Batal</button>
              <button type="button" className="danger-button" disabled={confirming} onClick={async () => { setConfirming(true); try { await confirm.onConfirm(); } finally { setConfirming(false); } }}>{confirming ? "Menyimpan..." : "Ya, Lanjutkan"}</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
          {toast.tone === "success" ? <Check /> : toast.tone === "error" ? <AlertTriangle /> : <Info />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Login({
  onLogin,
}: {
  onLogin: (email: string, password: string, remember: boolean) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "forgot">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const slides = [
    { src: "/menengs-landing-1.png", alt: "Panduan stok rapi Menengs" },
    { src: "/menengs-landing-2.png", alt: "SOP operasional harian Menengs" },
    { src: "/menengs-landing-3.png", alt: "Sinkronisasi stok semua outlet Menengs" },
  ];
  const [activeSlide, setActiveSlide] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setActiveSlide(current => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(interval);
  }, [slides.length]);
  const changeMode = (next: "login" | "forgot") => {
    setMode(next);
    setError("");
  };
  return (
    <div className="login-page">
      <aside className="login-art" aria-label="Informasi operasional Menengs">
        <div className="login-carousel-stage">
          {slides.map((slide, index) => <img key={slide.src} className={`login-slide ${index === activeSlide ? "active" : ""}`} src={slide.src} alt={slide.alt} />)}
          <div className="login-carousel-controls" role="tablist" aria-label="Pilih informasi Menengs">
            {slides.map((slide, index) => <button key={slide.src} type="button" className={index === activeSlide ? "active" : ""} onClick={() => setActiveSlide(index)} role="tab" aria-selected={index === activeSlide} aria-label={`Tampilan ${index + 1}: ${slide.alt}`} />)}
          </div>
        </div>
      </aside>
      <div className="login-panel">
        {mode === "forgot" ? (
          <ForgotPasswordFlow onBack={() => changeMode("login")} />
        ) : (
        <form
          className="login-box"
          onSubmit={async (e) => {
            e.preventDefault();
            if (loading) return;
            setError("");
            setLoading(true);
            try {
              await onLogin(email, password, remember);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Gagal memproses permintaan",
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          <small>SELAMAT DATANG, TIM MENENGS</small>
          <h2>Masuk ke Menengs</h2>
          <p>Gunakan akun operasional yang diberikan oleh Owner Menengs.</p>
          <Field label="Alamat email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Format email belum valid')}
              onInput={(e) => (e.target as HTMLInputElement).setCustomValidity('')}
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              minLength={8}
              required
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </Field>
          {mode === "login" && (
            <div className="login-options">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Ingat akun di perangkat ini
              </label>
              <button type="button" className="link-btn" onClick={() => changeMode("forgot")}>
                Lupa password?
              </button>
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <button className="primary login-submit" disabled={loading}>
            {loading
              ? "Memproses..."
              : "Masuk ke Dashboard"}
          </button>
          <div className="secure-note">
            🔒 Stok, penjualan, dan aktivitas tim Menengs tercatat dengan aman.
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

function ForgotPasswordFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<"request" | "verify">("request"),
    [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim OTP');
    } finally { setLoading(false); }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) return setError('Konfirmasi password tidak cocok');
    if (newPassword.length < 8) return setError('Password minimal 8 karakter');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp, newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset password');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-box forgot-flow">
      <button type="button" className="back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        Kembali ke Login
      </button>
      {success ? (
        <div className="forgot-success">
          <div className="forgot-success-icon">✅</div>
          <h2>Password Berhasil Direset!</h2>
          <p>{success}</p>
          <button className="primary" style={{ width: '100%', marginTop: '24px' }} onClick={onBack}>Masuk Sekarang</button>
        </div>
      ) : step === "request" ? (
        <form onSubmit={requestOtp}>
          <small>LUPA PASSWORD</small>
          <h2>Reset Password</h2>
          <p>Masukkan email akun Anda. Kami akan mengirimkan kode OTP 6 angka ke email tersebut.</p>
          <Field label="Alamat email">
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="email@usaha.com" autoComplete="username" />
          </Field>
          {error && <div className="login-error">{error}</div>}
          <button className="primary login-submit" disabled={loading}>{loading ? 'Mengirim...' : 'Kirim Kode OTP'}</button>
        </form>
      ) : (
        <form onSubmit={resetPassword}>
          <small>LUPA PASSWORD · LANGKAH 2</small>
          <h2>Masukkan Kode OTP</h2>
          <p>Kode OTP 6 angka telah dikirim ke <strong>{email}</strong>. Berlaku 15 menit.</p>
          <Field label="Kode OTP">
            <input
              required
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              className="otp-input"
            />
          </Field>
          <Field label="Password Baru">
            <PasswordInput required minLength={8} value={newPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="Minimal 8 karakter" />
          </Field>
          <Field label="Konfirmasi Password Baru">
            <PasswordInput required minLength={8} value={confirmPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)} autoComplete="new-password" placeholder="Ulangi password baru" />
          </Field>
          {error && <div className="login-error">{error}</div>}
          <button className="primary login-submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Reset Password'}</button>
          <button type="button" className="link-btn" style={{ width: '100%', marginTop: '8px' }} onClick={() => { setStep('request'); setOtp(''); setNewPassword(''); setConfirmPassword(''); setError(''); }}>
            Kirim ulang kode OTP
          </button>
        </form>
      )}
    </div>
  );
}

function Dashboard({
  data,
  variants,
  locations,
  setPage,
  organizationName,
  canEdit,
  canSetup,
  role,
  outletId,
}: any) {
  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const sales = isPic ? data.sales.filter((s: any) => s.locationId === outletId) : data.sales;
  const balances = isPic ? data.balances.filter((b: any) => b.locationId === outletId) : data.balances;
  const transfers = isPic ? data.transfers.filter((t: any) => t.fromId === outletId || t.toId === outletId) : data.transfers;
  const myLocations = isPic ? data.locations.filter((l: any) => l.id === outletId) : data.locations;

  const todayKey = jakartaDateKey();
  const [dateFrom, setDateFrom] = useState(todayKey);
  const [dateTo, setDateTo] = useState(todayKey);
  const selectedSales = sales.filter((sale: any) => {
    const saleDate = jakartaDateKey(sale.createdAt);
    return sale.status !== "voided" && saleDate >= dateFrom && saleDate <= dateTo;
  });
  const salesTotal = selectedSales.reduce((sum: number, sale: any) => sum + Number(sale.total || 0), 0);
  const formatRangeDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const isTodayRange = dateFrom === todayKey && dateTo === todayKey;
  const rangeLabel = dateFrom === dateTo ? formatRangeDate(dateFrom) : `${formatRangeDate(dateFrom)} – ${formatRangeDate(dateTo)}`;
  const salesByLocation = myLocations.map((location: any) => {
    const items = selectedSales.filter((sale: any) => sale.locationId === location.id);
    return { location, transactions: items.length, total: items.reduce((sum: number, sale: any) => sum + Number(sale.total || 0), 0) };
  }).sort((left: any, right: any) => right.total - left.total || left.location.name.localeCompare(right.location.name));
  const low = balances.filter(
    (b: any) => b.quantity < minimumFor(variants[b.variantId], b.locationId),
  );
  return (
    <>
      <section className="welcome">
        <div>
          <span>{isTodayRange ? "RINGKASAN HARI INI" : "RINGKASAN PERIODE TERPILIH"}</span>
          <h2>Selamat bekerja, tim {organizationName}.</h2>
          <p>
            Penjualan ditampilkan sesuai periode yang dipilih. Saldo stok dan transfer selalu menampilkan kondisi terkini.
          </p>
        </div>
        {canEdit && (
          <button className="primary" onClick={() => setPage("sales")}>
            <Plus /> Catat Penjualan
          </button>
        )}
      </section>
      <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} initialMode="realtime" />
      {canSetup&&(data.products.length===0||data.balances.length===0)&&<section className="onboarding"><div><small>PANDUAN MULAI</small><h2>Siapkan stok pertama Anda</h2><p>Ikuti urutan ini agar saldo awal tercatat sebagai transaksi dan mudah diaudit.</p></div><ol><li className={data.locations.length?'done':''}><b>1. Buat lokasi</b><span>Gudang atau outlet tempat stok disimpan.</span><button onClick={()=>setPage('locations')}>Buka lokasi</button></li><li className={data.products.length?'done':''}><b>2. Tambah produk & varian</b><span>Masukkan ukuran, warna, SKU, harga, dan minimum stok.</span><button onClick={()=>setPage('products')}>Buka produk</button></li><li className={data.balances.length?'done':''}><b>3. Catat stok masuk</b><span>Pilih supplier atau hasil produksi untuk membentuk saldo awal.</span><button onClick={()=>setPage('receipts')}>Catat stok</button></li></ol></section>}
      <section className="stats-grid">
        <Stat
          label={isTodayRange ? "Penjualan hari ini" : "Penjualan periode"}
          value={money(salesTotal)}
          sub={`${selectedSales.length} transaksi · ${rangeLabel}`}
          tone="navy"
        />
        <Stat
          label="Stok seluruh lokasi"
          value={`${balances.length} saldo`}
          sub={`${data.products.flatMap((p: any) => p.variants).length} varian aktif`}
        />
        <Stat
          label="Transfer berjalan"
          value={transfers.filter((t: any) => t.status === "sent").length}
          sub="Menunggu penerimaan"
          tone="amber"
        />
        <Stat
          label="Perlu perhatian"
          value={low.length}
          sub="Stok di bawah minimum"
          tone="red"
        />
      </section>
      <ChannelSalesSummary sales={selectedSales} />
      <section className="dashboard-grid">
        <Card
          title="Stok per lokasi"
          action="Lihat detail"
          onAction={() => setPage("stock")}
        >
          <div className="location-list">
            {myLocations.map((l: any) => {
              return (
                <div key={l.id}>
                  <div className="location-icon">
                    {l.type === "warehouse" ? <Warehouse /> : <Store />}
                  </div>
                  <div>
                    <b>{l.name}</b>
                    <span>
                      {
                        balances.filter((b: any) => b.locationId === l.id)
                          .length
                      }{" "}
                      varian tercatat
                    </span>
                  </div>
                  <strong>
                    {l.type === "warehouse" ? "Gudang" : "Outlet"}
                  </strong>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Penjualan per lokasi" action="Lihat transaksi" onAction={() => setPage("sales")}>
          <div className="location-sales-list">
            {salesByLocation.map(({ location, transactions, total }: any) => <div key={location.id}>
              <div className="location-icon">{location.type === "warehouse" ? <Warehouse /> : <Store />}</div>
              <div><b>{location.name}</b><span>{transactions ? `${transactions} transaksi` : "Belum ada transaksi"}</span></div>
              <strong>{money(total)}</strong>
            </div>)}
          </div>
        </Card>
        <Card
          title="Aktivitas terbaru"
          action="Lihat semua"
          onAction={() => setPage("history")}
        >
          <Activity data={data} variants={variants} locations={locations} role={role} outletId={outletId} />
        </Card>
      </section>
    </>
  );
}
type PeriodMode = "all" | "realtime" | "yesterday" | "last7" | "last30" | "day" | "week" | "month" | "year";
function DateRangePicker({ from, to, setFrom, setTo, initialMode = "all", onApplied, className = "" }: { from: string; to: string; setFrom: (value: string) => void; setTo: (value: string) => void; initialMode?: PeriodMode; onApplied?: () => void; className?: string }) {
  const todayKey = jakartaDateKey();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PeriodMode>(initialMode);
  const [pickerView, setPickerView] = useState<"range" | "month" | "year">("range");
  const [viewYear, setViewYear] = useState(Number(todayKey.slice(0, 4)));
  const [decadeStart, setDecadeStart] = useState(Math.floor(Number(todayKey.slice(0, 4)) / 10) * 10);
  const pickerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const closeWhenOutside = (event: MouseEvent | TouchEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("touchstart", closeWhenOutside, { passive: true });
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("touchstart", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const rangeLabel = !from && !to ? "Semua tanggal" : from && to ? (from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`) : from ? `Sejak ${formatDate(from)}` : `Hingga ${formatDate(to)}`;
  const jakartaTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(".", ":");
  const modeTitle: Record<PeriodMode, string> = { all: "Semua tanggal", realtime: `Hari ini · ${jakartaTime} WIB`, yesterday: "Kemarin", last7: "7 hari terakhir", last30: "30 hari terakhir", day: "Per hari", week: "Per minggu", month: "Per bulan", year: "Berdasarkan tahun" };
  const selectPeriod = (next: PeriodMode) => {
    const ranges: Record<PeriodMode, [string, string]> = { all: ["", ""], realtime: [todayKey, todayKey], yesterday: [shiftDateKey(todayKey, -1), shiftDateKey(todayKey, -1)], last7: [shiftDateKey(todayKey, -6), todayKey], last30: [shiftDateKey(todayKey, -29), todayKey], day: [todayKey, todayKey], week: [startOfWeekKey(todayKey), todayKey], month: [startOfMonthKey(todayKey), todayKey], year: [startOfYearKey(todayKey), todayKey] };
    setMode(next); setPickerView("range"); setFrom(ranges[next][0]); setTo(ranges[next][1]);
  };
  const selectMonth = (monthIndex: number) => {
    const first = `${viewYear}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const last = new Date(Date.UTC(viewYear, monthIndex + 1, 0)).toISOString().slice(0, 10);
    setFrom(first); setTo(last > todayKey ? todayKey : last); setPickerView("range");
  };
  const selectYear = (year: number) => {
    setFrom(`${year}-01-01`); setTo(year === Number(todayKey.slice(0, 4)) ? todayKey : `${year}-12-31`); setPickerView("range");
  };
  const options: Array<[PeriodMode, string, string]> = [["realtime", "Real-time", "Data hingga waktu sekarang"], ["yesterday", "Kemarin", "Satu hari penuh sebelumnya"], ["last7", "7 hari terakhir", "Termasuk hari ini"], ["last30", "30 hari terakhir", "Termasuk hari ini"], ["day", "Per hari", "Pilih tanggal tertentu"], ["week", "Per minggu", "Senin hingga hari ini"], ["month", "Per bulan", "Awal bulan hingga hari ini"], ["year", "Berdasarkan tahun", "Awal tahun hingga hari ini"]];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return <section ref={pickerRef} className={`period-picker ${className}`} aria-label="Filter periode">
    <button type="button" className="period-trigger" aria-expanded={open} onClick={() => setOpen(value => !value)}><span>Periode data</span><b>{modeTitle[mode]}</b><em>{rangeLabel}</em><CalendarDays aria-hidden="true" /><ChevronDown aria-hidden="true" className={open ? "open" : ""} /></button>
    {open && <div className="period-popover"><div className="period-menu" role="menu" aria-label="Pilihan periode"><button type="button" className={mode === "all" ? "active" : ""} onClick={() => selectPeriod("all")}><span>Semua tanggal</span><small>Tampilkan seluruh riwayat</small></button>{options.map(([value, label, hint], index) => <button type="button" key={value} className={`${mode === value ? "active" : ""}${index === 4 ? " period-menu-divider" : ""}`} onClick={() => { if (value === "month") { setMode(value); setViewYear(Number(todayKey.slice(0, 4))); setPickerView("month"); } else if (value === "year") { setMode(value); setDecadeStart(Math.floor(Number(todayKey.slice(0, 4)) / 10) * 10); setPickerView("year"); } else selectPeriod(value); }}><span>{label}</span><small>{hint}</small>{["day", "week", "month", "year"].includes(value) && <ChevronRight aria-hidden="true" />}</button>)}</div><div className="period-range-panel">{pickerView === "month" ? <div className="period-calendar"><header><button type="button" aria-label="Tahun sebelumnya" onClick={() => setViewYear(year => year - 1)}>‹</button><b>{viewYear}</b><button type="button" aria-label="Tahun berikutnya" disabled={viewYear >= Number(todayKey.slice(0, 4))} onClick={() => setViewYear(year => year + 1)}>›</button></header><div className="period-calendar-grid">{monthNames.map((name, index) => { const disabled = viewYear === Number(todayKey.slice(0, 4)) && index > Number(todayKey.slice(5, 7)) - 1; const active = from.startsWith(`${viewYear}-${String(index + 1).padStart(2, "0")}`); return <button type="button" key={name} disabled={disabled} className={active ? "active" : ""} onClick={() => selectMonth(index)}>{name}</button>; })}</div></div> : pickerView === "year" ? <div className="period-calendar"><header><button type="button" aria-label="Dekade sebelumnya" onClick={() => setDecadeStart(year => year - 10)}>‹</button><b>{decadeStart} – {decadeStart + 9}</b><button type="button" aria-label="Dekade berikutnya" disabled={decadeStart + 10 > Number(todayKey.slice(0, 4))} onClick={() => setDecadeStart(year => year + 10)}>›</button></header><div className="period-calendar-grid">{Array.from({ length: 10 }, (_, index) => decadeStart + index).map(year => <button type="button" key={year} disabled={year > Number(todayKey.slice(0, 4))} className={from.startsWith(`${year}-`) ? "active" : ""} onClick={() => selectYear(year)}>{year}</button>)}</div></div> : <><small>PERIODE TERPILIH</small><h3>{modeTitle[mode]}</h3><p>{rangeLabel}</p><div className="period-date-inputs"><label><span>Tanggal mulai</span><input type="date" value={from} max={to || todayKey} onChange={event => { setFrom(event.target.value); setMode("day"); }} /></label><label><span>Tanggal akhir</span><input type="date" value={to} min={from} max={todayKey} onChange={event => { setTo(event.target.value); setMode("day"); }} /></label></div><button type="button" className="primary period-apply" onClick={() => { setOpen(false); onApplied?.(); }}>Terapkan periode <Check /></button></>}</div></div>}
  </section>;
}
const Stat = ({ label, value, sub, tone = "green" }: any) => (
  <article className={`stat ${tone}`}>
    <small>{label}</small>
    <b>{value}</b>
    <span>{sub}</span>
  </article>
);
const TablePagination = ({ page, total, size, setPage }: any) => {
  const pages = Math.max(1, Math.ceil(total / size));
  if (!total) return null;
  return <div className="table-pagination"><span>Menampilkan {(page - 1) * size + 1}–{Math.min(page * size, total)} dari {total} data</span><div><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button><button className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Selanjutnya</button></div></div>;
};
const ChannelSalesSummary = ({ sales }: { sales: Sale[] }) => {
  const channels = [
    { key: "offline" as Channel, label: "Penjualan Outlet", caption: "Transaksi langsung di outlet", className: "outlet" },
    { key: "online" as Channel, label: "Penjualan Online", caption: "Pesanan dari kanal online", className: "online" },
  ];

  return (
    <section className="channel-sales-summary" aria-label="Ringkasan penjualan outlet dan online">
      {channels.map((channel) => {
        const transactions = sales.filter((sale) => sale.channel === channel.key);
        const total = transactions.reduce((sum, sale) => sum + sale.total, 0);
        return (
          <article className={`channel-sales-card ${channel.className}`} key={channel.key}>
            <div>
              <small>{channel.label}</small>
              <b>{money(total)}</b>
              <span>{transactions.length} transaksi · {channel.caption}</span>
            </div>
            <strong>{channel.key === "offline" ? "Outlet" : "Online"}</strong>
          </article>
        );
      })}
    </section>
  );
};
const Card = ({ title, action, onAction, children }: any) => (
  <article className="card">
    <div className="card-head">
      <h3>{title}</h3>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
    {children}
  </article>
);
function Activity({ data, variants, locations, role, outletId }: any) {
  const movements = role === "pic" && outletId 
    ? data.movements.filter((m: any) => m.locationId === outletId)
    : data.movements;
  return (
    <div className="activity">
      {movements.slice(0, 5).map((m: any) => (
        <div key={m.id}>
          <i className={m.quantity >= 0 ? "in" : "out"}>
            {m.quantity >= 0 ? "+" : "−"}
          </i>
          <div>
            <b>
              {m.type} · {variants[m.variantId]?.name}
            </b>
            <span>
              {locations[m.locationId]?.name} · {m.note}
            </span>
          </div>
          <time>
            {new Date(m.createdAt).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
      ))}
    </div>
  );
}

function Products({ data, open, edit, exportProducts, locationId, canCreate, canEdit }: any) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const scopedProducts = data.products
    .map((product: any) => ({
      ...product,
      variants: locationId
        ? product.variants.filter((variant: any) =>
            data.balances.some((balance: any) =>
              balance.locationId === locationId && balance.variantId === variant.id && balance.quantity > 0,
            ),
          )
        : product.variants,
    }))
    .filter((product: any) => product.variants.length > 0);
  const categories = Array.from(new Set(scopedProducts.map((p: any) => p.category))).sort();
  const scannableVariants = scopedProducts.flatMap((product: any) => product.variants.map((variant: any) => ({ ...variant, productId: product.id })));
  const scanProduct = (value: string) => {
    const variant = findVariantByBarcode(scannableVariants, value);
    if (!variant) return false;
    setSearch(variant.barcode || variant.sku || value);
    if (canEdit) edit(variant.productId);
    return true;
  };

  return (
    <PageBlock
      title="Daftar produk"
      desc={locationId ? "Produk yang tersedia di lokasi kerja Anda." : "Kelola kategori, satuan, varian, dan harga jual."}
      action={canCreate ? "Tambah Produk" : undefined}
      onAction={canCreate ? open : undefined}
      secondaryAction="Unduh data"
      onSecondaryAction={exportProducts}
    >
      <div style={{ display: 'flex', gap: '12px' }}>
        <div className="scan-search-row" style={{ flex: 1 }}>
          <ListSearch value={search} setValue={setSearch} placeholder="Cari produk, varian, SKU, atau kategori" />
          <BarcodeScanControl label="Scan" onDetected={scanProduct} />
        </div>
        <select 
          style={{ width: '200px', height: '44px', borderRadius: '12px', border: '1px solid #d9e1e8', padding: '0 14px', outline: 'none', background: '#fff' }} 
          value={categoryFilter} 
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">Semua Kategori</option>
          {categories.map((c: any) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="product-grid">
        {scopedProducts
          .filter((p: any) => categoryFilter === "all" || p.category === categoryFilter)
          .filter((p: any) => 
            `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()) || 
            p.variants.some((v:any) => `${v.name} ${v.sku} ${v.barcode || ""}`.toLowerCase().includes(search.toLowerCase()))
          )
          .map((p: any) => (
            <article className={`product-card ${canEdit ? "clickable-card" : ""}`} key={p.id} onClick={canEdit ? () => edit(p.id) : undefined}>
              {canEdit && <button className="card-edit" aria-label={`Edit ${p.name}`} onClick={(e) => { e.stopPropagation(); edit(p.id); }}>
                <Settings size={18} />
              </button>}
              
              <div className="product-head">
                <div className="product-img">
                  {p.imageUrl || p.image || p.variants[0]?.imageUrl ? (
                    <img src={p.imageUrl || p.image || p.variants[0]?.imageUrl} alt={p.name} loading="lazy" />
                  ) : (
                    p.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                
                <div className="product-info">
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className="badge">{p.category}</span>
                    {!p.active && <span className="status danger">Nonaktif</span>}
                  </div>
                  <h3>{p.name}</h3>
                </div>
              </div>

              <div className="product-variants">
                <div className="variant-count">{p.variants.length} Varian</div>
                {p.variants.map((v: any) => (
                  <div key={v.id} className="variant-item">
                    <div>
                      <b>{v.name} {v.active === false && <span className="inactive-badge">(Nonaktif)</span>}</b>
                      <code>{v.sku}</code>
                      <BarcodeGraphic value={v.barcode} compact />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <strong>{money(v.price)}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        Stok: {data.balances?.filter((b: any) => b.variantId === v.id && (!locationId || b.locationId === locationId)).reduce((sum: number, b: any) => sum + b.quantity, 0) || 0} {p.unit || 'Pcs'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
        ))}
      </div>
      {scopedProducts.length === 0 && <div className="empty"><PackagePlus /><b>Belum ada stok tersedia di lokasi ini</b><span>Hubungi PIC atau gudang untuk mengirim stok ke lokasi kerja Anda.</span></div>}
    </PageBlock>
  );
}
function LocationsPage({ data, open, edit }: any) {
  const [search, setSearch] = useState("");
  const rows = data.locations.filter((x: any) =>
    `${x.name} ${x.address || ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <PageBlock
      title="Lokasi usaha"
      desc="Tambahkan, edit, atau nonaktifkan gudang dan outlet tanpa menghapus histori."
      action="Tambah Lokasi"
      onAction={open}
    >
      <ListSearch
        value={search}
        setValue={setSearch}
        placeholder="Cari lokasi atau alamat"
      />
      <div className="user-grid">
        {rows.map((location: any) => (
          <article className="clickable-card" key={location.id} onClick={() => edit(location.id)}>
            <div className="location-icon">
              {location.type === "warehouse" ? <Warehouse /> : <Store />}
            </div>
            <div>
              <h3>{location.name}</h3>
              <p>
                {location.address || (location.type === "warehouse"
                  ? "Gudang"
                  : "Outlet / cabang")}
              </p>
              <span className={`status ${location.active ? "ok" : "danger"}`}>
                {location.active ? "Aktif" : "Nonaktif"}
              </span>
              {location.isCentralWarehouse && <span className="status info">Gudang pusat</span>}
            </div>
            <button
              className="icon-btn user-edit"
              aria-label={`Edit ${location.name}`}
            >
              <Settings />
            </button>
          </article>
        ))}
      </div>
    </PageBlock>
  );
}
function ReceiptsPage({ data, variants, locations, open, edit, cancel, detail }: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterSource, setFilterSource] = useState("");
  
  const [sortCol] = useState<string>("date");
  const [sortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate, filterSource]);

  const rows = (data.receipts || []).filter((x: any) => {
    const matchSearch = `${x.supplierName || ""} ${locations[x.locationId]?.name || ""} ${variants[x.variantId]?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    
    let matchDate = true;
    const itemDate = new Date(x.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    const matchSource = filterSource ? x.sourceType === filterSource : true;
    return matchSearch && matchDate && matchSource;
  });

  const totalItemMasuk = rows.reduce((acc: number, r: any) => acc + (r.status !== 'cancelled' ? r.quantity : 0), 0);
  const totalNilai = rows.reduce((acc: number, r: any) => acc + (r.status !== 'cancelled' ? r.quantity * r.unitCost : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "source") { valA = a.sourceType === "production" ? "Hasil produksi" : a.supplierName || ""; valB = b.sourceType === "production" ? "Hasil produksi" : b.supplierName || ""; }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.productName || ""; valB = variants[b.variantId]?.productName || ""; }
    else if (sortCol === "qty") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "value") { valA = a.quantity * a.unitCost; valB = b.quantity * b.unitCost; }
    else if (sortCol === "status") { valA = a.status; valB = b.status; }
    else if (sortCol === "user") { valA = a.createdBy || ""; valB = b.createdBy || ""; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  // Satu perintah "Catat Stok Masuk" dapat berisi banyak varian. Semua baris
  // yang dibuat oleh perintah tersebut memakai receiptCode yang sama dan tampil
  // sebagai satu dokumen di daftar.
  const groupedRows = Object.values(sortedRows.reduce((result: Record<string, any>, receipt: any) => {
    const key = receiptGroupKey(receipt);
    if (!result[key]) result[key] = { ...receipt, key, code: receiptDisplayCode(receipt), items: [] };
    result[key].items.push(receipt);
    return result;
  }, {}));
  const totalTransaksi = groupedRows.length;
  const totalPages = Math.ceil(groupedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = groupedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <PageBlock
      title="Stok masuk"
      desc="Catat pembelian supplier atau hasil produksi tanpa menggunakan stock opname."
      action="Catat Stok Masuk"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Transaksi"
          value={totalTransaksi.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Item Masuk"
          value={totalItemMasuk.toString()}
          sub="Tidak termasuk batal"
        />
        <Stat
          label="Total Nilai"
          value={money(totalNilai)}
          sub="Estimasi modal stok"
        />
      </div>
      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari supplier, lokasi, atau produk"
        />
        <DateRangePicker from={filterStartDate} to={filterEndDate} setFrom={setFilterStartDate} setTo={setFilterEndDate} className="list-period-picker" />
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
           <option value="">Semua Sumber</option>
           <option value="supplier">Pembelian Supplier</option>
           <option value="production">Hasil Produksi</option>
        </select>
      </div>
      <div className="record-card-list">
        {paginatedRows.length ? paginatedRows.map((group: any) => {
          const isCancelled = group.items.every((item: any) => item.status === "cancelled");
          const totalQuantity = group.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
          const totalValue = group.items.reduce((sum: number, item: any) => sum + item.quantity * item.unitCost, 0);
          const productSummary = group.items.slice(0, 2).map((item: any) => `${variants[item.variantId]?.productName} · ${variants[item.variantId]?.name}`).join(" · ");
          return <article className="record-card clickable-record-card" key={group.key} role="button" tabIndex={0} onClick={() => detail(group.key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); detail(group.key); } }}>
            <div className="record-card-top"><div className="record-card-code"><span>DOKUMEN STOK MASUK</span><b>{group.code}</b><time>{new Date(group.createdAt).toLocaleString("id-ID")}</time></div><span className={`status ${isCancelled ? "danger" : "ok"}`}>{isCancelled ? "Dibatalkan" : "Selesai"}</span></div>
            <div className="record-card-body"><div className="record-detail"><small>SUMBER & LOKASI</small><b>{group.sourceType === "production" ? "Hasil produksi" : group.supplierName || "Supplier"} · {locations[group.locationId]?.name || "Lokasi tidak diketahui"}</b><span>{group.createdBy || "Penginput tidak tercatat"}</span></div><div className="record-detail"><small>ISI PENERIMAAN</small><b>{group.items.length} varian · {totalQuantity.toLocaleString("id-ID")} item · {money(totalValue)}</b><span>{productSummary}{group.items.length > 2 ? ` +${group.items.length - 2} lainnya` : ""}</span></div></div>
            {!isCancelled && <div className="record-card-actions">{group.items.length === 1 && <button className="table-action" onClick={(event) => { event.stopPropagation(); edit(group.items[0].id); }}>Edit</button>}<button className="table-action danger-text" onClick={(event) => { event.stopPropagation(); cancel(group.key); }}>Batalkan</button></div>}
          </article>;
        }) : <Empty text="Belum ada stok masuk." />}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, groupedRows.length)} dari {groupedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function ReturnsPage({ data, variants, locations, open, cancel, detail, role, outletId }: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol] = useState<string>("date");
  const [sortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredReturns = isPic ? (data.returns || []).filter((x: any) => x.locationId === outletId) : (data.returns || []);
  const rows = filteredReturns.filter((x: any) => {
    const matchSearch = `${x.reason} ${locations[x.locationId]?.name || ""} ${variants[x.variantId]?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(x.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchSearch && matchDate;
  });

  const totalRetur = rows.length;
  const totalItem = rows.reduce((acc: number, r: any) => acc + (r.status !== 'cancelled' ? r.quantity : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "type") { valA = a.type; valB = b.type; }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.productName || ""; valB = variants[b.variantId]?.productName || ""; }
    else if (sortCol === "qty") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "reason") { valA = a.reason; valB = b.reason; }
    else if (sortCol === "status") { valA = a.status; valB = b.status; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <PageBlock
      title="Retur barang"
      desc="Retur pelanggan menambah stok; retur supplier mengurangi stok."
      action="Catat Retur"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Retur"
          value={totalRetur.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Item Retur"
          value={totalItem.toString()}
          sub="Tidak termasuk batal"
        />
        <Stat
          label="Selisih Retur"
          value={totalItem.toString()}
          sub="Barang berputar"
        />
      </div>
      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari produk, lokasi, atau alasan"
        />
        <DateRangePicker from={filterStartDate} to={filterEndDate} setFrom={setFilterStartDate} setTo={setFilterEndDate} className="list-period-picker" />
      </div>
      <div className="record-card-list">
        {paginatedRows.length ? paginatedRows.map((item: any) => (
          <article className="record-card clickable-record-card" key={item.id} role="button" tabIndex={0} onClick={() => detail(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); detail(item.id); } }}>
            <div className="record-card-top"><div className="record-card-code"><span>TRANSAKSI RETUR</span><b>{item.type === "customer" ? "Retur dari pelanggan" : "Retur ke supplier"}</b><time>{new Date(item.createdAt).toLocaleString("id-ID")}</time></div><span className={`status ${item.status === "cancelled" ? "danger" : "ok"}`}>{item.status === "cancelled" ? "Dibatalkan" : "Selesai"}</span></div>
            <div className="record-card-body"><div className="record-detail"><small>LOKASI & ALASAN</small><b>{locations[item.locationId]?.name || "Lokasi tidak diketahui"}</b><span>{item.status === "cancelled" ? `Dibatalkan: ${item.cancelReason || item.reason}` : item.reason}</span></div><div className="record-detail"><small>PRODUK</small><b>{variants[item.variantId]?.productName} · {variants[item.variantId]?.name}</b><span>{qty(item.quantity, variants[item.variantId]?.unit)}</span></div></div>
            {item.status !== "cancelled" && <div className="record-card-actions"><button className="table-action danger-text" onClick={(event) => { event.stopPropagation(); cancel(item.id); }}>Batalkan</button></div>}
          </article>
        )) : <Empty text="Belum ada retur barang." />}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function BusinessPage({ data, open }: any) {
  const profile = data.business || {};
  return (
    <PageBlock
      title="Identitas usaha"
      desc="Informasi ini digunakan pada dokumen dan ruang kerja Menengs."
      action="Edit Profil Usaha"
      onAction={open}
    >
      <article className="business-card">
        <div className="business-logo">
          {profile.logoUrl ? (
            <img src={profile.logoUrl} alt={profile.name} />
          ) : (
            String(profile.name || "U")
              .slice(0, 2)
              .toUpperCase()
          )}
        </div>
        <div>
          <h2>{profile.name || "Usaha Saya"}</h2>
          <p>{profile.ownerName || "-"}</p>
          <span>
            {profile.phone || "Nomor telepon belum diisi"} ·{" "}
            {profile.email || "Email belum diisi"}
          </span>
          <address>{profile.address || "Alamat belum diisi"}</address>
        </div>
      </article>
    </PageBlock>
  );
}
function SuppliersPage({ data, open, edit }: any) {
  const [search, setSearch] = useState("");
  const suppliers = (data.suppliers || []).filter((supplier:any) => `${supplier.name} ${supplier.phone || ""} ${supplier.address || ""}`.toLowerCase().includes(search.toLowerCase()));
  const receiptCount = (supplierId:string) => (data.receipts || []).filter((receipt:any) => receipt.supplierId === supplierId && receipt.status !== "cancelled").length;
  return <PageBlock title="Supplier" desc="Kelola pemasok untuk pembelian stok dan telusuri riwayat penerimaannya." action="Tambah Supplier" onAction={open}>
    <div className="stats-grid compact"><Stat label="Supplier aktif" value={String((data.suppliers || []).filter((item:any) => item.active).length)} sub="Dapat dipilih saat stok masuk" /><Stat label="Total supplier" value={String((data.suppliers || []).length)} sub="Termasuk supplier nonaktif" tone="blue" /></div>
    <div className="table-controls"><ListSearch value={search} setValue={setSearch} placeholder="Cari nama, telepon, atau alamat supplier" /></div>
    <div className="table-wrap"><table><thead><tr><th>Supplier</th><th>Kontak</th><th>Alamat</th><th>Dokumen penerimaan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{suppliers.length ? suppliers.map((supplier:any) => <tr key={supplier.id}><td><b>{supplier.name}</b></td><td>{supplier.phone || "-"}</td><td>{supplier.address || "-"}</td><td>{receiptCount(supplier.id)} dokumen</td><td><span className={`status ${supplier.active ? "ok" : "danger"}`}>{supplier.active ? "Aktif" : "Nonaktif"}</span></td><td><button className="table-action" onClick={() => edit(supplier.id)}>Atur</button></td></tr>) : <Empty text="Belum ada supplier. Tambahkan supplier sebelum mencatat pembelian." />}</tbody></table></div>
  </PageBlock>;
}
function EmployeesPage({ data, locations, open, editAccess, editEmployee, completeEmployee }: any) {
  const accounts = data.users.filter((account:any) => account.role !== "owner");
  const employees = data.employees || [];
  const linkedCount = accounts.filter((account:any) => employees.some((employee:any) => employee.userId === account.id)).length;
  const payrollEstimate = employees.filter((employee:any) => employee.active).reduce((sum:number, employee:any) => sum + employee.monthlySalary, 0);
  return <PageBlock title="Tim & Akses" desc="Kelola akun, hak akses, data kerja, absensi, dan penggajian staf dari satu tempat." action="Tambah Staf" onAction={open}>
    <div className="stats-grid compact"><Stat label="Akun staf aktif" value={accounts.filter((account:any) => account.active).length} sub="Dapat masuk sesuai hak akses" /><Stat label="Data kerja lengkap" value={`${linkedCount}/${accounts.length}`} sub={linkedCount === accounts.length ? "Semua staf masuk penggajian" : `${accounts.length - linkedCount} staf perlu dilengkapi`} tone={linkedCount === accounts.length ? "blue" : "amber"} /><Stat label="Estimasi gaji" value={money(payrollEstimate)} sub="Per bulan · staf aktif" /></div>
    <div className="table-wrap"><table><thead><tr><th>Staf</th><th>Peran staf</th><th>Lokasi kerja</th><th>Gaji bulanan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{accounts.length ? accounts.map((account:any) => { const employee = employees.find((item:any) => item.userId === account.id), assigned = Boolean(employee?.locationId); return <tr key={account.id}><td><b>{account.name}</b><small className="block">{account.email}</small></td><td><span className={`status ${account.active ? "ok" : "danger"}`}>{account.active ? accessRoleLabel(account.role) : "Akun nonaktif"}</span></td><td>{employee ? assigned ? locations[employee.locationId]?.name || "Lokasi tidak aktif" : <span className="status wait">Belum ditugaskan</span> : "-"}</td><td><b>{employee ? money(employee.monthlySalary) : "-"}</b></td><td>{employee ? <span className={`status ${employee.active && assigned ? "ok" : employee.active ? "wait" : "danger"}`}>{employee.active ? assigned ? "Siap absensi & gaji" : "Data kerja tanpa lokasi" : "Data kerja nonaktif"}</span> : <span className={`status ${account.active ? "wait" : "danger"}`}>{account.active ? "Lengkapi data kerja" : "Aktifkan akun dahulu"}</span>}</td><td><div className="team-row-actions"><button className="table-action" onClick={() => editAccess(account.id)}>Atur peran</button>{employee ? <button className="table-action" onClick={() => editEmployee(employee.id)}>Atur lokasi & gaji</button> : account.active ? <button className="table-action primary-link" onClick={() => completeEmployee(account.id)}>Lengkapi lokasi & gaji</button> : null}</div></td></tr>; }) : <Empty text="Belum ada staf. Tambahkan akun staf untuk memulai." />}</tbody></table></div>
  </PageBlock>;
}
function AttendancePage({ data, user, runCommand, notify }: any) {
  const today = jakartaDateKey();
  if (user.role === "owner") return <OwnerAttendancePage data={data} runCommand={runCommand} notify={notify} today={today} />;
  const employee = (data.employees || []).find((item:any) => item.userId === user.id && item.active);
  const assigned = Boolean(employee?.locationId && data.locations.some((location:any) => location.id === employee.locationId && location.active));
  const attendance = employee && (data.attendances || []).find((item:any) => item.employeeId === employee.id && item.date === today);
  const history = employee ? (data.attendances || []).filter((item:any) => item.employeeId === employee.id).sort((a:any,b:any) => b.date.localeCompare(a.date)).slice(0, 20) : [];
  const setting = employee && (data.attendanceSettings || []).find((item:any) => item.locationId === employee.locationId) || { checkInStart: "08:00", checkInEnd: "09:00", checkOutStart: "17:00", checkOutEnd: "23:59", lateToleranceMinutes: 10 };
  const capture = (kind: "in" | "out") => {
    if (!employee || !assigned) return notify("Lokasi kerja belum ditetapkan. Hubungi owner sebelum melakukan absensi.");
    navigator.geolocation?.getCurrentPosition((position) => {
      void runCommand("/api/commands/attendance", { kind, latitude: position.coords.latitude, longitude: position.coords.longitude, capturedAt: new Date().toISOString() })
        .then(() => notify(kind === "in" ? "Check-in dan lokasi GPS berhasil dicatat." : "Check-out dan lokasi GPS berhasil dicatat."))
        .catch((error:any) => notify(error.message || "Absensi gagal disimpan ke server."));
    }, () => notify("GPS tidak tersedia. Aktifkan izin lokasi untuk melakukan absensi."), { enableHighAccuracy: true, timeout: 10000 });
  };
  const updateSetting = (locationId:string, field:string, value:string|number) => {
    const currentSetting = (data.attendanceSettings || []).find((item:any) => item.locationId === locationId) || { locationId, checkInStart: "08:00", checkInEnd: "09:00", checkOutStart: "17:00", checkOutEnd: "23:59", lateToleranceMinutes: 10 };
    void runCommand(`/api/commands/attendance-settings/${locationId}`, { setting: { ...currentSetting, [field]: value } }, "PATCH").catch((error:any) => notify(error.message || "Pengaturan kehadiran gagal disimpan."));
  };
  return <PageBlock title="Kehadiran" desc="Check-in dan check-out menggunakan waktu perangkat serta titik GPS saat ini.">{!assigned && <section className="attendance-hero"><div><small>STATUS PENUGASAN</small><h3>Menunggu penugasan lokasi</h3><p>Owner perlu menetapkan lokasi kerja Anda sebelum absensi dapat dilakukan.</p></div></section>}<section className="attendance-hero"><div><small>ABSENSI HARI INI</small><h3>{assigned ? data.locations.find((location:any) => location.id === employee.locationId)?.name : "Lokasi belum ditetapkan"}</h3><p>{assigned ? `Jam masuk ${setting.checkInStart}–${setting.checkInEnd} · Pulang hingga ${setting.checkOutEnd}` : "Check-in dan check-out akan terbuka setelah lokasi kerja ditetapkan."}</p></div><div className="attendance-actions"><button className="primary" disabled={!assigned || !!attendance?.checkInAt} onClick={() => capture("in")}><MapPin size={17}/> {attendance?.checkInAt ? "Sudah check-in" : "Check-in"}</button><button className="secondary" disabled={!assigned || !attendance?.checkInAt || !!attendance?.checkOutAt} onClick={() => capture("out")}><Clock3 size={17}/> {attendance?.checkOutAt ? "Sudah check-out" : "Check-out"}</button></div></section><div className="detail-list"><p><span>Check-in</span><b>{attendance?.checkInAt ? new Date(attendance.checkInAt).toLocaleString("id-ID") : "Belum tercatat"}</b></p><p><span>Lokasi check-in</span><b>{attendance?.checkInGps || "-"}</b></p><p><span>Check-out</span><b>{attendance?.checkOutAt ? new Date(attendance.checkOutAt).toLocaleString("id-ID") : "Belum tercatat"}</b></p><p><span>Keterlambatan</span><b>{attendance?.lateMinutes ? `${attendance.lateMinutes} menit` : "-"}</b></p></div><section className="payroll-section"><div className="card-head"><h3>Riwayat absensi</h3><span>20 data terbaru</span></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead><tbody>{history.length ? history.map((item:any) => <tr key={item.id}><td>{new Date(`${item.date}T00:00:00`).toLocaleDateString("id-ID")}</td><td>{item.checkInAt ? new Date(item.checkInAt).toLocaleTimeString("id-ID") : "-"}</td><td>{item.checkOutAt ? new Date(item.checkOutAt).toLocaleTimeString("id-ID") : "-"}</td><td><span className={`status ${item.checkOutAt ? "ok" : "wait"}`}>{item.checkOutAt ? "Lengkap" : "Belum check-out"}</span></td></tr>) : <Empty text="Belum ada riwayat absensi." />}</tbody></table></div></section>{user.role === "owner" && <section className="attendance-settings"><div className="card-head"><h3>Pengaturan kehadiran per lokasi</h3><span>Disimpan otomatis</span></div>{data.locations.filter((location:any) => location.active).map((location:any) => { const value = (data.attendanceSettings || []).find((item:any) => item.locationId === location.id) || { checkInStart: "08:00", checkInEnd: "09:00", checkOutStart: "17:00", checkOutEnd: "23:59", lateToleranceMinutes: 10 }; return <div className="attendance-setting-row" key={location.id}><b>{location.name}</b><label>Masuk<input type="time" value={value.checkInStart} onChange={(event) => updateSetting(location.id, "checkInStart", event.target.value)} /></label><label>Batas masuk<input type="time" value={value.checkInEnd} onChange={(event) => updateSetting(location.id, "checkInEnd", event.target.value)} /></label><label>Pulang<input type="time" value={value.checkOutStart} onChange={(event) => updateSetting(location.id, "checkOutStart", event.target.value)} /></label><label>Toleransi<input type="number" min="0" value={value.lateToleranceMinutes} onChange={(event) => updateSetting(location.id, "lateToleranceMinutes", Number(event.target.value))} /></label></div>; })}</section>}</PageBlock>;
}
function OwnerAttendancePage({ data, runCommand, notify, today }: any) {
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState("all");
  const employees = (data.employees || []).filter((employee:any) => employee.active);
  const activeLocations = (data.locations || []).filter((location:any) => location.active);
  const rows = employees.map((employee:any) => {
    const account = (data.users || []).find((user:any) => user.id === employee.userId);
    const record = (data.attendances || []).find((attendance:any) => attendance.employeeId === employee.id && attendance.date === date);
    return { employee, account, record, location: (data.locations || []).find((location:any) => location.id === employee.locationId) };
  }).filter((row:any) => `${row.account?.name || ""} ${row.employee.position || ""} ${row.location?.name || ""}`.toLowerCase().includes(search.toLowerCase()) && (locationId === "all" || row.employee.locationId === locationId));
  const checkedIn = rows.filter((row:any) => row.record?.checkInAt).length;
  const completed = rows.filter((row:any) => row.record?.checkOutAt).length;
  const updateSetting = (targetLocationId:string, field:string, value:string|number) => {
    const fallback = { locationId: targetLocationId, checkInStart: "08:00", checkInEnd: "09:00", checkOutStart: "17:00", checkOutEnd: "23:59", lateToleranceMinutes: 10 };
    const existing = (data.attendanceSettings || []).find((item:any) => item.locationId === targetLocationId) || fallback;
    const next = { ...existing, [field]: value };
    void runCommand(`/api/commands/attendance-settings/${targetLocationId}`, { setting: next }, "PATCH").catch((error:any) => notify(error.message || "Pengaturan kehadiran gagal disimpan."));
  };
  return <PageBlock title="Kehadiran karyawan" desc="Pantau kehadiran seluruh karyawan dan atur jam kerja per lokasi.">
    <div className="stats-grid compact"><Stat label="Karyawan aktif" value={String(employees.length)} sub="Memiliki akses absensi" /><Stat label="Sudah check-in" value={String(checkedIn)} sub={`Pada ${new Date(`${date}T00:00:00`).toLocaleDateString("id-ID")}`} /><Stat label="Sudah check-out" value={String(completed)} sub="Absensi lengkap" tone="blue" /></div>
    <section className="payroll-section"><div className="card-head"><h3>Rekap kehadiran</h3><span>{date === today ? "Data realtime hari ini" : "Riwayat berdasarkan tanggal"}</span></div><div className="table-controls"><ListSearch value={search} setValue={setSearch} placeholder="Cari karyawan, jabatan, atau lokasi" /><AppSelect value={locationId} onChange={(event:any) => setLocationId(event.target.value)}><option value="all">Semua lokasi</option>{activeLocations.map((location:any) => <option key={location.id} value={location.id}>{location.name}</option>)}</AppSelect><label className="date-filter">Tanggal<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><div className="table-wrap"><table><thead><tr><th>Karyawan</th><th>Lokasi</th><th>Check-in</th><th>GPS check-in</th><th>Check-out</th><th>Keterlambatan</th><th>Status</th></tr></thead><tbody>{rows.length ? rows.map((row:any) => <tr key={row.employee.id}><td><b>{row.account?.name || "Akun tidak ditemukan"}</b><small className="block">{row.employee.position}</small></td><td>{row.location?.name || <span className="status wait">Belum ditugaskan</span>}</td><td>{row.record?.checkInAt ? new Date(row.record.checkInAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" }) : "-"}</td><td>{row.record?.checkInGps || "-"}</td><td>{row.record?.checkOutAt ? new Date(row.record.checkOutAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" }) : "-"}</td><td>{row.record?.checkInAt ? row.record.lateMinutes ? `${row.record.lateMinutes} menit` : "Tepat waktu" : "-"}</td><td><span className={`status ${row.record?.checkOutAt ? "ok" : row.record?.checkInAt ? "wait" : "danger"}`}>{row.record?.checkOutAt ? "Lengkap" : row.record?.checkInAt ? "Belum check-out" : "Belum hadir"}</span></td></tr>) : <Empty text="Tidak ada karyawan yang sesuai filter." />}</tbody></table></div></section>
    <section className="attendance-settings"><div className="card-head"><h3>Pengaturan kehadiran per lokasi</h3><span>Perubahan disimpan otomatis</span></div>{activeLocations.map((location:any) => { const setting = (data.attendanceSettings || []).find((item:any) => item.locationId === location.id) || { checkInStart: "08:00", checkInEnd: "09:00", checkOutStart: "17:00", checkOutEnd: "23:59", lateToleranceMinutes: 10 }; return <div className="attendance-setting-row" key={location.id}><b>{location.name}</b><label>Masuk<input type="time" value={setting.checkInStart} onChange={(event) => updateSetting(location.id, "checkInStart", event.target.value)} /></label><label>Batas masuk<input type="time" value={setting.checkInEnd} onChange={(event) => updateSetting(location.id, "checkInEnd", event.target.value)} /></label><label>Pulang<input type="time" value={setting.checkOutStart} onChange={(event) => updateSetting(location.id, "checkOutStart", event.target.value)} /></label><label>Toleransi<input type="number" min="0" value={setting.lateToleranceMinutes} onChange={(event) => updateSetting(location.id, "lateToleranceMinutes", Number(event.target.value))} /></label></div>; })}</section>
  </PageBlock>;
}

function LoansPage({ data, locations, open, openPayrollPayment, confirmInstallment }: any) {
  const loans = data.loans || [];
  const period = jakartaDateKey().slice(0, 7);
  const payrolls = data.payrolls || [];
  const activeEmployees = (data.employees || []).filter((employee:any) => employee.active);
  const totalPayroll = activeEmployees.reduce((sum:number, employee:any) => sum + employee.monthlySalary, 0);
  const paidPayroll = payrolls.filter((payroll:any) => payroll.period === period).reduce((sum:number, payroll:any) => sum + payroll.grossAmount, 0);
  const payEmployee = (employee:any) => openPayrollPayment(employee.id);
  const [paySearch, setPaySearch] = useState(""), [payStatus, setPayStatus] = useState("all"), [payLocation, setPayLocation] = useState("all"), [paySort, setPaySort] = useState("employee"), [payDesc, setPayDesc] = useState(false), [payPage, setPayPage] = useState(1);
  const [loanSearch, setLoanSearch] = useState(""), [loanStatus, setLoanStatus] = useState("all"), [loanFrom, setLoanFrom] = useState(""), [loanTo, setLoanTo] = useState(""), [loanSort, setLoanSort] = useState("date"), [loanDesc, setLoanDesc] = useState(true), [loanPage, setLoanPage] = useState(1);
  const pageSize = 10;
  const dateMatches = (date:string, from:string, to:string) => (!from || date >= from) && (!to || date <= to);
  const payRows = activeEmployees.map((employee:any) => ({ employee, account: data.users.find((item:any) => item.id === employee.userId), payroll: payrolls.find((item:any) => item.employeeId === employee.id && item.period === period), loanReminder: loans.filter((loan:any) => loan.employeeId === employee.id && loan.status === "active").reduce((sum:number, loan:any) => sum + loan.installmentAmount, 0) })).filter((row:any) => `${row.account?.name} ${row.employee.position} ${locations[row.employee.locationId]?.name}`.toLowerCase().includes(paySearch.toLowerCase()) && (payStatus === "all" || (payStatus === "paid" ? !!row.payroll : !row.payroll)) && (payLocation === "all" || row.employee.locationId === payLocation)).sort((a:any,b:any) => { const av = paySort === "salary" ? a.employee.monthlySalary : paySort === "location" ? locations[a.employee.locationId]?.name || "" : a.account?.name || ""; const bv = paySort === "salary" ? b.employee.monthlySalary : paySort === "location" ? locations[b.employee.locationId]?.name || "" : b.account?.name || ""; return (av > bv ? 1 : av < bv ? -1 : 0) * (payDesc ? -1 : 1); });
  const loanRows = loans.map((loan:any) => ({ loan, employee: data.employees?.find((item:any) => item.id === loan.employeeId), account: data.users.find((item:any) => item.id === data.employees?.find((employee:any) => employee.id === loan.employeeId)?.userId) })).filter((row:any) => `${row.account?.name} ${row.employee?.position} ${row.loan.note || ""}`.toLowerCase().includes(loanSearch.toLowerCase()) && (loanStatus === "all" || row.loan.status === loanStatus) && dateMatches(row.loan.loanDate, loanFrom, loanTo)).sort((a:any,b:any) => { const av = loanSort === "amount" ? a.loan.amount : loanSort === "employee" ? a.account?.name || "" : a.loan.loanDate; const bv = loanSort === "amount" ? b.loan.amount : loanSort === "employee" ? b.account?.name || "" : b.loan.loanDate; return (av > bv ? 1 : av < bv ? -1 : 0) * (loanDesc ? -1 : 1); });
  const togglePaySort = (key:string) => { if (paySort === key) setPayDesc(!payDesc); else { setPaySort(key); setPayDesc(false); } setPayPage(1); };
  const toggleLoanSort = (key:string) => { if (loanSort === key) setLoanDesc(!loanDesc); else { setLoanSort(key); setLoanDesc(false); } setLoanPage(1); };
  return <PageBlock title="Kasbon & penggajian" desc="Gaji dibayarkan dan dicatat per periode. Kasbon hanya tampil sebagai pengingat; tidak dipotong otomatis." action="Catat Kasbon" onAction={open}>
    <div className="stats-grid compact"><Stat label="Gaji periode ini" value={money(totalPayroll)} sub={`Periode ${period}`} /><Stat label="Sudah dibayar" value={money(paidPayroll)} sub={`${payrolls.filter((payroll:any) => payroll.period === period).length} karyawan`} /><Stat label="Menunggu pembayaran" value={String(Math.max(0, activeEmployees.length - payrolls.filter((payroll:any) => payroll.period === period).length))} sub="Gaji pokok, tanpa potongan kasbon" tone="amber" /></div>
    <section className="payroll-section"><div className="card-head"><h3>Penggajian periode {period}</h3><span>Owner saja · kasbon tidak mengurangi nominal</span></div><div className="table-controls"><ListSearch value={paySearch} setValue={(value:string) => { setPaySearch(value); setPayPage(1); }} placeholder="Cari karyawan atau lokasi" /><AppSelect value={payStatus} onChange={(event:any) => { setPayStatus(event.target.value); setPayPage(1); }}><option value="all">Semua status</option><option value="paid">Sudah dibayar</option><option value="waiting">Menunggu</option></AppSelect><AppSelect value={payLocation} onChange={(event:any) => { setPayLocation(event.target.value); setPayPage(1); }}><option value="all">Semua lokasi</option>{data.locations.map((location:any) => <option key={location.id} value={location.id}>{location.name}</option>)}</AppSelect></div><div className="table-wrap"><table><thead><tr><th onClick={() => togglePaySort("employee")}>Karyawan {paySort === "employee" && (payDesc ? "↓" : "↑")}</th><th onClick={() => togglePaySort("location")}>Lokasi {paySort === "location" && (payDesc ? "↓" : "↑")}</th><th onClick={() => togglePaySort("salary")}>Gaji pokok {paySort === "salary" && (payDesc ? "↓" : "↑")}</th><th>Pengingat kasbon</th><th>Tanggal dibayar</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{payRows.length ? payRows.slice((payPage - 1) * pageSize, payPage * pageSize).map((row:any) => <tr key={row.employee.id}><td><b>{row.account?.name || "-"}</b><small className="block">{row.employee.position}</small></td><td>{locations[row.employee.locationId]?.name || "-"}</td><td><b>{money(row.employee.monthlySalary)}</b></td><td>{row.loanReminder ? <span className="status wait">Kasbon {money(row.loanReminder)}</span> : "-"}</td><td>{row.payroll ? new Date(row.payroll.paidAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" }) : "-"}{row.payroll?.proofUrl && <a className="proof-link" href={row.payroll.proofUrl} target="_blank" rel="noreferrer">Lihat bukti transfer</a>}</td><td><span className={`status ${row.payroll ? "ok" : "wait"}`}>{row.payroll ? "Dibayar" : "Menunggu"}</span></td><td>{!row.payroll && <button className="table-action" onClick={() => payEmployee(row.employee)}>Tandai dibayar</button>}</td></tr>) : <Empty text="Data penggajian tidak ditemukan." />}</tbody></table></div><TablePagination page={payPage} total={payRows.length} size={pageSize} setPage={setPayPage} /></section>
    <section className="payroll-section"><div className="card-head"><h3>Kasbon aktif</h3><span>Pengingat cicilan, terpisah dari gaji</span></div><div className="table-controls"><ListSearch value={loanSearch} setValue={(value:string) => { setLoanSearch(value); setLoanPage(1); }} placeholder="Cari karyawan atau catatan" /><AppSelect value={loanStatus} onChange={(event:any) => { setLoanStatus(event.target.value); setLoanPage(1); }}><option value="all">Semua status</option><option value="active">Aktif</option><option value="paid">Lunas</option></AppSelect><label className="date-filter">Dari<input type="date" value={loanFrom} onChange={(event) => { setLoanFrom(event.target.value); setLoanPage(1); }} /></label><label className="date-filter">Hingga<input type="date" value={loanTo} onChange={(event) => { setLoanTo(event.target.value); setLoanPage(1); }} /></label></div><div className="table-wrap"><table><thead><tr><th onClick={() => toggleLoanSort("employee")}>Karyawan {loanSort === "employee" && (loanDesc ? "↓" : "↑")}</th><th onClick={() => toggleLoanSort("date")}>Tanggal pinjaman {loanSort === "date" && (loanDesc ? "↓" : "↑")}</th><th onClick={() => toggleLoanSort("amount")}>Kasbon {loanSort === "amount" && (loanDesc ? "↓" : "↑")}</th><th>Cicilan</th><th>Sisa</th><th>Aksi</th></tr></thead><tbody>{loanRows.length ? loanRows.slice((loanPage - 1) * pageSize, loanPage * pageSize).map((row:any) => { const remaining = Math.max(0, row.loan.installmentCount - row.loan.paidInstallments); return <tr key={row.loan.id}><td><b>{row.account?.name || "-"}</b><small className="block">{locations[row.employee?.locationId]?.name || "-"}</small></td><td>{new Date(row.loan.loanDate).toLocaleDateString("id-ID")}</td><td>{money(row.loan.amount)}</td><td>{money(row.loan.installmentAmount)} × {row.loan.installmentCount}</td><td><span className={`status ${remaining ? "wait" : "ok"}`}>{remaining ? `${remaining} cicilan` : "Lunas"}</span></td><td>{remaining > 0 && <button className="table-action" onClick={() => confirmInstallment(row.loan, row.account?.name || "karyawan")}>Tandai 1 cicilan</button>}</td></tr>; }) : <Empty text="Data kasbon tidak ditemukan." />}</tbody></table></div><TablePagination page={loanPage} total={loanRows.length} size={pageSize} setPage={setLoanPage} /></section>
  </PageBlock>;
}
function Stock({ data, updateMinimum, variants, role, outletId }: any) {
  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const myLocations = isPic ? data.locations.filter((l: any) => l.id === outletId) : data.locations;
  const [loc, setLoc] = useState(myLocations[0]?.id || data.locations[0]?.id);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "restock" | "empty">("all");
  const [minimumDrafts, setMinimumDrafts] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<string>("variant");
  const [sortDesc, setSortDesc] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, loc, stockFilter]);

  const location = data.locations.find((item: any) => item.id === loc);
  const locationRows = data.balances.filter((b: any) => b.locationId === loc);
  const rows = locationRows.filter(
    (b: any) =>
      `${variants[b.variantId]?.productName} ${variants[b.variantId]?.name} ${variants[b.variantId]?.sku} ${variants[b.variantId]?.barcode || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (stockFilter === "all" || (stockFilter === "empty" ? b.quantity === 0 : b.quantity < minimumFor(variants[b.variantId], b.locationId))),
  );

  const totalVariants = locationRows.length;
  const totalQuantity = locationRows.reduce((sum: number, item: any) => sum + item.quantity, 0);
  const lowStockVariants = locationRows.filter((b: any) => b.quantity > 0 && b.quantity < minimumFor(variants[b.variantId], b.locationId)).length;
  const emptyVariants = locationRows.filter((b: any) => b.quantity === 0).length;

  const sortedRows = [...rows].sort((a, b) => {
    const vA = variants[a.variantId];
    const vB = variants[b.variantId];
    const minA = minimumFor(vA, a.locationId);
    const minB = minimumFor(vB, b.locationId);

    let valA: any, valB: any;
    if (sortCol === "variant") { valA = vA?.name || ""; valB = vB?.name || ""; }
    else if (sortCol === "sku") { valA = vA?.sku || ""; valB = vB?.sku || ""; }
    else if (sortCol === "balance") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "min") { valA = minA; valB = minB; }
    else if (sortCol === "status") { valA = a.quantity < minA ? 0 : 1; valB = b.quantity < minB ? 0 : 1; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const productGroups = Object.values(sortedRows.reduce((groups: Record<string, { name: string; rows: any[] }>, row: any) => {
    const productName = variants[row.variantId]?.productName || "Produk tanpa nama";
    if (!groups[productName]) groups[productName] = { name: productName, rows: [] };
    groups[productName].rows.push(row);
    return groups;
  }, {})).sort((a: any, b: any) => a.name.localeCompare(b.name, "id"));
  const totalPages = Math.ceil(productGroups.length / ITEMS_PER_PAGE) || 1;
  const paginatedGroups = productGroups.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE) as { name: string; rows: any[] }[];

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => {
      if (sortCol === col) setSortDesc(!sortDesc);
      else { setSortCol(col); setSortDesc(true); }
    }}>{label} {sortCol === col ? (sortDesc ? "↓" : "↑") : ""}</th>
  );
  const minimumKey = (variantId: string) => `${loc}:${variantId}`;
  const saveMinimum = async (variantId: string, currentMinimum: number) => {
    const key = minimumKey(variantId);
    const raw = minimumDrafts[key];
    if (raw === undefined) return;
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 0) return;
    if (next !== currentMinimum) await updateMinimum(variantId, loc, next);
    setMinimumDrafts((drafts) => { const updated = { ...drafts }; delete updated[key]; return updated; });
  };

  return (
    <PageBlock
      title="Saldo stok aktual"
      desc="Pantau saldo, batas minimum, dan kebutuhan re-stock per lokasi secara real-time."
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Varian"
          value={totalVariants.toString()}
          sub="Di lokasi ini"
        />
        <Stat
          label="Total unit"
          value={totalQuantity.toLocaleString("id-ID")}
          sub="Akumulasi semua varian"
        />
        <Stat
          label="Perlu re-stock"
          value={lowStockVariants.toString()}
          sub={emptyVariants ? `${emptyVariants} varian habis` : "Tidak ada stok habis"}
          tone={lowStockVariants || emptyVariants ? "amber" : "navy"}
        />
      </div>
      <section className="stock-toolbar" aria-label="Filter stok per lokasi">
        <div className="stock-location-picker">
          <span>LOKASI DIPANTAU</span>
          <select value={loc} onChange={(e) => setLoc(e.target.value)}>
          {myLocations.map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          </select>
          <small>{location?.type === "warehouse" ? "Gudang" : "Outlet / cabang"}{location?.isCentralWarehouse ? " · Gudang pusat" : ""}</small>
        </div>
        <div className="scan-search-row">
          <ListSearch
            value={search}
            setValue={setSearch}
            placeholder="Cari varian, SKU, atau barcode"
          />
          <BarcodeScanControl label="Scan" onDetected={(value) => {
            const variant = findVariantByBarcode(Object.values(variants), value);
            if (!variant || !locationRows.some((row: any) => row.variantId === variant.id)) return false;
            setSearch(variant.barcode || variant.sku || value);
            return true;
          }} />
        </div>
      </section>
      <div className="stock-filter-row">
        <span>Tampilkan:</span>
        <button className={stockFilter === "all" ? "active" : ""} onClick={() => setStockFilter("all")}>Semua ({totalVariants})</button>
        <button className={stockFilter === "restock" ? "active warning" : ""} onClick={() => setStockFilter("restock")}>Perlu re-stock ({lowStockVariants})</button>
        <button className={stockFilter === "empty" ? "active danger" : ""} onClick={() => setStockFilter("empty")}>Stok habis ({emptyVariants})</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th col="variant" label="Varian" />
              <Th col="sku" label="SKU" />
              <Th col="balance" label="Saldo aktual" />
              <Th col="min" label="Minimum" />
              <Th col="status" label="Status" />
            </tr>
          </thead>
          <tbody>
            {paginatedGroups.length ? (
              paginatedGroups.flatMap((group) => [
                <tr className="stock-product-group" key={`group-${group.name}`}><td colSpan={5}><b>{group.name}</b><span>{group.rows.length} varian</span></td></tr>,
                ...group.rows.map((b: any) => {
                const v = variants[b.variantId],
                  minimum = minimumFor(v, b.locationId),
                  low = b.quantity > 0 && b.quantity < minimum,
                  empty = b.quantity === 0,
                  draftKey = minimumKey(v.id),
                  draftMinimum = minimumDrafts[draftKey] ?? String(minimum);
                return (
                  <tr className="stock-variant-row" key={`${b.locationId}-${b.variantId}`}>
                    <td>
                      <b>{v.name}</b>
                    </td>
                    <td>
                      <code>{v.sku}</code>
                      {v.barcode && <small className="block">Barcode: {v.barcode}</small>}
                    </td>
                    <td>
                      <strong className={empty ? "negative" : low ? "stock-low-value" : "positive"}>{qty(b.quantity, v.unit)}</strong>
                    </td>
                    <td>
                      {role === "owner" ? (
                        <input
                          className="minimum-input"
                          aria-label={`Minimum stok ${v.name}`}
                          type="number"
                          min="0"
                          value={draftMinimum}
                          onChange={(e) => {
                            setMinimumDrafts((drafts) => ({ ...drafts, [draftKey]: e.target.value.replace(/^0+(?=\d)/, "") }));
                          }}
                          onBlur={() => void saveMinimum(v.id, minimum)}
                          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveMinimum(v.id, minimum); } }}
                        />
                      ) : qty(minimum, v.unit)}
                    </td>
                    <td>
                      <span className={`status ${empty || low ? "danger" : "ok"}`}>
                        {empty ? "Habis" : low ? "Menipis" : "Aman"}
                      </span>
                    </td>
                  </tr>
                );
              })])
            ) : (
              <Empty text="Belum ada saldo stok di lokasi ini." />
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, productGroups.length)} dari {productGroups.length} produk
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function Transfers({
  data,
  runCommand,
  uploadImage,
  variants,
  locations,
  open,
  notify,
  role,
  outletId,
  cancel,
  detail,
  helpAction,
}: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [page, setPage] = useState<number>(1);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [receiveVerifyGroup, setReceiveVerifyGroup] = useState<any>(null);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
    setSelectedCodes([]);
  }, [search, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const scopedTransfers = isPic
    ? data.transfers.filter((t: any) => t.fromId === outletId || t.toId === outletId)
    : data.transfers;
  const groups = Object.values(scopedTransfers.reduce((result: Record<string, any>, transfer: any) => {
    const key = transferGroupKey(transfer);
    if (!result[key]) result[key] = { key, code: transferDisplayCode(transfer), items: [], ...transfer };
    result[key].items.push(transfer);
    return result;
  }, {})).filter((group: any) => {
    const matchSearch = `${group.code} ${locations[group.fromId]?.name} ${locations[group.toId]?.name} ${group.items.map((item: any) => variants[item.variantId]?.name).join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(group.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchSearch && matchDate;
  });

  const groupStatus = (group: any) => group.items.some((item: any) => item.status === "sent") ? "sent" : group.items.every((item: any) => item.status === "cancelled") ? "cancelled" : "received";
  const totalTransfer = groups.length;
  const totalReceived = groups.filter((group: any) => groupStatus(group) === 'received').length;
  const totalSent = groups.filter((group: any) => groupStatus(group) === 'sent').length;

  const sortedRows = [...groups].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const receiveGroups = async (groupsToReceive: any[], receiveProofUrl?: string) => {
    const pending = groupsToReceive.filter((group) => group.items.some((item: any) => item.status === "sent"));
    if (!pending.length) return false;
    try {
      // Each transfer code is an atomic server-side command. A failed document
      // cannot make the client show a received status before the database does.
      for (const group of pending) {
        await runCommand(`/api/commands/transfers/${encodeURIComponent(group.items[0].transferCode || group.items[0].id)}/receive`, { receiveProofUrl });
      }
      setSelectedCodes([]);
      notify(`${pending.length} dokumen transfer diterima; stok tujuan telah bertambah`);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Transfer tidak dapat diterima");
      return false;
    }
  };
  const canReceive = (group: any) => groupStatus(group) === "sent" && (role === "owner" || group.toId === outletId);
  const selectableGroups = paginatedRows.filter((group: any) => canReceive(group));
  const selectedGroups = paginatedRows.filter((group: any) => selectedCodes.includes(group.key) && canReceive(group));
  return (<>
    <PageBlock
      title="Transfer antar lokasi"
      desc="Stok tujuan bertambah setelah penerima mengonfirmasi barang."
      action="Buat Transfer"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Transfer"
          value={totalTransfer.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Selesai (Diterima)"
          value={totalReceived.toString()}
          sub="Stok sudah masuk"
        />
        <Stat
          label="Dalam Perjalanan"
          value={totalSent.toString()}
          sub="Menunggu konfirmasi"
        />
      </div>

      <div style={{ background: '#f0f7f4', border: '1px solid #18a66a33', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LifeBuoy color="var(--green)" size={20} />
          <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 600 }}>Butuh bantuan mengirim atau menerima stok?</span>
        </div>
        <button className="small-primary" onClick={helpAction} style={{ background: 'white', border: '1px solid var(--line)', color: 'var(--navy)' }}>Baca Panduan Transfer</button>
      </div>

      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari rute atau produk"
        />
        <DateRangePicker from={filterStartDate} to={filterEndDate} setFrom={setFilterStartDate} setTo={setFilterEndDate} className="list-period-picker" />
      </div>
      {selectableGroups.length > 0 && <div className="transfer-bulk-bar"><label><input type="checkbox" checked={selectableGroups.every((group: any) => selectedCodes.includes(group.key))} onChange={(event) => setSelectedCodes(event.target.checked ? selectableGroups.map((group: any) => group.key) : [])} /> Pilih semua transfer di halaman ini</label><button className="small-primary" disabled={!selectedGroups.length} onClick={() => receiveGroups(selectedGroups)}><Check size={16} /> Terima {selectedGroups.length ? `${selectedGroups.length} terpilih` : "terpilih"}</button></div>}
      <div className="transfer-document-list">
        {paginatedRows.length ? paginatedRows.map((group: any) => {
          const status = groupStatus(group), isSelected = selectedCodes.includes(group.key);
          return <article className={`transfer-document-card clickable-record-card ${isSelected ? "selected" : ""}`} key={group.key} role="button" tabIndex={0} onClick={() => detail(group.key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); detail(group.key); } }}>
            <div className="transfer-document-top">
              {canReceive(group) ? <input className="transfer-select" type="checkbox" checked={isSelected} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedCodes((current) => event.target.checked ? [...current, group.key] : current.filter((key) => key !== group.key))} aria-label={`Pilih ${group.code}`} /> : <span className="transfer-document-mark" />}
              <div className="transfer-code"><span>DOKUMEN TRANSFER</span><b>{group.code}</b><time>{new Date(group.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</time></div>
              <span className={`status ${status === "cancelled" ? "danger" : status === "sent" ? "wait" : "ok"}`}>{status === "cancelled" ? "Dibatalkan" : status === "sent" ? "Dalam perjalanan" : "Diterima"}</span>
            </div>
            <div className="transfer-document-body">
              <div className="transfer-route"><small>RUTE PENGIRIMAN</small><b>{locations[group.fromId]?.name || group.fromName || "Lokasi asal"}</b><span>→</span><b>{locations[group.toId]?.name || group.toName || "Lokasi tujuan"}</b></div>
              <div className="transfer-items-summary"><small>ISI PENGIRIMAN</small><b>{group.items.length} varian · {group.items.reduce((sum: number, item: any) => sum + item.quantity, 0)} item</b><span>{group.items.slice(0, 2).map((item: any) => `${variants[item.variantId]?.productName} · ${variants[item.variantId]?.name}`).join(" · ")}{group.items.length > 2 ? ` +${group.items.length - 2} lainnya` : ""}</span></div>
            </div>
            <div className="transfer-document-actions">{canReceive(group) && <button className="small-primary" onClick={(event) => { event.stopPropagation(); setReceiveVerifyGroup(group); }}><Check size={16} /> Terima</button>}{status !== "cancelled" && role === "owner" && <button className="table-action danger-text" onClick={(event) => { event.stopPropagation(); cancel(group.key); }}>Batalkan</button>}</div>
          </article>;
        }) : <div className="empty standalone"><PackagePlus /><b>Belum ada transfer stok.</b><span>Buat transfer untuk mengirim stok antar lokasi.</span></div>}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
    {receiveVerifyGroup && <TransferReceiveScanner group={receiveVerifyGroup} variants={variants} locations={locations} uploadImage={uploadImage} close={() => setReceiveVerifyGroup(null)} confirm={async (receiveProofUrl?:string) => { if (await receiveGroups([receiveVerifyGroup], receiveProofUrl)) setReceiveVerifyGroup(null); }} />}
  </>);
}
function TransferReceiveScanner({ group, variants, locations, uploadImage, close, confirm }: any) {
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const expectedIds = Array.from(new Set(group.items.map((item: any) => item.variantId))) as string[];
  const verifiedCount = expectedIds.filter((id: string) => verified[id]).length;
  const complete = expectedIds.every((id: string) => verified[id]);
  return <Modal className="transfer-receive-modal" title={`Terima transfer ${group.code}`} desc="Cocokkan barang dengan bukti pengiriman sebelum menambah stok tujuan." close={close}>
    <div className="transfer-receive-scanner">
      <div className="transfer-receive-route"><div><small>DIKIRIM DARI</small><b>{locations[group.fromId]?.name || "Lokasi asal"}</b></div><ArrowRight /><div><small>DITERIMA DI</small><b>{locations[group.toId]?.name || "Lokasi tujuan"}</b></div></div>
      <section className="transfer-sender-proof"><div className="transfer-receive-section-head"><div><small>BUKTI DARI PENGIRIM</small><b>Foto bukti pengiriman</b></div>{group.sendProofUrl && <a href={group.sendProofUrl} target="_blank" rel="noreferrer">Buka ukuran penuh</a>}</div>{group.sendProofUrl ? <a className="transfer-proof-image" href={group.sendProofUrl} target="_blank" rel="noreferrer"><img src={group.sendProofUrl} alt={`Bukti pengiriman ${group.code}`} /></a> : <div className="transfer-proof-empty"><Camera /><span><b>Pengirim tidak melampirkan foto</b><small>Bukti foto bersifat opsional.</small></span></div>}</section>
      <div className="transfer-receive-section-head"><div><small>CHECKLIST BARANG</small><b>Centang barang yang sudah diterima</b></div><span>{verifiedCount}/{expectedIds.length} dicentang</span></div>
      <div className="transfer-check-all">
        <button type="button" onClick={() => setVerified(Object.fromEntries(expectedIds.map((id) => [id, true])))} disabled={complete}><Check size={15} /> Pilih semua</button>
        {verifiedCount > 0 && <button type="button" className="clear" onClick={() => setVerified({})}>Batalkan semua</button>}
      </div>
      <div className="transfer-verify-list">
        {group.items.map((item: any) => {
          const variant = variants[item.variantId];
          return <label key={item.id} className={verified[item.variantId] ? "verified" : ""}><input type="checkbox" checked={Boolean(verified[item.variantId])} onChange={(event) => setVerified((current) => ({ ...current, [item.variantId]: event.target.checked }))} /><span>{verified[item.variantId] ? <Check size={16} /> : <PackagePlus size={16} />}</span><span className="transfer-check-copy"><b>{variant?.productName} · {variant?.name}</b><small>{qty(item.quantity, variant?.unit)} {verified[item.variantId] ? "· sudah diterima" : "· belum dicentang"}</small></span></label>;
        })}
      </div>
      <div className="transfer-receive-section-head receive-proof-title"><div><small>BUKTI PENERIMA</small><b>Foto saat barang diterima <em>Opsional</em></b></div></div>
      <EvidencePhotoPicker file={proofFile} setFile={setProofFile} subject="penerimaan" />
      {uploadError && <p className="login-error">{uploadError}</p>}
    </div>
    <footer className="modal-actions"><button type="button" className="secondary" onClick={close}>Batal</button><button type="button" className="primary" disabled={!complete || saving} onClick={async () => { setSaving(true); setUploadError(""); try { const receiveProofUrl = proofFile ? await uploadImage(proofFile) : undefined; await confirm(receiveProofUrl); } catch (error) { setUploadError(error instanceof Error ? error.message : "Bukti penerimaan tidak dapat diunggah."); setSaving(false); } }}><Check />{saving ? "Menerima..." : complete ? "Terima transfer" : `Centang ${expectedIds.filter((id) => !verified[id]).length} varian lagi`}</button></footer>
  </Modal>;
}
function Sales({ data, variants, locations, open, cancel, detail, role, outletId, canCancel }: any) {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol] = useState<string>("date");
  const [sortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, channel, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredSales = isPic ? data.sales.filter((s: any) => s.locationId === outletId) : data.sales;
  const rows = filteredSales.filter((s: any) => {
    const matchChannel = channel === "all" || s.channel === channel;
    const matchSearch = `${locations[s.locationId]?.name} ${s.channel} ${variants[s.items[0]?.variantId]?.name}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(s.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchChannel && matchSearch && matchDate;
  });

  const totalSales = rows.length;
  const totalRevenue = rows.reduce((acc: number, s: any) => acc + (s.status !== 'voided' ? s.total : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "channel") { valA = a.channel; valB = b.channel; }
    else if (sortCol === "item") { valA = variants[a.items[0]?.variantId]?.name || ""; valB = variants[b.items[0]?.variantId]?.name || ""; }
    else if (sortCol === "payment") { valA = a.payment; valB = b.payment; }
    else if (sortCol === "total") { valA = a.total; valB = b.total; }
    else if (sortCol === "status") { valA = a.status; valB = b.status; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <PageBlock
      title="Transaksi penjualan"
      desc="Offline, online, dan reseller tercatat dalam satu laporan."
      action="Catat Penjualan"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Transaksi"
          value={totalSales.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Pendapatan"
          value={money(totalRevenue)}
          sub="Hanya transaksi selesai"
        />
      </div>
      <div className="filters">
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">Semua kanal</option>
          <option value="offline">Offline</option>
          <option value="online">Online</option>
          <option value="reseller">Reseller</option>
        </select>
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari lokasi atau produk"
        />
        <DateRangePicker from={filterStartDate} to={filterEndDate} setFrom={setFilterStartDate} setTo={setFilterEndDate} className="list-period-picker" />
      </div>
      <div className="record-card-list">
        {paginatedRows.length ? paginatedRows.map((s: any) => {
          const firstItem = s.items?.[0];
          const variant = variants[firstItem?.variantId];
          const itemCount = s.items?.length || 0;
          return <article className="record-card clickable-record-card" key={s.id} role="button" tabIndex={0} onClick={() => detail(s.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); detail(s.id); } }}>
            <div className="record-card-top"><div className="record-card-code"><span>TRANSAKSI PENJUALAN</span><b>{locations[s.locationId]?.name || "Lokasi tidak diketahui"}</b><time>{new Date(s.createdAt).toLocaleString("id-ID")}</time></div><div className="record-card-badges"><span className="status info">{s.channel}</span><span className={`status ${s.status === "voided" ? "danger" : "ok"}`}>{s.status === "voided" ? "Dibatalkan" : "Selesai"}</span></div></div>
            <div className="record-card-body"><div className="record-detail"><small>ITEM TERJUAL</small><b>{variant?.productName} · {variant?.name}</b><span>{firstItem ? qty(firstItem.quantity, variant?.unit) : "Tidak ada item"}{itemCount > 1 ? ` +${itemCount - 1} item lainnya` : ""}</span></div><div className="record-detail"><small>PEMBAYARAN & TOTAL</small><b>{money(s.total)}</b><span>{s.payment || "Metode pembayaran tidak tercatat"}</span></div></div>
            {canCancel && s.status !== "voided" && <div className="record-card-actions"><button className="table-action danger-text" onClick={(event) => { event.stopPropagation(); cancel(s.id); }}>Batalkan</button></div>}
          </article>;
        }) : <Empty text="Belum ada penjualan." />}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function Opname({ data, variants, locations, open, edit, cancel, detail, role, outletId, canCorrect }: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol] = useState<string>("date");
  const [sortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredOpname = isPic ? data.stockCounts.filter((o: any) => o.locationId === outletId) : data.stockCounts;
  
  const rows = filteredOpname.filter((o: any) => {
    const matchSearch = `${o.reason} ${locations[o.locationId]?.name || ""} ${variants[o.variantId]?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(o.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchSearch && matchDate;
  });

  const totalOpname = rows.length;
  const totalDiff = rows.reduce((acc: number, o: any) => acc + (o.status !== 'cancelled' ? o.difference : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.name || ""; valB = variants[b.variantId]?.name || ""; }
    else if (sortCol === "system") { valA = a.systemQty; valB = b.systemQty; }
    else if (sortCol === "actual") { valA = a.actualQty; valB = b.actualQty; }
    else if (sortCol === "diff") { valA = a.difference; valB = b.difference; }
    else if (sortCol === "reason") { valA = a.reason; valB = b.reason; }
    else if (sortCol === "user") { valA = a.createdBy || ""; valB = b.createdBy || ""; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <PageBlock
      title="Stock opname"
      desc="Bandingkan stok sistem dan fisik tanpa menghapus histori."
      action="Mulai Opname"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Riwayat Opname"
          value={totalOpname.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Selisih"
          value={totalDiff.toString()}
          sub="Unit barang"
        />
      </div>
      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari lokasi, produk, alasan"
        />
        <DateRangePicker from={filterStartDate} to={filterEndDate} setFrom={setFilterStartDate} setTo={setFilterEndDate} className="list-period-picker" />
      </div>
      <div className="record-card-list">
        {paginatedRows.length ? paginatedRows.map((o: any) => (
          <article className="record-card clickable-record-card" key={o.id} role="button" tabIndex={0} onClick={() => detail(o.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); detail(o.id); } }}>
            <div className="record-card-top"><div className="record-card-code"><span>DOKUMEN STOCK OPNAME</span><b>{locations[o.locationId]?.name || "Lokasi tidak diketahui"}</b><time>{new Date(o.createdAt).toLocaleString("id-ID")} · {o.createdBy || "Penginput tidak tercatat"}</time></div><span className={`status ${o.status === "cancelled" ? "danger" : "ok"}`}>{o.status === "cancelled" ? "Dibatalkan" : "Selesai"}</span></div>
            <div className="record-card-body"><div className="record-detail"><small>VARIAN & ALASAN</small><b>{variants[o.variantId]?.productName} · {variants[o.variantId]?.name}</b><span>{o.status === "cancelled" ? `Dibatalkan: ${o.cancelReason || o.reason}` : o.reason}</span></div><div className="record-detail"><small>SISTEM / FISIK / SELISIH</small><b>{qty(o.systemQty, variants[o.variantId]?.unit)} / {qty(o.actualQty, variants[o.variantId]?.unit)}</b><strong className={o.difference < 0 ? "negative" : "positive"}>{o.difference > 0 ? "+" : ""}{qty(o.difference, variants[o.variantId]?.unit)}</strong></div></div>
            {canCorrect && o.status !== "cancelled" && <div className="record-card-actions"><button className="table-action" onClick={(event) => { event.stopPropagation(); edit(o.id); }}>Edit</button><button className="table-action danger-text" onClick={(event) => { event.stopPropagation(); cancel(o.id); }}>Batalkan</button></div>}
          </article>
        )) : <Empty text="Belum ada stock opname." />}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function HistoryPage({ data, variants, locations, role, outletId }: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol] = useState<string>("date");
  const [sortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredMovements = isPic ? data.movements.filter((m: any) => m.locationId === outletId) : data.movements;
  
  const rows = filteredMovements.filter((m: any) => {
    const matchSearch = `${locations[m.locationId]?.name} ${variants[m.variantId]?.name} ${m.type} ${m.note} ${m.user}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(m.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchSearch && matchDate;
  });

  const totalMovements = rows.length;
  const totalIn = rows.reduce((acc: number, m: any) => acc + (m.quantity > 0 ? m.quantity : 0), 0);
  const totalOut = rows.reduce((acc: number, m: any) => acc + (m.quantity < 0 ? Math.abs(m.quantity) : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.name || ""; valB = variants[b.variantId]?.name || ""; }
    else if (sortCol === "type") { valA = a.type; valB = b.type; }
    else if (sortCol === "qty") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "user") { valA = a.user; valB = b.user; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <PageBlock
      title="Jejak stok"
      desc="Setiap perubahan tersimpan permanen untuk audit operasional."
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Jejak"
          value={totalMovements.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Stok Masuk"
          value={totalIn.toString()}
          sub="Unit barang"
        />
        <Stat
          label="Total Stok Keluar"
          value={totalOut.toString()}
          sub="Unit barang"
        />
      </div>
      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari lokasi, produk, tipe, pengguna"
        />
        <DateRangePicker from={filterStartDate} to={filterEndDate} setFrom={setFilterStartDate} setTo={setFilterEndDate} className="list-period-picker" />
      </div>
      <div className="record-card-list">
        {paginatedRows.length ? paginatedRows.map((m: any, index: number) => (
          <article className="record-card" key={m.id || `${m.createdAt}-${m.variantId}-${index}`}>
            <div className="record-card-top"><div className="record-card-code"><span>JEJAK PERGERAKAN STOK</span><b>{m.type === "INITIAL_BALANCE" ? "Saldo awal" : m.type}</b><time>{new Date(m.createdAt).toLocaleString("id-ID")}</time></div><strong className={m.quantity >= 0 ? "positive" : "negative"}>{m.quantity > 0 ? "+" : ""}{qty(m.quantity, variants[m.variantId]?.unit)}</strong></div>
            <div className="record-card-body"><div className="record-detail"><small>LOKASI & PENGGUNA</small><b>{locations[m.locationId]?.name || "Lokasi tidak diketahui"}</b><span>{m.user || "Pengguna tidak tercatat"}</span></div><div className="record-detail"><small>VARIAN & KETERANGAN</small><b>{variants[m.variantId]?.productName} · {variants[m.variantId]?.name}</b><span>{m.type === "INITIAL_BALANCE" ? "Stok awal" : m.note || "Tidak ada keterangan"}</span></div></div>
          </article>
        )) : <Empty text="Belum ada jejak stok." />}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function Reports({ data, variants, locations, notify, role, outletId }: any) {
  const todayKey = jakartaDateKey();
  const [dateFrom, setDateFrom] = useState(shiftDateKey(todayKey, -29));
  const [dateTo, setDateTo] = useState(todayKey);
  const [location, setLocation] = useState("all"),
    [product, setProduct] = useState("all"),
    [channel, setChannel] = useState("all");
  const periodDays = dateFrom && dateTo ? Math.floor((new Date(`${dateTo}T12:00:00Z`).getTime() - new Date(`${dateFrom}T12:00:00Z`).getTime()) / 864e5) + 1 : 0;
  const reportRangeLabel = !dateFrom && !dateTo ? "Semua tanggal" : dateFrom === dateTo ? new Date(`${dateFrom}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : `${new Date(`${dateFrom}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(`${dateTo}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;
  const inPeriod = (createdAt: string) => {
    const key = jakartaDateKey(createdAt);
    return (!dateFrom || key >= dateFrom) && (!dateTo || key <= dateTo);
  };
  const previousStartKey = periodDays ? shiftDateKey(dateFrom, -periodDays) : "0000-01-01";
  const previousEndKey = periodDays ? shiftDateKey(dateFrom, -1) : "0000-01-01";
  const inPreviousPeriod = (createdAt: string) => periodDays > 0 && jakartaDateKey(createdAt) >= previousStartKey && jakartaDateKey(createdAt) <= previousEndKey;
  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const visibleLocations = isPic
    ? data.locations.filter((item: any) => item.id === outletId)
    : data.locations;
  const visibleBalances = isPic
    ? data.balances.filter((item: any) => item.locationId === outletId)
    : data.balances;
  const saleMatchesScope = (s: any) =>
        s.status !== "voided" && s.status !== "cancelled" &&
        (!isPic || s.locationId === outletId) &&
        (location === "all" || s.locationId === location) &&
        (channel === "all" || s.channel === channel);
  const scopedSales = data.sales.filter(saleMatchesScope);
  const normalizeSale = (sale: any) => {
    const items = sale.items.filter((item: any) => product === "all" || item.variantId === product);
    const allItemValue = sale.items.reduce((sum: number, item: any) => sum + Number(item.subtotal ?? (item.price || 0) * item.quantity), 0);
    const selectedItemValue = items.reduce((sum: number, item: any) => sum + Number(item.subtotal ?? (item.price || 0) * item.quantity), 0);
    const selectedQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
    const allQuantity = sale.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
    const reportTotal = product === "all"
      ? Number(sale.total || selectedItemValue)
      : allItemValue > 0
        ? Number(sale.total || allItemValue) * (selectedItemValue / allItemValue)
        : Number(sale.total || 0) * (selectedQuantity / Math.max(1, allQuantity));
    return { ...sale, items, reportTotal };
  };
  const sales = scopedSales.filter((s: any) => inPeriod(s.createdAt)).map(normalizeSale).filter((s: any) => s.items.length);
  const previousSales = scopedSales.filter((s: any) => inPreviousPeriod(s.createdAt)).map(normalizeSale).filter((s: any) => s.items.length);
  const total = sales.reduce((sum: number, sale: any) => sum + sale.reportTotal, 0);
  const previousTotal = previousSales.reduce((sum: number, sale: any) => sum + sale.reportTotal, 0);
  const revenueChange = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  const cogs = sales.reduce((sum: number, sale: any) => sum + sale.items.reduce((lineSum: number, item: any) => lineSum + item.quantity * Number(item.unitCost || variants[item.variantId]?.cost || 0), 0), 0);
  const grossProfit = total - cogs;
  const grossMargin = total > 0 ? grossProfit / total * 100 : 0;
  const soldUnits = sales.reduce((sum: number, sale: any) => sum + sale.items.reduce((lineSum: number, item: any) => lineSum + item.quantity, 0), 0);
  const receipts = (data.receipts || []).filter(
      (r: any) =>
        r.status !== "cancelled" &&
        (!isPic || r.locationId === outletId) &&
        inPeriod(r.createdAt) &&
        (location === "all" || r.locationId === location) &&
        (product === "all" || r.variantId === product),
    );
  const totalReceipts = receipts.reduce((a: number, r: any) => a + (r.quantity * (r.unitCost || 0)), 0);
  const sold: Record<string, number> = {};
  sales.forEach((s: any) =>
    s.items.forEach(
      (i: any) => (sold[i.variantId] = (sold[i.variantId] || 0) + i.quantity),
    ),
  );
  const topVariants = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const averageTransaction = sales.length ? total / sales.length : 0;
  const receiptDocuments = new Set(receipts.map((item: any) => item.receiptCode || item.id)).size;
  const salesAudit = sales.map((sale: any) => {
    const original = data.sales.find((item: any) => item.id === sale.id) || sale;
    const lineSubtotal = original.items.reduce((sum: number, item: any) => sum + Number(item.subtotal || 0), 0);
    const missingCostLines = original.items.filter((item: any) => !Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) < 0).length;
    const subtotalDifference = Math.abs(Number(original.total || 0) - lineSubtotal);
    return { id: sale.id, createdAt: sale.createdAt, subtotalDifference, missingCostLines, reconciled: subtotalDifference <= 1, hppComplete: missingCostLines === 0 };
  });
  const unreconciledSales = salesAudit.filter((item: any) => !item.reconciled);
  const incompleteHppSales = salesAudit.filter((item: any) => !item.hppComplete);
  const revenueQuality = product !== "all" && unreconciledSales.length ? "estimate" : "verified";
  const hppQuality = incompleteHppSales.length || (total > 0 && cogs > total * 2) ? "review" : "verified";
  const profitQuality = revenueQuality === "verified" && hppQuality === "verified" ? "verified" : "review";
  const receiptQuality = receipts.every((item: any) => Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.unitCost)) && item.quantity > 0 && item.unitCost >= 0) ? "verified" : "review";
  const qualityLabel = (quality: "verified" | "estimate" | "review") => quality === "verified" ? "Terverifikasi" : quality === "estimate" ? "Estimasi" : "Perlu diperiksa";
  const relevantBalances = visibleBalances.filter((balance: any) => (location === "all" || balance.locationId === location) && (product === "all" || balance.variantId === product));
  const stockValue = relevantBalances.reduce((sum: number, balance: any) => sum + balance.quantity * Number(variants[balance.variantId]?.cost || 0), 0);
  const retailValue = relevantBalances.reduce((sum: number, balance: any) => sum + balance.quantity * Number(variants[balance.variantId]?.price || 0), 0);
  const emptyCount = relevantBalances.filter((balance: any) => balance.quantity === 0).length;
  const lowCount = relevantBalances.filter((balance: any) => balance.quantity > 0 && balance.quantity < minimumFor(variants[balance.variantId], balance.locationId)).length;
  const returns = (data.returns || []).filter((item: any) => item.status !== "cancelled" && inPeriod(item.createdAt) && (!isPic || item.locationId === outletId) && (location === "all" || item.locationId === location) && (product === "all" || item.variantId === product));
  const returnQuantity = returns.reduce((sum: number, item: any) => sum + item.quantity, 0);
  const transfers = (data.transfers || []).filter((item: any) => item.status !== "cancelled" && inPeriod(item.createdAt) && (location === "all" || item.fromId === location || item.toId === location) && (product === "all" || item.variantId === product));
  const pendingTransfers = transfers.filter((item: any) => item.status === "sent").length;
  const transferDocuments = new Set(transfers.map((item: any) => item.transferCode || item.id)).size;
  const stockCounts = (data.stockCounts || []).filter((item: any) => item.status !== "cancelled" && inPeriod(item.createdAt) && (!isPic || item.locationId === outletId) && (location === "all" || item.locationId === location) && (product === "all" || item.variantId === product));
  const stockDifference = stockCounts.reduce((sum: number, item: any) => sum + item.difference, 0);
  const oldestReceipt = [...receipts].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const stockout = Object.entries(variants)
      .filter(([id]) => product === "all" || id === product)
      .map(([id, v]: any) => {
        const balance = relevantBalances
            .filter((b: any) => b.variantId === id)
            .reduce((a: number, b: any) => a + b.quantity, 0),
          daily =
            (sold[id] || 0) /
            Math.max(
              1,
              periodDays || 90,
            );
        return {
          ...v,
          id,
          balance,
          days: daily > 0 ? Math.ceil(balance / daily) : null,
        };
      })
      .filter((x: any) => x.balance > 0)
      .sort((a: any, b: any) => (a.days ?? 99999) - (b.days ?? 99999))
      .slice(0, 5);
  const trendDays = periodDays || 30;
  const trendStartKey = periodDays ? dateFrom : shiftDateKey(todayKey, -(trendDays - 1));
  const trend = Array.from({ length: trendDays }, (_, index) => {
    const key = shiftDateKey(trendStartKey, index);
    return { key, label: new Date(`${key}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" }), Omzet: 0, HPP: 0 };
  });
  const trendMap = Object.fromEntries(trend.map((item, index) => [item.key, index]));
  sales.forEach((sale: any) => {
    const index = trendMap[jakartaDateKey(sale.createdAt)];
    if (index === undefined) return;
    trend[index].Omzet += sale.reportTotal;
    trend[index].HPP += sale.items.reduce((sum: number, item: any) => sum + item.quantity * Number(item.unitCost || variants[item.variantId]?.cost || 0), 0);
  });
  const download = async () => {
    // Prepare Sales Data - Detailed per item
    const salesData: any[] = [];
    sales.forEach((s: any) => {
      s.items.forEach((item: any) => {
        salesData.push([
          new Date(s.createdAt).toLocaleString("id-ID"),
          s.id.substring(0, 8).toUpperCase(), // Receipt No (short ID)
          locations[s.locationId]?.name || '-',
          s.channel || 'offline',
          s.cashierName || '-',
          variants[item.variantId]?.productName || '-',
          variants[item.variantId]?.name || '-',
          item.quantity,
          item.price || (item.quantity ? item.subtotal / item.quantity : 0),
          item.subtotal || 0,
          s.payment || '-',
          "Selesai"
        ]);
      });
    });

    // Prepare Receipts Data (Stok Masuk)
    const receiptsData: any[] = [];
    receipts.forEach((r: any) => {
      receiptsData.push([
        new Date(r.createdAt).toLocaleString("id-ID"),
        locations[r.locationId]?.name || '-',
        r.sourceType === "production" ? "Produksi Internal" : r.supplierName || "Supplier",
        variants[r.variantId]?.productName || '-',
        variants[r.variantId]?.name || '-',
        r.quantity,
        r.unitCost || 0,
        r.quantity * (r.unitCost || 0),
        r.note || '-',
        "Selesai"
      ]);
    });

    const summaryData = [
      ["Periode", reportRangeLabel],
      ["Lokasi", location === "all" ? "Semua lokasi" : locations[location]?.name || "-"],
      ["Produk / varian", product === "all" ? "Semua produk" : `${variants[product]?.productName || "-"} · ${variants[product]?.name || "-"}`],
      ["Kanal penjualan", channel === "all" ? "Semua kanal" : channel],
      ["Omzet", total], ["HPP", cogs], ["Estimasi laba kotor", grossProfit], ["Margin kotor", `${grossMargin.toFixed(1)}%`],
      ["Jumlah transaksi", sales.length], ["Barang terjual", soldUnits], ["Rata-rata transaksi", averageTransaction],
      ["Nilai pembelian stok", totalReceipts], ["Nilai stok saat ini", stockValue], ["Potensi nilai jual stok", retailValue],
      ["Varian menipis", lowCount], ["Varian habis", emptyCount], ["Jumlah retur", returns.length], ["Barang diretur", returnQuantity],
      ["Dokumen transfer", transferDocuments], ["Transfer dalam perjalanan", pendingTransfers], ["Selisih opname", stockDifference],
    ];
    await downloadExcel(`Laporan_Menengs_${dateFrom || "awal"}_${dateTo || "sekarang"}`, [
      {
        name: "Ringkasan",
        columns: [{ header: "Metrik", key: "metrik", width: 30 }, { header: "Nilai", key: "nilai", width: 24 }],
        data: summaryData,
      },
      {
        name: "Audit Metrik",
        columns: [
          { header: "Metrik", key: "metrik", width: 24 }, { header: "Sumber Data", key: "sumber", width: 34 },
          { header: "Rumus", key: "rumus", width: 44 }, { header: "Status", key: "status", width: 20 },
          { header: "Catatan", key: "catatan", width: 48 },
        ],
        data: [
          ["Omzet", "Transaksi penjualan selesai", "Total transaksi / alokasi subtotal saat varian difilter", qualityLabel(revenueQuality), `${unreconciledSales.length} transaksi tidak rekonsiliasi`],
          ["HPP", "Snapshot modal baris penjualan", "Jumlah × unitCost saat transaksi", qualityLabel(hppQuality), `${incompleteHppSales.length} transaksi tanpa HPP lengkap`],
          ["Laba kotor", "Omzet dan HPP", "Omzet − HPP", qualityLabel(profitQuality), "Belum termasuk biaya operasional"],
          ["Nilai pembelian", "Dokumen stok masuk", "Jumlah × modal penerimaan", qualityLabel(receiptQuality), `${receipts.length} baris penerimaan`],
          ["Nilai stok", "Saldo dan modal master", "Saldo × modal terbaru", "Estimasi", "Belum menggunakan FIFO/batch"],
          ["Perkiraan stok habis", "Saldo dan penjualan", "Saldo ÷ rata-rata harian", "Estimasi", "Bukan prediksi kedaluwarsa"],
        ],
      },
      {
        name: "Anomali Penjualan",
        columns: [
          { header: "Tanggal", key: "tanggal", width: 20 }, { header: "ID Transaksi", key: "id", width: 24 },
          { header: "Selisih Total", key: "selisih", width: 18 }, { header: "Baris HPP Kosong", key: "hpp", width: 18 },
          { header: "Status Rekonsiliasi", key: "status", width: 22 },
        ],
        data: salesAudit.filter((item: any) => !item.reconciled || !item.hppComplete).map((item: any) => [new Date(item.createdAt).toLocaleString("id-ID"), item.id, item.subtotalDifference, item.missingCostLines, item.reconciled && item.hppComplete ? "Sesuai" : "Perlu diperiksa"]),
      },
      {
        name: "Penjualan Detail",
        columns: [
          { header: "Tanggal", key: "tanggal", width: 20 },
          { header: "No. Struk", key: "receipt", width: 15 },
          { header: "Outlet", key: "outlet", width: 20 },
          { header: "Kanal", key: "kanal", width: 12 },
          { header: "Kasir", key: "kasir", width: 15 },
          { header: "Produk", key: "produk", width: 25 },
          { header: "Varian", key: "varian", width: 15 },
          { header: "Jumlah", key: "jumlah", width: 10 },
          { header: "Harga Satuan", key: "hargasatuan", width: 15 },
          { header: "Subtotal", key: "subtotal", width: 15 },
          { header: "Pembayaran", key: "pembayaran", width: 15 },
          { header: "Status", key: "status", width: 12 }
        ],
        data: salesData
      },
      {
        name: "Stok Masuk",
        columns: [
          { header: "Tanggal", key: "tanggal", width: 20 },
          { header: "Lokasi", key: "lokasi", width: 20 },
          { header: "Sumber", key: "sumber", width: 20 },
          { header: "Produk", key: "produk", width: 25 },
          { header: "Varian", key: "varian", width: 15 },
          { header: "Jumlah Masuk", key: "jumlah", width: 15 },
          { header: "Harga Beli / Modal", key: "harga", width: 20 },
          { header: "Total Nilai", key: "totalnilai", width: 20 },
          { header: "Catatan", key: "catatan", width: 25 },
          { header: "Status", key: "status", width: 12 }
        ],
        data: receiptsData
      },
      {
        name: "Kondisi Stok",
        columns: [
          { header: "Lokasi", key: "lokasi", width: 22 }, { header: "Produk", key: "produk", width: 24 },
          { header: "Varian", key: "varian", width: 18 }, { header: "Saldo", key: "saldo", width: 12 },
          { header: "Satuan", key: "satuan", width: 12 }, { header: "Minimum", key: "minimum", width: 12 },
          { header: "Nilai Modal", key: "modal", width: 18 }, { header: "Potensi Jual", key: "jual", width: 18 },
          { header: "Status", key: "status", width: 12 },
        ],
        data: relevantBalances.map((balance: any) => {
          const variant = variants[balance.variantId], minimum = minimumFor(variant, balance.locationId);
          return [locations[balance.locationId]?.name || "-", variant?.productName || "-", variant?.name || "-", balance.quantity, variant?.unit || "unit", minimum, balance.quantity * Number(variant?.cost || 0), balance.quantity * Number(variant?.price || 0), balance.quantity === 0 ? "Habis" : balance.quantity < minimum ? "Menipis" : "Aman"];
        }),
      },
      {
        name: "Retur",
        columns: [
          { header: "Tanggal", key: "tanggal", width: 20 }, { header: "Jenis", key: "jenis", width: 20 },
          { header: "Lokasi", key: "lokasi", width: 22 }, { header: "Produk", key: "produk", width: 24 },
          { header: "Varian", key: "varian", width: 18 }, { header: "Jumlah", key: "jumlah", width: 12 },
          { header: "Alasan", key: "alasan", width: 30 }, { header: "Bukti", key: "bukti", width: 28 },
        ],
        data: returns.map((item: any) => [new Date(item.createdAt).toLocaleString("id-ID"), item.type === "customer" ? "Dari pelanggan" : "Ke supplier", locations[item.locationId]?.name || "-", variants[item.variantId]?.productName || "-", variants[item.variantId]?.name || "-", item.quantity, item.reason, item.proofUrl || "-"]),
      }
    ]);
    
    notify("Laporan Excel berhasil diunduh.");
  };

  const downloadPDF = async () => {
    try {
      notify("Mempersiapkan PDF, mohon tunggu...");
      const element = document.getElementById("report-content");
      if (!element) return notify("Konten laporan tidak ditemukan");
      
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      
      await document.fonts?.ready;
      const sections = Array.from(element.querySelectorAll<HTMLElement>("[data-pdf-section]"));
      if (!sections.length) return notify("Bagian laporan tidak ditemukan");

      const pdf = new jsPDF("l", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 12;
      const contentTop = 25;
      const contentBottom = 13;
      const contentWidth = pageWidth - marginX * 2;
      const contentHeight = pageHeight - contentTop - contentBottom;
      let cursorY = contentTop;
      let pageNumber = 1;

      const drawPageFrame = () => {
        pdf.setFillColor(7, 88, 117);
        pdf.rect(0, 0, pageWidth, 16, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text("MENENGS · LAPORAN USAHA", marginX, 10.5);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(reportRangeLabel, pageWidth - marginX, 10.5, { align: "right" });
        pdf.setTextColor(94, 117, 135);
        pdf.text(`Halaman ${pageNumber}`, pageWidth - marginX, pageHeight - 5, { align: "right" });
      };

      drawPageFrame();
      for (const section of sections) {
        const canvas = await html2canvas(section, {
          scale: 1.7,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: Math.max(document.documentElement.clientWidth, 1440),
          onclone: (clonedDocument) => {
            clonedDocument.querySelectorAll(".period-popover").forEach((node) => node.remove());
          },
        });
        const naturalHeight = (canvas.height * contentWidth) / canvas.width;
        const renderHeight = Math.min(naturalHeight, contentHeight);
        const renderWidth = naturalHeight > contentHeight
          ? (canvas.width * renderHeight) / canvas.height
          : contentWidth;

        if (cursorY > contentTop && cursorY + renderHeight > pageHeight - contentBottom) {
          pdf.addPage();
          pageNumber += 1;
          cursorY = contentTop;
          drawPageFrame();
        }

        const x = marginX + (contentWidth - renderWidth) / 2;
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", x, cursorY, renderWidth, renderHeight, undefined, "FAST");
        cursorY += renderHeight + 4;
      }
      
      pdf.save(`Laporan_Menengs_${dateFrom || "awal"}_${dateTo || "sekarang"}.pdf`);
      notify("Laporan PDF berhasil diunduh.");
    } catch (err) {
      console.error(err);
      notify("Gagal mengunduh PDF");
    }
  };

  return (
    <PageBlock
      title="Laporan & analisis stok"
      desc="Saring per periode, outlet, produk, dan kanal."
      action="Unduh Excel"
      onAction={download}
      secondaryAction="Unduh PDF"
      onSecondaryAction={downloadPDF}
    >
      <div id="report-content" style={{ padding: '16px', backgroundColor: '#fff', borderRadius: '8px' }}>

      <div data-pdf-section><DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} initialMode="last30" className="report-period-picker" />
      <div className="filters report-filters">
        <label className="report-filter-field"><span>LOKASI</span><select aria-label="Lokasi laporan" value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="all">Semua outlet</option>
          {visibleLocations.map((l: any) => (
            <option value={l.id} key={l.id}>
              {l.name}
            </option>
          ))}
        </select></label>
        <label className="report-filter-field"><span>PRODUK / VARIAN</span><select aria-label="Produk atau varian laporan" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="all">Semua produk</option>
          {Object.entries(variants).map(([id, v]: any) => (
            <option value={id} key={id}>
              {v.productName} · {v.name}
            </option>
          ))}
        </select></label>
        <label className="report-filter-field"><span>KANAL PENJUALAN</span><select aria-label="Kanal penjualan laporan" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">Semua kanal</option>
          <option>offline</option>
          <option>online</option>
          <option>reseller</option>
        </select></label>
      </div></div>
      <section className="report-overview" data-pdf-section>
        <div className="report-section-heading"><div><small>RINGKASAN USAHA</small><h3>Kinerja sesuai filter</h3></div><span>{reportRangeLabel}</span></div>
        <div className="report-kpi-grid">
          <article className="report-kpi highlight"><span>Omzet penjualan</span><i className={`metric-quality ${revenueQuality}`}>{qualityLabel(revenueQuality)}</i><b>{money(total)}</b><small>{sales.length} transaksi · rata-rata {money(averageTransaction)}</small>{periodDays > 0 && <em className={revenueChange !== null && revenueChange < 0 ? "down" : "up"}>{revenueChange === null ? "Belum ada pembanding" : `${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(1)}% dari periode sebelumnya`}</em>}</article>
          <article className="report-kpi"><span>HPP barang terjual</span><i className={`metric-quality ${hppQuality}`}>{qualityLabel(hppQuality)}</i><b>{money(cogs)}</b><small>Snapshot modal pada {soldUnits.toLocaleString("id-ID")} barang terjual</small></article>
          <article className={`report-kpi profit ${grossProfit < 0 ? "loss" : ""}`}><span>Estimasi laba kotor</span><i className={`metric-quality ${profitQuality}`}>{qualityLabel(profitQuality)}</i><b>{money(grossProfit)}</b><small>Omzet dikurangi HPP</small><em>{grossMargin.toFixed(1)}% margin kotor</em></article>
          <article className="report-kpi"><span>Nilai pembelian stok</span><i className={`metric-quality ${receiptQuality}`}>{qualityLabel(receiptQuality)}</i><b>{money(totalReceipts)}</b><small>{receiptDocuments} dokumen · {receipts.length} baris varian</small></article>
        </div>
        <p className={`report-definition ${cogs > total * 2 && total > 0 ? "report-warning" : ""}`}><b>{cogs > total * 2 && total > 0 ? "Periksa data harga modal:" : "Catatan:"}</b> {cogs > total * 2 && total > 0 ? "HPP jauh lebih besar daripada omzet. Pastikan harga modal varian dan transaksi historis sudah benar." : "Laba kotor belum dikurangi gaji, sewa, listrik, biaya marketplace, dan biaya operasional lainnya."}</p>
      </section>

      <section className="report-panel report-audit-panel" data-pdf-section>
        <div className="report-section-heading"><div><small>JEJAK AUDIT & KUALITAS DATA</small><h3>Dasar perhitungan laporan</h3></div><span>Diperbarui {new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB</span></div>
        <div className="report-audit-summary">
          <article><b>{sales.length - unreconciledSales.length}/{sales.length}</b><span>Transaksi penjualan cocok dengan detail baris</span></article>
          <article><b>{sales.length - incompleteHppSales.length}/{sales.length}</b><span>Transaksi memiliki snapshot HPP lengkap</span></article>
          <article><b>{receipts.length}</b><span>Baris penerimaan menjadi sumber nilai pembelian</span></article>
          <article><b>{data.movements.length}</b><span>Jejak mutasi membentuk saldo stok sistem</span></article>
        </div>
        <div className="table-wrap report-formula-table"><table><thead><tr><th>Metrik</th><th>Sumber</th><th>Rumus</th><th>Status</th></tr></thead><tbody>
          <tr><td><b>Omzet</b></td><td>Transaksi penjualan selesai</td><td>Total transaksi; filter varian memakai proporsi subtotal baris</td><td><span className={`metric-quality ${revenueQuality}`}>{qualityLabel(revenueQuality)}</span></td></tr>
          <tr><td><b>HPP</b></td><td>Snapshot unitCost pada baris penjualan</td><td>Jumlah terjual × modal per unit saat transaksi</td><td><span className={`metric-quality ${hppQuality}`}>{qualityLabel(hppQuality)}</span></td></tr>
          <tr><td><b>Laba kotor</b></td><td>Omzet dan HPP</td><td>Omzet − HPP; belum termasuk biaya operasional</td><td><span className={`metric-quality ${profitQuality}`}>{qualityLabel(profitQuality)}</span></td></tr>
          <tr><td><b>Nilai pembelian stok</b></td><td>Dokumen stok masuk</td><td>Jumlah diterima × harga modal penerimaan</td><td><span className={`metric-quality ${receiptQuality}`}>{qualityLabel(receiptQuality)}</span></td></tr>
          <tr><td><b>Nilai stok saat ini</b></td><td>Saldo sistem dan modal master terbaru</td><td>Saldo saat ini × modal master; belum FIFO/batch</td><td><span className="metric-quality estimate">Estimasi</span></td></tr>
          <tr><td><b>Perkiraan stok habis</b></td><td>Saldo dan rata-rata penjualan periode</td><td>Saldo ÷ rata-rata penjualan harian</td><td><span className="metric-quality estimate">Estimasi</span></td></tr>
          <tr><td><b>Retur, transfer, opname</b></td><td>Dokumen operasional tersimpan</td><td>Jumlah dokumen/baris sesuai filter</td><td><span className="metric-quality verified">Terverifikasi sistem</span></td></tr>
        </tbody></table></div>
        {(unreconciledSales.length > 0 || incompleteHppSales.length > 0 || hppQuality === "review") && <div className="report-audit-alert"><AlertTriangle /><div><b>Data yang perlu ditindaklanjuti</b><p>{unreconciledSales.length} transaksi memiliki selisih antara total struk dan subtotal baris. {incompleteHppSales.length} transaksi tidak memiliki snapshot HPP lengkap.{hppQuality === "review" && total > 0 && cogs > total * 2 ? " Rasio HPP terhadap omzet juga berada di luar kewajaran dan memerlukan pemeriksaan harga modal." : ""}</p></div></div>}
      </section>

      <section className="report-panel" data-pdf-section>
        <div className="report-section-heading"><div><small>TREN PENJUALAN</small><h3>Omzet dibandingkan HPP</h3></div><span>{trendDays} hari</span></div>
        <div className="report-chart"><ResponsiveContainer width="100%" height={260}><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke="#e5edf1" /><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} /><RechartsTooltip formatter={(value: any) => money(Number(value))} /><Legend /><Line type="monotone" dataKey="Omzet" stroke="#079bc3" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="HPP" stroke="#f59e0b" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
      </section>

      <section className="report-two-columns" data-pdf-section>
        <div className="report-panel">
          <div className="report-section-heading"><div><small>PERFORMA PRODUK</small><h3>Varian terlaris</h3></div></div>
          <div className="report-ranking">{topVariants.length ? topVariants.map(([id, amount], index) => <div key={id}><i>{index + 1}</i><span><b>{variants[id]?.productName} · {variants[id]?.name}</b><small>{qty(amount as number, variants[id]?.unit)}</small></span></div>) : <p className="report-empty">Belum ada penjualan sesuai filter.</p>}</div>
        </div>
        <div className="report-panel">
          <div className="report-section-heading"><div><small>KESEHATAN PERSEDIAAN</small><h3>Nilai stok saat ini</h3></div><i className="metric-quality estimate">Estimasi</i></div>
          <div className="report-stock-values"><p><span>Nilai modal persediaan</span><b>{money(stockValue)}</b></p><p><span>Potensi nilai jual</span><b>{money(retailValue)}</b></p><p><span>Varian menipis</span><b className={lowCount ? "stock-low-value" : "positive"}>{lowCount}</b></p><p><span>Varian habis</span><b className={emptyCount ? "negative" : "positive"}>{emptyCount}</b></p></div>
        </div>
      </section>

      <section className="report-two-columns" data-pdf-section>
        <div className="report-panel">
          <div className="report-section-heading"><div><small>PERKIRAAN PERSEDIAAN</small><h3>Stok yang paling cepat habis</h3></div><i className="metric-quality estimate">Estimasi</i></div>
          <div className="location-list report-stockout">{stockout.length ? stockout.map((x: any) => <div key={x.id}><div><b>{x.productName} · {x.name}</b><span>Saldo {qty(x.balance, x.unit)}</span></div><strong>{x.days ? `± ${x.days} hari` : "Belum cukup data penjualan"}</strong></div>) : <p className="report-empty">Tidak ada saldo stok sesuai filter.</p>}</div>
          <p className="report-definition">Estimasi menggunakan rata-rata penjualan pada periode yang dipilih, bukan tanggal kedaluwarsa barang.</p>
        </div>
        <div className="report-panel">
          <div className="report-section-heading"><div><small>KONTROL OPERASIONAL</small><h3>Aktivitas yang perlu diperhatikan</h3></div><i className="metric-quality verified">Terverifikasi sistem</i></div>
          <div className="report-operations"><p><span>Retur tercatat</span><b>{returns.length} catatan · {returnQuantity.toLocaleString("id-ID")} barang</b></p><p><span>Transfer stok</span><b>{transferDocuments} dokumen</b></p><p><span>Dalam perjalanan</span><b className={pendingTransfers ? "stock-low-value" : "positive"}>{pendingTransfers} baris varian</b></p><p><span>Selisih hasil opname</span><b className={stockDifference < 0 ? "negative" : stockDifference > 0 ? "stock-low-value" : "positive"}>{stockDifference > 0 ? "+" : ""}{stockDifference.toLocaleString("id-ID")}</b></p><p><span>Penerimaan paling lama di periode ini</span><b>{oldestReceipt ? `${variants[oldestReceipt.variantId]?.productName} · ${variants[oldestReceipt.variantId]?.name}` : "Tidak ada"}</b></p></div>
        </div>
      </section>
      </div>
    </PageBlock>
  );
}
const PageBlock = ({ title, desc, action, onAction, secondaryAction, onSecondaryAction, children }: any) => (
  <>
    <section className="page-head">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {secondaryAction && onSecondaryAction && (
          <button className="secondary" onClick={onSecondaryAction}>
            {secondaryAction}
          </button>
        )}
        {action && onAction && (
          <button className="primary" onClick={onAction}>
            <Plus />
            {action}
          </button>
        )}
      </div>
    </section>
    {children}
  </>
);
const Empty = ({ text }: any) => (
  <tr>
    <td colSpan={9}>
      <div className="empty">
        <PackagePlus />
        <b>{text}</b>
        <span>Gunakan tombol di kanan atas untuk mulai.</span>
      </div>
    </td>
  </tr>
);

const Modal = ({ title, desc, close, children, className = "" }: any) => (
  <div className="modal-backdrop">
    <div className={`modal ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{desc}</p>
        </div>
        <button className="icon-btn" aria-label="Tutup dialog" onClick={close}>
          <X />
        </button>
      </header>
      {children}
    </div>
  </div>
);
const AppSelect = ({ value, onChange, children, disabled = false, placeholder = "Pilih opsi", className = "" }: any) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); setQuery(""); }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); setQuery(""); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);
  const options = Children.toArray(children).filter(isValidElement).map((option: any) => ({ value: String(option.props.value ?? option.props.children), label: option.props.children, meta: option.props["data-meta"], disabled: option.props.disabled }));
  const current = options.find((option: any) => option.value === String(value));
  const visibleOptions = options.filter((option: any) => String(option.label).toLowerCase().includes(query.toLowerCase()));
  return <div ref={rootRef} className={`app-select ${className}`}>
    <button type="button" className="app-select-trigger" disabled={disabled} onClick={() => { setOpen((state) => !state); setQuery(""); }} aria-expanded={open}><span>{current?.label || placeholder}</span><ChevronDown size={18} /></button>
    {open && <div className="app-select-menu">{options.length > 5 && <label className="app-select-search"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari opsi" /></label>}{visibleOptions.length ? visibleOptions.map((option: any) => <button key={option.value} type="button" disabled={option.disabled} className={option.value === String(value) ? "selected" : ""} onClick={() => { onChange({ target: { value: option.value } }); setOpen(false); setQuery(""); }}><span>{option.label}</span>{option.meta && <small>{option.meta}</small>}{option.value === String(value) && <Check size={16} />}</button>) : <p className="app-select-empty">Opsi tidak ditemukan.</p>}</div>}
  </div>;
};
function ProductExportModal({ data, close, notify }: any) {
  const columns = [
    { key: "productName", header: "Nama Produk", width: 28 },
    { key: "category", header: "Kategori", width: 18 },
    { key: "variantName", header: "Nama Varian", width: 24 },
    { key: "sku", header: "SKU", width: 20 },
    { key: "barcode", header: "Barcode EAN-13", width: 20 },
    { key: "unit", header: "Satuan", width: 12 },
    { key: "cost", header: "Harga Modal", width: 16 },
    { key: "price", header: "Harga Jual", width: 16 },
    { key: "resellerPrice", header: "Harga Reseller", width: 18 },
    { key: "minStock", header: "Minimum Stok", width: 16 },
    { key: "totalStock", header: "Total Stok", width: 14 },
    { key: "productStatus", header: "Status Produk", width: 16 },
    { key: "variantStatus", header: "Status Varian", width: 16 },
    { key: "imageUrl", header: "URL Gambar", width: 36 },
  ];
  const [selected, setSelected] = useState(() => new Set(columns.map(column => column.key)));
  const toggle = (key: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const exportRows = data.products.flatMap((product: any) => product.variants.map((variant: any) => ({
    productName: product.name,
    category: product.category || "-",
    variantName: variant.name,
    sku: variant.sku || "-",
    barcode: variant.barcode || "-",
    unit: product.unit || "Pcs",
    cost: Number(variant.cost || 0),
    price: Number(variant.price || 0),
    resellerPrice: Number(variant.resellerPrice || 0),
    minStock: Number(variant.minStock || 0),
    totalStock: data.balances.filter((balance: any) => balance.variantId === variant.id).reduce((total: number, balance: any) => total + Number(balance.quantity || 0), 0),
    productStatus: product.active === false ? "Nonaktif" : "Aktif",
    variantStatus: variant.active === false ? "Nonaktif" : "Aktif",
    imageUrl: product.imageUrl || product.image || "-",
  })));
  const exportData = async () => {
    const selectedColumns = columns.filter(column => selected.has(column.key));
    if (!selectedColumns.length) return;
    await downloadExcel(`Data_Produk_${new Date().toISOString().slice(0, 10)}`, [{ name: "Produk & Varian", columns: selectedColumns, data: exportRows }]);
    notify(`${exportRows.length} varian produk berhasil diunduh.`);
    close();
  };
  return <Modal title="Unduh data produk" desc="Pilih informasi yang ingin dimasukkan ke file Excel. Setiap baris mewakili satu varian produk." close={close}>
    <div className="product-export-modal">
      <div className="product-export-toolbar">
        <span>{selected.size} dari {columns.length} kolom dipilih</span>
        <button type="button" className="link-btn" onClick={() => setSelected(current => current.size === columns.length ? new Set() : new Set(columns.map(column => column.key)))}>{selected.size === columns.length ? "Lepas semua" : "Pilih semua"}</button>
      </div>
      <div className="product-export-columns">
        {columns.map(column => <label key={column.key}>
          <input type="checkbox" checked={selected.has(column.key)} onChange={() => toggle(column.key)} />
          <span>{column.header}</span>
        </label>)}
      </div>
      <p className="product-export-summary">Siap mengunduh <b>{exportRows.length} varian</b> dari <b>{data.products.length} produk</b>.</p>
      <footer className="modal-actions">
        <button type="button" className="secondary" onClick={close}>Batal</button>
        <button type="button" className="primary" disabled={!selected.size || !exportRows.length} onClick={exportData}><Download /> Unduh Excel</button>
      </footer>
    </div>
  </Modal>;
}
function ProductModal({
  close,
  save,
  uploadImage,
  product,
  onDelete,
  locations
}: any) {
  const editing = Boolean(product),
    [name, setName] = useState(product?.name || ""),
    [category, setCategory] = useState(product?.category || "Umum"),
    [unit, setUnit] = useState<StockUnit>(product?.unit || "pcs"),
    [active, setActive] = useState(product?.active ?? true),
    [file, setFile] = useState<File | null>(null),
    [imagePreview, setImagePreview] = useState(product?.imageUrl || product?.image || ""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);

  const [variants, setVariants] = useState<any[]>(
    product?.variants || [
      { id: newId("v"), name: "", sku: "", cost: 0, price: 0, resellerPrice: 0, minStock: 0, active: true, initialStock: 0 }
    ]
  );
  
  const [includeInitialStock, setIncludeInitialStock] = useState(false);
  const [initialStockLocationId, setInitialStockLocationId] = useState(locations?.length === 1 ? locations[0].id : "");

  const [bulkCost, setBulkCost] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkReseller, setBulkReseller] = useState("");
  const [bulkMinStock, setBulkMinStock] = useState("");

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const applyBulk = () => {
    setVariants(variants.map(v => ({
      ...v,
      cost: bulkCost !== "" ? Number(bulkCost) : v.cost,
      price: bulkPrice !== "" ? Number(bulkPrice) : v.price,
      resellerPrice: bulkReseller !== "" ? Number(bulkReseller) : v.resellerPrice,
      minStock: bulkMinStock !== "" ? Number(bulkMinStock) : v.minStock
    })));
    setBulkCost("");
    setBulkPrice("");
    setBulkReseller("");
    setBulkMinStock("");
  };

  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setVariants(newVariants);
  };
  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };
  const addVariant = () => {
    setVariants([...variants, { id: newId("v"), name: "", sku: "", cost: 0, price: 0, resellerPrice: 0, minStock: 0, active: true, initialStock: 0 }]);
  };

  return (
    <Modal
      title={editing ? "Edit produk & varian" : "Tambah produk"}
      desc="Kelola informasi produk dan variannya."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (variants.length === 0) return setError("Minimal harus ada 1 varian");
          if (variants.some(v => !v.name.trim())) return setError("Nama varian tidak boleh kosong");
          if (variants.some(v => !Number.isFinite(Number(v.cost)) || Number(v.cost) < 0)) return setError("Harga modal varian tidak valid");
          if (variants.some(v => !Number.isFinite(Number(v.price)) || Number(v.price) <= 0)) return setError("Harga jual setiap varian harus lebih dari nol");
          setError("");
          setLoading(true);
          try {
            const uploadedUrl = file ? await uploadImage(file) : undefined;
            const updatedProduct: Product = {
              id: product?.id || newId("prod"),
              name,
              category,
              unit,
              active,
              imageUrl: uploadedUrl || product?.imageUrl,
              variants: variants.map((v, index) => {
                const { initialStock, ...rest } = v;
                void initialStock;
                return {
                  ...rest,
                  sku: v.sku || `VST-${v.name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-3)}${index}`,
                };
              }),
            };
            const initialStocks = (!editing && includeInitialStock) ? variants.filter(v => v.initialStock > 0).map(v => ({
              variantId: v.id,
              locationId: initialStockLocationId,
              quantity: v.initialStock,
              cost: v.cost
            })) : [];
            await save(updatedProduct, initialStocks);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal menyimpan produk");
            setLoading(false);
          }
        }}
      >
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Informasi Produk</h3>
          <Field label="Gambar produk (opsional)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={(e) => {
                const nextFile = e.target.files?.[0] || null;
                setFile(nextFile);
              }}
            />
            {imagePreview && <img className="product-image-preview" src={imagePreview} alt="Pratinjau gambar produk" />}
            <span className="upload-hint" style={{ marginTop: '10px' }}>Rekomendasi: Gambar persegi (1:1), ukuran maksimal 2MB, format JPG/PNG/WEBP.</span>
          </Field>
          <div className="form-grid">
            <Field label="Nama produk">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Kaos Polos" />
            </Field>
            <Field label="Kategori">
              <input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Contoh: Fashion" />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Satuan stok">
              <select value={unit} onChange={(e) => setUnit(e.target.value as StockUnit)}>
                <option value="Pcs">Pcs</option>
                <option value="Botol">Botol</option>
                <option value="Cup">Cup</option>
                <option value="Pack">Pack</option>
                <option value="Box">Box</option>
                <option value="Dus">Dus</option>
                <option value="Kg">Kg</option>
                <option value="Gram">Gram</option>
                <option value="Liter">Liter</option>
                <option value="Ml">Ml</option>
              </select>
              <span className="upload-hint" style={{ marginTop: '4px', display: 'block' }}>Sistem belum mendukung konversi otomatis.</span>
            </Field>
            {editing && (
              <label className="toggle-field" style={{ alignSelf: 'end', marginBottom: '8px' }}>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                <span>Produk aktif dijual</span>
              </label>
            )}
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>Isi Cepat (Terapkan ke Semua Varian)</h3>
            <button type="button" onClick={applyBulk} style={{ background: 'var(--green)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Terapkan</button>
          </div>
          <div className="form-grid">
            <Field label="Harga Modal"><input type="number" min="0" value={String(bulkCost)} onChange={(e) => setBulkCost(e.currentTarget.value.replace(/^0+(?=\d)/, ''))} placeholder="Opsional" style={{ background: 'white' }} /></Field>
            <Field label="Harga Jual"><input type="number" min="0" value={String(bulkPrice)} onChange={(e) => setBulkPrice(e.currentTarget.value.replace(/^0+(?=\d)/, ''))} placeholder="Opsional" style={{ background: 'white' }} /></Field>
            <Field label="Harga Reseller"><input type="number" min="0" value={String(bulkReseller)} onChange={(e) => setBulkReseller(e.currentTarget.value.replace(/^0+(?=\d)/, ''))} placeholder="Opsional" style={{ background: 'white' }} /></Field>
            <Field label="Min Stok"><input type="number" min="0" value={String(bulkMinStock)} onChange={(e) => setBulkMinStock(e.currentTarget.value.replace(/^0+(?=\d)/, ''))} placeholder="Opsional" style={{ background: 'white' }} /></Field>
          </div>
        </div>

        {!editing && (
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Stok Awal Produk</h3>
            <label className="toggle-field" style={{ marginBottom: includeInitialStock ? '16px' : '0' }}>
              <input type="checkbox" checked={includeInitialStock} onChange={(e) => setIncludeInitialStock(e.target.checked)} />
              <span style={{ fontWeight: 500 }}>Masukkan stok yang sudah tersedia</span>
            </label>
            {!includeInitialStock && (
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Bagian ini bersifat opsional. Anda juga dapat menambahkan stok melalui menu Stok Masuk setelah produk dibuat.</p>
            )}
            {includeInitialStock && (
              <>
                <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>Stok yang dimasukkan akan tercatat sebagai saldo awal pada riwayat stok.</p>
                <Field label="Lokasi penyimpanan">
                  <select required={includeInitialStock} value={initialStockLocationId} onChange={(e) => setInitialStockLocationId(e.target.value)}>
                    <option value="" disabled>Pilih gudang atau outlet</option>
                    {locations?.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <span className="upload-hint" style={{ marginTop: '4px' }}>Pilih lokasi tempat stok barang saat ini disimpan.</span>
                </Field>
              </>
            )}
          </div>
        )}

        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Daftar Varian</h3>
        {variants.map((v, index) => (
          <div key={v.id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <b style={{ fontSize: '14px' }}>Varian {index + 1}</b>
              {variants.length > 1 && (
                <button type="button" onClick={() => removeVariant(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                  <Trash2 size={14} /> Hapus
                </button>
              )}
            </div>
            <div className="form-grid">
              <Field label="Nama varian">
                <input required value={v.name} onChange={(e) => updateVariant(index, 'name', e.target.value)} placeholder="Contoh: Hitam / L" />
              </Field>
              <Field label="SKU (Otomatis jika kosong)">
                <input value={v.sku} onChange={(e) => updateVariant(index, 'sku', e.target.value)} />
              </Field>
              <Field label="Barcode (scan atau isi manual)">
                <div className="barcode-field">
                  <input value={v.barcode || ""} onChange={(e) => updateVariant(index, "barcode", e.target.value)} placeholder="Barcode akan dibuat otomatis bila kosong" />
                  <BarcodeScanControl label="Scan barcode" onDetected={(value) => { updateVariant(index, "barcode", value); return true; }} />
                  <BarcodeGraphic value={v.barcode} />
                  {v.barcode && <button type="button" className="table-action" onClick={() => printBarcodeLabel(name, v.name, v.barcode)}>Cetak label</button>}
                </div>
              </Field>
              <Field label={`Harga Modal${bulkCost !== '' ? ' (Dilewati)' : ''}`}>
                <input required type="number" min="0" value={v.cost === 0 ? '' : String(v.cost)} onChange={(e) => updateVariant(index, 'cost', Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0)} />
              </Field>
              <Field label={`Harga Jual${bulkPrice !== '' ? ' (Dilewati)' : ''}`}>
                <input required type="number" min="0" value={v.price === 0 ? '' : String(v.price)} onChange={(e) => updateVariant(index, 'price', Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0)} />
              </Field>
              <Field label={`Harga Reseller${bulkReseller !== '' ? ' (Dilewati)' : ''}`}>
                <input type="number" min="0" value={v.resellerPrice === 0 ? '' : String(v.resellerPrice)} onChange={(e) => updateVariant(index, 'resellerPrice', Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0)} />
              </Field>
              <Field label={`Min Stok${bulkMinStock !== '' ? ' (Dilewati)' : ''}`}>
                <input type="number" min="0" value={v.minStock === 0 ? '' : String(v.minStock)} onChange={(e) => updateVariant(index, 'minStock', Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0)} />
              </Field>
              {!editing && includeInitialStock && (
                <Field label="Stok Awal">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="number" min="0" value={v.initialStock === 0 ? '' : String(v.initialStock)} onChange={(e) => updateVariant(index, 'initialStock', Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0)} placeholder="0" style={{ flex: 1 }} />
                    <span style={{ fontSize: '14px', color: '#64748b' }}>{unit}</span>
                  </div>
                  <span className="upload-hint" style={{ marginTop: '4px' }}>Isi jumlah barang yang sudah tersedia.</span>
                </Field>
              )}
            </div>
            {editing && (
              <label className="toggle-field" style={{ marginTop: '12px' }}>
                <input type="checkbox" checked={v.active !== false} onChange={(e) => updateVariant(index, 'active', e.target.checked)} />
                <span>Varian aktif</span>
              </label>
            )}
          </div>
        ))}
        
        <button type="button" className="secondary" onClick={addVariant} style={{ width: '100%', marginBottom: '24px', borderStyle: 'dashed' }}>
          + Tambah Varian Lainnya
        </button>

        {!editing && includeInitialStock && (
           <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Ringkasan stok awal</h4>
              <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#475569' }}>Lokasi: <b>{locations?.find((l:any) => l.id === initialStockLocationId)?.name || '-'}</b></p>
              <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#475569' }}>Jumlah varian: <b>{variants.filter(v => v.initialStock > 0).length} varian</b></p>
              <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#475569' }}>Total stok: <b>{variants.reduce((sum, v) => sum + (Number(v.initialStock) || 0), 0)} {unit}</b></p>
              <p style={{ margin: 0, fontSize: '12px', color: '#0369a1', fontStyle: 'italic' }}>Stok akan langsung tersedia setelah produk berhasil disimpan.</p>
           </div>
        )}

        {error && <div className="login-error">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>Batal</button>
          {onDelete && <button type="button" className="danger-button" onClick={onDelete}><Trash2 size={16} /> Hapus Produk</button>}
          <button className="primary" disabled={loading}>
            <Check />
            {loading ? "Menyimpan..." : "Simpan Produk"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function LocationModal({ close, save, location, onDelete }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const editing=Boolean(location),[name, setName] = useState(location?.name||""),
    [type, setType] = useState<"warehouse" | "outlet">(location?.type||"outlet"),[address,setAddress]=useState(location?.address||""),[active,setActive]=useState(location?.active??true),[isCentralWarehouse,setIsCentralWarehouse]=useState(location?.isCentralWarehouse===true);
  return (
    <Modal
      title={editing?"Edit lokasi usaha":"Tambah lokasi usaha"}
      desc="Stok lokasi ini akan dihitung dan diaudit secara terpisah."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          try {
            await save(name, type, address, active, isCentralWarehouse);
          } catch {
            setIsSaving(false);
          }
        }}
      >
        <Field label="Nama lokasi">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Outlet Pasar Baru"
          />
        </Field>
        <Field label="Alamat lokasi"><textarea value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="Alamat lengkap gudang atau outlet"/></Field>
        {editing&&<label className="toggle-field"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)}/><span>Lokasi aktif dan dapat digunakan untuk transaksi</span></label>}
        <Field label="Jenis lokasi">
          <select
            value={type}
            onChange={(e) => { const next = e.target.value as "warehouse" | "outlet"; setType(next); if (next !== "warehouse") setIsCentralWarehouse(false); }}
          >
            <option value="outlet">Outlet / cabang</option>
            <option value="warehouse">Gudang</option>
          </select>
        </Field>
        {type === "warehouse" && <label className="toggle-field"><input type="checkbox" checked={isCentralWarehouse} onChange={(e)=>setIsCentralWarehouse(e.target.checked)}/><span>Tetapkan sebagai gudang pusat</span></label>}
        <ModalActions close={close} onDelete={onDelete} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function SupplierModal({ supplier, close, save }: any) {
  const editing = Boolean(supplier);
  const [name, setName] = useState(supplier?.name || ""), [phone, setPhone] = useState(supplier?.phone || ""), [address, setAddress] = useState(supplier?.address || ""), [active, setActive] = useState(supplier?.active ?? true), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const submit = async (event:React.FormEvent) => { event.preventDefault(); if (loading || name.trim().length < 2) return; setLoading(true); setError(""); try { await save({ id: supplier?.id || newId("sup"), name: name.trim(), phone: phone.trim() || undefined, address: address.trim() || undefined, active }); } catch (err) { setError(err instanceof Error ? err.message : "Supplier tidak dapat disimpan."); setLoading(false); } };
  return <Modal title={editing ? "Atur supplier" : "Tambah supplier"} desc="Data supplier dipakai untuk menelusuri asal stok masuk dan histori pembelian." close={close}><form onSubmit={submit}><Field label="Nama supplier"><input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: CV Snack Nusantara" /></Field><Field label="Nomor telepon"><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="08xxxxxxxxxx" /></Field><Field label="Alamat"><textarea value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Alamat supplier" /></Field>{editing && <label className="toggle-field"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Supplier aktif dan dapat dipilih saat stok masuk</span></label>}{error && <p className="login-error">{error}</p>}<ModalActions close={close} disabled={loading} /></form></Modal>;
}
const accessRoleLabel = (role:string) => role === "admin" ? "Admin Cabang" : role === "warehouse" ? "Staf Gudang" : role === "cashier" ? "Kasir" : role === "finance" ? "Keuangan" : role === "employee" ? "Karyawan" : role === "pic" ? "PIC Outlet" : "Owner";
function EmployeeModal({ data, employee, initialUserId, close, save, createAccount }: any) {
  const eligibleUsers = data.users.filter((user:any) => user.active && user.role !== "owner" && !(data.employees || []).some((item:any) => item.userId === user.id));
  const editing = Boolean(employee);
  const [useExisting, setUseExisting] = useState(editing || Boolean(initialUserId)), [userId, setUserId] = useState(employee?.userId || initialUserId || eligibleUsers[0]?.id || ""), [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [locationId, setLocationId] = useState(employee?.locationId || ""), [monthlySalary, setMonthlySalary] = useState(String(employee?.monthlySalary ?? 0)), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const linkedAccount = data.users.find((item:any) => item.id === (employee?.userId || userId));
  const staffPosition = accessRoleLabel(linkedAccount?.role || "employee");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (loading) return; setError(""); if (useExisting && !userId) return setError("Pilih akun staf yang ingin dihubungkan."); if (!useExisting && (name.trim().length < 2 || !email.includes("@") || password.length < 8)) return setError("Isi nama, email, dan password minimal 8 karakter."); setLoading(true); try { const account = useExisting ? undefined : await createAccount({ name: name.trim(), email: email.trim(), password, role: "employee" }); await save({ id: employee?.id || newId("emp"), userId: useExisting ? userId : account.id, locationId: locationId || undefined, position: useExisting ? staffPosition : "Karyawan", monthlySalary: Number(monthlySalary) || 0, active: employee?.active ?? true }, account); } catch (err) { setError(err instanceof Error ? err.message : "Karyawan tidak dapat disimpan."); setLoading(false); } };
  return <Modal title={editing ? "Atur data kerja" : "Lengkapi data kerja"} desc="Peran staf mengikuti pengaturan akses. Di sini Owner cukup mengatur lokasi kerja dan gaji." close={close}><form onSubmit={submit}>{!editing && <><label className="toggle-field"><input type="checkbox" checked={useExisting} onChange={(event) => setUseExisting(event.target.checked)} /><span>Hubungkan akun staf yang sudah ada</span></label>{useExisting ? <><Field label="Akun staf"><AppSelect required value={userId} onChange={(event:any) => setUserId(event.target.value)}><option value="" disabled>Pilih akun staf</option>{eligibleUsers.map((item:any) => <option key={item.id} value={item.id} data-meta={accessRoleLabel(item.role)}>{item.name} · {item.email}</option>)}</AppSelect></Field><small className="upload-hint">Peran staf ditentukan dari pengaturan akses dan otomatis digunakan pada data kerja serta penggajian.</small>{eligibleUsers.length === 0 && <small className="upload-hint">Semua akun staf aktif sudah terhubung. Hilangkan centang di atas untuk membuat akun Karyawan baru.</small>}</> : <div className="form-grid"><Field label="Nama karyawan"><input required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Email login"><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field><Field label="Password awal"><input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" /></Field></div>}</>}<Field label="Lokasi kerja"><AppSelect value={locationId} onChange={(event:any) => setLocationId(event.target.value)}><option value="">Belum ditetapkan</option>{data.locations.filter((location:any) => location.active).map((location:any) => <option key={location.id} value={location.id}>{location.name}</option>)}</AppSelect></Field><small className="upload-hint">Tanpa lokasi kerja, staf tetap dapat login sesuai perannya, tetapi tidak dapat melakukan absensi.</small><div className="form-grid"><Field label="Peran staf"><input readOnly className="input-readonly" value={useExisting ? staffPosition : "Karyawan"} /></Field><Field label="Gaji bulanan"><input type="text" inputMode="numeric" pattern="[0-9]*" value={monthlySalary} onChange={(event) => setMonthlySalary(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))} /></Field></div>{error && <p className="login-error">{error}</p>}<ModalActions close={close} disabled={loading} /></form></Modal>;
}
function LoanModal({ data, close, save }: any) {
  const [employeeId, setEmployeeId] = useState(data.employees?.find((item:any) => item.active)?.id || ""), [amount, setAmount] = useState(0), [installmentCount, setInstallmentCount] = useState(1), [loanDate, setLoanDate] = useState(jakartaDateKey()), [note, setNote] = useState("");
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const submit = async (event:React.FormEvent) => { event.preventDefault(); const nominal = Number(amount), tenor = Number(installmentCount); if (!employeeId || nominal <= 0 || tenor < 1 || loading) return; setLoading(true); setError(""); try { await save({ id: newId("loan"), employeeId, loanDate, amount: nominal, installmentCount: tenor, installmentAmount: Math.ceil(nominal / tenor), paidInstallments: 0, note, status: "active" }); } catch (err) { setError(err instanceof Error ? err.message : "Kasbon tidak dapat disimpan."); setLoading(false); } };
  return <Modal title="Catat kasbon" desc="Kasbon dicatat sebagai pengingat owner dan tidak memotong gaji secara otomatis." close={close}><form onSubmit={submit}><Field label="Karyawan"><AppSelect required value={employeeId} onChange={(event:any) => setEmployeeId(event.target.value)}><option value="" disabled>Pilih karyawan</option>{(data.employees || []).filter((employee:any) => employee.active).map((employee:any) => <option key={employee.id} value={employee.id}>{data.users.find((user:any) => user.id === employee.userId)?.name || "Karyawan"}</option>)}</AppSelect></Field><div className="form-grid"><Field label="Tanggal pinjaman"><input type="date" required value={loanDate} onChange={(event) => setLoanDate(event.target.value)} /></Field><Field label="Nominal kasbon"><input type="number" min="1" required value={amount || ""} onChange={(event) => setAmount(Number(event.target.value))} /></Field><Field label="Jumlah cicilan"><input type="number" min="1" required value={installmentCount} onChange={(event) => setInstallmentCount(Number(event.target.value))} /></Field><Field label="Estimasi per cicilan"><input readOnly value={money(Math.ceil((amount || 0) / Math.max(1, installmentCount)))} /></Field></div><Field label="Catatan"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Contoh: kebutuhan pribadi" /></Field>{error && <p className="login-error">{error}</p>}<ModalActions close={close} disabled={loading} /></form></Modal>;
}
function PayrollPaymentModal({ employee, employeeName, close, save, uploadImage }: any) {
  const [file, setFile] = useState<File | null>(null), [note, setNote] = useState(""), [loading, setLoading] = useState(false), [error, setError] = useState("");
  return <Modal title={`Tandai gaji dibayar`} desc="Unggah bukti transfer bila tersedia. Bukti bersifat opsional dan dapat dilihat kembali dari tabel penggajian." close={close}><form onSubmit={async (event) => { event.preventDefault(); if (loading) return; setLoading(true); setError(""); try { const proofUrl = file ? await uploadImage(file) : undefined; await save(proofUrl, note.trim() || undefined); } catch (err) { setError(err instanceof Error ? err.message : "Bukti transfer tidak dapat diunggah."); setLoading(false); } }}><div className="detail-list payroll-payment-summary"><p><span>Karyawan</span><b>{employeeName}</b></p><p><span>Gaji pokok</span><b>{money(employee.monthlySalary)}</b></p></div><Field label="Bukti transfer (opsional)"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setFile(event.target.files?.[0] || null)} /></Field><small className="upload-hint">Unggah gambar JPG, PNG, WebP, HEIC, atau HEIF. Maksimal 5 MB.</small><Field label="Catatan (opsional)"><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Contoh: transfer melalui BCA" /></Field>{error && <p className="login-error">{error}</p>}<footer className="modal-actions"><button type="button" className="secondary" onClick={close} disabled={loading}>Batal</button><button type="submit" className="primary" disabled={loading}>{loading ? "Mengunggah..." : "Simpan pembayaran"}</button></footer></form></Modal>;
}
function UserModal({ data, close, save, user, uploadImage, onDelete }: any) {
  const editing = Boolean(user),
    isOwner = user?.role === "owner",
    [name, setName] = useState(user?.name || ""),
    [email, setEmail] = useState(user?.email || ""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState<"owner" | "pic" | "finance" | "admin" | "warehouse" | "cashier" | "employee">(
      user?.role || "pic",
    ),
    [outletId, setOutletId] = useState(
      user?.outletId ||
        data.locations.find((item: any) => item.type === "outlet")?.id ||
        "",
    ),
    [active, setActive] = useState(user?.active ?? true),
    [file,setFile]=useState<File|null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [showPasswordEdit, setShowPasswordEdit] = useState(false),
    [showHelp, setShowHelp] = useState(false);
  return (
    <Modal
      title={editing ? "Edit profil pengguna" : "Tambah pengguna"}
      desc={
        editing
          ? "Perbarui identitas, akses, outlet, atau password pengguna."
          : "Buat akun operasional khusus untuk UMKM ini."
      }
      close={close}
    >
      <form
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setLoading(true);
          try {
            const avatarUrl=file?await uploadImage(file):user?.avatarUrl;
            await save({
              name,
              email,
              password: password || undefined,
              role,
              outletId: ["pic", "warehouse", "cashier"].includes(role) ? outletId : undefined,
              active,
              avatarUrl,
            });
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Gagal menyimpan pengguna",
            );
            setLoading(false);
          }
        }}
      >
        {!isOwner && (
          <>
            <Field label="Foto profil (opsional)"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e)=>setFile(e.target.files?.[0]||null)}/></Field>
            <small className="upload-hint">Foto otomatis dikompresi. {editing&&user.avatarUrl?'Kosongkan jika foto tidak diubah.':''}</small>
          </>
        )}
        <Field label="Nama lengkap">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {editing ? (
          showPasswordEdit ? (
            <Field label="Ganti Password">
              <PasswordInput
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="Masukkan password baru pengguna ini"
              />
              <small className="upload-hint" style={{marginTop: 8, display: 'block'}}>
                Biarkan form kosong jika Anda batal mengganti password.
              </small>
            </Field>
          ) : (
            <Field label="Keamanan">
              <button
                type="button"
                className="table-action"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px' }}
                onClick={() => setShowPasswordEdit(true)}
              >
                <KeyRound size={16} /> Ganti Password
              </button>
            </Field>
          )
        ) : (
          <Field label="Password awal">
            <PasswordInput
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            />
          </Field>
        )}
        <Field label={
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%'}}>
            <span>Peran</span>
            <button type="button" onClick={() => setShowHelp(!showHelp)} style={{background:'none',border:'none',color:'var(--green)',fontSize:'10px',cursor:'pointer',textDecoration:'underline',padding:0,fontWeight:700}}>Pelajari hak akses</button>
          </div>
        }>
          <select
            value={role}
            disabled={isOwner}
            onChange={(e) => setRole(e.target.value as "owner" | "pic" | "finance" | "admin" | "warehouse" | "cashier" | "employee")}
          >
            {isOwner && <option value="owner">Owner</option>}
            <option value="admin">Admin Cabang</option>
            <option value="pic">PIC Outlet</option>
            <option value="warehouse">Staf Gudang</option>
            <option value="cashier">Kasir</option>
            <option value="finance">Keuangan</option>
            <option value="employee">Karyawan (Absensi)</option>
          </select>
          {showHelp && (
            <div style={{ marginTop: '8px', padding: '12px', background: 'var(--mint)', borderRadius: '8px', fontSize: '11.5px', color: 'var(--text)', border: '1px solid #d8f6e8', lineHeight: 1.5 }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div><b>Admin Cabang:</b> Mengelola operasional cabang (stok & penjualan), tanpa akses laporan keuangan.</div>
                <div><b>PIC Outlet:</b> Kepala operasional toko/outlet.</div>
                <div><b>Staf Gudang:</b> Khusus mencatat mutasi stok di gudang, tanpa melihat harga jual/omset.</div>
                <div><b>Kasir:</b> Hanya bisa mengakses dan melayani transaksi di menu Penjualan.</div>
                <div><b>Keuangan:</b> Memantau laporan omset dan laba, tanpa bisa memodifikasi stok fisik.</div>
                <div><b>Karyawan:</b> Hanya dapat mengakses absensi dan riwayat absensi pribadi.</div>
              </div>
            </div>
          )}
        </Field>
        {["pic", "warehouse", "cashier"].includes(role) && (
          <Field label="Lokasi Penempatan">
            <select
              required
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
            >
              <option value="">Pilih Lokasi</option>
              {data.locations
                .filter((item: any) => {
                  if (role === "warehouse") return item.type === "warehouse";
                  if (role === "pic" || role === "cashier") return item.type === "outlet";
                  return true; // admin can see all for now
                })
                .map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {editing && !isOwner && (
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>Akun aktif dan dapat masuk</span>
          </label>
        )}
        {error && <div className="login-error">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>Batal</button>
          {onDelete && <button type="button" className="danger-button" onClick={onDelete}><Trash2 size={16} /> Hapus</button>}
          <button className="primary" disabled={loading}>
            <Check />
            {loading ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Simpan"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function ReceiptModal({ data, receipt, close, save, uploadImage, prefillLocationId, prefillVariantId }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const availableSuppliers = (data.suppliers || []).filter((supplier:any) => supplier.active || supplier.id === receipt?.supplierId);
  const products = data.products
    .filter((product: any) => product.active && product.variants.some((variant: any) => variant.active !== false))
    .map((product: any) => ({ ...product, variants: product.variants.filter((variant: any) => variant.active !== false) }));
  const variants = products.flatMap((product: any) => product.variants.map((variant: any) => ({ ...variant, unit: product.unit, productName: product.name })));
  const selectedVariantId = receipt?.variantId || prefillVariantId;
  const initialProductId = selectedVariantId ? data.products.find((product: any) => product.variants.some((variant: any) => variant.id === selectedVariantId))?.id || "" : "";
  const prefilledVariant = variants.find((variant: any) => variant.id === prefillVariantId);
  const [sourceType, setSourceType] = useState<"supplier" | "production">(
      receipt?.sourceType || "supplier",
    ),
    [supplierId, setSupplierId] = useState(receipt?.supplierId || ""),
    [supplierName, setSupplierName] = useState(receipt?.supplierName || ""),
    [manualSupplier, setManualSupplier] = useState(Boolean(receipt?.supplierName && !receipt?.supplierId) || availableSuppliers.length === 0),
    [locationId, setLocationId] = useState(
      receipt?.locationId || prefillLocationId || data.locations.find((l: any) => l.active)?.id || "",
    ),
    [selectedProductId, setSelectedProductId] = useState(initialProductId),
    [productPickerOpen, setProductPickerOpen] = useState(false),
    [productSearch, setProductSearch] = useState(""),
    [selectedItems, setSelectedItems] = useState<Record<string, { quantity: number, unitCost: number }>>(
      receipt ? { [receipt.variantId]: { quantity: receipt.quantity, unitCost: receipt.unitCost } } : prefilledVariant ? { [prefilledVariant.id]: { quantity: 1, unitCost: prefilledVariant.cost || 0 } } : {}
    ),
    [note, setNote] = useState(receipt?.note || "");
  const selectedProduct = products.find((product: any) => product.id === selectedProductId);
  const visibleVariants = selectedProduct?.variants.map((variant: any) => ({ ...variant, unit: selectedProduct.unit, productName: selectedProduct.name })) || [];
  const matchingProducts = products.filter((product: any) => product.name.toLowerCase().includes(productSearch.toLowerCase()));
  return (
    <Modal
      title={receipt ? "Edit stok masuk" : "Catat stok masuk"}
      desc={receipt ? "Perbarui informasi transaksi stok masuk ini." : "Saldo langsung bertambah dan aktivitas tercatat dalam histori."}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          setUploadError("");
          try {
            const proofUrl = proofFile ? await uploadImage(proofFile) : receipt?.proofUrl;
            await save({
              sourceType,
              supplierId: sourceType === "supplier" ? supplierId || undefined : undefined,
              supplierName: sourceType === "supplier" ? (data.suppliers?.find((supplier:any) => supplier.id === supplierId)?.name || supplierName) : undefined,
              locationId,
              items: Object.entries(selectedItems).map(([vid, val]) => ({ variantId: vid, quantity: val.quantity, unitCost: val.unitCost })),
              note,
              proofUrl,
            });
          } catch (error) {
            setUploadError(error instanceof Error ? error.message : "Bukti penerimaan tidak dapat diunggah.");
            setIsSaving(false);
          }
        }}
      >
        <Field label="Sumber stok">
          <AppSelect
            value={sourceType}
            onChange={(e: any) =>
              setSourceType(e.target.value as "supplier" | "production")
            }
          >
            <option value="supplier">Pembelian supplier</option>
            <option value="production">Hasil produksi</option>
          </AppSelect>
        </Field>
        {sourceType === "supplier" && (
          <Field label="Supplier">
            <AppSelect required value={manualSupplier ? "__manual__" : supplierId} onChange={(event:any) => { const manual = event.target.value === "__manual__"; setManualSupplier(manual); setSupplierId(manual ? "" : event.target.value); }}><option value="" disabled>Pilih supplier</option>{availableSuppliers.map((supplier:any) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}<option value="__manual__">Input nama supplier manual</option></AppSelect>
            {manualSupplier && <input required value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Masukkan nama supplier" />}
          </Field>
        )}
        <Field label="Lokasi penerima">
          <AppSelect
            value={locationId}
            onChange={(e: any) => setLocationId(e.target.value)}
          >
            {data.locations
              .filter((l: any) => l.active || l.id === locationId)
              .map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.type === 'warehouse' ? '🏢 Gudang: ' : '🏪 Outlet: '} {l.name}
                </option>
              ))}
          </AppSelect>
        </Field>
        {!receipt && <Field label="Scan barcode / SKU">
          <BarcodeScanControl label="Scan barang" onDetected={(value) => {
            const variant = findVariantByBarcode(variants, value);
            if (!variant) return false;
            const product = products.find((item: any) => item.id && item.variants.some((itemVariant: any) => itemVariant.id === variant.id));
            if (!product) return false;
            setSelectedProductId(product.id);
            setProductPickerOpen(false);
            setSelectedItems((current) => ({ ...current, [variant.id]: current[variant.id] || { quantity: 1, unitCost: variant.cost || 0 } }));
            return true;
          }} />
          <small className="scan-field-hint">Scan setiap varian barang yang datang; varian langsung masuk ke daftar penerimaan.</small>
        </Field>}
        {receipt ? (
          <div className="form-grid">
            <Field label={`Jumlah (${variants.find((v:any) => v.id === receipt.variantId)?.unit || "unit"})`}>
              <input
                type="number"
                min="1"
                value={String(selectedItems[receipt.variantId]?.quantity || 1)}
                onInput={(e) => { const quantity = Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0; setSelectedItems((current) => ({...current, [receipt.variantId]: { ...current[receipt.variantId], quantity }})); }}
                onBlur={(e) => { const quantity = Number(e.currentTarget.value) || 0; setSelectedItems((current) => ({...current, [receipt.variantId]: { ...current[receipt.variantId], quantity }})); }}
              />
            </Field>
            <Field label={`Harga modal per ${variants.find((v:any) => v.id === receipt.variantId)?.unit || "unit"}`}>
              <input
                type="number"
                min="0"
                value={String(selectedItems[receipt.variantId]?.unitCost || 0)}
                onInput={(e) => { const unitCost = Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0; setSelectedItems((current) => ({...current, [receipt.variantId]: { ...current[receipt.variantId], unitCost }})); }}
                onBlur={(e) => { const unitCost = Number(e.currentTarget.value) || 0; setSelectedItems((current) => ({...current, [receipt.variantId]: { ...current[receipt.variantId], unitCost }})); }}
              />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Pilih produk">
              <div className="product-picker">
                <button type="button" className={`product-picker-trigger ${productPickerOpen ? "open" : ""}`} onClick={() => setProductPickerOpen((open) => !open)} aria-expanded={productPickerOpen}>
                  <span>{selectedProduct?.name || "Pilih nama produk"}</span><ChevronDown size={18} />
                </button>
                {productPickerOpen && <div className="product-picker-panel">
                  <label className="product-picker-search"><Search size={17} /><input autoFocus value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Cari nama produk" /></label>
                  <div className="product-picker-options">
                    {matchingProducts.length ? matchingProducts.map((product: any) => <button type="button" key={product.id} className={product.id === selectedProductId ? "selected" : ""} onClick={() => { setSelectedProductId(product.id); setProductPickerOpen(false); setProductSearch(""); }}><span>{product.name}</span><small>{product.variants.length} varian</small>{product.id === selectedProductId && <Check size={16} />}</button>) : <p>Produk tidak ditemukan.</p>}
                  </div>
                </div>}
              </div>
            </Field>
            {selectedProduct && <Field label={`Pilih varian ${selectedProduct.name}`}>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8 }}>
                {visibleVariants.map((v: any) => (
                  <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!selectedItems[v.id]} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                      if (e.target.checked) {
                        setSelectedItems({ ...selectedItems, [v.id]: { quantity: 1, unitCost: v.cost || 0 } });
                      } else {
                        const next = { ...selectedItems };
                        delete next[v.id];
                        setSelectedItems(next);
                      }
                    }} />
                    <span>{v.name} <small className="variant-stock">Stok saat ini: {qty(getBalance(data.balances, locationId, v.id), v.unit)}</small></span>
                  </label>
                ))}
              </div>
            </Field>}
            {!selectedProduct && <p className="variant-picker-hint">Pilih nama produk untuk menampilkan varian yang tersedia.</p>}
            {Object.keys(selectedItems).length > 0 && (
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Varian Terpilih:</h4>
                {Object.entries(selectedItems).map(([vid, item]) => {
                  const v = variants.find((x: any) => x.id === vid);
                  if (!v) return null;
                  return (
                    <div key={vid} className="form-grid" style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ gridColumn: '1 / -1', fontSize: 13 }}><b>{v.productName} · {v.name}</b></div>
                      <Field label={`Jumlah (${v.unit})`}>
                         <input type="number" min="1" value={String(item.quantity)} onInput={e => { const quantity = Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0; setSelectedItems((current) => ({...current, [vid]: { ...current[vid], quantity }})); }} onBlur={e => { const quantity = Number(e.currentTarget.value) || 0; setSelectedItems((current) => ({...current, [vid]: { ...current[vid], quantity }})); }} style={{ background: 'white' }} />
                      </Field>
                      <Field label="Harga Modal">
                         <input type="number" min="0" value={String(item.unitCost)} onInput={e => { const unitCost = Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0; setSelectedItems((current) => ({...current, [vid]: { ...current[vid], unitCost }})); }} onBlur={e => { const unitCost = Number(e.currentTarget.value) || 0; setSelectedItems((current) => ({...current, [vid]: { ...current[vid], unitCost }})); }} style={{ background: 'white' }} />
                      </Field>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <Field label="Catatan">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nomor faktur, batch, atau catatan produksi"
          />
        </Field>
        <div className="field"><span>Bukti penerimaan barang (opsional)</span>
          <EvidencePhotoPicker file={proofFile} setFile={setProofFile} subject="penerimaan barang" />
        </div>
        <small className="upload-hint">Unggah foto barang diterima, surat jalan, atau faktur. JPG, PNG, WebP, HEIC, atau HEIF; maksimal 5 MB.{receipt?.proofUrl && !proofFile ? " Bukti yang tersimpan tetap digunakan jika tidak diganti." : ""}</small>
        {uploadError && <p className="login-error">{uploadError}</p>}
        <ModalActions close={close} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function ReturnModal({ data, close, save, uploadImage }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const variants = data.products
      .filter((p: any) => p.active)
      .flatMap((p: any) =>
        p.variants
          .filter((v: any) => v.active !== false)
          .map((v: any) => ({ ...v, unit: p.unit, productName: p.name })),
      ),
    [type, setType] = useState<"customer" | "supplier">("customer"),
    [locationId, setLocationId] = useState(
      data.locations.find((l: any) => l.active)?.id || "",
    ),
    [selectedItems, setSelectedItems] = useState<Record<string, { quantity: number }>>({}),
    [reason, setReason] = useState(""),
    filteredVariants = variants;
  const products = Array.from(new Map(variants.map((variant: any) => [variant.productName, variant.productName])).values());
  const [selectedProductName, setSelectedProductName] = useState("");
  const visibleVariants = filteredVariants.filter((variant: any) => variant.productName === selectedProductName);

  return (
    <Modal
      title="Catat retur"
      desc="Perubahan stok dicatat otomatis tanpa menghapus transaksi asal."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          if (Object.keys(selectedItems).length === 0) { setIsSaving(false); return alert("Pilih minimal satu produk"); }
          setUploadError("");
          try {
            const proofUrl = proofFile ? await uploadImage(proofFile) : undefined;
            await save({ type, locationId, items: Object.entries(selectedItems).map(([vid, val]) => ({ variantId: vid, quantity: val.quantity })), reason, proofUrl });
          } catch (error) {
            setUploadError(error instanceof Error ? error.message : "Bukti retur tidak dapat diunggah.");
            setIsSaving(false);
          }
        }}
      >
        <Field label="Jenis retur">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "customer" | "supplier")}
          >
            <option value="customer">Retur dari pelanggan</option>
            <option value="supplier">Retur ke supplier</option>
          </select>
        </Field>
        <Field label="Lokasi">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {data.locations
              .filter((l: any) => l.active)
              .map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Scan barang retur">
          <BarcodeScanControl label="Scan barang" onDetected={(value) => {
            const variant = findVariantByBarcode(variants, value);
            if (!variant) return false;
            setSelectedProductName(variant.productName);
            setSelectedItems((current) => ({ ...current, [variant.id]: current[variant.id] || { quantity: 1 } }));
            return true;
          }} />
          <small className="scan-field-hint">Barcode yang dipindai langsung menambahkan varian ke retur.</small>
        </Field>
        <Field label="Pilih produk">
          <AppSelect value={selectedProductName} onChange={(e: any) => setSelectedProductName(e.target.value)} placeholder="Pilih nama produk">
            <option value="" disabled>Pilih nama produk</option>{products.map((product: any) => <option key={product} value={product}>{product}</option>)}
          </AppSelect>
        </Field>
        {selectedProductName && <Field label={`Pilih varian ${selectedProductName}`}>
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8 }}>
            {visibleVariants.map((v: any) => (
              <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!selectedItems[v.id]} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                  if (e.target.checked) {
                    setSelectedItems({ ...selectedItems, [v.id]: { quantity: 1 } });
                  } else {
                    const next = { ...selectedItems };
                    delete next[v.id];
                    setSelectedItems(next);
                  }
                }} />
                <span>{v.name} <small className="variant-stock">Stok saat ini: {qty(getBalance(data.balances, locationId, v.id), v.unit)}</small></span>
              </label>
            ))}
          </div>
        </Field>}
        {Object.keys(selectedItems).length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Varian Terpilih:</h4>
            {Object.entries(selectedItems).map(([vid, item]) => {
              const v = variants.find((x: any) => x.id === vid);
              if (!v) return null;
              return (
                <div key={vid} style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}><b>{v.productName} · {v.name}</b></div>
                  <Field label={`Jumlah (${v.unit})`}>
                     <input type="number" min="1" value={String(item.quantity)} onInput={e => { const quantity = Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0; setSelectedItems((current) => ({...current, [vid]: { quantity }})); }} onBlur={e => { const quantity = Number(e.currentTarget.value) || 0; setSelectedItems((current) => ({...current, [vid]: { quantity }})); }} style={{ background: 'white' }} />
                  </Field>
                </div>
              );
            })}
          </div>
        )}
        <Field label="Alasan retur">
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: Barang rusak atau salah kirim"
          />
        </Field>
        <div className="field"><span>Foto bukti retur (opsional)</span><EvidencePhotoPicker file={proofFile} setFile={setProofFile} subject="retur" /></div>
        <small className="upload-hint">Foto kondisi barang, nota, atau surat jalan. Maksimal 5 MB.</small>
        {uploadError && <p className="login-error">{uploadError}</p>}
        <ModalActions close={close} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function BusinessModal({ data, close, save, uploadImage }: any) {
  const current = data.business || {},
    [name, setName] = useState(current.name || ""),
    [ownerName, setOwnerName] = useState(current.ownerName || ""),
    [phone, setPhone] = useState(current.phone || ""),
    [email, setEmail] = useState(current.email || ""),
    [address, setAddress] = useState(current.address || ""),
    [negativeStockPolicy, setNegativeStockPolicy] = useState(current.negativeStockPolicy || "BLOCK"),
    [file, setFile] = useState<File | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Edit profil usaha"
      desc="Logo dan identitas digunakan pada dokumen usaha."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError("");
          try {
            const logoUrl = file ? await uploadImage(file) : current.logoUrl;
            save({ name, ownerName, phone, email, address, logoUrl, negativeStockPolicy });
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Gagal menyimpan profil",
            );
            setLoading(false);
          }
        }}
      >
        <Field label="Logo usaha">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <small className="upload-hint">
          Logo otomatis dikompresi sebelum disimpan.
        </small>
        <div className="form-grid">
          <Field label="Nama usaha">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Nama pemilik">
            <input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Nomor telepon">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email usaha">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Alamat usaha">
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
          <Field label="Kebijakan Stok Negatif">
            <select value={negativeStockPolicy} onChange={(e) => setNegativeStockPolicy(e.target.value)}>
              <option value="BLOCK">BLOCK (Tolak transaksi jika stok habis)</option>
              <option value="WARN">WARN (Munculkan peringatan)</option>
            </select>
          </Field>
        </div>
        {error && <div className="login-error">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Batal
          </button>
          <button className="primary" disabled={loading}>
            <Check />
            {loading ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function TransferModal({ data, close, save, uploadImage, fixedFrom, initialFrom, initialTo, initialVariantId }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const activeLocations=data.locations.filter((l:any)=>l.active),variants = data.products.filter((p:any)=>p.active).flatMap((p: any) =>
      p.variants.filter((item:any)=>item.active!==false).map((item: any) => ({
        ...item,
        unit: p.unit,
        productName: p.name,
        category: p.category,
        productImageUrl: p.imageUrl || p.image || item.imageUrl,
      })),
    ),
    defaultFrom = fixedFrom || activeLocations.find((l: any) => l.id === initialFrom)?.id || activeLocations.find((l: any) => l.isCentralWarehouse)?.id || activeLocations[0]?.id || "",
    [from, setFrom] = useState(defaultFrom),
    [to, setTo] = useState(initialTo && initialTo !== defaultFrom ? initialTo : activeLocations.find((l: any) => l.id !== defaultFrom)?.id || ""),
    [selectedItems, setSelectedItems] = useState<Record<string, { quantity: number }>>(initialVariantId ? { [initialVariantId]: { quantity: 1 } } : {}),
    filteredVariants = variants.filter((v: any) => {
      return getBalance(data.balances, from, v.id) > 0 || selectedItems[v.id];
    });
  const transferProducts = Object.values(variants.reduce((result: Record<string, any>, variant: any) => {
    if (!result[variant.productName]) result[variant.productName] = { name: variant.productName, unit: variant.unit, quantity: 0 };
    result[variant.productName].quantity += getBalance(data.balances, from, variant.id);
    return result;
  }, {}));
  const [selectedTransferProduct, setSelectedTransferProduct] = useState(variants.find((variant: any) => variant.id === initialVariantId)?.productName || "");
  const visibleTransferVariants = filteredVariants.filter((variant: any) => variant.productName === selectedTransferProduct);
  const invalidTransferItems = Object.entries(selectedItems).filter(([variantId, item]) => item.quantity < 1 || item.quantity > getBalance(data.balances, from, variantId));
  const canSaveTransfer = Object.keys(selectedItems).length > 0 && invalidTransferItems.length === 0 && !isSaving;

  return (
    <Modal
      title="Buat transfer stok"
      desc="Lokasi tujuan harus mengonfirmasi barang yang diterima."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (isSaving) return;
          if (invalidTransferItems.length) return;
          setIsSaving(true);
          if (Object.keys(selectedItems).length === 0) { setIsSaving(false); return alert("Pilih minimal satu produk"); }
          setUploadError("");
          try {
            const sendProofUrl = proofFile ? await uploadImage(proofFile) : undefined;
            await save(from, to, Object.entries(selectedItems).map(([vid, val]) => ({ variantId: vid, quantity: val.quantity })), sendProofUrl);
          } catch (error) {
            setUploadError(error instanceof Error ? error.message : "Bukti pengiriman tidak dapat diunggah.");
            setIsSaving(false);
          }
        }}
      >
        <Field label="Lokasi asal">
          {fixedFrom ? (
            <input
              readOnly
              value={activeLocations.find((l: any) => l.id === fixedFrom)?.name || fixedFrom}
              className="input-readonly"
            />
          ) : (
          <select
            value={from}
            onChange={(e) => {
              const next = e.target.value;
              setFrom(next);
              if (to === next)
                setTo(activeLocations.find((l: any) => l.id !== next)?.id || "");
            }}
          >
            {activeLocations.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          )}
        </Field>
        <Field label="Lokasi tujuan">
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {activeLocations
              .filter((l: any) => l.id !== from)
              .map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Scan varian untuk dikirim">
          <BarcodeScanControl label="Scan varian" onDetected={(value) => {
            const variant = findVariantByBarcode(variants, value);
            if (!variant || getBalance(data.balances, from, variant.id) <= 0) return false;
            setSelectedTransferProduct(variant.productName);
            setSelectedItems((current) => ({ ...current, [variant.id]: current[variant.id] || { quantity: 1 } }));
            return true;
          }} />
          <small className="scan-field-hint">Scan varian satu per satu saat menyiapkan barang. Hanya stok dari lokasi asal yang dapat dipilih.</small>
        </Field>
        <Field label="Pilih produk">
          <AppSelect value={selectedTransferProduct} onChange={(e: any) => setSelectedTransferProduct(e.target.value)} placeholder="Pilih nama produk"><option value="" disabled>Pilih nama produk</option>{transferProducts.map((product: any) => <option key={product.name} value={product.name} data-meta={`Total stok: ${qty(product.quantity, product.unit)}`}>{product.name}</option>)}</AppSelect>
        </Field>
        {selectedTransferProduct && <Field label={`Pilih varian ${selectedTransferProduct}`}>
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8 }}>
            {visibleTransferVariants.map((v: any) => (
              <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!selectedItems[v.id]} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                  if (e.target.checked) {
                    setSelectedItems({ ...selectedItems, [v.id]: { quantity: 1 } });
                  } else {
                    const next = { ...selectedItems };
                    delete next[v.id];
                    setSelectedItems(next);
                  }
                }} />
                <span>{v.name} (Stok: {getBalance(data.balances, from, v.id)} {v.unit})</span>
              </label>
            ))}
          </div>
        </Field>}
        {Object.keys(selectedItems).length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Varian Terpilih:</h4>
            {Object.entries(selectedItems).map(([vid, item]) => {
              const v = variants.find((x: any) => x.id === vid);
              if (!v) return null;
              const available = getBalance(data.balances, from, vid);
              const exceedsStock = item.quantity > available || item.quantity < 1;
              return (
                <div key={vid} className={exceedsStock ? "transfer-item-invalid" : ""} style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}><b>{v.productName} · {v.name}</b></div>
                  <Field label={`Jumlah (${v.unit})`}>
                     <input className={exceedsStock ? "invalid" : ""} type="number" min="1" max={available} value={String(item.quantity)} onInput={e => { const quantity = Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0; setSelectedItems((current) => ({...current, [vid]: { quantity }})); }} onBlur={e => { const quantity = Number(e.currentTarget.value) || 0; setSelectedItems((current) => ({...current, [vid]: { quantity }})); }} style={{ background: 'white' }} />
                  </Field>
                  <small className={exceedsStock ? "transfer-stock-error" : "transfer-stock-limit"}>{exceedsStock ? `Jumlah melebihi stok tersedia (${qty(available, v.unit)}).` : `Maksimum yang dapat ditransfer: ${qty(available, v.unit)}.`}</small>
                </div>
              );
            })}
          </div>
        )}
        <div className="field"><span>Foto bukti pengiriman (opsional)</span><EvidencePhotoPicker file={proofFile} setFile={setProofFile} subject="pengiriman" /></div>
        <small className="upload-hint">Foto barang saat dikirim atau surat jalan. Maksimal 5 MB.</small>
        {uploadError && <p className="login-error">{uploadError}</p>}
        <ModalActions close={close} disabled={!canSaveTransfer} />
      </form>
    </Modal>
  );
}
function SaleModal({ data, close, save, fixedLocation }: any) {
  const activeLocations=data.locations.filter((l:any)=>l.active),variants = data.products.filter((p:any)=>p.active).flatMap((p: any) =>
      p.variants.filter((item:any)=>item.active!==false).map((item: any) => ({
        ...item,
        unit: p.unit,
        productName: p.name,
      })),
    ),
    [loc, setLoc] = useState(
      fixedLocation || activeLocations[1]?.id || activeLocations[0]?.id || "",
    ),
    [channel, setChannel] = useState<Channel>("offline"),
    [skuSearch, setSkuSearch] = useState(""),
    [categoryFilter, setCategoryFilter] = useState("all"),
    [payment, setPayment] = useState("QRIS"),
    [cart, setCart] = useState<Array<{ variantId: string; quantity: number }>>([]),
    [cameraOpen, setCameraOpen] = useState(false),
    [cameraError, setCameraError] = useState(""),
    categories = Array.from(new Set(variants.map((item: any) => item.category).filter(Boolean))).sort() as string[],
    matchingVariants = variants.filter((item: any) =>
      (categoryFilter === "all" || item.category === categoryFilter) &&
      `${item.sku || ""} ${item.barcode || ""} ${item.productName} ${item.name}`.toLowerCase().includes(skuSearch.toLowerCase()),
    ),
    sellableMatchingVariants = matchingVariants.filter((item: any) =>
      getBalance(data.balances, loc, item.id) > 0 || cart.some(c => c.variantId === item.id),
    );
  const visibleProductGroups = Object.values(sellableMatchingVariants.reduce((groups: Record<string, any>, variant: any) => {
    if (!groups[variant.productName]) groups[variant.productName] = { name: variant.productName, imageUrl: variant.productImageUrl, variants: [] };
    groups[variant.productName].variants.push(variant);
    return groups;
  }, {}));
  const scannerRef = useRef<HTMLInputElement>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const barcodePhotoRef = useRef<HTMLInputElement>(null);
  const scanAudioContextRef = useRef<AudioContext | null>(null);
  const isOffline = channel === "offline";
  const isTouchDevice = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const findScannedVariant = (rawValue: string) => {
    const value = rawValue.trim().toLowerCase();
    if (!value) return undefined;
    return variants.find((item: any) =>
      (item.sku?.toLowerCase() === value || item.barcode?.toLowerCase() === value) &&
      getBalance(data.balances, loc, item.id) > 0,
    );
  };
  const addToCart = (variantId: string) => {
    setCart((current) => {
      const found = current.find((item) => item.variantId === variantId);
      return found
        ? current.map((item) => item.variantId === variantId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { variantId, quantity: 1 }];
    });
    setSkuSearch("");
  };
  const getScanAudioContext = () => {
    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    if (!scanAudioContextRef.current || scanAudioContextRef.current.state === "closed") {
      scanAudioContextRef.current = new AudioContextConstructor();
    }
    return scanAudioContextRef.current;
  };
  const primeScanAudio = () => {
    const context = getScanAudioContext();
    if (context?.state === "suspended") void context.resume().catch(() => undefined);
  };
  const playScanSuccessSound = () => {
    const context = getScanAudioContext();
    if (!context) return;
    const play = () => {
      const now = context.currentTime;
      const makeTone = (frequency: number, start: number, duration: number) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.045, start + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.01);
      };
      // Dua bunyi pendek memberi konfirmasi yang jelas seperti scanner kasir,
      // namun volumenya sengaja rendah agar tidak mengganggu area outlet.
      makeTone(1_450, now, 0.052);
      makeTone(2_050, now + 0.064, 0.072);
    };
    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined);
    else play();
  };
  const applyScannedValue = (rawValue: string) => {
    const candidate = findScannedVariant(rawValue) || (sellableMatchingVariants.length === 1 ? sellableMatchingVariants[0] : undefined);
    if (!candidate) return false;
    addToCart(candidate.id);
    playScanSuccessSound();
    return true;
  };
  const stopCameraScanner = () => {
    scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;
    if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null;
    setCameraOpen(false);
  };
  const getCameraPermissionError = async (error: any) => {
    if (error?.name !== "NotAllowedError") return null;
    try {
      const permission = await navigator.permissions?.query({ name: "camera" as PermissionName });
      if (permission?.state === "denied") {
        return "Izin kamera untuk situs Menengs masih diblokir di Chrome. Ketuk ikon pengaturan di kiri alamat situs → Izin → Kamera → Izinkan, lalu muat ulang halaman.";
      }
    } catch {
      // Browser lama tidak selalu mendukung Permissions API untuk kamera.
    }
    return "Kamera ditolak oleh perangkat atau browser. Pastikan Chrome tidak sedang memakai kamera di aplikasi lain, lalu coba kembali.";
  };
  const openCameraScanner = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Kamera tidak tersedia di perangkat ini. Gunakan scanner Bluetooth atau masukkan SKU.");
      return;
    }
    if (!(window as any).BarcodeDetector) {
      setCameraError("Browser ini belum mendukung pembacaan barcode kamera. Gunakan Chrome terbaru atau scanner Bluetooth.");
      return;
    }
    try {
      // getUserMedia wajib dipanggil langsung dari event klik. Di sebagian
      // Android, pemanggilan yang ditunda lewat effect dianggap bukan aksi
      // pengguna dan akan ditolak walaupun izin Chrome sudah aktif.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      scannerStreamRef.current = stream;
      setCameraOpen(true);
    } catch (error: any) {
      const messageByErrorName: Record<string, string> = {
        NotFoundError: "Kamera tidak ditemukan pada perangkat ini.",
        NotReadableError: "Kamera sedang digunakan aplikasi lain. Tutup aplikasi Kamera, WhatsApp, atau Instagram lalu coba lagi.",
        OverconstrainedError: "Kamera belakang tidak dapat digunakan. Coba lagi setelah menutup aplikasi lain.",
      };
      setCameraError((await getCameraPermissionError(error)) || messageByErrorName[error?.name] || "Kamera tidak dapat dibuka. Coba lagi atau gunakan scanner Bluetooth.");
      stopCameraScanner();
    }
  };
  const scanBarcodePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCameraError("");
    try {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) throw new Error("unsupported");
      const imageUrl = URL.createObjectURL(file);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("invalid-image"));
        image.src = imageUrl;
      });
      const codes = await new Detector().detect(image);
      URL.revokeObjectURL(imageUrl);
      const rawValue = codes[0]?.rawValue;
      if (!rawValue) {
        setCameraError("Barcode belum terbaca dari foto. Pastikan barcode terlihat utuh dan pencahayaan cukup.");
      } else if (!applyScannedValue(rawValue)) {
        setCameraError("Barcode ditemukan, tetapi produknya tidak tersedia pada stok lokasi ini.");
      }
    } catch {
      setCameraError("Foto barcode tidak dapat dipindai di browser ini. Gunakan input SKU atau scanner Bluetooth.");
    }
  };
  const updateQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.variantId !== variantId));
      return;
    }
    setCart((current) => current.map((item) => item.variantId === variantId ? { ...item, quantity } : item));
  };
  useEffect(() => {
    if (isOffline && !isTouchDevice) requestAnimationFrame(() => scannerRef.current?.focus());
  }, [isOffline, isTouchDevice]);
  // Izin kamera diminta dari handler klik; effect ini hanya memasang stream ke
  // video dan menjalankan pembacaan barcode agar Android tidak menolak izin.
  useEffect(() => {
    if (!cameraOpen || !scannerStreamRef.current) return;
    let cancelled = false;
    let detectorTimer: number | null = null;
    const start = async () => {
      try {
        const stream = scannerStreamRef.current;
        if (!stream || cancelled) return;
        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = stream;
          await scannerVideoRef.current.play();
        }
        const Detector = (window as any).BarcodeDetector;
        const preferredFormats = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"];
        const supportedFormats = typeof Detector.getSupportedFormats === "function"
          ? await Detector.getSupportedFormats()
          : preferredFormats;
        const formats = preferredFormats.filter((format) => supportedFormats.includes(format));
        const detector = formats.length ? new Detector({ formats }) : new Detector();
        detectorTimer = window.setInterval(async () => {
          const video = scannerVideoRef.current;
          if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || cancelled) return;
          try {
            const codes = await detector.detect(video);
            const rawValue = codes[0]?.rawValue;
            if (rawValue && applyScannedValue(rawValue)) stopCameraScanner();
          } catch {
            // Frame yang belum siap dibaca tidak boleh menghentikan kamera.
          }
        }, 280);
      } catch {
        setCameraError("Pemindai kamera tidak dapat dijalankan. Perbarui Chrome atau gunakan scanner Bluetooth.");
        stopCameraScanner();
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (detectorTimer) window.clearInterval(detectorTimer);
      scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);
  useEffect(() => () => stopCameraScanner(), []);
  useEffect(() => () => { void scanAudioContextRef.current?.close(); }, []);
  
  const totalQty = cart.reduce((acc, c) => acc + c.quantity, 0);
  const totalAmount = cart.reduce((acc, c) => {
    const varDetail = variants.find((item: any) => item.id === c.variantId);
    const price = channel === "reseller" ? (varDetail?.resellerPrice || 0) : (varDetail?.price || 0);
    return acc + (c.quantity * price);
  }, 0);

  return (
    <Modal
      title="Catat penjualan"
      desc="Catat penjualan untuk mengurangi stok dan mencatat riwayat transaksi."
      close={close}
      className={isOffline ? "large pos-modal" : "large"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cart.length === 0) return alert("Keranjang masih kosong");
          save(loc, channel, cart, payment);
        }}
      >
        <div className="form-grid">
          <Field label="Lokasi">
            <select
              value={loc}
              disabled={Boolean(fixedLocation)}
              onChange={(e) => setLoc(e.target.value)}
            >
              {activeLocations.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kanal">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="offline">Offline</option>
              <option value="online">Online</option>
              <option value="reseller">Reseller</option>
            </select>
          </Field>
        </div>
        <div className={isOffline ? "pos-product-picker" : ""} style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>TAMBAH PRODUK</h4>
          <Field label="">
            <div className="pos-scan-row">
              <input
                ref={scannerRef}
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Cari produk, varian, atau SKU"
                autoComplete="off"
                inputMode="search"
                onPointerDown={primeScanAudio}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (!applyScannedValue(skuSearch)) setCameraError("Barcode atau SKU tidak ditemukan pada stok lokasi ini.");
                }}
              />
              <button type="button" className="pos-camera-button" onClick={() => { primeScanAudio(); void openCameraScanner(); }} aria-label="Pindai barcode dengan kamera">
                <Camera size={18} /><span>Scan</span>
              </button>
              <input ref={barcodePhotoRef} type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={scanBarcodePhoto} />
            </div>
            {cameraError && <div className="pos-scan-feedback" role="status">
              <span>{cameraError}</span>
              <button type="button" onClick={() => barcodePhotoRef.current?.click()}>Pilih foto barcode</button>
            </div>}
            {cameraOpen && <div className="pos-camera-scanner">
              <video ref={scannerVideoRef} muted playsInline aria-label="Pratinjau kamera pemindai barcode" />
              <div><span>Arahkan kamera ke barcode produk</span><button type="button" onClick={stopCameraScanner}><X size={16} /> Tutup kamera</button></div>
            </div>}
            <div className="pos-category-tabs" aria-label="Kategori produk">
              <button type="button" className={categoryFilter === "all" ? "active" : ""} onClick={() => setCategoryFilter("all")}>Semua</button>
              {categories.map((category) => <button type="button" key={category} className={categoryFilter === category ? "active" : ""} onClick={() => setCategoryFilter(category)}>{category}</button>)}
            </div>
            <div className={isOffline ? "pos-product-results" : ""} style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8, background: 'white' }}>
              {visibleProductGroups.length === 0 && <p className="pos-empty-products">Tidak ada varian tersedia untuk lokasi ini. Tambahkan stok terlebih dahulu.</p>}
              {visibleProductGroups.map((product: any) => <section className="pos-product-group" key={product.name}>
                <header>
                  <div className="pos-product-image">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : product.name.slice(0, 2).toUpperCase()}</div>
                  <div><b>{product.name}</b><small>{product.variants.length} varian tersedia</small></div>
                </header>
                <div className="pos-variant-list">
                  {product.variants.map((v: any) => {
                    const checked = cart.some(c => c.variantId === v.id);
                    return <button type="button" className={isOffline ? "pos-product-button" : "sale-product-button"} key={v.id} onClick={() => addToCart(v.id)}>
                      <span><b>{v.name}</b><small>Stok: {getBalance(data.balances, loc, v.id)} {v.unit} · {money(channel === "reseller" ? v.resellerPrice : v.price)}</small></span>
                      <strong>{checked ? '+1 lagi' : 'Tambah'}</strong>
                    </button>;
                  })}
                </div>
              </section>)}
            </div>
          </Field>
        </div>
        
        {cart.length > 0 && (
          <div className="pos-cart-table" style={{ marginBottom: 16 }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '8px 0' }}>Produk</th>
                  <th style={{ padding: '8px 0' }}>Harga</th>
                  <th style={{ padding: '8px 0' }}>Qty</th>
                  <th style={{ padding: '8px 0', textAlign: 'right' }}>Subtotal</th>
                  <th style={{ padding: '8px 0', width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((c, idx) => {
                  const varDetail = variants.find((item: any) => item.id === c.variantId);
                  if (!varDetail) return null;
                  const price = channel === "reseller" ? varDetail.resellerPrice : varDetail.price;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0' }}>{varDetail.productName} - {varDetail.name}</td>
                      <td style={{ padding: '8px 0' }}>{money(price)}</td>
                      <td style={{ padding: '8px 0' }}>
                        <div className="pos-qty-control">
                          <button type="button" onClick={() => updateQuantity(c.variantId, c.quantity - 1)} aria-label={`Kurangi ${varDetail.name}`}>−</button>
                          <b>{c.quantity}</b><span>{varDetail.unit}</span>
                          <button type="button" onClick={() => updateQuantity(c.variantId, c.quantity + 1)} aria-label={`Tambah ${varDetail.name}`}>+</button>
                        </div>
                      </td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{money(price * c.quantity)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'center' }}>
                        <button type="button" className="pos-remove" onClick={() => updateQuantity(c.variantId, 0)} aria-label={`Hapus ${varDetail.name}`}>×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ background: 'var(--navy)', color: 'white', padding: '12px 16px', borderRadius: '8px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>TOTAL TAGIHAN</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{money(totalAmount)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>TOTAL QTY</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{totalQty} item</div>
              </div>
            </div>
          </div>
        )}

        <div className={isOffline ? "pos-payment" : "form-grid"}>
          <Field label="Metode Pembayaran">
            {isOffline ? <div className="pos-payment-options">{['QRIS', 'Tunai', 'Transfer'].map(method => <button key={method} type="button" className={payment === method ? 'active' : ''} onClick={() => setPayment(method)}>{method}</button>)}</div> : <select value={payment} onChange={(e) => setPayment(e.target.value)}><option>QRIS</option><option>Tunai</option><option>Transfer</option></select>}
          </Field>
          <div></div>
        </div>
        <ModalActions close={close} disabled={cart.length === 0} label={isOffline ? 'Bayar & Simpan' : 'Simpan'} />
      </form>
    </Modal>
  );
}
function OpnameModal({ data, item, close, save, fixedLocation }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const products = data.products
      .filter((product: any) => product.active && product.variants.some((variant: any) => variant.active !== false))
      .map((product: any) => ({ ...product, variants: product.variants.filter((variant: any) => variant.active !== false) })),
    variants = products.flatMap((product: any) => product.variants.map((variant: any) => ({ ...variant, unit: product.unit, productName: product.name }))),
    initialProductId = item ? products.find((product: any) => product.variants.some((variant: any) => variant.id === item.variantId))?.id || "" : "",
    [loc, setLoc] = useState(
      item?.locationId || fixedLocation || data.locations[1]?.id || data.locations[0]?.id || "",
    ),
    [selectedProductId, setSelectedProductId] = useState(initialProductId),
    [productPickerOpen, setProductPickerOpen] = useState(false),
    [productSearch, setProductSearch] = useState(""),
    [selectedItems, setSelectedItems] = useState<Record<string, { actualQty: number, reason: string }>>(
      item ? { [item.variantId]: { actualQty: item.actualQty || 0, reason: item.reason || "Koreksi saldo dari halaman stok" } } : {}
    );
  const selectedProduct = products.find((product: any) => product.id === selectedProductId);
  const visibleVariants = selectedProduct?.variants.map((variant: any) => ({ ...variant, unit: selectedProduct.unit, productName: selectedProduct.name })) || [];
  const matchingProducts = products.filter((product: any) => product.name.toLowerCase().includes(productSearch.toLowerCase()));

  return (
    <Modal
      title="Catat stock opname"
      desc="Selisih akan menjadi koreksi dengan jejak audit."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          if (Object.keys(selectedItems).length === 0) { setIsSaving(false); return alert("Pilih minimal satu produk"); }
          save(loc, Object.entries(selectedItems).map(([vid, val]) => ({ variantId: vid, actualQty: val.actualQty, reason: val.reason })));
        }}
      >
        <Field label="Lokasi opname">
          <AppSelect
            value={loc}
            disabled={Boolean(fixedLocation)}
            onChange={(e: any) => setLoc(e.target.value)}
          >
            {data.locations.filter((l: any) => l.active || l.id === loc).map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.type === "warehouse" ? "🏢 Gudang: " : "🏪 Outlet: "}{l.name}
              </option>
            ))}
          </AppSelect>
        </Field>
        {!item && <Field label="Scan barang fisik">
          <BarcodeScanControl label="Scan barang" onDetected={(value) => {
            const variant = findVariantByBarcode(variants, value);
            if (!variant) return false;
            const product = products.find((current: any) => current.variants.some((currentVariant: any) => currentVariant.id === variant.id));
            if (!product) return false;
            setSelectedProductId(product.id);
            setProductPickerOpen(false);
            setSelectedItems((current) => ({ ...current, [variant.id]: current[variant.id] || { actualQty: 0, reason: "Hasil hitung fisik akhir hari" } }));
            return true;
          }} />
          <small className="scan-field-hint">Setelah scan, masukkan jumlah fisik aktual untuk menyelesaikan opname.</small>
        </Field>}
        <Field label="Pilih produk">
          <div className="product-picker">
            <button type="button" className={`product-picker-trigger ${productPickerOpen ? "open" : ""}`} onClick={() => setProductPickerOpen((open) => !open)} aria-expanded={productPickerOpen}>
              <span>{selectedProduct?.name || "Pilih nama produk"}</span><ChevronDown size={18} />
            </button>
            {productPickerOpen && <div className="product-picker-panel">
              <label className="product-picker-search"><Search size={17} /><input autoFocus value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Cari nama produk" /></label>
              <div className="product-picker-options">
                {matchingProducts.length ? matchingProducts.map((product: any) => <button type="button" key={product.id} className={product.id === selectedProductId ? "selected" : ""} onClick={() => { setSelectedProductId(product.id); setProductPickerOpen(false); setProductSearch(""); }}><span>{product.name}</span><small>{product.variants.length} varian</small>{product.id === selectedProductId && <Check size={16} />}</button>) : <p>Produk tidak ditemukan.</p>}
              </div>
            </div>}
          </div>
        </Field>
        {selectedProduct && <Field label={`Pilih varian ${selectedProduct.name}`}>
          <div className="variant-picker-list">
            {visibleVariants.map((v: any) => (
              <label key={v.id} className="variant-picker-option">
                <input type="checkbox" checked={!!selectedItems[v.id]} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                  if (e.target.checked) {
                    setSelectedItems({ ...selectedItems, [v.id]: { actualQty: 0, reason: "Hasil hitung fisik akhir hari" } });
                  } else {
                    const next = { ...selectedItems };
                    delete next[v.id];
                    setSelectedItems(next);
                  }
                }} />
                <span><b>{v.name}</b><small className="variant-stock">Stok sistem saat ini: {qty(getBalance(data.balances, loc, v.id), v.unit)}</small></span>
              </label>
            ))}
          </div>
        </Field>}
        {!selectedProduct && <p className="variant-picker-hint">Pilih nama produk untuk menampilkan varian yang akan dihitung.</p>}
        {Object.keys(selectedItems).length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Varian Terpilih:</h4>
            {Object.entries(selectedItems).map(([vid, selectedItem]) => {
              const v = variants.find((x: any) => x.id === vid);
              if (!v) return null;
              return (
                <div key={vid} className="opname-selected-item">
                  <div className="opname-item-head"><div><b>{v.productName} · {v.name}</b><small>Stok sistem: {qty(getBalance(data.balances, loc, v.id), v.unit)}</small></div><span className={selectedItem.actualQty - getBalance(data.balances, loc, v.id) === 0 ? "status ok" : "status wait"}>{selectedItem.actualQty - getBalance(data.balances, loc, v.id) === 0 ? "Sesuai" : `Selisih ${selectedItem.actualQty - getBalance(data.balances, loc, v.id) > 0 ? "+" : ""}${qty(selectedItem.actualQty - getBalance(data.balances, loc, v.id), v.unit)}`}</span></div>
                  <div className="form-grid">
                  <Field label={`Stok fisik (${v.unit})`}>
                     <input type="number" min="0" value={String(selectedItem.actualQty)} onInput={e => { const actualQty = Number(e.currentTarget.value.replace(/^0+(?=\d)/, '')) || 0; setSelectedItems((current) => ({...current, [vid]: { ...current[vid], actualQty }})); }} onBlur={e => { const actualQty = Number(e.currentTarget.value) || 0; setSelectedItems((current) => ({...current, [vid]: { ...current[vid], actualQty }})); }} style={{ background: 'white' }} />
                  </Field>
                  <Field label="Alasan / catatan">
                     <textarea required value={selectedItem.reason} onChange={e => { const reason = e.currentTarget.value; setSelectedItems((current) => ({...current, [vid]: { ...current[vid], reason }})); }} style={{ background: 'white' }} />
                  </Field>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <ModalActions close={close} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function CancelModal({close,save}:any){const [isSaving, setIsSaving] = useState(false);const[reason,setReason]=useState("");return <Modal title="Batalkan transaksi" desc="Stok akan dikoreksi otomatis. Transaksi asli dan alasan tetap ada dalam histori." close={close}><form onSubmit={(e)=>{e.preventDefault();if(isSaving)return;setIsSaving(true);save(reason)}}><Field label="Alasan pembatalan / koreksi"><textarea required minLength={5} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Contoh: Salah memilih produk atau jumlah"/></Field><footer className="modal-actions"><button type="button" className="secondary" onClick={close}>Kembali</button><button className="danger-button" type="submit" disabled={isSaving}><RotateCcw/>Batalkan transaksi</button></footer></form></Modal>}
function SaleDetail({ item, variants, locations, close }: any) {
  if (!item) return null;
  return (
    <Modal
      title={`Detail transaksi ${item.id}`}
      desc="Rincian lengkap transaksi penjualan."
      close={close}
    >
      <div className="detail-list">
        <p>
          <span>Waktu</span>
          <b>{new Date(item.createdAt).toLocaleString("id-ID")}</b>
        </p>
        <p>
          <span>Lokasi</span>
          <b>{locations[item.locationId]?.name}</b>
        </p>
        <p>
          <span>Kanal / pembayaran</span>
          <b>
            {item.channel} &middot; {item.payment}
          </b>
        </p>
        {item.items.map((line: any) => (
          <p key={line.variantId}>
            <span>
              {variants[line.variantId]?.productName} &middot; {variants[line.variantId]?.name}
            </span>
            <b>{qty(line.quantity, variants[line.variantId]?.unit)}</b>
          </p>
        ))}
        <p>
          <span>Total</span>
          <b>{money(item.total)}</b>
        </p>
        <p>
          <span>Status</span>
          <b>
            {item.status === "cancelled"
              ? `Dibatalkan: ${item.cancelReason}`
              : "Selesai"}
          </b>
        </p>
      </div>
      <footer className="modal-actions detail-modal-actions">
        <button type="button" className="secondary" onClick={close}>
          Tutup
        </button>
      </footer>
    </Modal>
  );
}
function ReceiptDetail({ items, variants, locations, close }: any) {
  if (!items?.length) return null;
  const receipt = items[0];
  const documentCode = receiptDisplayCode(receipt);
  const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
  const totalValue = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitCost, 0);
  const isCancelled = items.every((item: any) => item.status === "cancelled");
  return <Modal title={`Detail stok masuk ${documentCode}`} desc="Rincian seluruh varian pada satu proses penerimaan stok." close={close}>
    <div className="detail-list">
      <p><span>Tanggal</span><b>{new Date(receipt.createdAt).toLocaleString("id-ID")}</b></p>
      <p><span>Sumber</span><b>{receipt.sourceType === "production" ? "Hasil produksi" : receipt.supplierName || "Supplier"}</b></p>
      <p><span>Lokasi penerima</span><b>{locations[receipt.locationId]?.name || "Lokasi tidak diketahui"}</b></p>
      <p><span>Penginput</span><b>{receipt.createdBy || "Penginput tidak tercatat"}</b></p>
      <p><span>Varian diterima</span><b>{items.length} varian · {totalQuantity.toLocaleString("id-ID")} item</b></p>
      <div className="detail-transfer-items">{items.map((line: any) => <p key={line.id}><span>{variants[line.variantId]?.productName} · {variants[line.variantId]?.name}<small className="block">{qty(line.quantity, variants[line.variantId]?.unit)} × {money(line.unitCost)}</small></span><b>{money(line.quantity * line.unitCost)}</b></p>)}</div>
      {receipt.note && <p><span>Catatan</span><b>{receipt.note}</b></p>}
      <p><span>Bukti penerimaan</span><b>{receipt.proofUrl ? <a className="proof-link" href={receipt.proofUrl} target="_blank" rel="noreferrer">Lihat gambar bukti</a> : "Tidak dilampirkan"}</b></p>
      <p><span>Total nilai</span><b>{money(totalValue)}</b></p>
      <p><span>Status</span><b>{isCancelled ? `Dibatalkan: ${receipt.cancelReason || "-"}` : "Selesai"}</b></p>
    </div>
    <footer className="modal-actions detail-modal-actions"><button type="button" className="secondary" onClick={close}>Tutup</button></footer>
  </Modal>;
}
function OpnameDetail({ item, variants, locations, close }: any) {
  if (!item) return null;
  const variant = variants[item.variantId];
  return <Modal title="Detail stock opname" desc="Rincian koreksi stok yang tercatat dalam histori." close={close}>
    <div className="detail-list">
      <p><span>Waktu</span><b>{new Date(item.createdAt).toLocaleString("id-ID")}</b></p>
      <p><span>Lokasi</span><b>{locations[item.locationId]?.name || "Lokasi tidak diketahui"}</b></p>
      <p><span>Varian</span><b>{variant?.productName} · {variant?.name}</b></p>
      <p><span>Stok sistem</span><b>{qty(item.systemQty, variant?.unit)}</b></p>
      <p><span>Stok fisik</span><b>{qty(item.actualQty, variant?.unit)}</b></p>
      <p><span>Selisih</span><b className={item.difference < 0 ? "negative" : "positive"}>{item.difference > 0 ? "+" : ""}{qty(item.difference, variant?.unit)}</b></p>
      <p><span>Alasan</span><b>{item.status === "cancelled" ? `Dibatalkan: ${item.cancelReason || item.reason}` : item.reason}</b></p>
      <p><span>Status</span><b>{item.status === "cancelled" ? "Dibatalkan" : "Selesai"}</b></p>
    </div>
    <footer className="modal-actions detail-modal-actions"><button type="button" className="secondary" onClick={close}>Tutup</button></footer>
  </Modal>;
}
function ReturnDetail({ item, variants, locations, close }: any) {
  if (!item) return null;
  const variant = variants[item.variantId];
  return <Modal title="Detail retur barang" desc="Rincian transaksi retur dan perubahan stoknya." close={close}>
    <div className="detail-list">
      <p><span>Waktu</span><b>{new Date(item.createdAt).toLocaleString("id-ID")}</b></p>
      <p><span>Jenis retur</span><b>{item.type === "customer" ? "Retur dari pelanggan" : "Retur ke supplier"}</b></p>
      <p><span>Lokasi</span><b>{locations[item.locationId]?.name || "Lokasi tidak diketahui"}</b></p>
      <p><span>Produk</span><b>{variant?.productName} · {variant?.name}</b></p>
      <p><span>Jumlah</span><b>{qty(item.quantity, variant?.unit)}</b></p>
      <p><span>Alasan</span><b>{item.status === "cancelled" ? `Dibatalkan: ${item.cancelReason || item.reason}` : item.reason}</b></p>
      <p><span>Bukti retur</span><b>{item.proofUrl ? <a className="proof-link" href={item.proofUrl} target="_blank" rel="noreferrer">Lihat foto bukti</a> : "Tidak dilampirkan"}</b></p>
      <p><span>Status</span><b>{item.status === "cancelled" ? "Dibatalkan" : "Selesai"}</b></p>
    </div>
    <footer className="modal-actions detail-modal-actions"><button type="button" className="secondary" onClick={close}>Tutup</button></footer>
  </Modal>;
}
function TransferDetail({
  items,
  business,
  variants,
  locations,
  close,
  notify,
}: any) {
  if (!items?.length) return null;
  const item = items[0];
  const documentCode = transferDisplayCode(item);
  const html = `<!doctype html><meta charset="utf-8"><title>Bukti ${
    documentCode
  }</title><style>body{font:16px Arial;max-width:700px;margin:50px auto;color:#10233b}h1{color:#063858}table{width:100%;border-collapse:collapse}td{padding:12px;border-bottom:1px solid #ddd}td:last-child{text-align:right;font-weight:bold}</style><h1>${
    business?.name || "Menengs"
  }</h1><h2>Bukti Transfer Stok</h2><table><tr><td>Nomor</td><td>${
    documentCode
  }</td></tr><tr><td>Tanggal</td><td>${new Date(item.createdAt).toLocaleString(
    "id-ID",
  )}</td></tr><tr><td>Rute</td><td>${locations[item.fromId]?.name} &rarr; ${
    locations[item.toId]?.name
  }</td></tr><tr><td>Varian</td><td>${items.map((line: any) => `${variants[line.variantId]?.productName} · ${variants[line.variantId]?.name} (${qty(line.quantity, variants[line.variantId]?.unit)})`).join("<br>")}</td></tr><tr><td>Status</td><td>${item.status}</td></tr></table>`;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `bukti-transfer-${documentCode}.html`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      "Bukti transfer diunduh. Cek folder Unduhan/Downloads pada perangkat Anda.",
    );
  };
  const print = () => {
    const win = window.open("", "_blank");
    if (!win) return notify("Izinkan popup browser untuk mencetak bukti.");
    win.document.write(html);
    win.document.close();
    win.print();
  };
  return (
    <Modal
      title="Bukti transfer stok"
      desc="Bukti dapat dicetak atau diunduh dan dibuka kembali."
      close={close}
    >
      <div className="detail-list">
        <p>
          <span>Nomor</span>
          <b>{documentCode}</b>
        </p>
        <p>
          <span>Rute</span>
          <b>
            {locations[item.fromId]?.name || item.fromName || "Lokasi asal"} &rarr; {locations[item.toId]?.name || item.toName || "Lokasi tujuan"}
          </b>
        </p>
        <p>
          <span>Varian ditransfer</span>
          <b>{items.length} varian</b>
        </p>
        <div className="detail-transfer-items">{items.map((line: any) => <p key={line.id}><span>{variants[line.variantId]?.productName} · {variants[line.variantId]?.name}</span><b>{qty(line.quantity, variants[line.variantId]?.unit)}</b></p>)}</div>
        <p><span>Bukti saat dikirim</span><b>{item.sendProofUrl ? <a className="proof-link" href={item.sendProofUrl} target="_blank" rel="noreferrer">Lihat foto pengiriman</a> : "Tidak dilampirkan"}</b></p>
        <p><span>Bukti saat diterima</span><b>{item.receiveProofUrl ? <a className="proof-link" href={item.receiveProofUrl} target="_blank" rel="noreferrer">Lihat foto penerimaan</a> : "Tidak dilampirkan"}</b></p>
        <p>
          <span>Status</span>
          <b>{item.status}</b>
        </p>
      </div>
      <footer className="modal-actions detail-modal-actions">
        <button type="button" className="secondary" onClick={close}>
          Tutup
        </button>
        <button type="button" className="secondary" onClick={print}>
          Cetak
        </button>
        <button type="button" className="primary" onClick={download}>
          <Download size={16} /> Unduh Bukti
        </button>
      </footer>
    </Modal>
  );
}
function ShippingPage({ data, user, runCommand, uploadImage, notify }: any) {
  const [tab, setTab] = useState<"packing" | "ready" | "handover" | "history">("packing");
  const locations = data.locations.filter((location: any) => location.active && (!user.outletId || location.id === user.outletId));
  const defaultLocationId = locations.find((location:any) => location.isCentralWarehouse)?.id || locations[0]?.id || "";
  const [locationId, setLocationId] = useState(defaultLocationId), [marketplace, setMarketplace] = useState("Shopee"), [carrier, setCarrier] = useState("auto");
  useEffect(() => {
    // Owner/Admin memulai dari gudang pusat. Pengguna dengan cakupan lokasi
    // terbatas tetap memakai lokasi penugasannya yang tersedia dalam daftar.
    if (!locations.some((location:any) => location.id === locationId)) setLocationId(defaultLocationId);
  }, [defaultLocationId, locationId, locations]);
  const [handoverCarrier, setHandoverCarrier] = useState("SPX Express"), [courierName, setCourierName] = useState(""), [vehicleNumber, setVehicleNumber] = useState(""), [proofFile, setProofFile] = useState<File | null>(null), [finishing, setFinishing] = useState(false);
  const [batchCode, setBatchCode] = useState(() => `KRM-${jakartaDateKey().replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  const shipments = data.shipments || [], handovers = data.shipmentHandovers || [];
  const scoped = shipments.filter((item: any) => !locationId || item.locationId === locationId);
  const ready = scoped.filter((item: any) => item.status === "ready"), allReady = shipments.filter((item: any) => item.status === "ready"), scanned = scoped.filter((item: any) => item.status === "handover_scanned" && item.handoverBatchCode === batchCode), completed = shipments.filter((item: any) => item.status === "handed_over");
  const carriers = ["SPX Express", "J&T Express", "JNE", "SiCepat", "AnterAja", "Ninja Xpress", "Lainnya"], marketplaces = ["Shopee", "TikTok Shop", "Tokopedia", "Lazada", "Website", "Lainnya"];
  const recordReady = async (trackingNumber: string) => { try { await runCommand("/api/commands/shipping/ready", { trackingNumber, locationId, marketplace, carrier }); const resolvedCarrier = detectShippingCarrier(trackingNumber) || carrier; return { ok: true, message: `${trackingNumber} tercatat sebagai ${resolvedCarrier} · siap diangkut.` }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Resi tidak dapat dicatat." }; } };
  const recordHandover = async (trackingNumber: string) => { try { await runCommand("/api/commands/shipping/handover/scan", { trackingNumber, locationId, carrier: handoverCarrier, batchCode }); return { ok: true, message: `${trackingNumber} masuk batch ${batchCode}.` }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Resi tidak dapat dimasukkan ke batch." }; } };
  const finalize = async () => { if (!scanned.length || finishing) return; setFinishing(true); try { const proofUrl = proofFile ? await uploadImage(proofFile) : undefined; await runCommand("/api/commands/shipping/handover/finalize", { batchCode, courierName, vehicleNumber, proofUrl }); notify(`${scanned.length} paket berhasil diserahkan ke ${handoverCarrier}.`); setBatchCode(`KRM-${jakartaDateKey().replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`); setCourierName(""); setVehicleNumber(""); setProofFile(null); setTab("history"); } catch (error) { notify(error instanceof Error ? error.message : "Serah terima tidak dapat diselesaikan."); } finally { setFinishing(false); } };
  return <PageBlock title="Pengiriman Pesanan" desc="Pastikan paket selesai dipacking dan benar-benar diserahkan kepada ekspedisi.">
    <div className="shipping-stats"><article><span>Siap diangkut</span><b>{allReady.length}</b><small>paket menunggu kurir</small></article><article><span>Batch aktif</span><b>{shipments.filter((item:any) => item.status === "handover_scanned").length}</b><small>resi sudah dipindai</small></article><article><span>Sudah diserahkan</span><b>{completed.length}</b><small>paket selesai</small></article></div>
    <div className="shipping-tabs" role="tablist">{[["packing","Packing"],["ready","Siap Diangkut"],["handover","Serah Terima"],["history","Riwayat"]].map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id as any)}>{label}</button>)}</div>
    {(tab === "packing" || tab === "handover") && <div className="shipping-config"><Field label="Lokasi"><AppSelect value={locationId} onChange={(event:any) => setLocationId(event.target.value)}>{locations.map((item:any) => <option key={item.id} value={item.id}>{item.name}</option>)}</AppSelect></Field>{tab === "packing" ? <><Field label="Marketplace"><AppSelect value={marketplace} onChange={(event:any) => setMarketplace(event.target.value)}>{marketplaces.map(item => <option key={item}>{item}</option>)}</AppSelect></Field><Field label="Identifikasi ekspedisi"><AppSelect value={carrier} onChange={(event:any) => setCarrier(event.target.value)}><option value="auto">Deteksi otomatis (disarankan)</option>{carriers.map(item => <option key={item}>{item}</option>)}</AppSelect></Field></> : <><Field label="Ekspedisi batch"><AppSelect value={handoverCarrier} onChange={(event:any) => setHandoverCarrier(event.target.value)}>{carriers.map(item => <option key={item}>{item}</option>)}</AppSelect></Field><Field label="Kode batch"><input readOnly className="input-readonly" value={batchCode}/></Field></>}</div>}
    {tab === "packing" && <section className="shipping-workspace"><div className="shipping-heading"><div><small>CHECKPOINT 1</small><h3>Scan setelah packing selesai</h3><p>Setiap scan langsung menjadikan paket berstatus Siap Diangkut.</p></div><span>{ready.length} siap</span></div><ContinuousResiScanner onDetected={recordReady}/><RecentShipmentList items={scoped.filter((item:any) => item.status === "ready").slice(0, 8)} users={data.users}/></section>}
    {tab === "ready" && <section className="shipping-workspace"><div className="shipping-heading"><div><small>MENUNGGU KURIR</small><h3>Paket siap diangkut</h3><p>Dikelompokkan per tanggal, lokasi, dan ekspedisi agar ratusan resi tetap mudah diperiksa.</p></div><span>{allReady.length} paket</span></div><GroupedShipmentList items={allReady} users={data.users} locations={data.locations}/></section>}
    {tab === "handover" && <section className="shipping-workspace"><div className="shipping-heading"><div><small>CHECKPOINT 2</small><h3>Scan saat paket diberikan ke kurir</h3><p>Kamera tetap aktif dan setiap resi masuk ke batch {batchCode}.</p></div><span>{scanned.length} dipindai</span></div><ContinuousResiScanner onDetected={recordHandover}/><div className="handover-fields"><Field label="Nama kurir (opsional)"><input value={courierName} onChange={event => setCourierName(event.target.value)} placeholder="Nama petugas ekspedisi"/></Field><Field label="Nomor kendaraan (opsional)"><input value={vehicleNumber} onChange={event => setVehicleNumber(event.target.value)} placeholder="Contoh: B 1234 XYZ"/></Field></div><Field label="Foto bukti serah terima (opsional)"><EvidencePhotoPicker file={proofFile} setFile={setProofFile} subject="serah terima"/></Field><RecentShipmentList items={scanned} users={data.users} empty="Belum ada resi pada batch ini."/><footer className="shipping-finalize"><span><b>{scanned.length} paket</b> akan ditandai telah diserahkan ke {handoverCarrier}.</span><button className="primary" disabled={!scanned.length || finishing} onClick={() => void finalize()}><Check/>{finishing ? "Menyimpan…" : "Selesaikan serah terima"}</button></footer></section>}
    {tab === "history" && <section className="shipping-workspace"><div className="shipping-heading"><div><small>JEJAK AUDIT</small><h3>Riwayat serah terima</h3><p>Buka folder batch untuk memeriksa seluruh resi yang diserahkan kepada kurir.</p></div><span>{handovers.filter((item:any) => item.status === "completed").length} batch</span></div><ShipmentBatchHistory handovers={handovers} shipments={shipments} locations={data.locations} users={data.users}/></section>}
  </PageBlock>;
}
function RecentShipmentList({ items, users, empty = "Belum ada resi tercatat." }: any) { return items.length ? <div className="shipment-list">{items.map((item:any) => <article key={item.id}><span className={`shipment-state ${item.status}`}><Check/></span><div><b>{item.trackingNumber}</b><small>{item.marketplace} · {item.carrier}</small></div><time>{new Date(item.handedOverAt || item.packedAt).toLocaleString("id-ID")} · {users.find((user:any) => user.id === (item.handedOverBy || item.packedBy))?.name || "Petugas"}</time></article>)}</div> : <div className="empty standalone"><Truck/><b>{empty}</b></div>; }

function ShipmentBatchHistory({ handovers, shipments, locations, users }: any) {
  const [query, setQuery] = useState("");
  const userName = (id?:string) => users.find((item:any) => item.id === id)?.name || "Petugas";
  const completed = handovers
    .filter((item:any) => item.status === "completed")
    .map((batch:any) => ({ ...batch, packages: shipments.filter((shipment:any) => shipment.handoverBatchCode === batch.batchCode) }))
    .filter((batch:any) => !query.trim() || batch.batchCode.toLowerCase().includes(query.trim().toLowerCase()) || batch.packages.some((item:any) => item.trackingNumber.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a:any,b:any) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());
  return <div className="batch-history">
    <label className="shipment-search batch-search"><Search/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari kode batch atau nomor resi"/></label>
    <div className="batch-history-summary"><b>{completed.length.toLocaleString("id-ID")} batch ditemukan</b><span>Klik satu batch untuk membuka daftar resi.</span></div>
    {completed.length ? completed.map((batch:any) => <details className="shipment-batch-folder" key={batch.id}>
      <summary>
        <span className="batch-folder-icon"><Archive/></span>
        <span className="batch-folder-main"><b>{batch.batchCode}</b><small>{locations.find((location:any) => location.id === batch.locationId)?.name || "Lokasi"} · {batch.carrier}</small></span>
        <span className="batch-folder-meta"><b>{batch.packages.length} paket</b><small>{batch.completedAt ? new Date(batch.completedAt).toLocaleString("id-ID") : "-"}</small></span>
        <ChevronDown className="batch-folder-chevron"/>
      </summary>
      <div className="batch-folder-content">
        <div className="batch-audit-grid">
          <span><small>Kurir</small><b>{batch.courierName || "Tidak dicatat"}</b></span>
          <span><small>Kendaraan</small><b>{batch.vehicleNumber || "Tidak dicatat"}</b></span>
          <span><small>Petugas serah terima</small><b>{userName(batch.completedBy)}</b></span>
          <span><small>Waktu selesai</small><b>{batch.completedAt ? new Date(batch.completedAt).toLocaleString("id-ID") : "-"}</b></span>
        </div>
        {batch.proofUrl && <a className="batch-proof" href={batch.proofUrl} target="_blank" rel="noreferrer"><img src={batch.proofUrl} alt={`Bukti serah terima ${batch.batchCode}`}/><span><Eye/> Lihat foto bukti</span></a>}
        <div className="batch-package-title"><b>Daftar resi</b><span>{batch.packages.length} paket</span></div>
        {batch.packages.length ? <div className="shipment-list">{batch.packages.map((item:any) => <article key={item.id}><span className="shipment-state handed_over"><Check/></span><div><b>{item.trackingNumber}</b><small>{item.marketplace} · {item.carrier}</small></div><time>Packing {new Date(item.packedAt).toLocaleString("id-ID")} · {userName(item.packedBy)}</time></article>)}</div> : <div className="empty standalone"><Truck/><b>Detail resi batch ini tidak tersedia.</b></div>}
      </div>
    </details>) : <div className="empty standalone"><Archive/><b>{query ? "Batch atau nomor resi tidak ditemukan." : "Belum ada riwayat serah terima."}</b></div>}
  </div>;
}

function GroupedShipmentList({ items, users, locations }: any) {
  const [query, setQuery] = useState(""), [carrier, setCarrier] = useState("all"), [marketplace, setMarketplace] = useState("all"), [visible, setVisible] = useState(50);
  const today = jakartaDateKey();
  const carriers = Array.from(new Set(items.map((item:any) => item.carrier))).sort() as string[];
  const marketplaces = Array.from(new Set(items.map((item:any) => item.marketplace))).sort() as string[];
  const filtered = items
    .filter((item:any) => !query.trim() || item.trackingNumber.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((item:any) => carrier === "all" || item.carrier === carrier)
    .filter((item:any) => marketplace === "all" || item.marketplace === marketplace)
    .sort((a:any,b:any) => new Date(b.packedAt).getTime() - new Date(a.packedAt).getTime());
  const shown = filtered.slice(0, visible);
  const dateGroups = Array.from(shown.reduce((groups:Map<string,any[]>, item:any) => {
    const key = jakartaDateKey(item.packedAt); groups.set(key, [...(groups.get(key) || []), item]); return groups;
  }, new Map<string,any[]>()).entries()) as [string, any[]][];
  const dateLabel = (key:string) => key === today ? `Hari ini · ${new Date(`${key}T12:00:00`).toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" })}` : new Date(`${key}T12:00:00`).toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  return <div className="shipment-groups">
    <div className="shipment-group-tools">
      <label className="shipment-search"><Search/><input value={query} onChange={event => { setQuery(event.target.value); setVisible(50); }} placeholder="Cari nomor resi"/></label>
      <select value={marketplace} onChange={event => { setMarketplace(event.target.value); setVisible(50); }} aria-label="Filter marketplace"><option value="all">Semua marketplace</option>{marketplaces.map(value => <option key={value}>{value}</option>)}</select>
      <select value={carrier} onChange={event => { setCarrier(event.target.value); setVisible(50); }} aria-label="Filter ekspedisi"><option value="all">Semua ekspedisi</option>{carriers.map(value => <option key={value}>{value}</option>)}</select>
    </div>
    <div className="shipment-result-summary"><b>{filtered.length.toLocaleString("id-ID")} paket</b><span>{filtered.length > shown.length ? `${shown.length} ditampilkan` : "seluruh data ditampilkan"}</span></div>
    {dateGroups.length ? dateGroups.map(([dateKey,dateItems]) => {
      const subgroups = Array.from(dateItems.reduce((groups:Map<string,any>, item:any) => {
        const key = `${item.locationId}::${item.carrier}`; const current = groups.get(key) || { locationId:item.locationId, carrier:item.carrier, items:[] }; current.items.push(item); groups.set(key,current); return groups;
      }, new Map<string,any>()).values()) as any[];
      return <details className="shipment-date-folder" key={dateKey} open={dateKey === today}>
        <summary><span><CalendarDays/> <b>{dateLabel(dateKey)}</b></span><em>{dateItems.length} paket</em></summary>
        <div className="shipment-date-content">{subgroups.map((group:any) => <details className="shipment-route-folder" key={`${dateKey}-${group.locationId}-${group.carrier}`} open={dateKey === today}>
          <summary><span><MapPin/> <b>{locations.find((location:any) => location.id === group.locationId)?.name || "Lokasi"}</b><small>{group.carrier}</small></span><em>{group.items.length} paket</em></summary>
          <RecentShipmentList items={group.items} users={users}/>
        </details>)}</div>
      </details>;
    }) : <div className="empty standalone"><Truck/><b>{query ? "Nomor resi tidak ditemukan." : "Belum ada paket yang siap diangkut."}</b></div>}
    {visible < filtered.length && <button type="button" className="secondary shipment-load-more" onClick={() => setVisible(current => current + 50)}>Tampilkan 50 berikutnya</button>}
  </div>;
}

function Notifications({ items, close, act }: { items: OperationalNotification[]; close: () => void; act: (item: OperationalNotification) => void }) {
  const transfers = items.filter((item) => item.tone === "info");
  const stockGroups = Array.from(items.filter((item) => item.tone === "warning").reduce((groups, item) => {
    const label = item.locationName || "Lokasi";
    groups.set(label, [...(groups.get(label) || []), item]);
    return groups;
  }, new Map<string, OperationalNotification[]>()).entries());
  const renderItem = (item: OperationalNotification) => (
    <article key={item.id} className={`notification-${item.tone}`}>
      <div className="notification-copy">
        <span className="notification-icon" aria-hidden="true">
          {item.tone === "warning" ? <AlertTriangle /> : <ArrowRightLeft />}
        </span>
        <div><b>{item.title}</b><span>{item.detail}</span></div>
      </div>
      {item.action && item.actionLabel && <button className="small-primary" onClick={() => act(item)}>{item.actionLabel}</button>}
    </article>
  );
  return (
    <Modal
      title="Notifikasi operasional"
      desc="Prioritas kerja berdasarkan transfer berjalan dan batas minimum stok di setiap lokasi."
      close={close}
    >
      {items.length ? (
        <div className="notification-list">
          <div className="notification-summary"><span><b>{transfers.length}</b> transfer perlu ditindaklanjuti</span><span><b>{items.length - transfers.length}</b> stok di bawah minimum</span></div>
          {transfers.length > 0 && <section className="notification-group"><header><span>TRANSFER BERJALAN</span><b>{transfers.length}</b></header>{transfers.map(renderItem)}</section>}
          {stockGroups.map(([locationName, group]) => <section className="notification-group" key={locationName}><header><span>{locationName.toUpperCase()}</span><b>{group.length} varian</b></header>{group.map(renderItem)}</section>)}
        </div>
      ) : (
        <div className="empty standalone"><Check/><b>Semua operasional aman</b><span>Tidak ada stok menipis atau transfer yang menunggu penerimaan.</span></div>
      )}
    </Modal>
  );
}
const ListSearch=({value,setValue,placeholder}:any)=><label className="list-search"><Search/><input value={value} onChange={(e)=>setValue(e.target.value)} placeholder={placeholder}/></label>;
function EvidencePhotoPicker({ file, setFile, subject = "bukti" }: { file: File | null; setFile: (file: File | null) => void; subject?: string }) {
  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (selected) setFile(selected);
    event.target.value = "";
  };
  return <div className={`evidence-photo-picker ${file ? "selected" : ""}`}>
    <div className="evidence-photo-actions">
      <label><Camera size={18} /><span>Ambil foto</span><input type="file" accept="image/*" capture="environment" onChange={choose} /></label>
      <label><PackagePlus size={18} /><span>Pilih dari galeri</span><input type="file" accept="image/*" onChange={choose} /></label>
    </div>
    <small>{file ? <><Check size={14} /> {file.name}</> : `Belum ada foto ${subject} dipilih.`}</small>
  </div>;
}

const Field = ({ label, children }: any) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
function ChangePasswordModal({ token, close, notify }: { token: string | null; close: () => void; notify: (msg: string) => void }) {
  const [current, setCurrent] = useState(""),
    [newPwd, setNewPwd] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(loading) return;
    setError("");
    if (newPwd !== confirm) return setError("Konfirmasi password tidak cocok");
    if (newPwd.length < 8) return setError("Password baru minimal 8 karakter");
    setLoading(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      notify(data.message);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah password');
    } finally { setLoading(false); }
  };
  return (
    <Modal title="Ganti Password" desc="Pastikan Anda ingat password baru sebelum menyimpan." close={close}>
      <form onSubmit={submit}>
        <Field label="Password Lama">
          <PasswordInput required value={current} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="Password Baru">
          <PasswordInput required minLength={8} value={newPwd} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPwd(e.target.value)} autoComplete="new-password" placeholder="Minimal 8 karakter" />
        </Field>
        <Field label="Konfirmasi Password Baru">
          <PasswordInput required minLength={8} value={confirm} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Ulangi password baru" />
        </Field>
        {error && <div className="login-error" style={{ marginTop: '4px' }}>{error}</div>}
        <ModalActions close={close}>
          <button className="primary" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan Password'}</button>
        </ModalActions>
      </form>
    </Modal>
  );
}
function PasswordInput({ value, onChange, autoComplete, minLength, required, placeholder }: any) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-input-wrap">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
const ModalActions = ({ close, onDelete, disabled, label = 'Simpan' }: any) => (
    <footer className="modal-actions">
      <button type="button" className="secondary" onClick={close}>Batal</button>
      {onDelete && <button type="button" className="danger-button" onClick={onDelete} disabled={disabled}><Trash2 size={16} /> Hapus</button>}
      <button className="primary" type="submit" disabled={disabled}>
        <Check />
        {label}
      </button>
    </footer>
);function HelpPage({ initialSection, clearInitialSection }: { initialSection: string | null, clearInitialSection: () => void }) {
  const [openSection, setOpenSection] = useState<string | null>(initialSection);
  const [searchQuery, setSearchQuery] = useState("");
  const [readingArticle, setReadingArticle] = useState<any>(null);

  useEffect(() => {
    if (initialSection) {
      let foundArticle = null;
      let foundSection = null;
      for (const s of sections) {
        if (s.id === initialSection) foundSection = s.id;
        const art = s.articles.find((a: any) => a.id === initialSection);
        if (art) {
          foundArticle = art;
          foundSection = s.id;
          break;
        }
      }

      if (foundArticle) {
        setReadingArticle(foundArticle);
        setOpenSection(foundSection);
      } else if (foundSection) {
        setOpenSection(foundSection);
      } else {
        setOpenSection(initialSection);
      }
      clearInitialSection();
    }
  }, [initialSection, clearInitialSection]);

  const toggle = (id: string) => setOpenSection(openSection === id ? null : id);

  const filteredSections = sections.map((s: any) => {
    if (!searchQuery) return s;
    const q = searchQuery.toLowerCase();
    const matchedArticles = s.articles.filter((a: any) => a.title.toLowerCase().includes(q));
    if (s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q) || matchedArticles.length > 0) {
      return { ...s, articles: matchedArticles.length > 0 ? matchedArticles : s.articles };
    }
    return null;
  }).filter(Boolean);

  const handlePopularClick = (id: string) => {
    for (const s of sections) {
      const art = s.articles.find((a: any) => a.id === id);
      if (art) {
        setReadingArticle(art);
        setOpenSection(s.id);
        return;
      }
    }
  };

  const toggleSectionFromKeyboard = (event: React.KeyboardEvent<HTMLElement>, id: string) => {
    if (searchQuery || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggle(id);
  };

  if (readingArticle) {
    return (
      <div className="help-page reading-mode">
        <div className="help-reading-header">
          <button className="back-btn" onClick={() => setReadingArticle(null)}>
            <ChevronLeft size={18} /> Kembali ke Pusat Bantuan
          </button>
        </div>
        <div className="help-reading-content">
          <h2 className="article-title">{readingArticle.title}</h2>
          <div className="article-body-wrapper">
            {readingArticle.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="help-page">
      <div className="help-hero">
        <LifeBuoy />
        <div>
          <h2>Pusat Bantuan Menengs</h2>
          <p>Panduan ringkas penggunaan fitur aplikasi. Temukan solusi masalah Anda di bawah ini.</p>
        </div>
      </div>

      <div className="help-search">
        <Search />
        <input 
          type="text" 
          placeholder="Cari bantuan, misalnya 'stok tidak sesuai'..." 
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setOpenSection(null); }}
        />
      </div>

      {!searchQuery && (
        <div className="help-popular">
          <h4>Artikel Populer</h4>
          <div className="popular-list">
            {popularArticles.map((artId: string, idx: number) => {
               let title = "";
               for (const s of sections) {
                 const a = s.articles.find((x: any) => x.id === artId);
                 if (a) title = a.title;
               }
               return (
                 <button key={idx} className="popular-btn" onClick={() => handlePopularClick(artId)}>
                   {title}
                 </button>
               );
            })}
          </div>
        </div>
      )}

      <div className="help-grid">
        {filteredSections.map((s: any) => (
          <article key={s.id} className={`help-card ${(openSection === s.id || searchQuery) ? "open" : ""}`}>
            <header
              onClick={() => !searchQuery && toggle(s.id)}
              onKeyDown={(event) => toggleSectionFromKeyboard(event, s.id)}
              role={searchQuery ? undefined : "button"}
              tabIndex={searchQuery ? -1 : 0}
              aria-expanded={openSection === s.id || Boolean(searchQuery)}
            >
              <div className="icon-wrap">{s.icon}</div>
              <div className="help-card-text">
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <small className="article-count">{s.articles.length} panduan</small>
              </div>
              <span className="icon-btn" aria-hidden="true">
                {(openSection === s.id || searchQuery) ? <ChevronUp /> : <ChevronDown />}
              </span>
            </header>
            {(openSection === s.id || searchQuery) && (
              <div className="help-content">
                {s.articles.map((art: any, idx: number) => (
                  <button key={idx} type="button" className="help-step" onClick={() => setReadingArticle(art)}>
                    <Check />
                    <span>{art.title}</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
        {filteredSections.length === 0 && (
          <div className="empty">
            <Search size={40} opacity={0.2} />
            <b>Tidak ada hasil</b>
            <span>Coba gunakan kata kunci lain.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function HppMarketplaceCalculator({ data, runCommand, notify }: { data: AppData; runCommand: (path: string, payload: object, method?: "POST" | "PATCH") => Promise<AppData>; notify: (message: string) => void }) {
  const variants = useMemo(() => data.products.flatMap(product => product.variants.map(variant => ({ ...variant, productName: product.name, unit: product.unit }))), [data.products]);
  const presets = {
    Shopee: { adminFee: 6.5, paymentFee: 1.8, shippingFee: 4, fixedFee: 1000 },
    Tokopedia: { adminFee: 6.5, paymentFee: 1.5, shippingFee: 4, fixedFee: 1000 },
    TikTok: { adminFee: 4.3, paymentFee: 1, shippingFee: 3, fixedFee: 0 },
  } as const;
  const recipeBlank = (variantId = variants[0]?.id || ""): HppRecipe => ({ id: newId("hpp"), variantId, name: variants.find(item => item.id === variantId)?.productName || "Resep HPP baru", yieldQuantity: 1, yieldUnit: variants.find(item => item.id === variantId)?.unit || "Pcs", materials: [{ id: newId("mat"), name: "", quantity: 1, unit: "Pcs", unitCost: 0 }], additionalCosts: [], targetMargin: 35, updatedAt: new Date().toISOString() });
  const savedRecipes = useMemo(() => data.pricing?.hppRecipes || [], [data.pricing?.hppRecipes]);
  const savedConfigs = useMemo(() => data.pricing?.marketplaceConfigs || [], [data.pricing?.marketplaceConfigs]);
  const [workspace, setWorkspace] = useState<"hpp" | "marketplace">("hpp");
  const [hppStep, setHppStep] = useState<1 | 2 | 3>(1);
  const [recipe, setRecipe] = useState<HppRecipe>(() => savedRecipes[0] || recipeBlank());
  const [platform, setPlatform] = useState<keyof typeof presets>("Shopee");
  const [variantId, setVariantId] = useState(() => savedRecipes[0]?.variantId || variants[0]?.id || "");
  const [sellingPrice, setSellingPrice] = useState(() => Number(variants[0]?.price || 0));
  const [discount, setDiscount] = useState(0);
  const [adminFee, setAdminFee] = useState(6.5);
  const [paymentFee, setPaymentFee] = useState(1.8);
  const [shippingFee, setShippingFee] = useState(4);
  const [fixedFee, setFixedFee] = useState(1000);
  const [saving, setSaving] = useState(false);
  const loadedConfigSignature = useRef("");
  useEffect(() => {
    const signature = JSON.stringify(savedConfigs);
    if (signature === loadedConfigSignature.current) return;
    loadedConfigSignature.current = signature;
    const saved = savedConfigs.find(item => item.platform === platform);
    if (!saved) return;
    setAdminFee(saved.adminFee); setPaymentFee(saved.paymentFee); setShippingFee(saved.shippingFee); setFixedFee(saved.fixedFee); setDiscount(saved.discount);
  }, [platform, savedConfigs]);
  const selected = variants.find(variant => variant.id === variantId);
  const rawMaterialCost = recipe.materials.reduce((total, item) => total + Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unitCost || 0)), 0);
  const extraCost = recipe.additionalCosts.reduce((total, item) => total + Math.max(0, Number(item.amount || 0)), 0);
  const recipeCost = rawMaterialCost + extraCost;
  const recipeHpp = recipe.yieldQuantity > 0 ? recipeCost / recipe.yieldQuantity : 0;
  const recommendedPrice = recipe.targetMargin < 100 ? recipeHpp / (1 - Math.max(0, recipe.targetMargin) / 100) : 0;
  const activeHpp = recipe.variantId === variantId && recipeHpp > 0 ? recipeHpp : Number(selected?.cost || 0);
  const afterDiscount = Math.max(0, sellingPrice) * (1 - Math.min(100, Math.max(0, discount)) / 100);
  const adminAmount = afterDiscount * Math.max(0, adminFee) / 100;
  const paymentAmount = afterDiscount * Math.max(0, paymentFee) / 100;
  const shippingAmount = afterDiscount * Math.max(0, shippingFee) / 100;
  const fees = adminAmount + paymentAmount + shippingAmount + Math.max(0, fixedFee);
  const payout = afterDiscount - fees;
  const profit = payout - activeHpp;
  const margin = afterDiscount > 0 ? (profit / afterDiscount) * 100 : 0;
  const targetPrice = activeHpp > 0 && adminFee + paymentFee + shippingFee < 100 ? activeHpp / (1 - (adminFee + paymentFee + shippingFee) / 100) : 0;
  const selectPreset = (next: keyof typeof presets) => {
    const saved = savedConfigs.find(item => item.platform === next);
    const base = saved || presets[next];
    setPlatform(next); setAdminFee(base.adminFee); setPaymentFee(base.paymentFee); setShippingFee(base.shippingFee); setFixedFee(base.fixedFee); setDiscount(saved?.discount || 0);
  };
  const updateMaterial = (id: string, patch: Partial<HppMaterial>) => setRecipe(current => ({ ...current, materials: current.materials.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const updateAdditional = (id: string, patch: Partial<HppAdditionalCost>) => setRecipe(current => ({ ...current, additionalCosts: current.additionalCosts.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const loadRecipe = (id: string) => {
    const next = savedRecipes.find(item => item.id === id);
    if (!next) { const blank = recipeBlank(variantId); setRecipe(blank); return; }
    setRecipe(next); setVariantId(next.variantId || variantId);
    const product = variants.find(item => item.id === next.variantId);
    if (product) setSellingPrice(Number(next.sellingPrice || product.price || 0));
  };
  const savePricing = async (nextRecipe?: HppRecipe, configOnly = false) => {
    if (!configOnly && !(nextRecipe || recipe).name.trim()) { notify("Nama resep HPP wajib diisi"); return; }
    const recipeToSave = { ...(nextRecipe || recipe), updatedAt: new Date().toISOString() };
    const recipes = configOnly ? savedRecipes : [recipeToSave, ...savedRecipes.filter(item => item.id !== recipeToSave.id)];
    const config: MarketplaceConfig = { platform, adminFee, paymentFee, shippingFee, fixedFee, discount, updatedAt: new Date().toISOString() };
    const configs = [config, ...savedConfigs.filter(item => item.platform !== platform)];
    setSaving(true);
    try {
      await runCommand("/api/commands/pricing", { pricing: { hppRecipes: recipes, marketplaceConfigs: configs } }, "POST");
      setRecipe(recipeToSave);
      notify(configOnly ? `Konfigurasi ${platform} tersimpan ke database` : "Resep HPP tersimpan ke database");
    } catch (error) { notify(error instanceof Error ? error.message : "Gagal menyimpan konfigurasi"); }
    finally { setSaving(false); }
  };
  const numberInput = (label: string, value: number, onChange: (value: number) => void, suffix = "Rp", step = "1") => <label className="field"><span>{label}</span><div className="money-input">{suffix && <small>{suffix}</small>}<input type="number" min="0" step={step} value={Number.isFinite(value) ? value : 0} onChange={event => onChange(Math.max(0, Number(event.target.value) || 0))} /></div></label>;
  return <PageBlock title="HPP & Marketplace" desc="Hitung HPP produksi serta simulasi biaya marketplace dari satu menu yang terhubung ke produk Menengs.">
    <div className="pricing-switch" role="tablist"><button className={workspace === "hpp" ? "active" : ""} onClick={() => setWorkspace("hpp")}>1. HPP Produksi</button><button className={workspace === "marketplace" ? "active" : ""} onClick={() => setWorkspace("marketplace")}>2. Biaya Marketplace</button></div>
    {workspace === "hpp" ? <div className="hpp-wizard">
      <div className="hpp-stepper" aria-label="Tahapan kalkulator HPP">{([{ id: 1, title: "Bahan Baku" }, { id: 2, title: "Biaya Tambahan" }, { id: 3, title: "Hasil & Harga" }] as const).map((item, index) => <div className={hppStep === item.id ? "active" : hppStep > item.id ? "done" : ""} key={item.id}><button onClick={() => setHppStep(item.id)}><b>{item.id}</b><span><small>Langkah {item.id}</small>{item.title}</span></button>{index < 2 && <i />}</div>)}</div>
      <div className="card hpp-recipe-bar"><label><span>Bahan baku HPP tersimpan</span><AppSelect value={savedRecipes.some(item => item.id === recipe.id) ? recipe.id : ""} onChange={(event:any) => loadRecipe(event.target.value)}><option value="">+ Bahan baku HPP baru (kosong)</option>{savedRecipes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</AppSelect></label><button className="secondary" onClick={() => { setRecipe(recipeBlank(recipe.variantId)); setHppStep(1); }}><Plus /> Buat bahan baku baru</button></div>
      {hppStep === 1 && <section className="card hpp-step-card">
        <div className="hpp-product-grid"><label className="field hpp-name-field"><span>Nama produk / resep</span><div className="money-input"><input value={recipe.name} onChange={event => setRecipe(current => ({ ...current, name: event.target.value }))} /></div></label>{numberInput("Yield (hasil jadi)", recipe.yieldQuantity, value => setRecipe(current => ({ ...current, yieldQuantity: value })), "")}<label className="field"><span>Satuan hasil</span><AppSelect value={recipe.yieldUnit} onChange={(event:any) => setRecipe(current => ({ ...current, yieldUnit: event.target.value }))}><option>Pcs</option><option>Pack</option><option>Box</option><option>Kg</option><option>Gram</option></AppSelect></label><label className="field hpp-variant-field"><span>Hubungkan ke varian Menengs</span><AppSelect value={recipe.variantId || ""} onChange={(event:any) => { const product = variants.find(item => item.id === event.target.value); setRecipe(current => ({ ...current, variantId: event.target.value, yieldUnit: product?.unit || current.yieldUnit })); setVariantId(event.target.value); setSellingPrice(Number(product?.price || 0)); }}><option value="">Belum dihubungkan</option>{variants.map(item => <option key={item.id} value={item.id}>{item.productName} · {item.name}</option>)}</AppSelect></label></div>
        <div className="pricing-section-head"><div><h3>Daftar bahan baku</h3><p>Masukkan bahan yang benar-benar dipakai untuk satu kali produksi {recipe.yieldQuantity || 0} {recipe.yieldUnit}.</p></div><button className="primary" onClick={() => setRecipe(current => ({ ...current, materials: [...current.materials, { id: newId("mat"), name: "", quantity: 1, unit: "Pcs", unitCost: 0 }] }))}><Plus /> Tambah bahan</button></div>
        <div className="pricing-table-wrap"><table className="pricing-table hpp-material-table"><thead><tr><th>Nama bahan baku</th><th>Jumlah dipakai</th><th>Satuan dipakai</th><th>Harga satuan</th><th>Harga per</th><th>Total biaya</th><th>Aksi</th></tr></thead><tbody>{recipe.materials.map(item => <tr key={item.id}><td><input aria-label="Nama bahan baku" value={item.name} onChange={event => updateMaterial(item.id, { name: event.target.value })} placeholder="Contoh: Makaroni" /></td><td><input aria-label="Jumlah bahan" type="number" min="0" value={item.quantity} onChange={event => updateMaterial(item.id, { quantity: Math.max(0, Number(event.target.value) || 0) })} /></td><td><select aria-label="Satuan bahan" value={item.unit} onChange={event => updateMaterial(item.id, { unit: event.target.value })}><option>Pcs</option><option>Gram</option><option>Kg</option><option>Liter</option><option>Pack</option><option>Box</option></select></td><td><input aria-label="Harga satuan bahan" type="number" min="0" value={item.unitCost} onChange={event => updateMaterial(item.id, { unitCost: Math.max(0, Number(event.target.value) || 0) })} /></td><td><span>{item.unit}</span></td><td><b>{money(item.quantity * item.unitCost)}</b></td><td><button className="icon-btn danger-icon" aria-label="Hapus bahan" disabled={recipe.materials.length === 1} onClick={() => setRecipe(current => ({ ...current, materials: current.materials.filter(material => material.id !== item.id) }))}><Trash2 /></button></td></tr>)}</tbody></table></div>
        <div className="subtotal-row"><span>Subtotal bahan baku</span><b>{money(rawMaterialCost)}</b></div><div className="hpp-nav"><span /><button className="primary" onClick={() => setHppStep(2)}>Lanjut ke Langkah 2: Biaya Tambahan <ArrowRight /></button></div>
      </section>}
      {hppStep === 2 && <section className="card hpp-step-card">
        <div className="pricing-section-head no-border"><div><h3>Biaya tambahan operasional</h3><p>Tenaga kerja, kemasan, stiker, gas/listrik, dan penyusutan alat untuk satu batch.</p></div><button className="primary" onClick={() => setRecipe(current => ({ ...current, additionalCosts: [...current.additionalCosts, { id: newId("cost"), name: "", category: "lainnya", amount: 0 }] }))}><Plus /> Tambah biaya</button></div>
        <div className="pricing-table-wrap"><table className="pricing-table hpp-cost-table"><thead><tr><th>Keterangan biaya</th><th>Kategori</th><th>Nominal alokasi</th><th>Aksi</th></tr></thead><tbody>{recipe.additionalCosts.map(item => <tr key={item.id}><td><input aria-label="Nama biaya tambahan" value={item.name} onChange={event => updateAdditional(item.id, { name: event.target.value })} placeholder="Contoh: Kemasan pouch" /></td><td><select aria-label="Kategori biaya" value={item.category || "lainnya"} onChange={event => updateAdditional(item.id, { category: event.target.value as HppAdditionalCost["category"] })}><option value="tenaga_kerja">Tenaga kerja</option><option value="kemasan">Kemasan & stiker</option><option value="overhead">Overhead</option><option value="lainnya">Lainnya</option></select></td><td><input aria-label="Nilai biaya tambahan" type="number" min="0" value={item.amount} onChange={event => updateAdditional(item.id, { amount: Math.max(0, Number(event.target.value) || 0) })} /></td><td><button className="icon-btn danger-icon" aria-label="Hapus biaya" onClick={() => setRecipe(current => ({ ...current, additionalCosts: current.additionalCosts.filter(cost => cost.id !== item.id) }))}><Trash2 /></button></td></tr>)}</tbody></table></div>
        <div className="subtotal-row"><span>Subtotal biaya tambahan</span><b>{money(extraCost)}</b></div><div className="hpp-nav"><button className="secondary" onClick={() => setHppStep(1)}><ChevronLeft /> Kembali ke bahan baku</button><button className="primary" onClick={() => setHppStep(3)}>Lanjut ke Langkah 3: Hasil & Harga <ArrowRight /></button></div>
      </section>}
      {hppStep === 3 && <section className="hpp-result-step"><div className="hpp-result-cards"><article><span>Total biaya produksi</span><b>{money(recipeCost)}</b><small>Bahan: {money(rawMaterialCost)} + biaya: {money(extraCost)}</small></article><article className="hpp-total-card"><span>HPP murni per {recipe.yieldUnit || "unit"}</span><b>{money(recipeHpp)}</b><small>Batas minimum absolut (harga modal)</small></article><article className="hpp-recommend-card"><span>Harga jual rekomendasi</span><b>{money(recommendedPrice)}</b><small>Berdasarkan target margin {recipe.targetMargin}%</small></article></div><div className="card hpp-final-card"><h3>Simulasi penentuan harga jual akhir</h3><div className="hpp-final-grid"><div><label className="field"><span>Target margin keuntungan</span><div className="range-control"><input type="range" min="0" max="90" value={recipe.targetMargin} onChange={event => setRecipe(current => ({ ...current, targetMargin: Number(event.target.value) }))} /><b>{recipe.targetMargin}%</b></div></label><p className="formula-note">Rumus HPP: Harga Jual = HPP / (1 − Margin/100)</p>{numberInput(`Harga jual ditetapkan toko (Rp / ${recipe.yieldUnit})`, sellingPrice, setSellingPrice)}</div><aside><div><span>Harga jual ditetapkan</span><b>{money(sellingPrice)}</b></div><div><span>Dikurangi HPP modal/unit</span><b className="negative">− {money(recipeHpp)}</b></div><hr /><strong>Laba bersih per {recipe.yieldUnit}: <b className={sellingPrice >= recipeHpp ? "positive" : "negative"}>{money(sellingPrice - recipeHpp)}</b></strong><p>Margin aktual: <b>{sellingPrice > 0 ? (((sellingPrice - recipeHpp) / sellingPrice) * 100).toFixed(1) : "0.0"}%</b></p><p>Persentase markup: <b>{recipeHpp > 0 ? (((sellingPrice - recipeHpp) / recipeHpp) * 100).toFixed(1) : "0.0"}%</b></p></aside></div><div className="hpp-nav"><button className="secondary" onClick={() => setHppStep(2)}><ChevronLeft /> Kembali ke biaya tambahan</button><button className="primary" disabled={saving} onClick={() => savePricing()}><Check /> {saving ? "Menyimpan…" : "Simpan resep HPP"}</button></div></div></section>}
    </div> : <div className="marketplace-workspace">
      <section className="card marketplace-intro"><h3>Kalkulator Diskon & Biaya Marketplace</h3><p>Simulasikan potongan Shopee, Tokopedia, atau TikTok Shop agar harga jual tetap menghasilkan laba bersih.</p></section>
      <div className="pricing-presets"><span>Preset platform</span>{(Object.keys(presets) as Array<keyof typeof presets>).map(item => <button key={item} className={platform === item ? "active" : ""} onClick={() => selectPreset(item)}>{item === "Shopee" ? "Shopee (Star / Mall)" : item === "Tokopedia" ? "Tokopedia (Power Merchant PRO)" : "TikTok Shop (Official)"}</button>)}</div>
      <div className="marketplace-grid"><section className="card pricing-form"><h3>Input harga & komisi platform</h3><div className="form-grid">{numberInput("Harga jual normal", sellingPrice, setSellingPrice)}{numberInput("Modal HPP produk", activeHpp, () => {}, "Rp")}</div>{numberInput("Diskon penjual / voucher", discount, value => setDiscount(Math.min(100, value)), "%", "0.1")}<div className="pricing-divider"><span>Konfigurasi potongan platform</span></div><div className="form-grid">{numberInput("Komisi admin platform", adminFee, value => setAdminFee(Math.min(100, value)), "%", "0.1")}{numberInput("Biaya pembayaran", paymentFee, value => setPaymentFee(Math.min(100, value)), "%", "0.1")}{numberInput("Gratis ongkir / cashback", shippingFee, value => setShippingFee(Math.min(100, value)), "%", "0.1")}{numberInput("Biaya tetap transaksi", fixedFee, setFixedFee)}</div><div className="pricing-actions"><button className="secondary" onClick={() => selectPreset(platform)}><RotateCcw /> Reset ke default</button><button className="primary" disabled={saving} onClick={() => savePricing(undefined, true)}><Check /> {saving ? "Menyimpan…" : "Simpan konfigurasi"}</button></div></section>
      <aside className={`card marketplace-summary ${profit < 0 ? "loss" : ""}`}><h3>Rincian penerimaan (net payout)</h3><div className="calc-row"><span>Harga setelah diskon</span><b>{money(afterDiscount)}</b></div><div className="fee-row"><span>Komisi admin ({adminFee}%)</span><b>- {money(adminAmount)}</b></div><div className="fee-row"><span>Biaya pembayaran ({paymentFee}%)</span><b>- {money(paymentAmount)}</b></div><div className="fee-row"><span>Gratis ongkir / cashback ({shippingFee}%)</span><b>- {money(shippingAmount)}</b></div><div className="fee-row"><span>Biaya tetap per pesanan</span><b>- {money(fixedFee)}</b></div><hr /><div className="calc-row total"><span>Total potongan platform</span><b>{money(fees)}</b></div><div className="net-payout"><span>Cair ke rekening (net)</span><b>{money(payout)}</b></div><div className="profit-box"><span>{profit < 0 ? "Peringatan kerugian" : "Laba bersih / produk"}</span><b>{money(profit)}</b><small>Margin keuntungan bersih: {margin.toFixed(1)}%</small></div><p className="muted">Harga minimum impas: <b>{money(targetPrice)}</b> sebelum pembulatan.</p></aside></div>
    </div>}
  </PageBlock>;
}

function AnalyticsPage({ data }: { data: AppData }) {
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const todayKey = jakartaDateKey();
  const [dateFrom, setDateFrom] = useState(todayKey);
  const [dateTo, setDateTo] = useState(todayKey);
  const analyticsRangeLabel = dateFrom === dateTo
    ? new Date(`${dateFrom}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : `${new Date(`${dateFrom}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(`${dateTo}T12:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;
  const handleRefresh = (key: string) => {
    setRefreshing(p => ({ ...p, [key]: true }));
    setTimeout(() => {
      setRefreshing(p => ({ ...p, [key]: false }));
    }, 600);
  };

  const stats = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    const isInRange = (createdAt: string) => {
      const key = jakartaDateKey(createdAt);
      return key >= dateFrom && key <= dateTo;
    };
    const filteredSales = data.sales.filter(sale => sale.status !== "voided" && isInRange(sale.createdAt));
    const filteredReceipts = (data.receipts || []).filter(receipt => receipt.status !== "cancelled" && isInRange(receipt.createdAt));
    const filteredTransfers = data.transfers.filter(transfer => transfer.status !== "cancelled" && isInRange(transfer.createdAt));
    
    const costMap: Record<string, number> = {};
    const variantMap: Record<string, Variant> = {};
    data.products.forEach(p => {
      p.variants.forEach(v => {
        costMap[v.id] = v.cost || 0;
        variantMap[v.id] = v;
      });
    });

    filteredSales.forEach(sale => {
      revenue += sale.total;
      sale.items.forEach((item: any) => {
        cogs += (item.quantity * (item.unitCost || costMap[item.variantId] || 0));
      });
    });

    const grossProfit = revenue - cogs;

    let stockValue = 0;
    const lowStockAlerts: { variant: Variant, product: Product, qty: number }[] = [];
    const balancesByVariant: Record<string, number> = {};

    data.balances.forEach(b => {
      stockValue += (b.quantity * (costMap[b.variantId] || 0));
      balancesByVariant[b.variantId] = (balancesByVariant[b.variantId] || 0) + b.quantity;
    });

    Object.entries(balancesByVariant).forEach(([vid, q]) => {
      const v = variantMap[vid];
      if (v && q <= (v.minStock || 0)) {
        const p = data.products.find(prod => prod.variants.some(x => x.id === vid));
        if (p) lowStockAlerts.push({ variant: v, product: p, qty: q });
      }
    });

    // Recent Activities
    const activities = [
      ...filteredSales.map(s => ({ date: new Date(s.createdAt), type: 'Penjualan', desc: `Transaksi Penjualan via ${s.channel}`, amount: s.total, color: '#10b981' })),
      ...filteredReceipts.map(r => ({ date: new Date(r.createdAt), type: 'Stok Masuk', desc: `Penerimaan stok dari ${r.sourceType}`, amount: r.quantity * r.unitCost, color: '#3b82f6' })),
      ...filteredTransfers.map(t => ({ date: new Date(t.createdAt), type: 'Transfer', desc: `Transfer stok antar lokasi`, amount: 0, color: '#f59e0b' }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);

    const salesTrend: { date: string, Omset: number, Modal: number }[] = [];
    const trendByKey: Record<string, number> = {};
    for (let key = dateFrom, day = 0; key <= dateTo && day < 366; key = shiftDateKey(key, 1), day += 1) {
      trendByKey[key] = salesTrend.length;
      salesTrend.push({ date: new Date(`${key}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }), Omset: 0, Modal: 0 });
    }
    filteredSales.forEach(sale => {
      const index = trendByKey[jakartaDateKey(sale.createdAt)];
      if (index === undefined) return;
      salesTrend[index].Omset += sale.total;
      sale.items.forEach((item: any) => { salesTrend[index].Modal += item.quantity * (item.unitCost || costMap[item.variantId] || 0); });
    });

    const salesByVariant: Record<string, number> = {};
    filteredSales.forEach(s => {
      s.items.forEach(item => {
        salesByVariant[item.variantId] = (salesByVariant[item.variantId] || 0) + item.quantity;
      });
    });

    const topProducts = Object.entries(salesByVariant)
      .map(([vid, q]) => ({
        variant: variantMap[vid],
        product: data.products.find(prod => prod.variants.some(x => x.id === vid)),
        qty: q
      }))
      .filter(x => x.variant && x.product)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
      
    // Profit / Loss Chart Data
    const profitData = [
      { name: 'Modal (HPP)', value: cogs, color: '#f87171' },
      { name: 'Estimasi Laba Kotor', value: grossProfit, color: '#10b981' }
    ];

    const channelSales = (['offline', 'online'] as Channel[]).reduce((result, channel) => {
      const transactions = filteredSales.filter(sale => sale.channel === channel);
      result[channel] = {
        total: transactions.reduce((sum, sale) => sum + sale.total, 0),
        count: transactions.length,
      };
      return result;
    }, {} as Record<Channel, { total: number; count: number }>);

    return {
      revenue,
      grossProfit,
      stockValue,
      lowStockAlerts,
      topProducts,
      activities,
      salesTrend,
      profitData,
      totalSalesCount: filteredSales.length,
      totalProductsCount: data.products.length,
      cogs,
      channelSales,
    };
  }, [data, dateFrom, dateTo]);

  return (
    <PageBlock
      title="Dashboard Utama"
      desc="Ringkasan performa dan kesehatan bisnis Anda."
      action="Unduh Analitik Excel"
      onAction={async () => {
        const summaryData = [
          ["Total Omset", stats.revenue],
          ["Estimasi Laba Kotor", stats.grossProfit],
          ["Total Modal (HPP)", stats.cogs],
          ["Nilai Stok Saat Ini", stats.stockValue],
          ["Jumlah Transaksi Penjualan", stats.totalSalesCount],
          ["Penjualan Outlet", stats.channelSales.offline.total],
          ["Transaksi Outlet", stats.channelSales.offline.count],
          ["Penjualan Online", stats.channelSales.online.total],
          ["Transaksi Online", stats.channelSales.online.count],
          ["Total Varian Produk", stats.totalProductsCount]
        ];
        
        const trendData = stats.salesTrend.map((t: any) => [t.date, t.Omset, t.Modal]);
        const topProductsData = stats.topProducts.map((t: any, idx: number) => [idx + 1, t.product?.name || '-', t.variant?.name || '-', t.qty]);
        
        await downloadExcel(`Analitik_Bisnis_Menengs_${new Date().toISOString().slice(0, 10)}`, [
          {
            name: "Ringkasan",
            columns: [
              { header: "Indikator", key: "indikator", width: 35 },
              { header: "Nilai", key: "totalnilai", width: 25 }
            ],
            data: summaryData
          },
          {
            name: "Tren Periode Terpilih",
            columns: [
              { header: "Tanggal", key: "tanggal", width: 20 },
              { header: "Omset Penjualan", key: "omset", width: 25 },
              { header: "Modal (HPP)", key: "modal", width: 25 }
            ],
            data: trendData
          },
          {
            name: "Top 5 Produk Terlaris",
            columns: [
              { header: "Peringkat", key: "peringkat", width: 15 },
              { header: "Produk", key: "produk", width: 30 },
              { header: "Varian", key: "varian", width: 25 },
              { header: "Terjual (Qty)", key: "qty", width: 20 }
            ],
            data: topProductsData
          }
        ]);
        alert("Laporan Analitik Excel berhasil diunduh.");
      }}
      secondaryAction="Cetak PDF"
      onSecondaryAction={() => {
        downloadPDF('analytics-dashboard-content', `Analitik_Bisnis_${new Date().toISOString().slice(0, 10)}`);
      }}
    >
      <div id="analytics-dashboard-content" style={{ padding: '4px', backgroundColor: 'var(--bg)' }}>
        <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} initialMode="realtime" />
        <ChannelSalesSummary sales={data.sales.filter(sale => sale.status !== 'voided' && jakartaDateKey(sale.createdAt) >= dateFrom && jakartaDateKey(sale.createdAt) <= dateTo)} />
        <div className="dash-grid-top">
          {/* Aktivitas Terakhir */}
        <article className="dash-widget">
          <header>
            <h3>Aktivitas Terakhir</h3>
            <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("act")}><RotateCcw size={14} className={`text-muted ${refreshing.act ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content scroll-y" style={{maxHeight: 220}}>
            {stats.activities.length === 0 ? <p className="empty-text">Belum ada aktivitas</p> : (
              <div className="timeline">
                {stats.activities.map((act, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="time-col">
                      <b>{act.date.toLocaleDateString('id-ID', {day:'2-digit'})}</b>
                      <small>{act.date.toLocaleDateString('id-ID', {month:'short'})}</small>
                    </div>
                    <div className="timeline-dot" style={{borderColor: act.color}}></div>
                    <div className="timeline-content">
                      <div className="time-badge">{act.date.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</div>
                      <p>{act.desc}</p>
                      {act.amount > 0 && <b>{money(act.amount)}</b>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        {/* Peringatan Stok */}
        <article className="dash-widget">
          <header>
            <h3>Peringatan Stok Menipis</h3>
            <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("stock")}><RotateCcw size={14} className={`text-muted ${refreshing.stock ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content scroll-y" style={{maxHeight: 220}}>
            {stats.lowStockAlerts.length === 0 ? <p className="empty-text">Semua stok aman</p> : (
              <div className="timeline">
                {stats.lowStockAlerts.map((alert, idx) => (
                  <div key={idx} className="timeline-item">
                     <div className="timeline-dot" style={{borderColor: '#ef4444'}}></div>
                     <div className="timeline-content">
                        <div className="time-badge" style={{background: '#fee2e2', color: '#b91c1c'}}>Perhatian</div>
                        <p>{alert.product.name} - {alert.variant.name}</p>
                        <small>Sisa: {qty(alert.qty, alert.product.unit)} (Min: {qty(alert.variant.minStock, alert.product.unit)})</small>
                     </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        {/* Aset Saat Ini */}
        <article className="dash-widget">
          <header>
            <h3>Aset saat ini</h3>
            <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("asset")}><RotateCcw size={14} className={`text-muted ${refreshing.asset ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content">
            <small style={{color:'var(--muted)'}}>Total Nilai Stok</small>
            <h2 style={{fontSize: 28, margin: '8px 0 24px', color: 'var(--navy)'}}>{money(stats.stockValue)}</h2>
            
            <div style={{display:'flex', justifyContent:'space-between', borderTop:'1px solid var(--line)', paddingTop: 16}}>
              <span className="text-muted">Total Transaksi</span>
              <b>{stats.totalSalesCount} kali</b>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', marginTop: 8}}>
              <span className="text-muted">Total Barang</span>
              <b>{stats.totalProductsCount} jenis</b>
            </div>
          </div>
        </article>
      </div>

      <div className="dash-grid-middle">
        {/* Arus Kas / Bar Chart */}
        <article className="dash-widget">
          <header>
             <div>
               <h3>Penjualan vs Modal</h3>
               <small className="text-muted">Periode {analyticsRangeLabel}</small>
             </div>
             <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("barchart")}><RotateCcw size={14} className={`text-muted ${refreshing.barchart ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content" style={{paddingTop: 16, minWidth: 0, minHeight: 250}}>
             <ResponsiveContainer width="100%" height={250}>
               <BarChart data={stats.salesTrend} margin={{top:0, right:10, left:-20, bottom:0}}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                 <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                 <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(val) => `Rp${val/1000}k`}/>
                 <RechartsTooltip formatter={(val: any) => money(Number(val))} cursor={{fill: '#f8fafc'}}/>
                 <Legend iconType="circle" wrapperStyle={{fontSize: 12, paddingTop: 10}}/>
                 <Bar dataKey="Modal" name="Modal (HPP)" stackId="a" fill="#f87171" radius={[0,0,4,4]} barSize={24}/>
                 <Bar dataKey="Omset" name="Omset Kotor" stackId="a" fill="#34d399" radius={[4,4,0,0]} />
               </BarChart>
             </ResponsiveContainer>
          </div>
        </article>

        {/* Grafik Penjualan */}
        <article className="dash-widget">
          <header>
             <div>
               <h3>Tren Omset Penjualan</h3>
               <small className="text-muted">Periode {analyticsRangeLabel}</small>
             </div>
             <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("linechart")}><RotateCcw size={14} className={`text-muted ${refreshing.linechart ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content" style={{paddingTop: 16, minWidth: 0, minHeight: 250}}>
             <ResponsiveContainer width="100%" height={250}>
               <LineChart data={stats.salesTrend} margin={{top:0, right:10, left:-20, bottom:0}}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                 <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                 <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(val) => `Rp${val/1000}k`}/>
                 <RechartsTooltip formatter={(val: any) => money(Number(val))} />
                 <Line type="monotone" dataKey="Omset" stroke="#0ea5e9" strokeWidth={3} dot={{r: 4, fill: '#0ea5e9', strokeWidth: 2, stroke:'#fff'}} activeDot={{r: 6}} />
               </LineChart>
             </ResponsiveContainer>
          </div>
        </article>
      </div>
      
      <div className="dash-grid-bottom">
        {/* Laba Rugi */}
        <article className="dash-widget">
          <header>
             <h3>Estimasi Laba Kotor (Semua Waktu)</h3>
             <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("donut")}><RotateCcw size={14} className={`text-muted ${refreshing.donut ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content" style={{display:'flex', alignItems:'center', height: 200}}>
             <div style={{width: '50%', height: '100%'}}>
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie data={stats.profitData} innerRadius={55} outerRadius={75} paddingAngle={2} dataKey="value" stroke="none">
                     {stats.profitData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                   </Pie>
                   <RechartsTooltip formatter={(val: any) => money(Number(val))}/>
                 </PieChart>
               </ResponsiveContainer>
             </div>
             <div style={{width: '50%', paddingLeft: 16}}>
                <div style={{marginBottom: 12}}>
                  <div style={{display:'flex', alignItems:'center', gap: 6, fontSize: 13, color: 'var(--muted)'}}>
                    <span style={{width: 8, height: 8, borderRadius: '50%', background: '#34d399'}}></span> Omset Total
                  </div>
                  <b>{money(stats.revenue)}</b>
                </div>
                <div style={{marginBottom: 12}}>
                  <div style={{display:'flex', alignItems:'center', gap: 6, fontSize: 13, color: 'var(--muted)'}}>
                    <span style={{width: 8, height: 8, borderRadius: '50%', background: '#f87171'}}></span> Nilai HPP
                  </div>
                  <b>{money(stats.cogs)}</b>
                </div>
                <div style={{borderTop:'1px solid var(--line)', paddingTop: 8}}>
                  <div style={{fontSize: 13, color: 'var(--muted)'}}>Estimasi Laba Kotor</div>
                  <b style={{color: '#10b981', fontSize: 16}}>{money(stats.grossProfit)}</b>
                </div>
             </div>
          </div>
        </article>
        
        {/* Produk Terlaris */}
        <article className="dash-widget">
          <header>
             <h3>Produk Terlaris</h3>
             <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("top")}><RotateCcw size={14} className={`text-muted ${refreshing.top ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content scroll-y" style={{height: 200, paddingRight: 8}}>
             {stats.topProducts.length === 0 ? <p className="empty-text">Belum ada data</p> : (
               <ul className="ranking-list" style={{gap: 0}}>
                 {stats.topProducts.map((p) => (
                   <li key={p.variant!.id} style={{padding: '12px 0', background: 'transparent', borderBottom: '1px solid var(--line)', borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0}}>
                     <div className="rank-info">
                       <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                         <b style={{margin: 0}}>{p.product!.name}</b>
                         <b style={{color:'#10b981', margin: 0}}>{qty(p.qty, p.product!.unit)}</b>
                       </div>
                       <small>{p.variant!.name}</small>
                     </div>
                   </li>
                 ))}
               </ul>
             )}
          </div>
        </article>
      </div>
      </div>
    </PageBlock>
  );
}

export default App;
