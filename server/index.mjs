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

const app = express();
const port = Number(process.env.PORT || 8787);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(cors({ origin: process.env.APP_ORIGIN || true }));
app.use(express.json({ limit: '2mb' }));
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
const FROM_ADDRESS = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@veinstock.app';
const APP_NAME = 'VEINSTOCK';

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
        ⚠️ <strong>Jangan bagikan kode ini</strong> kepada siapa pun, termasuk tim VEINSTOCK. Kode ini bersifat rahasia dan hanya untuk Anda.
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
function generateOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

let pool;
async function db() {
  if (!process.env.DB_HOST) return null;
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
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('owner','pic','finance','admin','warehouse','cashier') NOT NULL,
      outlet_id VARCHAR(40) NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_email (organization_id,email),
      INDEX idx_users_email (email)
    )`);
    const [orgColumn]=await pool.query("SHOW COLUMNS FROM users LIKE 'organization_id'");
    if(!orgColumn.length){
      await pool.execute("ALTER TABLE users ADD COLUMN organization_id VARCHAR(40) NULL AFTER id");
      await pool.execute("INSERT IGNORE INTO organizations (id,name,slug) VALUES ('org-meneng','Meneng','meneng')");
      await pool.execute("UPDATE users SET organization_id='org-meneng' WHERE organization_id IS NULL");
      await pool.execute("ALTER TABLE users MODIFY organization_id VARCHAR(40) NOT NULL");
    }
    const [countRows] = await pool.query('SELECT COUNT(*) total FROM users');
    if (!Number(countRows[0].total)) {
      const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || 'VeinStock123!';
      const passwordHash = await bcrypt.hash(defaultPassword, 12);
      await pool.execute("INSERT IGNORE INTO organizations (id,name,slug) VALUES ('org-meneng','Meneng','meneng')");
      const initialUsers = [
        ['u-owner','Owner Meneng',process.env.INITIAL_ADMIN_EMAIL || 'owner@meneng.id','owner',null],
        ['u-pic','Rina - PIC Outlet','pic@meneng.id','pic','loc-outlet-1'],
        ['u-fin','Dewi - Keuangan','finance@meneng.id','finance',null],
      ];
      for (const [id,name,email,role,outletId] of initialUsers) await pool.execute('INSERT INTO users (id,organization_id,name,email,password_hash,role,outlet_id,active) VALUES (?,\'org-meneng\',?,?,?,?,?,TRUE)', [id,name,email,passwordHash,role,outletId]);
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
const slugify=value=>String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const emptyState=(organizationName,owner)=>({business:{name:organizationName,ownerName:owner.name,email:owner.email},users:[{id:owner.id,name:owner.name,email:owner.email,role:'owner',active:true}],locations:[{id:'loc-owner',name:`Gudang ${organizationName}`,type:'warehouse',active:true}],products:[],balances:[],transfers:[],sales:[],movements:[],stockCounts:[],suppliers:[],receipts:[],returns:[]});
app.post('/api/login', async (req,res) => {
  const email=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  const conn=await db();
  let user;
  if(conn){ const [rows]=await conn.execute('SELECT u.*,o.name organization_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.email=? AND u.active=TRUE AND o.active=TRUE LIMIT 1',[email]); user=rows[0]; if(!user || !await bcrypt.compare(password,user.password_hash)) return res.status(401).json({message:'Email atau password tidak sesuai'}); }
  else { user=demoUsers.find(item=>item.email===email); if(!user || password!==(user.demo_password||'VeinStock123!')) return res.status(401).json({message:'Email atau password tidak sesuai'}); }
  const publicUser=safeUser(user);
  res.json({token:jwt.sign({sub:publicUser.id,role:publicUser.role,org:publicUser.organizationId},jwtSecret,{expiresIn:'12h'}),user:publicUser});
});
app.post('/api/register',async(req,res)=>{
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
function validatePicChange(previous,next,user){
  if(!previous) return 'Data awal hanya dapat dibuat oleh Owner';
  if(!same(previous.users,next.users)||!same(previous.locations,next.locations)||!same(previous.products,next.products)) return 'PIC tidak dapat mengubah master data';
  const outletId=user.outlet_id||user.outletId;
  if(!outletId) return 'Akun PIC belum terhubung ke outlet';
  const appendOnly=(oldItems,newItems)=>oldItems.every(old=>newItems.some(item=>item.id===old.id&&same(item,old)));
  if(!appendOnly(previous.sales,next.sales)||!appendOnly(previous.stockCounts,next.stockCounts)||!appendOnly(previous.movements,next.movements))return 'Riwayat transaksi lama tidak boleh diubah atau dihapus';
  const oldSales=new Set(previous.sales.map(item=>item.id));
  if(next.sales.some(item=>!oldSales.has(item.id)&&item.locationId!==outletId)) return 'PIC hanya dapat mencatat penjualan outletnya';
  const oldCounts=new Set(previous.stockCounts.map(item=>item.id));
  if(next.stockCounts.some(item=>!oldCounts.has(item.id)&&item.locationId!==outletId)) return 'PIC hanya dapat melakukan opname outletnya';
  const oldMovements=new Set(previous.movements.map(item=>item.id));
  if(next.movements.some(item=>!oldMovements.has(item.id)&&item.locationId!==outletId))return 'PIC hanya dapat mencatat pergerakan stok outletnya';
  const oldTransfers=new Map(previous.transfers.map(item=>[item.id,item]));
  if(next.transfers.some(item=>!oldTransfers.has(item.id))) return 'Transfer baru hanya dapat dibuat oleh Owner';
  for(const item of next.transfers){const old=oldTransfers.get(item.id);if(old&&!same(old,item)&&(old.toId!==outletId||old.status!=='sent'||item.status!=='received'))return 'PIC hanya dapat mengonfirmasi transfer ke outletnya';}
  const changedBalances=next.balances.filter(item=>{const old=previous.balances.find(value=>value.locationId===item.locationId&&value.variantId===item.variantId);return !old||old.quantity!==item.quantity});
  if(changedBalances.some(item=>item.locationId!==outletId)) return 'PIC hanya dapat mengubah stok outletnya';
  if(next.balances.length<previous.balances.length) return 'Saldo stok tidak boleh dihapus';
  return null;
}
function validateState(data){
  const arrays=['users','locations','products','balances','transfers','sales','movements','stockCounts'];
  if(!data||arrays.some(key=>!Array.isArray(data[key])))return 'Format data stok tidak valid';
  const isNumber=value=>typeof value==='number'&&Number.isFinite(value);
  const variants=new Set(data.products.flatMap(product=>Array.isArray(product.variants)?product.variants.map(variant=>variant.id):[]));
  const locations=new Set(data.locations.map(location=>location.id));
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
app.post('/api/users',requireAuth,async(req,res)=>{
  const conn=await db(),actor=await currentUser(conn,req.auth);
  if(!actor||actor.role!=='owner')return res.status(403).json({message:'Hanya Owner yang dapat menambah pengguna'});
  const name=String(req.body?.name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''),role=String(req.body?.role||''),outletId=req.body?.outletId||null;
  if(name.length<2||!email.includes('@')||password.length<8||!['pic','finance','admin','warehouse','cashier'].includes(role))return res.status(400).json({message:'Data pengguna belum lengkap'});
  if(role==='pic'&&!outletId)return res.status(400).json({message:'PIC wajib dihubungkan ke outlet'});
  if(role==='pic'){
    const state=!conn?demoStates.get(req.auth.org)?.data:(await conn.execute('SELECT payload FROM app_state WHERE id=?',[req.auth.org]))[0][0]?.payload;
    if(!state?.locations?.some(item=>item.id===outletId&&item.type==='outlet'&&item.active))return res.status(400).json({message:'Outlet PIC tidak valid atau belum aktif'});
  }
  const id=`u-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,organizationId=req.auth.org;
  if(!conn){if(demoUsers.some(item=>item.email===email))return res.status(409).json({message:'Email sudah terdaftar'});const user={id,organization_id:organizationId,organization_name:actor.organization_name,name,email,role,outletId,active:true,demo_password:password};demoUsers.push(user);return res.status(201).json({user:safeUser(user)});}
  const [existing]=await conn.execute('SELECT id FROM users WHERE email=? LIMIT 1',[email]);
  if(existing.length)return res.status(409).json({message:'Email sudah terdaftar'});
  await conn.execute('INSERT INTO users (id,organization_id,name,email,password_hash,role,outlet_id,active) VALUES (?,?,?,?,?,?,?,TRUE)',[id,organizationId,name,email,await bcrypt.hash(password,12),role,role==='pic'?outletId:null]);
  res.status(201).json({user:{id,name,email,role,outletId:role==='pic'?outletId:undefined,active:true,organizationId}});
});
app.patch('/api/users/:id',requireAuth,async(req,res)=>{
  const conn=await db(),actor=await currentUser(conn,req.auth),targetId=String(req.params.id||'');
  if(!actor||actor.role!=='owner')return res.status(403).json({message:'Hanya Owner yang dapat mengubah profil pengguna'});
  const name=String(req.body?.name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''),requestedRole=String(req.body?.role||''),outletId=req.body?.outletId||null,active=req.body?.active!==false;
  if(name.length<2||!email.includes('@')||(password&&password.length<8))return res.status(400).json({message:'Nama, email, atau password belum valid'});
  let target;
  if(!conn)target=demoUsers.find(item=>item.id===targetId&&item.organization_id===req.auth.org);
  else{const [rows]=await conn.execute('SELECT id,organization_id,name,email,role,outlet_id,active FROM users WHERE id=? AND organization_id=? LIMIT 1',[targetId,req.auth.org]);target=rows[0];}
  if(!target)return res.status(404).json({message:'Pengguna tidak ditemukan'});
  const role=target.role==='owner'?'owner':requestedRole;
  const finalActive=target.role==='owner'?true:active;
  if(!['owner','pic','finance','admin','warehouse','cashier'].includes(role))return res.status(400).json({message:'Role pengguna tidak valid'});
  if(role==='pic'){
    const state=!conn?demoStates.get(req.auth.org)?.data:(await conn.execute('SELECT payload FROM app_state WHERE id=?',[req.auth.org]))[0][0]?.payload;
    if(!state?.locations?.some(item=>item.id===outletId&&item.type==='outlet'&&item.active))return res.status(400).json({message:'PIC wajib dihubungkan ke outlet aktif'});
  }
  if(!conn){
    if(demoUsers.some(item=>item.email===email&&item.id!==targetId))return res.status(409).json({message:'Email sudah digunakan akun lain'});
    Object.assign(target,{name,email,role,outletId:role==='pic'?outletId:undefined,active:finalActive,...(password?{demo_password:password}:{})});
    return res.json({user:safeUser(target)});
  }
  const [duplicate]=await conn.execute('SELECT id FROM users WHERE email=? AND id<>? LIMIT 1',[email,targetId]);
  if(duplicate.length)return res.status(409).json({message:'Email sudah digunakan akun lain'});
  const params=[name,email,role,role==='pic'?outletId:null,finalActive];
  let sql='UPDATE users SET name=?,email=?,role=?,outlet_id=?,active=?';
  if(password){sql+=',password_hash=?';params.push(await bcrypt.hash(password,12));}
  sql+=' WHERE id=? AND organization_id=?';params.push(targetId,req.auth.org);
  await conn.execute(sql,params);
  res.json({user:{id:targetId,name,email,role,outletId:role==='pic'?outletId:undefined,active:finalActive,organizationId:req.auth.org}});
});

