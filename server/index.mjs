import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveUserScope, authorizeAction } from './rbac.mjs';
import { syncStateToSQL, getStateFromSQL } from './sqlState.mjs';

// EAN-13 adalah format yang dapat dibaca oleh scanner barcode retail umum.
// Prefix 20 dipakai untuk kode internal usaha; 10 digit berikutnya diturunkan
// dari ID organisasi + varian agar kode tetap stabil saat data dimuat ulang.
const ean13Checksum = (digits) => {
  const sum = String(digits).split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
};
const internalBarcode = (key, used = new Set()) => {
  let hash = 2166136261;
  for (const character of String(key)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  let suffix = (hash >>> 0) % 10_000_000_000;
  for (;;) {
    const base = `20${String(suffix).padStart(10, '0')}`;
    const barcode = `${base}${ean13Checksum(base)}`;
    if (!used.has(barcode)) return barcode;
    suffix = (suffix + 1) % 10_000_000_000;
  }
};
const assignMissingBarcodes = (state, organizationId) => {
  const used = new Set((state?.products || []).flatMap(product => (product.variants || []).map(variant => variant.barcode)).filter(Boolean));
  let changed = false;
  for (const product of state?.products || []) for (const variant of product.variants || []) {
    // Barcode supplier dapat berupa Code 128/Code 39, bukan hanya EAN-13.
    // Buat barcode internal hanya bila memang belum ada nilainya.
    if (!String(variant.barcode || '').trim()) {
      variant.barcode = internalBarcode(`${organizationId}:${variant.id}`, used);
      used.add(variant.barcode);
      changed = true;
    }
  }
  return changed;
};
async function backfillBarcodes(pool) {
  const [states] = await pool.execute('SELECT id, payload FROM app_state');
  for (const row of states) {
    const state = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    if (!state || !assignMissingBarcodes(state, row.id)) continue;
    await pool.execute('UPDATE app_state SET payload = ? WHERE id = ?', [JSON.stringify(state), row.id]);
    for (const product of state.products || []) for (const variant of product.variants || []) {
      await pool.execute('UPDATE variants SET barcode = ? WHERE id = ? AND organization_id = ?', [variant.barcode, variant.id, row.id]);
    }
  }
}

// Versi awal aplikasi menyimpan sebagian transaksi tanpa `cashierId`. Kolom
// relasional sekarang wajib diisi, sehingga satu transaksi lama yang cacat
// sebelumnya dapat menggagalkan CRUD lain (misalnya menambah lokasi). Tandai
// riwayat tersebut sebagai hasil migrasi agar akuntabilitas user saat ini
// tetap jujur dan sinkronisasi berikutnya selalu dapat berjalan.
async function backfillLegacySaleCashiers(pool) {
  const [states] = await pool.execute('SELECT id, payload FROM app_state');
  let organizationsUpdated = 0;
  let salesBackfilled = 0;
  for (const row of states) {
    const state = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    if (!state || !Array.isArray(state.sales)) continue;
    let changed = false;
    for (const sale of state.sales) {
      if (sale.cashierId) continue;
      sale.cashierId = 'system-migration';
      changed = true;
      salesBackfilled += 1;
    }
    if (!changed) continue;
    organizationsUpdated += 1;
    await pool.execute('UPDATE app_state SET payload = ? WHERE id = ?', [JSON.stringify(state), row.id]);
  }
  if (salesBackfilled) console.info(`Backfilled cashier identity for ${salesBackfilled} legacy sales across ${organizationsUpdated} organizations.`);
}
async function backfillRolePolicyDependencies(pool) {
  const requirements = { analytics:'report.view', products:'product.view', locations:'location.view', pricing:'pricing.view', suppliers:'supplier.view', receipts:'stock.view', stock:'stock.view', transfers:'transfer.view', opname:'stock.view', history:'audit.view', sales:'sale.view', shipping:'shipping.view', returns:'stock.view', employees:'user.view', attendance:'attendance.view', loans:'payroll.view', reports:'report.view' };
  const [rows] = await pool.execute('SELECT id, payload FROM app_state');
  for (const row of rows) {
    const state = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    let changed = false;
    state.rolePolicies ||= {};
    const defaults = defaultRolePolicyState();
    for (const [role, policy] of Object.entries(defaults)) {
      if (!state.rolePolicies[role]) { state.rolePolicies[role] = policy; changed = true; }
    }
    for (const policy of Object.values(state?.rolePolicies || {})) {
      policy.permissions ||= [];
      for (const menu of policy.menus || []) {
        const required = requirements[menu];
        if (required && !policy.permissions.includes(required)) { policy.permissions.push(required); changed = true; }
      }
    }
    if (changed) await pool.execute('UPDATE app_state SET payload=? WHERE id=?', [JSON.stringify(state), row.id]);
  }
}

const defaultRoleMenusById = {
  admin: ['dashboard','analytics','products','locations','pricing','suppliers','receipts','stock','transfers','opname','history','sales','shipping','returns','employees','attendance','reports','help'],
  pic: ['dashboard','products','locations','stock','transfers','opname','history','sales','shipping','reports','attendance','help'],
  finance: ['dashboard','stock','reports','analytics','help'],
  warehouse: ['dashboard','products','locations','receipts','stock','transfers','opname','history','shipping','reports','attendance','help'],
  cashier: ['dashboard','products','locations','stock','sales','attendance','help'],
  employee: ['attendance','help'],
};
const defaultRolePolicyState = () => Object.fromEntries(Object.entries(defaultRoleMenusById).map(([role, menus]) => [role, {
  menus: [...menus],
  permissions: [...resolveUserScope({ role, outletId: 'default-location' }).permissions],
}]));

const app = express();
const port = Number(process.env.PORT || 8787);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProduction = process.env.NODE_ENV === 'production';
const databaseRequired = isProduction || (process.env.NODE_ENV !== 'test' && process.env.REQUIRE_DATABASE === 'true');
const appOrigin = process.env.APP_ORIGIN?.trim();
const selfRegistrationEnabled = process.env.ALLOW_SELF_REGISTRATION === 'true';
const configuredJwtSecret = process.env.JWT_SECRET || '';
const insecureSecrets = new Set(['replace_with_a_long_random_secret', 'veinstock-local-development-secret-change-in-production', 'veinstock-local-development-secret']);
if (isProduction && (!process.env.DB_HOST || !appOrigin || configuredJwtSecret.length < 32 || insecureSecrets.has(configuredJwtSecret))) {
  throw new Error('DB_HOST, APP_ORIGIN, dan JWT_SECRET acak minimal 32 karakter wajib diatur pada environment production');
}
app.use(cors({ origin: appOrigin ? appOrigin.split(',').map(origin => origin.trim()).filter(Boolean) : !isProduction }));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    // Pemindaian barcode POS menggunakan kamera pada origin aplikasi sendiri.
    // `camera=()` memblokir getUserMedia sebelum Chrome sempat menampilkan
    // dialog izin; karena itu hanya self yang diizinkan, sementara fitur lain
    // yang tidak dipakai tetap tertutup.
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self)'
  });
  if (isProduction) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (isProduction) res.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://res.cloudinary.com; connect-src 'self'; media-src 'self' blob:");
  next();
});
// State aplikasi saat ini masih dikirim sebagai satu dokumen agar perubahan
// stok/transaksi antar akun tetap atomik. Batas default Express (100 KB) dan
// batas lama 2 MB terlalu kecil untuk organisasi yang memiliki riwayat
// transaksi, sehingga request valid dapat ditolak sebelum autentikasi/rute
// sempat diproses.
app.use(express.json({ limit: '10mb' }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
cloudinary.config({secure:true});
const imageUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1},fileFilter:(_req,file,done)=>done(null,['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.mimetype))});

// ── Email / SMTP ─────────────────────────────────────────────────────────────
const hasResend = Boolean(process.env.RESEND_API_KEY);
const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_PASS);
const mailer = hasResend ? nodemailer.createTransport({
  host: 'smtp.resend.com',
  port: 465,
  secure: true,
  auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
}) : hasSmtp ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}) : null;
const FROM_ADDRESS = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@menengs.app';
const APP_NAME = 'Menengs';

function buildResetEmail(recipientName, token, expiresMinutes = 15) {
  const subject = `Reset Password ${APP_NAME}`;
  const html = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;padding:32px 16px}
  .wrap{max-width:520px;margin:0 auto}
  .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px #0002}
  .header{background:linear-gradient(135deg,#0d9563 0%,#0a7a50 100%);padding:36px 40px;text-align:center}
  .logo{font-size:22px;font-weight:800;color:#fff;letter-spacing:2px;margin-bottom:4px}
  .logo-sub{font-size:12px;color:#a7f3d0;letter-spacing:1px}
  .body{padding:40px}
  .greeting{font-size:16px;color:#374151;margin-bottom:16px}
  .lead{font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:28px}
  .token-box{background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:28px}
  .token-label{font-size:11px;font-weight:700;color:#16a34a;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px}
  .token{font-size:28px;font-weight:800;color:#0d9563;letter-spacing:8px;font-family:monospace}
  .expires{font-size:12px;color:#9ca3af;margin-top:8px}
  .warning{background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#92400e;margin-bottom:28px;line-height:1.5}
  .ignore{font-size:13px;color:#9ca3af;text-align:center;line-height:1.5;margin-bottom:32px}
  .footer{background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb}
  .footer p{font-size:12px;color:#9ca3af;line-height:1.6}
  .footer strong{color:#6b7280}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
      <div class="logo-sub">Sistem Manajemen Stok UMKM</div>
    </div>
    <div class="body">
      <p class="greeting">Halo, <strong>${recipientName}</strong> 👋</p>
      <p class="lead">Kami menerima permintaan untuk mereset password akun <strong>${APP_NAME}</strong> Anda. Gunakan kode OTP di bawah ini untuk melanjutkan proses reset password.</p>
      <div class="token-box">
        <div class="token-label">Kode OTP Reset Password</div>
        <div class="token">${token}</div>
        <div class="expires">Berlaku selama ${expiresMinutes} menit</div>
      </div>
      <div class="warning">
        ⚠️ <strong>Jangan bagikan kode ini</strong> kepada siapa pun, termasuk Tim Menengs. Kode ini bersifat rahasia dan hanya untuk Anda.
      </div>
      <p class="ignore">Jika Anda tidak merasa meminta reset password, abaikan email ini. Akun Anda tetap aman.</p>
    </div>
    <div class="footer">
      <p><strong>${APP_NAME}</strong> · Sistem Manajemen Stok UMKM</p>
      <p>Email ini dikirim otomatis, harap tidak membalas.</p>
    </div>
  </div>
</div>
</body></html>`;
  return { subject, html };
}

function buildChangePasswordEmail(recipientName) {
  const subject = `Password ${APP_NAME} Berhasil Diubah`;
  const html = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;padding:32px 16px}
  .wrap{max-width:520px;margin:0 auto}
  .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px #0002}
  .header{background:linear-gradient(135deg,#0d9563 0%,#0a7a50 100%);padding:36px 40px;text-align:center}
  .logo{font-size:22px;font-weight:800;color:#fff;letter-spacing:2px;margin-bottom:4px}
  .logo-sub{font-size:12px;color:#a7f3d0;letter-spacing:1px}
  .body{padding:40px}
  .greeting{font-size:16px;color:#374151;margin-bottom:16px}
  .lead{font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:28px}
  .success-box{background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:28px}
  .check{font-size:36px;margin-bottom:8px}
  .success-text{font-size:15px;font-weight:700;color:#0d9563}
  .warning{background:#fef2f2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;color:#991b1b;margin-bottom:28px;line-height:1.5}
  .footer{background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb}
  .footer p{font-size:12px;color:#9ca3af;line-height:1.6}
  .footer strong{color:#6b7280}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div class="logo">${APP_NAME}</div>
      <div class="logo-sub">Sistem Manajemen Stok UMKM</div>
    </div>
    <div class="body">
      <p class="greeting">Halo, <strong>${recipientName}</strong> 👋</p>
      <p class="lead">Kami ingin memberitahu bahwa password akun <strong>${APP_NAME}</strong> Anda baru saja berhasil diubah.</p>
      <div class="success-box">
        <div class="check">✅</div>
        <div class="success-text">Password berhasil diperbarui</div>
      </div>
      <div class="warning">
        🚨 <strong>Bukan Anda yang melakukan ini?</strong> Segera hubungi Owner atau admin usaha Anda untuk mengamankan akun.
      </div>
    </div>
    <div class="footer">
      <p><strong>${APP_NAME}</strong> · Sistem Manajemen Stok UMKM</p>
      <p>Email ini dikirim otomatis, harap tidak membalas.</p>
    </div>
  </div>
</div>
</body></html>`;
  return { subject, html };
}

// In-memory OTP store: Map<email, { otp, hash, expiresAt, name }>
const resetTokens = new Map();
const requestWindows = new Map();
function generateOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
function rateLimit({ key, windowMs, max }) {
  if (requestWindows.size > 10000) requestWindows.clear();
  const now = Date.now();
  const attempts = (requestWindows.get(key) || []).filter(timestamp => timestamp > now - windowMs);
  if (attempts.length >= max) return false;
  attempts.push(now);
  requestWindows.set(key, attempts);
  return true;
}

let pool;
async function db() {
  if (!process.env.DB_HOST) {
    if (databaseRequired) throw new Error('Database wajib digunakan, tetapi DB_HOST belum dikonfigurasi');
    return null;
  }
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 8,
      timezone: 'Z',
    });
    await pool.execute(`CREATE TABLE IF NOT EXISTS app_state (
      id VARCHAR(40) PRIMARY KEY,
      version BIGINT NOT NULL DEFAULT 1,
      payload JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS organizations (
      id VARCHAR(40) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      owner_name VARCHAR(150),
      phone VARCHAR(50),
      email VARCHAR(150),
      address TEXT,
      logo_url TEXT,
      negative_stock_policy ENUM('BLOCK', 'WARN', 'ALLOW') DEFAULT 'BLOCK',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('owner','pic','finance','admin','warehouse','cashier','employee') NOT NULL,
      outlet_id VARCHAR(40) NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_email (organization_id,email),
      INDEX idx_users_email (email),
      INDEX idx_users_org_created (organization_id, created_at)
    )`);
    const [orgColumn]=await pool.query("SHOW COLUMNS FROM users LIKE 'organization_id'");
    if(!orgColumn.length){
      await pool.execute("ALTER TABLE users ADD COLUMN organization_id VARCHAR(40) NULL AFTER id");
      await pool.execute("INSERT IGNORE INTO organizations (id,name,slug) VALUES ('org-meneng','Meneng','meneng')");
      await pool.execute("UPDATE users SET organization_id='org-meneng' WHERE organization_id IS NULL");
      await pool.execute("ALTER TABLE users MODIFY organization_id VARCHAR(40) NOT NULL");
    }
    // Menambah peran karyawan pada instalasi lama tanpa mengubah akun yang sudah ada.
    await pool.execute("ALTER TABLE users MODIFY COLUMN role ENUM('owner','pic','finance','admin','warehouse','cashier','employee') NOT NULL");
    
    // Check if new organization columns exist (Migration)
    const [orgOwnerColumn]=await pool.query("SHOW COLUMNS FROM organizations LIKE 'owner_name'");
    if(!orgOwnerColumn.length){
      await pool.execute("ALTER TABLE organizations ADD COLUMN owner_name VARCHAR(150) NULL AFTER slug, ADD COLUMN phone VARCHAR(50) NULL, ADD COLUMN email VARCHAR(150) NULL, ADD COLUMN address TEXT NULL, ADD COLUMN logo_url TEXT NULL, ADD COLUMN negative_stock_policy ENUM('BLOCK', 'WARN', 'ALLOW') DEFAULT 'BLOCK'");
    }

    // Check if unique constraint exists on locations (Migration)
    try {
      await pool.execute("ALTER TABLE locations ADD CONSTRAINT uq_org_loc_name UNIQUE (organization_id, name, type)");
    } catch (err) {
      // Ignore if constraint already exists
    }

    // Check if unique constraint exists on email (Migration VS-R004)
    try {
      await pool.execute("ALTER TABLE users ADD CONSTRAINT uq_global_email UNIQUE (email)");
    } catch (err) {
      // Ignore if constraint already exists
    }

    // Daftar staf dibatasi per organisasi lalu diurutkan berdasarkan waktu
    // pembuatan. Indeks gabungan mencegah filesort saat jumlah akun membesar.
    try {
      await pool.execute("ALTER TABLE users ADD INDEX idx_users_org_created (organization_id, created_at)");
    } catch (err) {
      if (err?.code !== 'ER_DUP_KEYNAME') throw err;
    }

    // --- V2 REST API TABLES ---
    await pool.execute(`CREATE TABLE IF NOT EXISTS locations (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(150) NOT NULL,
      type ENUM('warehouse', 'outlet') NOT NULL,
      address TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      is_central_warehouse BOOLEAN NOT NULL DEFAULT FALSE,
      INDEX idx_org (organization_id),
      UNIQUE KEY uq_org_loc_name (organization_id, name, type)
    )`);
    const [centralWarehouseColumn] = await pool.query("SHOW COLUMNS FROM locations LIKE 'is_central_warehouse'");
    if (!centralWarehouseColumn.length) {
      await pool.execute("ALTER TABLE locations ADD COLUMN is_central_warehouse BOOLEAN NOT NULL DEFAULT FALSE AFTER active");
    }
    await pool.execute(`CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(100),
      unit VARCHAR(20) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      image_url TEXT,
      INDEX idx_org (organization_id)
    )`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS variants (
      id VARCHAR(40) PRIMARY KEY,
      product_id VARCHAR(40) NOT NULL,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(150) NOT NULL,
      sku VARCHAR(100) NOT NULL,
      barcode VARCHAR(20) NULL,
      cost INT NOT NULL DEFAULT 0,
      price INT NOT NULL DEFAULT 0,
      reseller_price INT NOT NULL DEFAULT 0,
      min_stock INT NOT NULL DEFAULT 0,
      grams_per_cup INT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      INDEX idx_org (organization_id),
      INDEX idx_product (product_id)
    )`);
    try {
      await pool.execute('ALTER TABLE variants ADD COLUMN barcode VARCHAR(20) NULL AFTER sku');
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    await backfillBarcodes(pool);
    await backfillRolePolicyDependencies(pool);
    await pool.execute(`CREATE TABLE IF NOT EXISTS variant_location_min_stock (
      variant_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      min_stock INT NOT NULL DEFAULT 0,
      PRIMARY KEY (variant_id, location_id)
    )`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS balances (
      organization_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      variant_id VARCHAR(40) NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      PRIMARY KEY (location_id, variant_id),
      INDEX idx_org (organization_id)
    )`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS stock_movements (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      variant_id VARCHAR(40) NOT NULL,
      quantity INT NOT NULL,
      type VARCHAR(50) NOT NULL, 
      reason TEXT,
      reference_id VARCHAR(40),
      date VARCHAR(100) NOT NULL,
      created_by VARCHAR(40) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_org_loc (organization_id, location_id)
    )`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      total INT NOT NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'offline',
      method VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL,
      note TEXT,
      cashier_id VARCHAR(40) NOT NULL,
      created_at VARCHAR(100) NOT NULL,
      INDEX idx_org_loc (organization_id, location_id)
    )`);
    try {
      await pool.execute("ALTER TABLE sales ADD COLUMN channel VARCHAR(20) NOT NULL DEFAULT 'offline' AFTER total");
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    await backfillLegacySaleCashiers(pool);
    await pool.execute(`CREATE TABLE IF NOT EXISTS sale_items (
      sale_id VARCHAR(40) NOT NULL,
      variant_id VARCHAR(40) NOT NULL,
      quantity INT NOT NULL,
      unit_cost INT NULL,
      price INT NOT NULL,
      discount INT NOT NULL DEFAULT 0,
      subtotal INT NOT NULL,
      INDEX idx_sale (sale_id)
    )`);
    try {
      await pool.execute('ALTER TABLE sale_items ADD COLUMN unit_cost INT NULL AFTER quantity');
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    await pool.execute(`CREATE TABLE IF NOT EXISTS transfers (
      id VARCHAR(40) PRIMARY KEY,
      transfer_code VARCHAR(64),
      organization_id VARCHAR(40) NOT NULL,
      from_id VARCHAR(40) NOT NULL,
      to_id VARCHAR(40) NOT NULL,
      variant_id VARCHAR(40) NOT NULL,
      quantity INT NOT NULL,
      status VARCHAR(50) NOT NULL,
      created_at VARCHAR(100) NOT NULL,
      received_at VARCHAR(100),
      cancelled_at VARCHAR(100),
      cancel_reason TEXT,
      created_by VARCHAR(40),
      INDEX idx_org (organization_id)
    )`);
    // Upgrade database lama tanpa menghapus histori transfer yang sudah ada.
    try {
      await pool.execute('ALTER TABLE transfers ADD COLUMN transfer_code VARCHAR(64) NULL');
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    await pool.execute(`CREATE TABLE IF NOT EXISTS stock_counts (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      variant_id VARCHAR(40) NOT NULL,
      expected INT NOT NULL,
      actual INT NOT NULL,
      reason TEXT,
      created_by VARCHAR(40),
      created_at VARCHAR(100) NOT NULL,
      INDEX idx_org_loc (organization_id, location_id)
    )`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS user_location_assignments (
      id VARCHAR(40) PRIMARY KEY,
      user_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      INDEX idx_user (user_id)
    )`);

    const [countRows] = await pool.query('SELECT COUNT(*) total FROM users');
    if (!Number(countRows[0].total)) {
      const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || (isProduction ? null : 'VeinStock123!');
      if (!defaultPassword) throw new Error('INITIAL_ADMIN_PASSWORD wajib diatur sebelum inisialisasi production pertama');
      const passwordHash = await bcrypt.hash(defaultPassword, 12);
      await pool.execute("INSERT IGNORE INTO organizations (id,name,slug) VALUES ('org-meneng','Meneng','meneng')");
      const initialUsers = [
        ['u-owner','Owner Meneng',process.env.INITIAL_ADMIN_EMAIL || 'owner@meneng.id','owner',null],
        ['u-pic','Rina - PIC Outlet','pic@meneng.id','pic','loc-outlet-1'],
        ['u-fin','Dewi - Keuangan','finance@meneng.id','finance',null],
      ];
      for (const [id,name,email,role,outletId] of initialUsers) await pool.execute('INSERT INTO users (id,organization_id,name,email,password_hash,role,outlet_id,active) VALUES (?,\'org-meneng\',?,?,?,?,?,TRUE)', [id,name,email,passwordHash,role,outletId]);
    }

    // Instalasi database baru harus langsung memiliki state organisasi. Tanpa
    // baris ini akun awal dapat login, tetapi seluruh command operasional akan
    // ditolak dengan pesan "Data usaha belum siap".
    const [initialStateRows] = await pool.execute("SELECT id FROM app_state WHERE id = 'org-meneng' LIMIT 1");
    if (!initialStateRows.length) {
      const [ownerRows] = await pool.execute("SELECT id, name, email FROM users WHERE organization_id = 'org-meneng' AND role = 'owner' LIMIT 1");
      if (ownerRows.length) {
        const initialState = emptyState('Meneng', ownerRows[0]);
        await pool.execute('INSERT INTO app_state (id, version, payload) VALUES (?, 1, ?)', ['org-meneng', JSON.stringify(initialState)]);
        await syncStateToSQL(pool, 'org-meneng', initialState);
      }
    }
  }
  return pool;
}

const demoStates = new Map();
const jwtSecret = process.env.JWT_SECRET || 'veinstock-local-development-secret';
const demoUsers = [
  { id:'u-owner',organization_id:'org-meneng',organization_name:'Meneng',name:'Owner Meneng',email:'owner@meneng.id',role:'owner',active:true },
  { id:'u-pic',organization_id:'org-meneng',organization_name:'Meneng',name:'Rina - PIC Outlet',email:'pic@meneng.id',role:'pic',outletId:'loc-outlet-1',active:true },
  { id:'u-fin',organization_id:'org-meneng',organization_name:'Meneng',name:'Dewi - Keuangan',email:'finance@meneng.id',role:'finance',active:true },
];
const safeUser = user => ({ id:user.id,name:user.name,email:user.email,role:user.role,outletId:user.outlet_id || user.outletId,active:Boolean(user.active),organizationId:user.organization_id,organizationName:user.organization_name });
async function attachRolePermissions(conn, organizationId, actor) {
  if (!actor || actor.role === 'owner') return actor;
  let state;
  if (!conn) state = demoStates.get(organizationId)?.data;
  else {
    const [rows] = await conn.execute('SELECT payload FROM app_state WHERE id=? LIMIT 1', [organizationId]);
    state = rows[0]?.payload;
    if (typeof state === 'string') state = JSON.parse(state);
  }
  actor.rolePermissions = state?.rolePolicies?.[actor.role]?.permissions;
  return actor;
}
async function organizationRoleIds(conn, organizationId) {
  let state;
  if (!conn) state = demoStates.get(organizationId)?.data;
  else {
    const [rows] = await conn.execute('SELECT payload FROM app_state WHERE id=? LIMIT 1', [organizationId]);
    state = rows[0]?.payload;
    if (typeof state === 'string') state = JSON.parse(state);
  }
  const roles = Object.keys(state?.rolePolicies || {}).filter(role => configurableRoles.has(role));
  return new Set(roles.length ? roles : configurableRoles);
}
const slugify=value=>String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const emptyState=(organizationName,owner)=>({business:{name:organizationName,ownerName:owner.name,email:owner.email},users:[{id:owner.id,name:owner.name,email:owner.email,role:'owner',active:true}],locations:[{id:'loc-owner',name:`Gudang ${organizationName}`,type:'warehouse',active:true}],products:[],balances:[],transfers:[],sales:[],movements:[],stockCounts:[],suppliers:[],receipts:[],returns:[],employees:[],attendanceSettings:[],attendances:[],loans:[],payrolls:[],rolePolicies:defaultRolePolicyState()});
app.post('/api/login', async (req,res) => {
  const email=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  if (!rateLimit({ key: `login:${email}:${req.ip}`, windowMs: 15 * 60 * 1000, max: 10 })) return res.status(429).json({ message: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.' });
  const conn=await db();
  let user;
  if(conn){ const [rows]=await conn.execute('SELECT u.*,o.name organization_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.email=? AND u.active=TRUE AND o.active=TRUE LIMIT 1',[email]); user=rows[0]; if(!user || !await bcrypt.compare(password,user.password_hash)) return res.status(401).json({message:'Email atau password tidak sesuai'}); }
  else { user=demoUsers.find(item=>item.email===email); if(!user || password!==(user.demo_password||'VeinStock123!')) return res.status(401).json({message:'Email atau password tidak sesuai'}); }
  const publicUser=safeUser(user);
  if(!publicUser.role) return res.status(403).json({message:'Role pengguna tidak valid atau kosong'});
  res.json({token:jwt.sign({sub:publicUser.id,role:publicUser.role,org:publicUser.organizationId},jwtSecret,{expiresIn:'12h'}),user:publicUser});
});
app.post('/api/register',async(req,res)=>{
  if (!selfRegistrationEnabled) return res.status(404).json({message:'Pendaftaran mandiri tidak tersedia'});
  const organizationName=String(req.body?.organizationName||'').trim(),name=String(req.body?.name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(organizationName.length<2||name.length<2||!email.includes('@')||password.length<8)return res.status(400).json({message:'Lengkapi data usaha dan gunakan password minimal 8 karakter'});
  const suffix=Math.random().toString(36).slice(2,7),organizationId=`org-${Date.now()}-${suffix}`,userId=`u-${Date.now()}-${suffix}`,slug=`${slugify(organizationName)||'usaha'}-${suffix}`;
  const conn=await db();
  let user={id:userId,organization_id:organizationId,organization_name:organizationName,name,email,role:'owner',active:true,demo_password:password};
  if(!conn){if(demoUsers.some(item=>item.email===email))return res.status(409).json({message:'Email sudah terdaftar'});demoUsers.push(user);demoStates.set(organizationId,{version:1,data:emptyState(organizationName,user)});}
  else{const connection=await conn.getConnection();try{await connection.beginTransaction();const [existing]=await connection.execute('SELECT id FROM users WHERE email=? LIMIT 1',[email]);if(existing.length){await connection.rollback();return res.status(409).json({message:'Email sudah terdaftar'});}await connection.execute('INSERT INTO organizations (id,name,slug) VALUES (?,?,?)',[organizationId,organizationName,slug]);await connection.execute('INSERT INTO users (id,organization_id,name,email,password_hash,role,active) VALUES (?,?,?,?,?,\'owner\',TRUE)',[userId,organizationId,name,email,await bcrypt.hash(password,12)]);await connection.execute('INSERT INTO app_state (id,version,payload) VALUES (?,1,?)',[organizationId,JSON.stringify(emptyState(organizationName,user))]);await connection.commit();}catch(error){await connection.rollback();return res.status(500).json({message:'Gagal membuat ruang usaha'});}finally{connection.release();}}
  const publicUser=safeUser(user);res.status(201).json({token:jwt.sign({sub:userId,role:'owner',org:organizationId},jwtSecret,{expiresIn:'12h'}),user:publicUser});
});
function requireAuth(req,res,next){ const token=req.headers.authorization?.replace(/^Bearer\s+/,''); if(!token)return res.status(401).json({message:'Silakan masuk kembali'}); try{req.auth=jwt.verify(token,jwtSecret);next()}catch{return res.status(401).json({message:'Sesi telah berakhir'})} }
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const inventoryKey = (locationId, variantId) => `${locationId}:${variantId}`;
const addInventoryDelta = (deltas, locationId, variantId, quantity) => {
  const key = inventoryKey(locationId, variantId);
  const next = (deltas.get(key) || 0) + quantity;
  if (next === 0) deltas.delete(key);
  else deltas.set(key, next);
};
const balanceChangesMatch = (previous, next, expected) => {
  const oldBalances = new Map((previous.balances || []).map(item => [inventoryKey(item.locationId, item.variantId), item.quantity]));
  const newBalances = new Map((next.balances || []).map(item => [inventoryKey(item.locationId, item.variantId), item.quantity]));
  const keys = new Set([...oldBalances.keys(), ...newBalances.keys(), ...expected.keys()]);
  for (const key of keys) {
    if ((newBalances.get(key) || 0) - (oldBalances.get(key) || 0) !== (expected.get(key) || 0)) return false;
  }
  return true;
};
const movementDeltasMatch = (previous, next, expected) => {
  const oldMovements = new Map((previous.movements || []).map(item => [item.id, item]));
  const actual = new Map();
  for (const item of (next.movements || [])) {
    if (oldMovements.has(item.id)) {
      if (!same(oldMovements.get(item.id), item)) return false;
      continue;
    }
    addInventoryDelta(actual, item.locationId, item.variantId, item.quantity);
  }
  if (actual.size !== expected.size) return false;
  for (const [key, quantity] of expected) if (actual.get(key) !== quantity) return false;
  return true;
};
const mergeById = (previous = [], next = []) => {
  const merged = new Map(previous.map(item => [item.id, item]));
  next.forEach(item => merged.set(item.id, item));
  return Array.from(merged.values());
};
const mergeBalances = (previous = [], next = []) => {
  const merged = new Map(previous.map(item => [inventoryKey(item.locationId, item.variantId), item]));
  next.forEach(item => merged.set(inventoryKey(item.locationId, item.variantId), item));
  return Array.from(merged.values());
};
const mergeScopedState = (previous, next, actor) => {
  if (actor.role === 'owner' || actor.role === 'admin') return next;
  // Location-scoped users receive only their own slice. Preserve the rest of the
  // organisation before validating the operation, so a normal POS write never
  // deletes data that is intentionally hidden from that user.
  return {
    ...previous,
    // getStateFromSQL berfokus pada tabel operasional dan tidak membawa users.
    // Saat payload dari PIC digabungkan, tetap sertakan array users agar state
    // gabungan memenuhi kontrak validasi tanpa membuka pengguna lain.
    users: next.users || previous.users || [],
    balances: mergeBalances(previous.balances, next.balances),
    sales: mergeById(previous.sales, next.sales),
    transfers: mergeById(previous.transfers, next.transfers),
    movements: mergeById(previous.movements, next.movements),
    stockCounts: mergeById(previous.stockCounts, next.stockCounts),
    receipts: mergeById(previous.receipts, next.receipts),
    returns: mergeById(previous.returns, next.returns),
    attendances: mergeById(previous.attendances, next.attendances),
  };
};
function validateRoleChange(previous,next,user){
  if(!previous) {
    const auth = authorizeAction({ user, action: 'product.create' });
    if (!auth.allowed) return 'Data awal hanya dapat dibuat oleh Owner/Admin';
    return null;
  }

  const role = user.role;
  const oldSales = new Map(previous.sales.map(s => [s.id, s]));
  const oldTransfers = new Map(previous.transfers.map(t => [t.id, t]));
  const oldCounts = new Map(previous.stockCounts.map(c => [c.id, c]));
  const oldReceipts = new Map((previous.receipts || []).map(r => [r.id, r]));
  const expectedBalanceDeltas = new Map();

  // Restricted roles may never mutate unrelated records through the generic state endpoint.
  if (role !== 'owner' && role !== 'admin') {
    if (!same(previous.returns || [], next.returns || [])) return 'Retur hanya dapat diubah oleh Owner atau Admin.';
    if (!same(previous.suppliers || [], next.suppliers || [])) return 'Data supplier hanya dapat diubah oleh Owner atau Admin.';
  }
  if (role !== 'owner' && (!same(previous.employees || [], next.employees || []) || !same(previous.attendanceSettings || [], next.attendanceSettings || []) || !same(previous.loans || [], next.loans || []) || !same(previous.payrolls || [], next.payrolls || []))) return 'Data karyawan, pengaturan kehadiran, kasbon, dan penggajian hanya dapat diubah oleh Owner.';

  // Profile and Master Data
  if (!same(previous.business, next.business) || !same(previous.locations, next.locations)) {
    const auth = authorizeAction({ user, action: 'location.update' });
    if (!auth.allowed) return auth.reason;
  }
  
  if (!same(previous.products, next.products)) {
    const auth = authorizeAction({ user, action: 'product.update' });
    if (!auth.allowed) return auth.reason;
  }

  // Sales validation
  for (const s of next.sales) {
    const old = oldSales.get(s.id);
    if (!old) { // New sale
      const auth = authorizeAction({ user, action: 'sale.create', locationId: s.locationId });
      if (!auth.allowed) return auth.reason;
      if (s.status && s.status !== 'completed') return 'Penjualan baru harus berstatus selesai.';
      for (const item of s.items) addInventoryDelta(expectedBalanceDeltas, s.locationId, item.variantId, -item.quantity);
    } else if (!same(s, old)) {
      if (old.status !== 'voided' && s.status === 'voided') {
        const auth = authorizeAction({ user, action: 'sale.void', locationId: s.locationId });
        if (!auth.allowed) return auth.reason;
        for (const item of old.items) addInventoryDelta(expectedBalanceDeltas, old.locationId, item.variantId, item.quantity);
      } else {
        if (role !== 'owner' && role !== 'admin') return 'Penjualan yang sudah tersimpan tidak dapat diedit langsung. Gunakan pembatalan (Void).';
      }
    }
  }

  // Stock In / Receipts
  for (const r of (next.receipts || [])) {
    const old = oldReceipts.get(r.id);
    if (!old) {
      const auth = authorizeAction({ user, action: 'stock.in', locationId: r.locationId });
      if (!auth.allowed) return auth.reason;
      if (r.status !== 'cancelled') addInventoryDelta(expectedBalanceDeltas, r.locationId, r.variantId, r.quantity);
    } else if (!same(r, old)) {
      if (old.status !== 'cancelled' && r.status === 'cancelled') {
        const auth = authorizeAction({ user, action: 'stock.in', locationId: old.locationId });
        if (!auth.allowed) return auth.reason;
        addInventoryDelta(expectedBalanceDeltas, old.locationId, old.variantId, -old.quantity);
      } else if (role !== 'owner' && role !== 'admin') return 'Stok masuk yang telah tersimpan tidak dapat diubah langsung.';
    }
  }

  // Stock Opname
  for (const c of next.stockCounts) {
    const old = oldCounts.get(c.id);
    if (!old) {
      const auth = authorizeAction({ user, action: 'stock.opname', locationId: c.locationId });
      if (!auth.allowed) return auth.reason;
      if (c.status !== 'cancelled') addInventoryDelta(expectedBalanceDeltas, c.locationId, c.variantId, c.difference);
    } else if (!same(c, old)) {
      if (old.status !== 'cancelled' && c.status === 'cancelled') {
        const auth = authorizeAction({ user, action: 'stock.opname', locationId: old.locationId });
        if (!auth.allowed) return auth.reason;
        addInventoryDelta(expectedBalanceDeltas, old.locationId, old.variantId, -old.difference);
      } else if (role !== 'owner' && role !== 'admin') return 'Stock opname yang telah tersimpan tidak dapat diubah langsung.';
    }
  }

  // Transfers
  for (const t of next.transfers) {
    const old = oldTransfers.get(t.id);
    if (!old) {
      const auth = authorizeAction({ user, action: 'transfer.create', locationId: t.fromId });
      if (!auth.allowed) return auth.reason;
      const sendAuth = authorizeAction({ user, action: 'transfer.send', locationId: t.fromId });
      if (!sendAuth.allowed) return sendAuth.reason;
      if (t.status !== 'sent') return 'Transfer baru harus dikirim dari lokasi asal.';
      addInventoryDelta(expectedBalanceDeltas, t.fromId, t.variantId, -t.quantity);
    } else if (!same(t, old)) {
      if (old.status === 'draft' && t.status === 'sent') {
        const auth = authorizeAction({ user, action: 'transfer.send', locationId: t.fromId });
        if (!auth.allowed) return auth.reason;
        addInventoryDelta(expectedBalanceDeltas, t.fromId, t.variantId, -t.quantity);
      } else if (old.status === 'sent' && t.status === 'received') {
        const auth = authorizeAction({ user, action: 'transfer.receive', locationId: t.toId });
        if (!auth.allowed) return auth.reason;
        addInventoryDelta(expectedBalanceDeltas, t.toId, t.variantId, t.quantity);
      } else if (old.status !== 'cancelled' && t.status === 'cancelled') {
        const auth = authorizeAction({ user, action: 'transfer.cancel', locationId: t.fromId });
        if (!auth.allowed) return auth.reason;
        addInventoryDelta(expectedBalanceDeltas, old.fromId, old.variantId, old.quantity);
      } else if (role !== 'owner' && role !== 'admin') {
        return 'Status transfer tidak valid.';
      }
    }
  }

  // General strict checks for deletion
  if (role !== 'owner' && role !== 'admin') {
    if (next.sales.length < previous.sales.length || next.movements.length < previous.movements.length) {
      return 'Penghapusan riwayat transaksi secara paksa hanya dapat dilakukan oleh Owner atau Admin.';
    }
    if (next.balances.length < previous.balances.length) {
      return 'Saldo stok tidak boleh dihapus.';
    }
  }

  if (role !== 'owner' && role !== 'admin') {
    if (!balanceChangesMatch(previous, next, expectedBalanceDeltas)) {
      return 'Perubahan saldo stok tidak sesuai dengan transaksi yang diizinkan.';
    }
    if (!movementDeltasMatch(previous, next, expectedBalanceDeltas)) {
      return 'Jejak audit stok tidak sesuai dengan transaksi yang diizinkan.';
    }
  }

  return null;
}
function validateState(data){
  const arrays=['users','locations','products','balances','transfers','sales','movements','stockCounts'];
  if(!data||arrays.some(key=>!Array.isArray(data[key])))return 'Format data stok tidak valid';
  const isNumber=value=>typeof value==='number'&&Number.isFinite(value);
  const variants=new Set(data.products.flatMap(product=>Array.isArray(product.variants)?product.variants.map(variant=>variant.id):[]));
  const locations=new Set(data.locations.map(location=>location.id));
  const locationNames=new Set();
  for(const loc of data.locations) {
    const key = (loc.name||'').toLowerCase().trim() + '|' + (loc.type||'');
    if(locationNames.has(key)) return 'Terdapat lokasi dengan nama dan jenis yang sama (duplikat)';
    locationNames.add(key);
  }
  const centralWarehouses = data.locations.filter(location => location.isCentralWarehouse);
  if (centralWarehouses.length > 1) return 'Hanya satu gudang pusat yang dapat ditetapkan.';
  if (centralWarehouses.some(location => location.type !== 'warehouse')) return 'Gudang pusat harus menggunakan jenis lokasi gudang.';
  if(data.balances.some(item=>!locations.has(item.locationId)||!variants.has(item.variantId)||!isNumber(item.quantity)||item.quantity<0))return 'Saldo stok tidak valid atau menjadi minus';
  if(data.sales.some(sale=>!locations.has(sale.locationId)||!isNumber(sale.total)||sale.total<0||!Array.isArray(sale.items)||sale.items.some(item=>!variants.has(item.variantId)||!isNumber(item.quantity)||item.quantity<=0)))return 'Transaksi penjualan tidak valid';
  if(data.transfers.some(item=>!locations.has(item.fromId)||!locations.has(item.toId)||item.fromId===item.toId||!variants.has(item.variantId)||!isNumber(item.quantity)||item.quantity<=0))return 'Transfer stok tidak valid';
  if((data.receipts||[]).some(item=>!locations.has(item.locationId)||!variants.has(item.variantId)||!isNumber(item.quantity)||item.quantity<=0||!isNumber(item.unitCost)||item.unitCost<0))return 'Stok masuk tidak valid';
  if((data.returns||[]).some(item=>!locations.has(item.locationId)||!variants.has(item.variantId)||!isNumber(item.quantity)||item.quantity<=0))return 'Retur stok tidak valid';
  if(data.stockCounts.some(item=>!locations.has(item.locationId)||!variants.has(item.variantId)||!isNumber(item.actualQty)||item.actualQty<0))return 'Stock opname tidak valid';
  return null;
}
async function currentUser(conn,auth){
  if(!conn)return demoUsers.find(item=>item.id===auth.sub&&item.organization_id===auth.org);
  const [rows]=await conn.execute('SELECT id,organization_id,name,email,role,outlet_id,active FROM users WHERE id=? AND organization_id=? AND active=TRUE LIMIT 1',[auth.sub,auth.org]);
  return rows[0];
}

// Transaction commands are deliberately separate from the legacy /api/state
// snapshot endpoint.  A POS or transfer action must be calculated on the
// server's latest committed data, not on a potentially stale browser copy.
const commandId = prefix => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const detectShippingCarrier = trackingNumber => {
  const value = String(trackingNumber || '').trim().toUpperCase().replace(/[\s._-]/g, '');
  if (/^SPX/.test(value)) return 'SPX Express';
  if (/^(JNT|JT|JP|EZ)[A-Z0-9]{6,}$/.test(value)) return 'J&T Express';
  if (/^JNE[A-Z0-9]{6,}$/.test(value)) return 'JNE';
  if (/^(SICEPAT|SCP|SC)[A-Z0-9]{6,}$/.test(value)) return 'SiCepat';
  if (/^(ANTERAJA|AJ)[A-Z0-9]{6,}$/.test(value)) return 'AnterAja';
  if (/^(NINJA|NV)[A-Z0-9]{6,}$/.test(value)) return 'Ninja Xpress';
  return null;
};
const commandTransferCode = () => `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
const commandBalanceKey = (locationId, variantId) => `${locationId}:${variantId}`;
const commandBalance = (balances, locationId, variantId) =>
  Number(balances.find(item => item.locationId === locationId && item.variantId === variantId)?.quantity || 0);
const commandAdjustBalance = (balances, locationId, variantId, delta) => {
  const key = commandBalanceKey(locationId, variantId);
  const result = new Map(balances.map(item => [commandBalanceKey(item.locationId, item.variantId), { ...item }]));
  const previous = result.get(key) || { locationId, variantId, quantity: 0 };
  result.set(key, { ...previous, quantity: Number(previous.quantity || 0) + delta });
  return Array.from(result.values());
};
const commandMovement = (variantId, locationId, type, quantity, note, actor) => ({
  id: commandId('mov'), variantId, locationId, type, quantity, note, user: actor.name, createdAt: new Date().toISOString(),
});
const commandAuth = (actor, action, locationId) => authorizeAction({ user: actor, action, locationId });
const configurableRoles = new Set(['admin', 'pic', 'finance', 'warehouse', 'cashier', 'employee']);
const configurablePermissions = new Set([
  'product.view','product.create','product.update','product.delete','location.view','location.create','location.update','location.delete',
  'user.view','user.create','user.update','user.assign_location','stock.view','stock.initial_balance','stock.in','stock.out','stock.adjust','stock.opname',
  'transfer.view','transfer.create','transfer.send','transfer.receive','transfer.cancel','sale.view','sale.create','sale.void','shipping.view','shipping.manage',
  'report.view','report.export','audit.view'
  ,'supplier.view','supplier.manage','pricing.view','pricing.manage','attendance.view','attendance.record','attendance.manage','payroll.view','payroll.manage'
]);
const configurableMenus = new Set(['dashboard','analytics','products','locations','pricing','suppliers','receipts','stock','transfers','opname','history','sales','shipping','returns','employees','attendance','loans','reports','help']);
const menuPermissionRequirements = { analytics:'report.view', products:'product.view', locations:'location.view', pricing:'pricing.view', suppliers:'supplier.view', receipts:'stock.view', stock:'stock.view', transfers:'transfer.view', opname:'stock.view', history:'audit.view', sales:'sale.view', shipping:'shipping.view', returns:'stock.view', employees:'user.view', attendance:'attendance.view', loans:'payroll.view', reports:'report.view' };
const validateCommandProduct = (product) => {
  if (!product?.id || !String(product.name || '').trim() || !Array.isArray(product.variants) || !product.variants.length) return 'Produk atau varian tidak valid.';
  const skuSet = new Set();
  for (const variant of product.variants) {
    const cost = Number(variant?.cost), price = Number(variant?.price);
    const sku = String(variant?.sku || '').trim().toLowerCase();
    if (!variant?.id || !String(variant.name || '').trim()) return 'Nama varian tidak boleh kosong.';
    if (!Number.isFinite(cost) || cost < 0) return 'Harga modal varian tidak valid.';
    if (!Number.isFinite(price) || price <= 0) return 'Harga jual varian harus lebih dari nol.';
    if (sku && skuSet.has(sku)) return 'SKU varian tidak boleh duplikat dalam satu produk.';
    if (sku) skuSet.add(sku);
  }
  return null;
};
const commandFailure = (res, error) => res.status(error.status || 400).json({ message: error.message || 'Perintah transaksi tidak valid' });
const invalidCommand = message => Object.assign(new Error(message), { status: 400 });
const forbiddenCommand = message => Object.assign(new Error(message), { status: 403 });

async function loadStateForCommand(conn, orgId) {
  if (!conn) return demoStates.get(orgId) || { version: 0, data: null };
  return getStateFromSQL(conn, orgId);
}
async function commitCommandState(conn, orgId, state, version) {
  if (!conn) {
    demoStates.set(orgId, { version, data: state });
    return;
  }
  await conn.execute(
    'INSERT INTO app_state (id, version, payload) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE version=VALUES(version), payload=VALUES(payload)',
    [orgId, version, JSON.stringify(state)],
  );
  await syncStateToSQL(conn, orgId, state);
}

const demoCommandLocks = new Map();
async function executeCommand(req, res, mutate) {
  const conn = await db();
  const actor = await currentUser(conn, req.auth);
  if (!actor) return res.status(401).json({ message: 'Akun tidak aktif' });
  const connection = conn ? await conn.getConnection() : null;
  let releaseDemoLock;
  let demoLockTail;
  if (!connection) {
    const previous = demoCommandLocks.get(req.auth.org) || Promise.resolve();
    const current = new Promise(resolve => { releaseDemoLock = resolve; });
    demoLockTail = previous.then(() => current);
    demoCommandLocks.set(req.auth.org, demoLockTail);
    await previous;
  }
  try {
    if (connection) {
      await connection.beginTransaction();
      // Serialisasi seluruh mutasi tenant pada baris versi kanonis. Ini
      // mencegah dua perangkat memakai saldo awal yang sama secara bersamaan.
      await connection.execute('SELECT version FROM app_state WHERE id = ? FOR UPDATE', [req.auth.org]);
    }
    const loaded = await loadStateForCommand(connection, req.auth.org);
    if (!loaded.data) throw invalidCommand('Data usaha belum siap. Muat ulang halaman lalu coba lagi.');
    const state = structuredClone(loaded.data);
    actor.rolePermissions = state.rolePolicies?.[actor.role]?.permissions;
    // Users are authoritative in the users table.  Keeping this projection in
    // the command transaction prevents a newly created employee account from
    // being invisible until some unrelated legacy snapshot is written.
    const existingUsers = state.users || [];
    if (connection) {
      const [rows] = await connection.execute('SELECT id, organization_id, name, email, role, outlet_id, active FROM users WHERE organization_id = ? ORDER BY created_at', [req.auth.org]);
      state.users = rows.map(safeUser).map(user => ({ ...existingUsers.find(item => item.id === user.id), ...user }));
    } else {
      state.users = demoUsers.filter(item => item.organization_id === req.auth.org).map(safeUser).map(user => ({ ...existingUsers.find(item => item.id === user.id), ...user }));
    }
    state.receipts ||= [];
    state.returns ||= [];
    state.suppliers ||= [];
    state.employees ||= [];
    state.attendanceSettings ||= [];
    state.attendances ||= [];
    state.loans ||= [];
    state.payrolls ||= [];
    state.sales ||= [];
    state.shipments ||= [];
    state.shipmentHandovers ||= [];
    for (const sale of state.sales) sale.cashierId ||= 'system-migration';
    assignMissingBarcodes(state, req.auth.org);
    await mutate(state, actor, connection);
    assignMissingBarcodes(state, req.auth.org);
    const invalid = validateState(state);
    if (invalid) throw invalidCommand(invalid);
    const nextVersion = Number(loaded.version || 0) + 1;
    await commitCommandState(connection, req.auth.org, state, nextVersion);
    if (connection) await connection.commit();
    return res.status(201).json({ version: nextVersion });
  } catch (error) {
    if (connection) await connection.rollback();
    if (!error?.status || error.status >= 500) console.error('Transactional command failed:', error);
    return commandFailure(res, error);
  } finally {
    connection?.release();
    if (releaseDemoLock) {
      releaseDemoLock();
      if (demoCommandLocks.get(req.auth.org) === demoLockTail) demoCommandLocks.delete(req.auth.org);
    }
  }
}
app.put('/api/organization', requireAuth, async (req, res) => {
  const conn = await db();
  const actor = await currentUser(conn, req.auth);
  if (!actor || actor.role !== 'owner') return res.status(403).json({ message: 'Hanya Owner yang dapat mengubah profil usaha' });
  
  const { name, ownerName, phone, email, address, logoUrl, negativeStockPolicy } = req.body || {};
  if (!name || name.length < 2) return res.status(400).json({ message: 'Nama usaha tidak valid' });

  if (!conn) {
    // Demo mode: just update app_state
    const state = demoStates.get(req.auth.org);
    if(state && state.data) {
      state.data.business = { name, ownerName, phone, email, address, logoUrl, negativeStockPolicy };
    }
    return res.json({ message: 'Profil usaha diperbarui' });
  }

  await conn.execute(
    'UPDATE organizations SET name=?, owner_name=?, phone=?, email=?, address=?, logo_url=?, negative_stock_policy=? WHERE id=?',
    [name, ownerName||null, phone||null, email||null, address||null, logoUrl||null, negativeStockPolicy||'BLOCK', req.auth.org]
  );
  res.json({ message: 'Profil usaha diperbarui' });
});
app.post('/api/users',requireAuth,async(req,res)=>{
  const conn=await db(),actor=await currentUser(conn,req.auth);
  await attachRolePermissions(conn, req.auth.org, actor);
  if(!actor||!authorizeAction({user:actor,action:'user.create'}).allowed)return res.status(403).json({message:'Akun Anda tidak memiliki izin menambah pengguna'});
  const name=String(req.body?.name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''),role=String(req.body?.role||''),rawOutletId=req.body?.outletId||null;
  const availableRoles=await organizationRoleIds(conn,req.auth.org);
  if(name.length<2||!email.includes('@')||password.length<8||!availableRoles.has(role))return res.status(400).json({message:'Data pengguna belum lengkap atau peran tidak tersedia di pengaturan Peran & Hak Akses'});
  let outletId = null;
  if(['pic','warehouse','cashier'].includes(role)){
    if(!rawOutletId)return res.status(400).json({message:'Role ini wajib dihubungkan ke lokasi'});
    let locType = null;
    if(!conn){
      const loc = demoStates.get(req.auth.org)?.data?.locations?.find(item=>item.id===rawOutletId&&item.active);
      locType = loc ? loc.type : null;
    } else {
      const [locs] = await conn.execute('SELECT type FROM locations WHERE id=? AND organization_id=? AND active=TRUE',[rawOutletId, req.auth.org]);
      if(locs.length) locType = locs[0].type;
      else {
        const [states] = await conn.execute('SELECT payload FROM app_state WHERE id=?', [req.auth.org]);
        const loc = states[0]?.payload?.locations?.find(l => l.id === rawOutletId && l.active !== false);
        if (loc) locType = loc.type;
      }
    }
    if(!locType) return res.status(400).json({message:'Lokasi tidak valid atau belum aktif'});
    if(role==='warehouse' && locType!=='warehouse') return res.status(400).json({message:'Staf Gudang harus ditempatkan di Gudang'});
    if((role==='pic'||role==='cashier') && locType!=='outlet') return res.status(400).json({message:'PIC/Kasir harus ditempatkan di Outlet'});
    outletId = rawOutletId;
  }
  const id=`u-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,organizationId=req.auth.org;
  if(!conn){if(demoUsers.some(item=>item.email===email))return res.status(409).json({message:'Email sudah terdaftar'});const user={id,organization_id:organizationId,organization_name:actor.organization_name,name,email,role,outletId,active:true,demo_password:password};demoUsers.push(user);return res.status(201).json({user:safeUser(user)});}
  const [existing]=await conn.execute('SELECT id FROM users WHERE email=? LIMIT 1',[email]);
  if(existing.length)return res.status(409).json({message:'Email sudah terdaftar'});
  await conn.execute('INSERT INTO users (id,organization_id,name,email,password_hash,role,outlet_id,active) VALUES (?,?,?,?,?,?,?,TRUE)',[id,organizationId,name,email,await bcrypt.hash(password,12),role,outletId]);
  res.status(201).json({user:{id,name,email,role,outletId,active:true,organizationId}});
});
app.patch('/api/users/:id',requireAuth,async(req,res)=>{
  const conn=await db(),actor=await currentUser(conn,req.auth),targetId=String(req.params.id||'');
  await attachRolePermissions(conn, req.auth.org, actor);
  if(!actor||!authorizeAction({user:actor,action:'user.update'}).allowed)return res.status(403).json({message:'Akun Anda tidak memiliki izin mengubah pengguna'});
  const requestedRole=String(req.body?.role||''),rawOutletId=req.body?.outletId||null,active=req.body?.active!==false;
  const name=String(req.body?.name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=req.body?.password?String(req.body.password):null;
  if(name.length<2||!email.includes('@')||(password&&password.length<8))return res.status(400).json({message:'Nama, email, atau password belum valid'});
  let target;
  if(!conn)target=demoUsers.find(item=>item.id===targetId&&item.organization_id===req.auth.org);
  else{const [rows]=await conn.execute('SELECT id,organization_id,name,email,role,outlet_id,active FROM users WHERE id=? AND organization_id=? LIMIT 1',[targetId,req.auth.org]);target=rows[0];}
  if(!target)return res.status(404).json({message:'Pengguna tidak ditemukan'});
  const role=target.role==='owner'?'owner':requestedRole;
  const finalActive=target.role==='owner'?true:active;
  const availableRoles=await organizationRoleIds(conn,req.auth.org);
  if(role!=='owner'&&!availableRoles.has(role))return res.status(400).json({message:'Peran pengguna tidak tersedia di pengaturan Peran & Hak Akses'});
  
  let outletId = null;
  if(['pic','warehouse','cashier'].includes(role)){
    if(!rawOutletId)return res.status(400).json({message:'Role ini wajib dihubungkan ke lokasi'});
    let locType = null;
    if(!conn){
      const loc = demoStates.get(req.auth.org)?.data?.locations?.find(item=>item.id===rawOutletId&&item.active);
      locType = loc ? loc.type : null;
    } else {
      const [locs] = await conn.execute('SELECT type FROM locations WHERE id=? AND organization_id=? AND active=TRUE',[rawOutletId, req.auth.org]);
      if(locs.length) locType = locs[0].type;
      else {
        const [states] = await conn.execute('SELECT payload FROM app_state WHERE id=?', [req.auth.org]);
        const loc = states[0]?.payload?.locations?.find(l => l.id === rawOutletId && l.active !== false);
        if (loc) locType = loc.type;
      }
    }
    if(!locType) return res.status(400).json({message:'Lokasi tidak valid atau belum aktif'});
    if(role==='warehouse' && locType!=='warehouse') return res.status(400).json({message:'Staf Gudang harus ditempatkan di Gudang'});
    if((role==='pic'||role==='cashier') && locType!=='outlet') return res.status(400).json({message:'PIC/Kasir harus ditempatkan di Outlet'});
    outletId = rawOutletId;
  }
  if(!conn){
    if(demoUsers.some(item=>item.email===email&&item.id!==targetId))return res.status(409).json({message:'Email sudah digunakan akun lain'});
    Object.assign(target,{name,email,role,outletId,active:finalActive,...(password?{demo_password:password}:{})});
    return res.json({user:safeUser(target)});
  }
  const [duplicate]=await conn.execute('SELECT id FROM users WHERE email=? AND id<>? LIMIT 1',[email,targetId]);
  if(duplicate.length)return res.status(409).json({message:'Email sudah digunakan akun lain'});
  const params=[name,email,role,outletId,finalActive];
  let sql='UPDATE users SET name=?,email=?,role=?,outlet_id=?,active=?';
  if(password){sql+=',password_hash=?';params.push(await bcrypt.hash(password,12));}
  sql+=' WHERE id=? AND organization_id=?';params.push(targetId,req.auth.org);
  await conn.execute(sql,params);
  res.json({user:{id:targetId,name,email,role,outletId,active:finalActive,organizationId:req.auth.org}});
});

// ── Forgot Password (Request OTP) ────────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email.includes('@')) return res.status(400).json({ message: 'Masukkan alamat email yang valid' });
  if (!rateLimit({ key: `forgot:${email}:${req.ip}`, windowMs: 60 * 60 * 1000, max: 3 })) return res.status(429).json({ message: 'Terlalu banyak permintaan reset. Coba lagi dalam satu jam.' });
  const conn = await db();
  let user;
  if (conn) {
    const [rows] = await conn.execute('SELECT id, name, email FROM users WHERE email=? AND active=TRUE LIMIT 1', [email]);
    user = rows[0];
  } else {
    user = demoUsers.find(u => u.email === email && u.active !== false);
  }
  
  // Keep this response identical for known and unknown addresses to prevent account enumeration.
  if (!user) return res.json({ message: 'Jika email terdaftar, kode OTP telah dikirim.' });

  const otp = generateOtp();
  const hash = await bcrypt.hash(otp, 10);
  resetTokens.set(email, { hash, userId: user.id, organizationId: user.organization_id, name: user.name, expiresAt: Date.now() + 15 * 60 * 1000 });
  if (mailer) {
    const { subject, html } = buildResetEmail(user.name, otp, 15);
    try {
      await mailer.sendMail({ from: `"${APP_NAME}" <${FROM_ADDRESS}>`, to: email, subject, html });
    } catch (err) {
      console.error('SMTP error:', err.message);
      return res.status(500).json({ message: 'Gagal mengirim email. Coba lagi beberapa saat.' });
    }
  }
  res.json({ message: 'Jika email terdaftar, kode OTP telah dikirim.' });
});

// ── Reset Password (Submit OTP + new password) ────────────────────────────────
app.post('/api/auth/reset-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const otp = String(req.body?.otp || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  if (!rateLimit({ key: `reset:${email}:${req.ip}`, windowMs: 15 * 60 * 1000, max: 10 })) return res.status(429).json({ message: 'Terlalu banyak percobaan reset. Coba lagi dalam 15 menit.' });
  if (!email.includes('@') || otp.length < 6 || newPassword.length < 8)
    return res.status(400).json({ message: 'Data tidak lengkap atau password minimal 8 karakter' });
  const entry = resetTokens.get(email);
  if (!entry || Date.now() > entry.expiresAt)
    return res.status(400).json({ message: 'Kode OTP tidak valid atau sudah kadaluarsa' });
  const valid = await bcrypt.compare(otp, entry.hash);
  if (!valid) {
    entry.attempts = (entry.attempts || 0) + 1;
    if (entry.attempts >= 5) resetTokens.delete(email);
    return res.status(400).json({ message: 'Kode OTP salah' });
  }
  resetTokens.delete(email);
  const newHash = await bcrypt.hash(newPassword, 12);
  const conn = await db();
  if (conn) {
    await conn.execute('UPDATE users SET password_hash=? WHERE id=? AND organization_id=? AND active=TRUE', [newHash, entry.userId, entry.organizationId]);
  } else {
    const u = demoUsers.find(u => u.id === entry.userId && u.organization_id === entry.organizationId);
    if (u) u.demo_password = newPassword;
  }
  // Not sending email for password changes anymore to save tokens
  res.json({ message: 'Password berhasil direset. Silakan masuk kembali.' });
});

// ── Change Password (for logged-in users) ─────────────────────────────────────
app.patch('/api/profile/password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword || newPassword.length < 8)
    return res.status(400).json({ message: 'Password baru minimal 8 karakter' });
  const conn = await db();
  let user;
  if (conn) {
    const [rows] = await conn.execute('SELECT id, name, email, password_hash FROM users WHERE id=? AND organization_id=? AND active=TRUE LIMIT 1', [req.auth.sub, req.auth.org]);
    user = rows[0];
  } else {
    user = demoUsers.find(u => u.id === req.auth.sub && u.organization_id === req.auth.org);
  }
  if (!user) return res.status(404).json({ message: 'Akun tidak ditemukan' });
  const currentHash = conn ? user.password_hash : null;
  const passwordOk = conn
    ? await bcrypt.compare(currentPassword, currentHash)
    : currentPassword === (user.demo_password || 'VeinStock123!');
  if (!passwordOk) return res.status(401).json({ message: 'Password lama tidak sesuai' });
  const newHash = await bcrypt.hash(newPassword, 12);
  if (conn) {
    await conn.execute('UPDATE users SET password_hash=? WHERE id=? AND organization_id=?', [newHash, req.auth.sub, req.auth.org]);
  } else {
    user.demo_password = newPassword;
  }
  // Not sending email for password changes anymore to save tokens
  res.json({ message: 'Password berhasil diubah' });
});
app.post('/api/uploads/image',requireAuth,imageUpload.single('image'),async(req,res)=>{
  const conn=await db(),actor=await currentUser(conn,req.auth);
  if(!actor)return res.status(401).json({message:'Akun tidak aktif'});
  if(!process.env.CLOUDINARY_URL)return res.status(503).json({message:'Penyimpanan gambar belum dikonfigurasi'});
  if(!req.file)return res.status(400).json({message:'Pilih gambar JPG, PNG, WebP, HEIC, atau HEIF maksimal 5 MB'});
  try{
    const optimized=await sharp(req.file.buffer).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:75,effort:5}).toBuffer();
    const result=await new Promise((resolve,reject)=>{const stream=cloudinary.uploader.upload_stream({folder:`menengs/${req.auth.org}`,resource_type:'image',format:'webp',overwrite:false,transformation:[{quality:'auto:eco',fetch_format:'auto'}]},(error,value)=>error?reject(error):resolve(value));stream.end(optimized)});
    res.status(201).json({url:result.secure_url,publicId:result.public_id,width:result.width,height:result.height,bytes:result.bytes,originalBytes:req.file.size});
  }catch(error){res.status(500).json({message:'Gambar gagal diproses atau diunggah'});}
});
app.get('/api/health', async (_req, res) => {
  try { const conn = await db(); if (conn) await conn.query('SELECT 1'); res.json({ ok: true, database: conn ? 'mysql' : 'demo' }); }
  catch (error) { console.error('Database health check failed', { code:error?.code, errno:error?.errno, message:error?.message }); res.status(503).json({ ok: false, message: 'Database tidak tersedia' }); }
});
app.get('/api/state', requireAuth, async (req, res) => {
  const conn = await db();
  const actor = await currentUser(conn, req.auth);
  if (!actor) return res.status(401).json({ message: 'Akun tidak aktif atau sesi tidak valid' });
  
  const sanitize = (data) => {
    if (!data) return data;
    actor.rolePermissions = data.rolePolicies?.[actor.role]?.permissions;
    const permissions = resolveUserScope(actor).permissions;
    const hasAny = (...items) => items.some(item => permissions.has(item));
    const maskByPermissions = (source) => actor.role === 'owner' ? source : ({
      ...source,
      rolePolicies: source.rolePolicies?.[actor.role] ? { [actor.role]: source.rolePolicies[actor.role] } : {},
      products: hasAny('product.view','product.create','product.update','stock.view','stock.in','stock.out','stock.opname','transfer.view','transfer.create','sale.view','sale.create','shipping.view','pricing.view','pricing.manage','report.view') ? source.products : [],
      locations: hasAny('location.view','location.create','location.update','stock.view','stock.in','stock.out','stock.opname','transfer.view','transfer.create','sale.view','sale.create','shipping.view','attendance.view','payroll.view','report.view') ? source.locations : [],
      balances: hasAny('stock.view','stock.in','stock.out','stock.adjust','stock.opname','transfer.view','transfer.create','transfer.send','transfer.receive','sale.create','report.view') ? source.balances : [],
      sales: hasAny('sale.view','sale.create','sale.void','shipping.view','shipping.manage','report.view') ? source.sales : [],
      transfers: hasAny('transfer.view','transfer.create','transfer.send','transfer.receive','transfer.cancel','report.view') ? source.transfers : [],
      movements: hasAny('audit.view','stock.view','report.view') ? source.movements : [],
      stockCounts: hasAny('stock.view','stock.opname','stock.adjust','report.view') ? source.stockCounts : [],
      receipts: hasAny('stock.view','stock.in','report.view') ? source.receipts : [],
      returns: hasAny('stock.view','stock.out','report.view') ? source.returns : [],
      suppliers: hasAny('supplier.view','supplier.manage','stock.in') ? source.suppliers : [],
      shipments: hasAny('shipping.view','shipping.manage') ? source.shipments : [],
      shipmentHandovers: hasAny('shipping.view','shipping.manage') ? source.shipmentHandovers : [],
      users: hasAny('user.view','attendance.view','payroll.view') ? source.users : (source.users || []).filter(user => user.id === actor.id),
      employees: hasAny('user.view','attendance.view','payroll.view') ? source.employees : (source.employees || []).filter(employee => employee.userId === actor.id),
      attendanceSettings: hasAny('attendance.view','attendance.record','attendance.manage') ? source.attendanceSettings : [],
      attendances: hasAny('attendance.view','attendance.manage') ? source.attendances : (source.attendances || []).filter(attendance => (source.employees || []).some(employee => employee.userId === actor.id && employee.id === attendance.employeeId)),
      loans: hasAny('payroll.view','payroll.manage') ? source.loans : [],
      payrolls: hasAny('payroll.view','payroll.manage') ? source.payrolls : [],
      pricing: hasAny('pricing.view','pricing.manage') ? source.pricing : undefined,
    });
    const scope = resolveUserScope(actor);
    if (scope.scopeType === 'all') return maskByPermissions(data);
    const locationNames = new Map((data.locations || []).map(location => [location.id, location.name]));
    const myEmployees = (data.employees || []).filter(employee => employee.userId === actor.id);
    // Akun karyawan tidak dapat melihat data lokasi lain, tetapi tetap perlu
    // menerima lokasi penugasannya sendiri agar jadwal dan absensi dapat dipakai.
    const employeeLocationIds = actor.role === 'employee' ? myEmployees.map(employee => employee.locationId).filter(Boolean) : scope.allowedLocationIds;
    return maskByPermissions({
      ...data,
      locations: (data.locations||[]).filter(l => employeeLocationIds.includes(l.id)),
      users: (data.users||[]).filter(u => u.id === actor.id),
      balances: (data.balances||[]).filter(b => scope.allowedLocationIds.includes(b.locationId)),
      sales: (data.sales||[]).filter(s => scope.allowedLocationIds.includes(s.locationId)),
      movements: (data.movements||[]).filter(m => scope.allowedLocationIds.includes(m.locationId)),
      stockCounts: (data.stockCounts||[]).filter(sc => scope.allowedLocationIds.includes(sc.locationId)),
      receipts: (data.receipts||[]).filter(r => scope.allowedLocationIds.includes(r.locationId)),
      returns: (data.returns||[]).filter(r => scope.allowedLocationIds.includes(r.locationId)),
      shipments: (data.shipments || []).filter(shipment => scope.allowedLocationIds.includes(shipment.locationId)),
      shipmentHandovers: (data.shipmentHandovers || []).filter(handover => scope.allowedLocationIds.includes(handover.locationId)),
      employees: myEmployees,
      attendanceSettings: (data.attendanceSettings || []).filter(setting => employeeLocationIds.includes(setting.locationId)),
      attendances: (data.attendances || []).filter(attendance => myEmployees.some(employee => employee.id === attendance.employeeId)),
      loans: [],
      payrolls: [],
      // PIC/Kasir dapat membaca rute dokumen, tetapi tidak memperoleh saldo
      // atau daftar produk dari lokasi asal.
      transfers: (data.transfers||[])
        .filter(t => scope.allowedLocationIds.includes(t.fromId) || scope.allowedLocationIds.includes(t.toId))
        .map(t => ({ ...t, fromName: locationNames.get(t.fromId) || t.fromName, toName: locationNames.get(t.toId) || t.toName }))
    });
  };

  if (!conn) {
    const state = demoStates.get(req.auth.org) || { version: 0, data: null };
    if (state.data) assignMissingBarcodes(state.data, req.auth.org);
    const users = demoUsers.filter(item => item.organization_id === req.auth.org).map(safeUser).map(user => ({...state.data?.users?.find(item => item.id === user.id), ...user}));
    return res.json({ ...state, data: state.data ? sanitize({ ...state.data, users }) : null });
  }
  
  try {
    const sqlState = await getStateFromSQL(conn, req.auth.org);
    if (!sqlState.data) return res.json({ version: 0, data: null });
    const [userRows] = await conn.execute('SELECT id, organization_id, name, email, role, outlet_id, active FROM users WHERE organization_id = ? ORDER BY created_at', [req.auth.org]);
    const allUsers = userRows.map(safeUser);
    
    // Filter data based on actor scope
    const actor = await currentUser(conn, req.auth);
    if (!actor || !actor.active) return res.status(401).json({ message: 'Akun tidak aktif' });
    
    let { locations, products, balances, sales, transfers, movements, stockCounts } = sqlState.data;
    let users = allUsers;

    if (actor.role === 'warehouse' || actor.role === 'pic' || actor.role === 'cashier') {
      const locationNames = new Map(locations.map(location => [location.id, location.name]));
      locations = locations.filter(l => l.id === actor.outlet_id);
      users = allUsers.filter(u => u.id === actor.id);
      
      const locId = actor.outlet_id;
      balances = balances.filter(b => b.locationId === locId);
      sales = sales.filter(s => s.locationId === locId);
      movements = movements.filter(m => m.locationId === locId);
      stockCounts = stockCounts.filter(c => c.locationId === locId);
      transfers = transfers
        .filter(t => t.fromId === locId || t.toId === locId)
        .map(t => ({ ...t, fromName: locationNames.get(t.fromId) || t.fromName, toName: locationNames.get(t.toId) || t.toName }));
    }
    
    sqlState.data = { ...sqlState.data, locations, users, products, balances, sales, transfers, movements, stockCounts };
    res.json({ version: sqlState.version, data: sanitize(sqlState.data) });
  } catch (err) {
    console.error('Failed to get SQL state:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
app.put('/api/state', requireAuth, async (req, res) => {
  // Snapshot penuh pernah dipakai oleh klien lama. Endpoint ini sengaja
  // ditutup secara default karena satu browser dapat menimpa transaksi dari
  // perangkat lain. Aktifkan hanya untuk migrasi data terkontrol.
  if (process.env.ALLOW_LEGACY_SNAPSHOT !== 'true') {
    return res.status(410).json({ message: 'Jalur snapshot legacy dinonaktifkan. Gunakan /api/commands.' });
  }
  const { data, version = 0 } = req.body || {};
  if (!data) return res.status(400).json({ message: 'Data wajib diisi' });
  
  const conn = await db();
  const actor = await currentUser(conn, req.auth);
  if (!actor) return res.status(401).json({ message: 'Akun tidak aktif' });
  if (actor.role === 'finance') return res.status(403).json({ message: 'Akun Keuangan hanya memiliki akses baca' });
  
  if (!conn) {
    const state = demoStates.get(req.auth.org) || { version: 0, data: null };
    const nextData = state.data ? mergeScopedState(state.data, data, actor) : data;
    assignMissingBarcodes(nextData, req.auth.org);
    const invalid = validateState(nextData);
    if (invalid) return res.status(400).json({ message: invalid });
    const denied = actor.role !== 'owner' && actor.role !== 'finance' && validateRoleChange(state.data, nextData, actor);
    if (denied) return res.status(403).json({ message: denied });
    if (Number(version) !== state.version) return res.status(409).json({ message: 'Data telah berubah di perangkat lain. Muat ulang sebelum menyimpan.' });
    const nextVersion = state.version + 1;
    demoStates.set(req.auth.org, { version: nextVersion, data: nextData });
    return res.json({ version: nextVersion });
  }

  const connection = await conn.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT version FROM app_state WHERE id=? FOR UPDATE', [req.auth.org]);
    if (rows.length && Number(rows[0].version) !== Number(version)) { 
      await connection.rollback(); 
      return res.status(409).json({ message: 'Data telah berubah di perangkat lain. Muat ulang sebelum menyimpan.' }); 
    }
    
    // Fetch previous state from SQL to validate role
    const sqlState = await getStateFromSQL(connection, req.auth.org);
    const previous = sqlState.data || null;
    const nextData = previous ? mergeScopedState(previous, data, actor) : data;
    assignMissingBarcodes(nextData, req.auth.org);
    const invalid = validateState(nextData);
    if (invalid) {
      await connection.rollback();
      return res.status(400).json({ message: invalid });
    }
    const denied = actor.role !== 'owner' && actor.role !== 'finance' && validateRoleChange(previous, nextData, actor);
    
    if (denied) {
      await connection.rollback();
      return res.status(403).json({ message: denied });
    }
    
    const next = Number(version) + 1;
    
    // Legacy blob save (for backwards compatibility/raw dump)
    await connection.execute('INSERT INTO app_state (id, version, payload) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE version=VALUES(version), payload=VALUES(payload)', [req.auth.org, next, JSON.stringify(nextData)]);
    
    // Sync into SQL Relational schema
    await syncStateToSQL(connection, req.auth.org, nextData);

    await connection.commit();
    res.json({ version: next });
  } catch (error) { 
    await connection.rollback(); 
    console.error('Failed to put SQL state:', error);
    res.status(500).json({ message: 'Gagal menyimpan data' }); 
  } finally { 
    connection.release(); 
  }
});

// Critical operational commands ------------------------------------------------
// These routes intentionally accept a small command payload only.  The server
// reads, validates and commits the current organization state in one database
// transaction so a refresh or a second device cannot overwrite a sale/transfer.
app.post('/api/commands/shipping/ready', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const trackingNumber = String(req.body?.trackingNumber || '').trim().toUpperCase();
    const locationId = String(req.body?.locationId || '');
    const authorization = commandAuth(actor, 'shipping.manage', locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!state.locations.some(location => location.id === locationId && location.active !== false)) throw invalidCommand('Lokasi packing tidak aktif atau tidak ditemukan.');
    if (!/^[A-Z0-9][A-Z0-9._-]{5,79}$/.test(trackingNumber)) throw invalidCommand('Nomor resi tidak valid. Periksa kembali hasil scan.');
    const detectedCarrier = detectShippingCarrier(trackingNumber);
    // Packing tidak boleh gagal hanya karena pola resi ekspedisi berubah.
    // Ekspedisi final ditetapkan saat paket masuk ke batch serah terima.
    const carrier = detectedCarrier || 'Belum ditentukan';
    const existing = state.shipments.find(item => item.trackingNumber === trackingNumber);
    if (existing) throw invalidCommand(existing.status === 'handed_over' ? 'Resi ini sudah diserahkan ke ekspedisi.' : 'Resi ini sudah tercatat pada proses pengiriman.');
    state.shipments.unshift({
      id: commandId('shp'), trackingNumber, locationId,
      marketplace: String(req.body?.marketplace || 'Lainnya').trim().slice(0, 40),
      carrier,
      status: 'ready', packedAt: new Date().toISOString(), packedBy: actor.id,
    });
  });
});

app.post('/api/commands/shipping/handover/scan', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const trackingNumber = String(req.body?.trackingNumber || '').trim().toUpperCase();
    const locationId = String(req.body?.locationId || '');
    const batchCode = String(req.body?.batchCode || '').trim().toUpperCase();
    const carrier = String(req.body?.carrier || '').trim();
    const authorization = commandAuth(actor, 'shipping.manage', locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!batchCode || !carrier) throw invalidCommand('Batch dan ekspedisi wajib dipilih.');
    const shipment = state.shipments.find(item => item.trackingNumber === trackingNumber);
    if (!shipment) throw invalidCommand('Resi belum tercatat sebagai paket siap diangkut.');
    if (shipment.locationId !== locationId) throw invalidCommand('Resi berasal dari lokasi packing yang berbeda.');
    if (shipment.status !== 'ready') throw invalidCommand(shipment.status === 'handed_over' ? 'Resi sudah pernah diserahkan ke ekspedisi.' : 'Resi sudah dipindai dalam batch serah terima.');
    let batch = state.shipmentHandovers.find(item => item.batchCode === batchCode);
    if (!batch) {
      batch = { id: commandId('hnd'), batchCode, carrier, locationId, status: 'draft', createdAt: new Date().toISOString(), createdBy: actor.id };
      state.shipmentHandovers.unshift(batch);
    }
    if (batch.status !== 'draft' || batch.locationId !== locationId || batch.carrier !== carrier) throw invalidCommand('Batch serah terima tidak sesuai atau sudah selesai.');
    shipment.status = 'handover_scanned';
    shipment.handoverBatchCode = batchCode;
    shipment.carrier = carrier;
  });
});

app.post('/api/commands/shipping/handover/finalize', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const batchCode = String(req.body?.batchCode || '').trim().toUpperCase();
    const batch = state.shipmentHandovers.find(item => item.batchCode === batchCode);
    if (!batch || batch.status !== 'draft') throw invalidCommand('Batch serah terima tidak ditemukan atau sudah selesai.');
    const authorization = commandAuth(actor, 'shipping.manage', batch.locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    const shipments = state.shipments.filter(item => item.handoverBatchCode === batchCode && item.status === 'handover_scanned');
    if (!shipments.length) throw invalidCommand('Pindai minimal satu resi sebelum menyelesaikan serah terima.');
    const completedAt = new Date().toISOString();
    Object.assign(batch, {
      status: 'completed', completedAt, completedBy: actor.id,
      courierName: String(req.body?.courierName || '').trim().slice(0, 80) || undefined,
      vehicleNumber: String(req.body?.vehicleNumber || '').trim().slice(0, 30) || undefined,
      proofUrl: String(req.body?.proofUrl || '').trim() || undefined,
    });
    shipments.forEach(item => { item.status = 'handed_over'; item.handedOverAt = completedAt; item.handedOverBy = actor.id; });
  });
});

app.post('/api/commands/pricing', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const authorization = commandAuth(actor, 'pricing.manage');
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    const pricing = req.body?.pricing;
    if (!pricing || typeof pricing !== 'object') throw invalidCommand('Konfigurasi HPP dan marketplace tidak valid.');
    const hppRecipes = Array.isArray(pricing.hppRecipes) ? pricing.hppRecipes : [];
    const marketplaceConfigs = Array.isArray(pricing.marketplaceConfigs) ? pricing.marketplaceConfigs : [];
    if (hppRecipes.some(item => !item?.id || !String(item.name || '').trim() || !Number.isFinite(Number(item.yieldQuantity)) || Number(item.yieldQuantity) <= 0)) {
      throw invalidCommand('Data resep HPP tidak valid.');
    }
    if (marketplaceConfigs.some(item => !item?.platform || ['adminFee', 'paymentFee', 'shippingFee', 'affiliateFee', 'fixedFee', 'discount'].some(key => item[key] != null && (!Number.isFinite(Number(item[key])) || Number(item[key]) < 0)))) {
      throw invalidCommand('Konfigurasi biaya marketplace tidak valid.');
    }
    if (req.body?.syncVariantCosts === true) {
      const syncedRecipe = hppRecipes.find(item => item.id === req.body?.syncedRecipeId);
      if (!syncedRecipe) throw invalidCommand('Resep HPP yang akan diterapkan tidak ditemukan.');
      const variantIds = [...new Set(Array.isArray(syncedRecipe.variantIds) && syncedRecipe.variantIds.length ? syncedRecipe.variantIds : syncedRecipe.variantId ? [syncedRecipe.variantId] : [])];
      if (!variantIds.length) throw invalidCommand('Pilih minimal satu varian penerima HPP.');
      const materialCost = (Array.isArray(syncedRecipe.materials) ? syncedRecipe.materials : []).reduce((total, item) => total + Math.max(0, Number(item?.quantity) || 0) * Math.max(0, Number(item?.unitCost) || 0), 0);
      const additionalCost = (Array.isArray(syncedRecipe.additionalCosts) ? syncedRecipe.additionalCosts : []).reduce((total, item) => total + Math.max(0, Number(item?.amount) || 0), 0);
      const unitHpp = Math.round((materialCost + additionalCost) / Number(syncedRecipe.yieldQuantity));
      if (!Number.isFinite(unitHpp) || unitHpp < 0) throw invalidCommand('HPP per unit tidak valid.');
      const matchedVariants = state.products.flatMap(product => product.variants).filter(variant => variantIds.includes(variant.id));
      if (new Set(matchedVariants.map(variant => variant.id)).size !== variantIds.length) throw invalidCommand('Satu atau beberapa varian penerima HPP tidak ditemukan.');
      matchedVariants.forEach(variant => { variant.cost = unitHpp; });
    }
    state.pricing = { hppRecipes, marketplaceConfigs };
  });
});
app.post('/api/commands/role-policies', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    if (actor.role !== 'owner') throw forbiddenCommand('Hanya Owner yang dapat mengatur peran dan hak akses.');
    const role = String(req.body?.role || '');
    const policy = req.body?.policy;
    if (!configurableRoles.has(role) || !policy || !Array.isArray(policy.menus) || !Array.isArray(policy.permissions)) throw invalidCommand('Kebijakan peran tidak valid.');
    const menus = [...new Set(policy.menus.map(String))];
    const permissions = [...new Set(policy.permissions.map(String))];
    if (menus.some(menu => !configurableMenus.has(menu)) || permissions.some(permission => !configurablePermissions.has(permission))) throw invalidCommand('Menu atau izin tidak dikenal.');
    const missingDependency = menus.find(menu => menuPermissionRequirements[menu] && !permissions.includes(menuPermissionRequirements[menu]));
    if (missingDependency) throw invalidCommand(`Menu ${missingDependency} membutuhkan izin ${menuPermissionRequirements[missingDependency]}.`);
    state.rolePolicies ||= {};
    state.rolePolicies[role] = { menus, permissions };
    state.movements ||= [];
    state.movements.push({ id: commandId('audit'), variantId: 'system', locationId: 'system', type: 'Perubahan hak akses', quantity: 0, note: `Kebijakan role ${role} diperbarui`, user: actor.name, createdAt: new Date().toISOString() });
  });
});

app.post('/api/commands/suppliers', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    if (!commandAuth(actor, 'supplier.manage').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin mengelola supplier.');
    const supplier = req.body?.supplier;
    if (!supplier?.id || String(supplier.name || '').trim().length < 2) throw invalidCommand('Nama supplier minimal 2 karakter.');
    if (state.suppliers.some(item => item.id === supplier.id || String(item.name || '').trim().toLowerCase() === String(supplier.name).trim().toLowerCase())) throw invalidCommand('Supplier dengan nama tersebut sudah ada.');
    state.suppliers.push({ id: supplier.id, name: String(supplier.name).trim(), phone: String(supplier.phone || '').trim() || undefined, address: String(supplier.address || '').trim() || undefined, active: supplier.active !== false });
  });
});
app.patch('/api/commands/suppliers/:id', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    if (!commandAuth(actor, 'supplier.manage').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin mengelola supplier.');
    const supplier = req.body?.supplier;
    const index = state.suppliers.findIndex(item => item.id === req.params.id);
    if (index < 0 || !supplier || supplier.id !== req.params.id || String(supplier.name || '').trim().length < 2) throw invalidCommand('Data supplier tidak valid.');
    if (state.suppliers.some(item => item.id !== req.params.id && String(item.name || '').trim().toLowerCase() === String(supplier.name).trim().toLowerCase())) throw invalidCommand('Supplier dengan nama tersebut sudah ada.');
    state.suppliers[index] = { ...state.suppliers[index], name: String(supplier.name).trim(), phone: String(supplier.phone || '').trim() || undefined, address: String(supplier.address || '').trim() || undefined, active: supplier.active !== false };
  });
});

// People operations use the same server-side command boundary as inventory.
// They must never be saved by shipping a full organization snapshot from a
// browser because attendance/payroll is often entered from several devices.
async function syncEmployeeAccountLocation(connection, organizationId, state, employee) {
  const account = state.users.find(user => user.id === employee.userId);
  if (!account || !['pic', 'warehouse', 'cashier'].includes(account.role)) return;
  const location = state.locations.find(item => item.id === employee.locationId && item.active !== false);
  if (!location) throw invalidCommand('Lokasi kerja untuk akun staf tidak valid atau belum aktif.');
  if (account.role === 'warehouse' && location.type !== 'warehouse') throw invalidCommand('Staf Gudang harus ditempatkan di Gudang.');
  if ((account.role === 'pic' || account.role === 'cashier') && location.type !== 'outlet') throw invalidCommand('PIC/Kasir harus ditempatkan di Outlet.');
  account.outletId = employee.locationId;
  if (connection) {
    await connection.execute('UPDATE users SET outlet_id=? WHERE id=? AND organization_id=?', [employee.locationId, employee.userId, organizationId]);
  } else {
    const demoAccount = demoUsers.find(user => user.id === employee.userId && user.organization_id === organizationId);
    if (demoAccount) demoAccount.outletId = employee.locationId;
  }
}

app.post('/api/commands/employees', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor, connection) => {
    if (!commandAuth(actor, 'user.create').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin menambah karyawan.');
    const employee = req.body?.employee;
    if (!employee?.id || !employee?.userId || !String(employee.position || '').trim()) throw invalidCommand('Data karyawan tidak valid.');
    if (!state.users.some(user => user.id === employee.userId && user.active && user.role !== 'owner')) throw invalidCommand('Akun staf tidak ditemukan, tidak aktif, atau merupakan akun Owner.');
    if ((employee.locationId && !state.locations.some(location => location.id === employee.locationId && location.active !== false))) throw invalidCommand('Lokasi kerja karyawan tidak valid.');
    if (state.employees.some(item => item.id === employee.id || item.userId === employee.userId)) throw invalidCommand('Akun tersebut sudah terdaftar sebagai karyawan.');
    state.employees.push({ ...employee, position: String(employee.position).trim(), monthlySalary: Math.max(0, Number(employee.monthlySalary || 0)), active: employee.active !== false });
    await syncEmployeeAccountLocation(connection, req.auth.org, state, employee);
  });
});
app.patch('/api/commands/employees/:id', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor, connection) => {
    if (!commandAuth(actor, 'user.update').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin mengubah karyawan.');
    const index = state.employees.findIndex(item => item.id === req.params.id);
    const employee = req.body?.employee;
    if (index < 0 || !employee || employee.id !== req.params.id || !String(employee.position || '').trim()) throw invalidCommand('Data karyawan tidak valid.');
    if (employee.locationId && !state.locations.some(location => location.id === employee.locationId && location.active !== false)) throw invalidCommand('Lokasi kerja karyawan tidak valid.');
    state.employees[index] = { ...state.employees[index], ...employee, position: String(employee.position).trim(), monthlySalary: Math.max(0, Number(employee.monthlySalary || 0)), active: employee.active !== false };
    await syncEmployeeAccountLocation(connection, req.auth.org, state, state.employees[index]);
  });
});
app.post('/api/commands/attendance', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    if (!commandAuth(actor, 'attendance.record').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin mencatat kehadiran.');
    const { kind, latitude, longitude, capturedAt } = req.body || {};
    if (!['in', 'out'].includes(kind) || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) throw invalidCommand('Data absensi atau GPS tidak valid.');
    const employee = state.employees.find(item => item.userId === actor.id && item.active);
    if (!employee?.locationId || !state.locations.some(location => location.id === employee.locationId && location.active !== false)) throw forbiddenCommand('Akun belum ditugaskan ke lokasi aktif.');
    const date = new Date(capturedAt || Date.now()).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const setting = state.attendanceSettings.find(item => item.locationId === employee.locationId) || { checkInStart: '08:00', lateToleranceMinutes: 10 };
    const at = new Date(capturedAt || Date.now());
    const point = `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
    const index = state.attendances.findIndex(item => item.employeeId === employee.id && item.date === date);
    const record = index >= 0 ? state.attendances[index] : { id: commandId('att'), employeeId: employee.id, locationId: employee.locationId, date };
    if (kind === 'in') {
      if (record.checkInAt) throw invalidCommand('Check-in hari ini sudah tercatat.');
      const jakartaTime = at.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
      const minutes = Number(jakartaTime.slice(0, 2)) * 60 + Number(jakartaTime.slice(3, 5));
      const start = String(setting.checkInStart || '08:00').split(':').map(Number);
      const late = Math.max(0, minutes - ((start[0] || 0) * 60 + (start[1] || 0) + Number(setting.lateToleranceMinutes || 0)));
      Object.assign(record, { checkInAt: at.toISOString(), checkInGps: point, lateMinutes: late });
    } else {
      if (!record.checkInAt) throw invalidCommand('Lakukan check-in sebelum check-out.');
      if (record.checkOutAt) throw invalidCommand('Check-out hari ini sudah tercatat.');
      Object.assign(record, { checkOutAt: at.toISOString(), checkOutGps: point });
    }
    if (index >= 0) state.attendances[index] = record; else state.attendances.unshift(record);
  });
});
app.patch('/api/commands/attendance-settings/:locationId', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    if (!commandAuth(actor, 'attendance.manage').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin mengatur kehadiran.');
    const setting = req.body?.setting;
    if (!state.locations.some(location => location.id === req.params.locationId && location.active !== false) || !setting || !/^\d{2}:\d{2}$/.test(String(setting.checkInStart || '')) || !/^\d{2}:\d{2}$/.test(String(setting.checkInEnd || '')) || !/^\d{2}:\d{2}$/.test(String(setting.checkOutEnd || ''))) throw invalidCommand('Pengaturan kehadiran tidak valid.');
    const next = { locationId: req.params.locationId, checkInStart: setting.checkInStart, checkInEnd: setting.checkInEnd, checkOutStart: setting.checkOutStart || setting.checkInEnd, checkOutEnd: setting.checkOutEnd, lateToleranceMinutes: Math.max(0, Number(setting.lateToleranceMinutes || 0)) };
    const index = state.attendanceSettings.findIndex(item => item.locationId === req.params.locationId);
    if (index >= 0) state.attendanceSettings[index] = next; else state.attendanceSettings.push(next);
  });
});
app.post('/api/commands/loans', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    if (!commandAuth(actor, 'payroll.manage').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin mengelola kasbon.');
    const loan = req.body?.loan;
    const installmentCount = Number(loan?.installmentCount);
    const loanDate = String(loan?.loanDate || '');
    if (!loan?.id || state.loans.some(item => item.id === loan.id) || !state.employees.some(employee => employee.id === loan.employeeId && employee.active) || !Number.isFinite(Number(loan.amount)) || Number(loan.amount) <= 0 || !Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(loanDate) || Number.isNaN(new Date(`${loanDate}T00:00:00Z`).getTime())) throw invalidCommand('Data kasbon tidak valid.');
    state.loans.push({ ...loan, loanDate, note: String(loan.note || '').trim().slice(0, 500), amount: Number(loan.amount), installmentCount, installmentAmount: Math.ceil(Number(loan.amount) / installmentCount), paidInstallments: 0, status: 'active' });
  });
});
app.post('/api/commands/loans/:id/installments', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    if (!commandAuth(actor, 'payroll.manage').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin mengelola kasbon.');
    const loan = state.loans.find(item => item.id === req.params.id && item.status === 'active');
    if (!loan) throw invalidCommand('Kasbon aktif tidak ditemukan.');
    loan.paidInstallments = Math.min(Number(loan.installmentCount), Number(loan.paidInstallments || 0) + 1);
    loan.status = loan.paidInstallments >= Number(loan.installmentCount) ? 'paid' : 'active';
  });
});
app.post('/api/commands/payrolls', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    if (!commandAuth(actor, 'payroll.manage').allowed) throw forbiddenCommand('Akun Anda tidak memiliki izin mengelola penggajian.');
    const payroll = req.body?.payroll;
    const period = String(payroll?.period || '');
    if (!payroll?.id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !state.employees.some(employee => employee.id === payroll.employeeId && employee.active)) throw invalidCommand('Data penggajian tidak valid.');
    if (state.payrolls.some(item => item.employeeId === payroll.employeeId && item.period === payroll.period)) throw invalidCommand('Gaji karyawan untuk periode ini sudah dicatat.');
    const employee = state.employees.find(item => item.id === payroll.employeeId);
    const account = state.users.find(item => item.id === employee.userId);
    const location = state.locations.find(item => item.id === employee.locationId);
    state.payrolls.push({
      ...payroll,
      period,
      // Nominal gaji berasal dari data kerja server, bukan angka kiriman
      // browser, agar slip dan rekap tidak dapat dimanipulasi dari request.
      grossAmount: Number(employee.monthlySalary || 0),
      status: 'paid',
      paidAt: new Date().toISOString(),
      note: String(payroll.note || '').trim().slice(0, 500) || undefined,
      proofUrl: String(payroll.proofUrl || '').trim().slice(0, 2048) || undefined,
      employeeName: account?.name || 'Karyawan',
      positionSnapshot: employee.position || '-',
      locationNameSnapshot: location?.name || '-',
    });
  });
});

app.post('/api/commands/sales', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const { locationId, channel, payment, items } = req.body || {};
    const authorization = commandAuth(actor, 'sale.create', locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!state.locations.some(location => location.id === locationId && location.active !== false)) throw invalidCommand('Lokasi penjualan tidak aktif atau tidak ditemukan.');
    if (!['offline', 'online', 'reseller'].includes(channel)) throw invalidCommand('Kanal penjualan tidak valid.');
    if (!Array.isArray(items) || !items.length) throw invalidCommand('Pilih minimal satu varian untuk penjualan.');

    const variants = new Map(state.products.flatMap(product => (product.variants || []).map(variant => [variant.id, { ...variant, unit: product.unit, productName: product.name }])));
    const combined = new Map();
    for (const item of items) {
      const quantity = Number(item?.quantity);
      if (!item?.variantId || !Number.isInteger(quantity) || quantity <= 0) throw invalidCommand('Jumlah produk harus berupa bilangan positif.');
      combined.set(item.variantId, (combined.get(item.variantId) || 0) + quantity);
    }

    const policy = state.business?.negativeStockPolicy || 'BLOCK';
    const saleItems = [];
    let balances = state.balances;
    let total = 0;
    const movements = [];
    for (const [variantId, quantity] of combined) {
      const variant = variants.get(variantId);
      if (!variant || variant.active === false) throw invalidCommand('Salah satu varian tidak aktif atau tidak ditemukan.');
      const available = commandBalance(balances, locationId, variantId);
      if (policy === 'BLOCK' && available < quantity) throw invalidCommand(`Stok ${variant.productName} ${variant.name} tidak mencukupi. Tersedia ${available} ${variant.unit}.`);
      const price = channel === 'reseller' ? Number(variant.resellerPrice || 0) : Number(variant.price || 0);
      balances = commandAdjustBalance(balances, locationId, variantId, -quantity);
      total += quantity * price;
      saleItems.push({ variantId, quantity, unit: variant.unit, unitCost: Number(variant.cost || 0), price, subtotal: quantity * price });
      movements.push(commandMovement(variantId, locationId, `Penjualan ${channel}`, -quantity, `${quantity} ${variant.unit}`, actor));
    }
    state.balances = balances;
    state.sales.unshift({ id: commandId('sale'), locationId, channel, total, payment: String(payment || 'Tunai'), cashierId: actor.id, createdAt: new Date().toISOString(), items: saleItems, status: 'completed' });
    state.movements.unshift(...movements);
  });
});