// ── Forgot Password (Request OTP) ────────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email.includes('@')) return res.status(400).json({ message: 'Masukkan alamat email yang valid' });
  const conn = await db();
  let user;
  if (conn) {
    const [rows] = await conn.execute('SELECT id, name, email FROM users WHERE email=? AND active=TRUE LIMIT 1', [email]);
    user = rows[0];
  } else {
    user = demoUsers.find(u => u.email === email && u.active !== false);
  }
  
  if (!user) return res.status(404).json({ message: 'Email tidak terdaftar di sistem. Silakan daftar terlebih dahulu.' });

  const otp = generateOtp();
  const hash = await bcrypt.hash(otp, 10);
  resetTokens.set(email, { hash, name: user.name, expiresAt: Date.now() + 15 * 60 * 1000 });
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
  if (!email.includes('@') || otp.length < 6 || newPassword.length < 8)
    return res.status(400).json({ message: 'Data tidak lengkap atau password minimal 8 karakter' });
  const entry = resetTokens.get(email);
  if (!entry || Date.now() > entry.expiresAt)
    return res.status(400).json({ message: 'Kode OTP tidak valid atau sudah kadaluarsa' });
  const valid = await bcrypt.compare(otp, entry.hash);
  if (!valid) return res.status(400).json({ message: 'Kode OTP salah' });
  resetTokens.delete(email);
  const newHash = await bcrypt.hash(newPassword, 12);
  const conn = await db();
  if (conn) {
    await conn.execute('UPDATE users SET password_hash=? WHERE email=? AND active=TRUE', [newHash, email]);
  } else {
    const u = demoUsers.find(u => u.email === email);
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
    const result=await new Promise((resolve,reject)=>{const stream=cloudinary.uploader.upload_stream({folder:`veinstock/${req.auth.org}`,resource_type:'image',format:'webp',overwrite:false,transformation:[{quality:'auto:eco',fetch_format:'auto'}]},(error,value)=>error?reject(error):resolve(value));stream.end(optimized)});
    res.status(201).json({url:result.secure_url,publicId:result.public_id,width:result.width,height:result.height,bytes:result.bytes,originalBytes:req.file.size});
  }catch(error){res.status(500).json({message:'Gambar gagal diproses atau diunggah'});}
});
app.get('/api/health', async (_req, res) => {
  try { const conn = await db(); if (conn) await conn.query('SELECT 1'); res.json({ ok: true, database: conn ? 'mysql' : 'demo' }); }
  catch (error) { console.error('Database health check failed', { code:error?.code, errno:error?.errno, message:error?.message }); res.status(503).json({ ok: false, message: 'Database tidak tersedia' }); }
});
app.get('/api/state', requireAuth, async (req, res) => {
  const conn = await db();
  const actor=await currentUser(conn,req.auth);
  if(!actor)return res.status(401).json({message:'Akun tidak aktif atau sesi tidak valid'});
  if (!conn) {const state=demoStates.get(req.auth.org)||{version:0,data:null},users=demoUsers.filter(item=>item.organization_id===req.auth.org).map(safeUser).map(user=>({...state.data?.users?.find(item=>item.id===user.id),...user}));return res.json({...state,data:state.data?{...state.data,users}:null});}
  const [rows] = await conn.execute('SELECT version, payload FROM app_state WHERE id=?', [req.auth.org]);
  if (!rows.length) return res.json({ version: 0, data: null });
  const [userRows]=await conn.execute('SELECT id,organization_id,name,email,role,outlet_id,active FROM users WHERE organization_id=? ORDER BY created_at',[req.auth.org]);
  res.json({ version: Number(rows[0].version), data: {...rows[0].payload,users:userRows.map(safeUser).map(user=>({...rows[0].payload?.users?.find(item=>item.id===user.id),...user}))} });
});
app.put('/api/state', requireAuth, async (req, res) => {
  const { data, version = 0 } = req.body || {};
  if (!data) return res.status(400).json({ message: 'Data wajib diisi' });
  const invalid=validateState(data);
  if(invalid)return res.status(400).json({message:invalid});
  const conn = await db();
  const actor=await currentUser(conn,req.auth);
  if(!actor)return res.status(401).json({message:'Akun tidak aktif'});
  if(actor.role==='finance')return res.status(403).json({message:'Akun Keuangan hanya memiliki akses baca'});
  if (!conn) {
    const state=demoStates.get(req.auth.org)||{version:0,data:null};
    const denied=actor.role==='pic'&&validatePicChange(state.data,data,actor);
    if(denied)return res.status(403).json({message:denied});
    if(Number(version)!==state.version)return res.status(409).json({message:'Data telah berubah di perangkat lain. Muat ulang sebelum menyimpan.'});
    const nextVersion=state.version+1;demoStates.set(req.auth.org,{version:nextVersion,data});return res.json({version:nextVersion});
  }
  const connection = await conn.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT version FROM app_state WHERE id=? FOR UPDATE', [req.auth.org]);
    if (rows.length && Number(rows[0].version) !== Number(version)) { await connection.rollback(); return res.status(409).json({ message: 'Data telah berubah di perangkat lain. Muat ulang sebelum menyimpan.' }); }
    const [stateRows]=await connection.execute('SELECT payload FROM app_state WHERE id=?',[req.auth.org]);
    const previous=stateRows[0]?.payload||null;
    const denied=actor.role==='pic'&&validatePicChange(previous,data,actor);
    if(denied){await connection.rollback();return res.status(403).json({message:denied});}
    const next = Number(version) + 1;
    await connection.execute('INSERT INTO app_state (id,version,payload) VALUES (?,?,?) ON DUPLICATE KEY UPDATE version=VALUES(version), payload=VALUES(payload)', [req.auth.org, next, JSON.stringify(data)]);
    await connection.commit();
    res.json({ version: next });
  } catch (error) { await connection.rollback(); res.status(500).json({ message: 'Gagal menyimpan data' }); }
  finally { connection.release(); }
});

app.use((error,_req,res,next)=>{
  if(error instanceof multer.MulterError)return res.status(400).json({message:error.code==='LIMIT_FILE_SIZE'?'Ukuran gambar maksimal 5 MB':'Upload gambar tidak valid'});
  next(error);
});

app.use(express.static(path.join(root, 'dist')));
app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
app.listen(port, () => console.log(`VEINSTOCK server running on http://localhost:${port}`));