app.post('/api/commands/transfers', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const { fromId, toId, sendProofUrl, items } = req.body || {};
    const authorization = commandAuth(actor, 'transfer.create', fromId);
    const sendAuthorization = commandAuth(actor, 'transfer.send', fromId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!sendAuthorization.allowed) throw forbiddenCommand(sendAuthorization.reason);
    if (!fromId || !toId || fromId === toId) throw invalidCommand('Pilih lokasi asal dan tujuan yang berbeda.');
    if (!state.locations.some(location => location.id === fromId && location.active !== false) || !state.locations.some(location => location.id === toId && location.active !== false)) throw invalidCommand('Lokasi transfer tidak aktif atau tidak ditemukan.');
    if (!Array.isArray(items) || !items.length) throw invalidCommand('Pilih minimal satu varian untuk transfer.');
    const variants = new Set(state.products.flatMap(product => (product.variants || []).filter(variant => variant.active !== false).map(variant => variant.id)));
    const combined = new Map();
    for (const item of items) {
      const quantity = Number(item?.quantity);
      if (!item?.variantId || !Number.isInteger(quantity) || quantity <= 0) throw invalidCommand('Jumlah transfer harus berupa bilangan positif.');
      if (!variants.has(item.variantId)) throw invalidCommand('Salah satu varian tidak aktif atau tidak ditemukan.');
      combined.set(item.variantId, (combined.get(item.variantId) || 0) + quantity);
    }
    const policy = state.business?.negativeStockPolicy || 'BLOCK';
    const transferCode = commandTransferCode();
    let balances = state.balances;
    const now = new Date().toISOString();
    for (const [variantId, quantity] of combined) {
      const available = commandBalance(balances, fromId, variantId);
      if (policy === 'BLOCK' && available < quantity) throw invalidCommand(`Stok asal tidak mencukupi untuk transfer. Tersedia ${available}.`);
      balances = commandAdjustBalance(balances, fromId, variantId, -quantity);
      state.transfers.unshift({ id: commandId('trf'), transferCode, fromId, toId, variantId, quantity, status: 'sent', createdAt: now, createdBy: actor.id, sendProofUrl: String(sendProofUrl || '') || undefined });
      state.movements.unshift(commandMovement(variantId, fromId, 'Transfer keluar', -quantity, `Dokumen ${transferCode}`, actor));
    }
    state.balances = balances;
  });
});

app.post('/api/commands/transfers/:code/receive', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const receiveProofUrl = String(req.body?.receiveProofUrl || '') || undefined;
    const transferCode = String(req.params.code || '');
    const lines = state.transfers.filter(transfer => (transfer.transferCode === transferCode || transfer.id === transferCode) && transfer.status === 'sent');
    if (!lines.length) throw invalidCommand('Transfer tidak ditemukan atau sudah diproses.');
    const destination = lines[0].toId;
    if (lines.some(line => line.toId !== destination)) throw invalidCommand('Dokumen transfer tidak konsisten.');
    const authorization = commandAuth(actor, 'transfer.receive', destination);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    let balances = state.balances;
    const receivedAt = new Date().toISOString();
    const locations = new Map(state.locations.map(location => [location.id, location.name]));
    for (const line of lines) {
      balances = commandAdjustBalance(balances, line.toId, line.variantId, Number(line.quantity));
      line.status = 'received';
      line.receivedAt = receivedAt;
      line.receivedBy = actor.id;
      line.receiveProofUrl = receiveProofUrl;
      state.movements.unshift(commandMovement(line.variantId, line.toId, 'Transfer diterima', Number(line.quantity), `Dari ${locations.get(line.fromId) || 'lokasi asal'} · ${transferCode}`, actor));
    }
    state.balances = balances;
  });
});

app.post('/api/commands/receipts', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const { locationId, sourceType = 'supplier', supplierId, supplierName, note, proofUrl, items } = req.body || {};
    const authorization = commandAuth(actor, 'stock.in', locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!state.locations.some(location => location.id === locationId && location.active !== false)) throw invalidCommand('Lokasi stok masuk tidak ditemukan.');
    if (sourceType === 'supplier' && supplierId && !state.suppliers.some(supplier => supplier.id === supplierId && supplier.active !== false)) throw invalidCommand('Supplier tidak aktif atau tidak ditemukan.');
    if (sourceType === 'supplier' && !String(supplierName || '').trim()) throw invalidCommand('Pilih supplier untuk pembelian stok.');
    if (!Array.isArray(items) || !items.length) throw invalidCommand('Pilih minimal satu varian.');
    const variants = new Set(state.products.flatMap(product => (product.variants || []).filter(variant => variant.active !== false).map(variant => variant.id)));
    let balances = state.balances;
    const receiptCode = commandId('rcv');
    const createdAt = new Date().toISOString();
    for (const item of items) {
      const quantity = Number(item?.quantity), unitCost = Number(item?.unitCost);
      if (!variants.has(item?.variantId) || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) throw invalidCommand('Data stok masuk tidak valid.');
      balances = commandAdjustBalance(balances, locationId, item.variantId, quantity);
      state.receipts.unshift({ id: commandId('rcv'), receiptCode, sourceType, supplierId, supplierName, locationId, variantId: item.variantId, quantity, unitCost, note: String(note || ''), proofUrl: String(proofUrl || '') || undefined, status: 'completed', createdBy: actor.id, createdAt });
      state.movements.unshift(commandMovement(item.variantId, locationId, sourceType === 'production' ? 'Hasil produksi' : (supplierName || 'Stok masuk'), quantity, String(note || ''), actor));
    }
    state.balances = balances;
  });
});

app.patch('/api/commands/receipts/:id', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const receipt = state.receipts.find(item => item.id === req.params.id);
    if (!receipt || receipt.status === 'cancelled') throw invalidCommand('Stok masuk tidak ditemukan atau sudah dibatalkan.');
    const { locationId, sourceType, supplierId, supplierName, note, proofUrl, items } = req.body || {};
    const authorization = commandAuth(actor, 'stock.in', receipt.locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!Array.isArray(items) || items.length !== 1) throw invalidCommand('Revisi stok masuk harus berisi tepat satu varian.');
    const item = items[0], quantity = Number(item?.quantity), unitCost = Number(item?.unitCost);
    const variants = new Set(state.products.flatMap(product => (product.variants || []).map(variant => variant.id)));
    if (sourceType === 'supplier' && supplierId && !state.suppliers.some(supplier => supplier.id === supplierId && supplier.active !== false)) throw invalidCommand('Supplier tidak aktif atau tidak ditemukan.');
    if (!variants.has(item?.variantId) || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) throw invalidCommand('Data revisi stok masuk tidak valid.');
    let balances = commandAdjustBalance(state.balances, receipt.locationId, receipt.variantId, -Number(receipt.quantity));
    balances = commandAdjustBalance(balances, locationId, item.variantId, quantity);
    Object.assign(receipt, { locationId, sourceType, supplierId, supplierName, note, proofUrl: String(proofUrl || '') || undefined, variantId: item.variantId, quantity, unitCost, updatedAt: new Date().toISOString() });
    state.balances = balances;
    state.movements.unshift(commandMovement(receipt.variantId, locationId, 'Koreksi stok masuk', quantity, 'Revisi dokumen stok masuk', actor));
  });
});

app.post('/api/commands/returns', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const { locationId, type, reason, items, proofUrl } = req.body || {};
    const authorization = commandAuth(actor, 'stock.out', locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!['customer', 'supplier'].includes(type) || !String(reason || '').trim() || !Array.isArray(items) || !items.length) throw invalidCommand('Data retur tidak valid.');
    const variants = new Set(state.products.flatMap(product => (product.variants || []).map(variant => variant.id)));
    let balances = state.balances;
    for (const item of items) {
      const quantity = Number(item?.quantity);
      if (!variants.has(item?.variantId) || !Number.isInteger(quantity) || quantity <= 0) throw invalidCommand('Item retur tidak valid.');
      const delta = type === 'customer' ? quantity : -quantity;
      if (delta < 0 && commandBalance(balances, locationId, item.variantId) < quantity) throw invalidCommand('Stok tidak mencukupi untuk retur supplier.');
      balances = commandAdjustBalance(balances, locationId, item.variantId, delta);
      state.returns.unshift({ id: commandId('ret'), type, locationId, variantId: item.variantId, quantity, reason: String(reason).trim(), proofUrl: String(proofUrl || '') || undefined, status: 'completed', createdAt: new Date().toISOString() });
      state.movements.unshift(commandMovement(item.variantId, locationId, type === 'customer' ? 'Retur pelanggan' : 'Retur ke supplier', delta, String(reason).trim(), actor));
    }
    state.balances = balances;
  });
});

app.post('/api/commands/opnames', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const { locationId, items } = req.body || {};
    const authorization = commandAuth(actor, 'stock.opname', locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!Array.isArray(items) || !items.length) throw invalidCommand('Isi minimal satu hasil stock opname.');
    const variants = new Set(state.products.flatMap(product => (product.variants || []).map(variant => variant.id)));
    let balances = state.balances;
    for (const item of items) {
      const actualQty = Number(item?.actualQty);
      if (!variants.has(item?.variantId) || !Number.isInteger(actualQty) || actualQty < 0 || !String(item?.reason || '').trim()) throw invalidCommand('Data stock opname tidak valid.');
      const systemQty = commandBalance(balances, locationId, item.variantId);
      const difference = actualQty - systemQty;
      balances = commandAdjustBalance(balances, locationId, item.variantId, difference);
      state.stockCounts.unshift({ id: commandId('opn'), locationId, variantId: item.variantId, systemQty, actualQty, difference, reason: String(item.reason).trim(), createdBy: actor.id, createdAt: new Date().toISOString() });
      state.movements.unshift(commandMovement(item.variantId, locationId, 'Koreksi opname', difference, String(item.reason).trim(), actor));
    }
    state.balances = balances;
  });
});

app.patch('/api/commands/opnames/:id', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const count = state.stockCounts.find(item => item.id === req.params.id);
    if (!count || count.status === 'cancelled') throw invalidCommand('Stock opname tidak ditemukan atau sudah dibatalkan.');
    const { locationId, items } = req.body || {};
    const authorization = commandAuth(actor, 'stock.opname', count.locationId);
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    if (!Array.isArray(items) || items.length !== 1) throw invalidCommand('Revisi stock opname harus berisi tepat satu varian.');
    const item = items[0], actualQty = Number(item?.actualQty);
    if (!Number.isInteger(actualQty) || actualQty < 0 || !String(item?.reason || '').trim()) throw invalidCommand('Data revisi stock opname tidak valid.');
    let balances = commandAdjustBalance(state.balances, count.locationId, count.variantId, -Number(count.difference));
    const systemQty = commandBalance(balances, locationId, item.variantId);
    const difference = actualQty - systemQty;
    balances = commandAdjustBalance(balances, locationId, item.variantId, difference);
    Object.assign(count, { locationId, variantId: item.variantId, systemQty, actualQty, difference, reason: String(item.reason).trim(), updatedAt: new Date().toISOString() });
    state.balances = balances;
    state.movements.unshift(commandMovement(item.variantId, locationId, 'Koreksi opname (Update)', difference, String(item.reason).trim(), actor));
  });
});

app.patch('/api/commands/variants/:id/minimums/:locationId', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const authorization = commandAuth(actor, 'product.update');
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    const minimum = Number(req.body?.minimum);
    if (!Number.isInteger(minimum) || minimum < 0 || !state.locations.some(location => location.id === req.params.locationId)) throw invalidCommand('Minimum stok tidak valid.');
    let found = false;
    for (const product of state.products) for (const variant of product.variants || []) if (variant.id === req.params.id) {
      variant.minStockByLocation = { ...(variant.minStockByLocation || {}), [req.params.locationId]: minimum };
      found = true;
    }
    if (!found) throw invalidCommand('Varian tidak ditemukan.');
  });
});

app.post('/api/commands/cancel', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const { kind, id, reason } = req.body || {};
    if (!String(reason || '').trim()) throw invalidCommand('Alasan pembatalan wajib diisi.');
    let balances = state.balances;
    const now = new Date().toISOString();
    const note = String(reason).trim();
    if (kind === 'sale') {
      const sale = state.sales.find(item => item.id === id);
      const authorization = commandAuth(actor, 'sale.void', sale?.locationId);
      if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
      if (!sale || sale.status === 'voided') throw invalidCommand('Penjualan tidak ditemukan atau sudah dibatalkan.');
      for (const line of sale.items || []) {
        balances = commandAdjustBalance(balances, sale.locationId, line.variantId, Number(line.quantity));
        state.movements.unshift(commandMovement(line.variantId, sale.locationId, 'Pembatalan Penjualan', Number(line.quantity), note, actor));
      }
      Object.assign(sale, { status: 'voided', cancelReason: note, cancelledAt: now });
    } else if (kind === 'transfer') {
      const lines = state.transfers.filter(item => (item.transferCode === id || item.id === id) && item.status !== 'cancelled');
      if (!lines.length) throw invalidCommand('Transfer tidak ditemukan atau sudah dibatalkan.');
      const authorization = commandAuth(actor, 'transfer.cancel', lines[0].fromId);
      if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
      for (const line of lines) {
        if (line.status === 'received') {
          if (commandBalance(balances, line.toId, line.variantId) < Number(line.quantity)) throw invalidCommand('Pembatalan gagal: stok tujuan sudah terpakai.');
          balances = commandAdjustBalance(balances, line.toId, line.variantId, -Number(line.quantity));
        }
        balances = commandAdjustBalance(balances, line.fromId, line.variantId, Number(line.quantity));
        Object.assign(line, { status: 'cancelled', cancelReason: note, cancelledAt: now });
        state.movements.unshift(commandMovement(line.variantId, line.fromId, 'Pembatalan transfer', Number(line.quantity), note, actor));
      }
    } else if (kind === 'receipt') {
      const legacyDocument = /^legacy:([^:]+):(\d+)$/.exec(String(id));
      const receipts = state.receipts.filter(item => (
        item.receiptCode === id || item.id === id ||
        (legacyDocument && item.locationId === legacyDocument[1] && new RegExp(`^rcv-${legacyDocument[2]}-`, 'i').test(item.id || ''))
      ) && item.status !== 'cancelled');
      const receipt = receipts[0];
      const authorization = commandAuth(actor, 'stock.in', receipt?.locationId);
      if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
      if (!receipts.length) throw invalidCommand('Stok masuk tidak ditemukan atau sudah dibatalkan.');
      for (const line of receipts) if (commandBalance(balances, line.locationId, line.variantId) < Number(line.quantity)) throw invalidCommand('Pembatalan gagal: stok masuk sudah terpakai.');
      for (const line of receipts) {
        balances = commandAdjustBalance(balances, line.locationId, line.variantId, -Number(line.quantity));
        Object.assign(line, { status: 'cancelled', cancelReason: note, cancelledAt: now });
        state.movements.unshift(commandMovement(line.variantId, line.locationId, 'Pembatalan stok masuk', -Number(line.quantity), note, actor));
      }
    } else if (kind === 'opname') {
      const count = state.stockCounts.find(item => item.id === id);
      const authorization = commandAuth(actor, 'stock.opname', count?.locationId);
      if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
      if (!count || count.status === 'cancelled') throw invalidCommand('Stock opname tidak ditemukan atau sudah dibatalkan.');
      balances = commandAdjustBalance(balances, count.locationId, count.variantId, -Number(count.difference));
      Object.assign(count, { status: 'cancelled', cancelReason: note, cancelledAt: now });
      state.movements.unshift(commandMovement(count.variantId, count.locationId, 'Pembatalan opname', -Number(count.difference), note, actor));
    } else if (kind === 'return') {
      const item = state.returns.find(row => row.id === id);
      const authorization = commandAuth(actor, 'stock.out', item?.locationId);
      if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
      if (!item || item.status === 'cancelled') throw invalidCommand('Retur tidak ditemukan atau sudah dibatalkan.');
      const delta = item.type === 'customer' ? -Number(item.quantity) : Number(item.quantity);
      if (delta < 0 && commandBalance(balances, item.locationId, item.variantId) < Number(item.quantity)) throw invalidCommand('Pembatalan gagal: stok retur sudah terpakai.');
      balances = commandAdjustBalance(balances, item.locationId, item.variantId, delta);
      Object.assign(item, { status: 'cancelled', cancelReason: note, cancelledAt: now });
      state.movements.unshift(commandMovement(item.variantId, item.locationId, 'Pembatalan retur', delta, note, actor));
    } else throw invalidCommand('Jenis transaksi tidak dikenal.');
    state.balances = balances;
  });
});

app.post('/api/commands/products', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const { product, initialStocks = [] } = req.body || {};
    const authorization = commandAuth(actor, 'product.create');
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    const validationError = validateCommandProduct(product);
    if (validationError) throw invalidCommand(validationError);
    if (state.products.some(item => item.id === product.id)) throw invalidCommand('ID produk sudah digunakan.');
    const existingVariants = state.products.flatMap(item => item.variants || []);
    if (product.variants.some(variant => existingVariants.some(existing =>
      String(existing.sku || '').trim().toLowerCase() === String(variant.sku || '').trim().toLowerCase() ||
      (String(variant.barcode || '').trim() && String(existing.barcode || '').trim() === String(variant.barcode || '').trim())
    ))) throw invalidCommand('SKU atau barcode sudah digunakan varian lain.');
    state.products.push({ ...product, name: String(product.name).trim(), active: product.active !== false });
    let balances = state.balances;
    const validVariants = new Set(product.variants.map(variant => variant.id));
    for (const item of initialStocks) {
      const quantity = Number(item?.quantity);
      const stockAuthorization = commandAuth(actor, 'stock.initial_balance', item?.locationId);
      if (!stockAuthorization.allowed) throw forbiddenCommand(stockAuthorization.reason);
      if (!validVariants.has(item?.variantId) || !Number.isInteger(quantity) || quantity < 0) throw invalidCommand('Saldo awal produk tidak valid.');
      balances = commandAdjustBalance(balances, item.locationId, item.variantId, quantity);
      state.movements.unshift(commandMovement(item.variantId, item.locationId, 'INITIAL_BALANCE', quantity, 'Saldo awal saat pembuatan produk', actor));
    }
    state.balances = balances;
  });
});

app.patch('/api/commands/products/:id', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const authorization = commandAuth(actor, 'product.update');
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    const index = state.products.findIndex(item => item.id === req.params.id);
    if (index < 0) throw invalidCommand('Produk tidak ditemukan.');
    const product = req.body?.product;
    if (!product || product.id !== req.params.id) throw invalidCommand('Data produk tidak valid.');
    const validationError = validateCommandProduct(product);
    if (validationError) throw invalidCommand(validationError);
    const existingVariants = state.products.filter(item => item.id !== req.params.id).flatMap(item => item.variants || []);
    if (product.variants.some(variant => existingVariants.some(existing =>
      String(existing.sku || '').trim().toLowerCase() === String(variant.sku || '').trim().toLowerCase() ||
      (String(variant.barcode || '').trim() && String(existing.barcode || '').trim() === String(variant.barcode || '').trim())
    ))) throw invalidCommand('SKU atau barcode sudah digunakan varian lain.');
    state.products[index] = { ...product, name: String(product.name).trim(), active: product.active !== false };
  });
});

app.post('/api/commands/locations', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const authorization = commandAuth(actor, 'location.create');
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    const { location } = req.body || {};
    if (!location?.id || !String(location.name || '').trim() || !['warehouse', 'outlet'].includes(location.type)) throw invalidCommand('Data lokasi tidak valid.');
    if (String(location.name).length > 60) throw invalidCommand('Nama lokasi maksimal 60 karakter.');
    if (!/^[\p{L}\p{N}\s.,'()-]+$/u.test(String(location.name))) throw invalidCommand('Nama lokasi mengandung karakter yang tidak diizinkan.');
    if (String(location.address || '').length > 250) throw invalidCommand('Alamat lokasi maksimal 250 karakter.');
    const duplicate = state.locations.some(item => `${item.name}`.trim().toLowerCase() === `${location.name}`.trim().toLowerCase() && item.type === location.type);
    if (duplicate) throw invalidCommand('Terdapat lokasi dengan nama dan jenis yang sama.');
    if (location.isCentralWarehouse && location.type !== 'warehouse') throw invalidCommand('Gudang pusat harus menggunakan jenis lokasi gudang.');
    if (location.isCentralWarehouse) state.locations.forEach(item => { item.isCentralWarehouse = false; });
    state.locations.push({ ...location, name: String(location.name).trim(), active: location.active !== false, isCentralWarehouse: location.isCentralWarehouse === true });
  });
});

app.patch('/api/commands/locations/:id', requireAuth, async (req, res) => {
  await executeCommand(req, res, async (state, actor) => {
    const authorization = commandAuth(actor, 'location.update');
    if (!authorization.allowed) throw forbiddenCommand(authorization.reason);
    const index = state.locations.findIndex(item => item.id === req.params.id);
    const location = req.body?.location;
    if (index < 0 || !location || !String(location.name || '').trim() || !['warehouse', 'outlet'].includes(location.type)) throw invalidCommand('Data lokasi tidak valid.');
    if (String(location.name).length > 60) throw invalidCommand('Nama lokasi maksimal 60 karakter.');
    if (!/^[\p{L}\p{N}\s.,'()-]+$/u.test(String(location.name))) throw invalidCommand('Nama lokasi mengandung karakter yang tidak diizinkan.');
    if (String(location.address || '').length > 250) throw invalidCommand('Alamat lokasi maksimal 250 karakter.');
    if (state.locations[index].active && location.active === false && state.locations.filter(item => item.active).length <= 1) throw invalidCommand('Minimal satu lokasi harus tetap aktif.');
    if (state.locations[index].active && location.active === false) {
      const assignedUsers = state.users.filter(user => user.active !== false && user.outletId === req.params.id);
      const assignedEmployees = state.employees.filter(employee => employee.active !== false && employee.locationId === req.params.id);
      const remainingStock = state.balances.some(balance => balance.locationId === req.params.id && Number(balance.quantity) !== 0);
      if (assignedUsers.length || assignedEmployees.length) throw invalidCommand('Lokasi masih dipakai oleh staf aktif. Pindahkan penugasan staf sebelum menonaktifkan lokasi.');
      if (remainingStock) throw invalidCommand('Lokasi masih memiliki saldo stok. Pindahkan atau kosongkan stok sebelum menonaktifkan lokasi.');
    }
    if (location.isCentralWarehouse && location.type !== 'warehouse') throw invalidCommand('Gudang pusat harus menggunakan jenis lokasi gudang.');
    const duplicate = state.locations.some(item => item.id !== req.params.id && `${item.name}`.trim().toLowerCase() === `${location.name}`.trim().toLowerCase() && item.type === location.type);
    if (duplicate) throw invalidCommand('Terdapat lokasi dengan nama dan jenis yang sama.');
    if (location.isCentralWarehouse) state.locations.forEach(item => { item.isCentralWarehouse = false; });
    state.locations[index] = { ...state.locations[index], ...location, id: req.params.id, name: String(location.name).trim(), isCentralWarehouse: location.isCentralWarehouse === true };
  });
});

app.use((error,req,res,next)=>{
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({ message: 'Data operasional terlalu besar untuk disimpan. Hubungi administrator untuk pengarsipan data.' });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ message: 'Format data yang dikirim tidak valid' });
  }
  if(error instanceof multer.MulterError)return res.status(400).json({message:error.code==='LIMIT_FILE_SIZE'?'Ukuran gambar maksimal 5 MB':'Upload gambar tidak valid'});
  if (req.path.startsWith('/api/')) {
    console.error('API request failed:', error?.code || error?.message || error);
    return res.status(503).json({ message: 'Database tidak dapat dihubungi. Periksa service MySQL lalu coba lagi.' });
  }
  next(error);
});

app.use(express.static(path.join(root, 'dist')));
app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
app.listen(port, () => console.log(`MENENGS server running on http://localhost:${port}`));
setInterval(() => {}, 1000 * 60 * 60);
