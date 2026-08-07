import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

if (process.env.ALLOW_SQL_RESTORE_DRILL !== 'true') {
  throw new Error('Set ALLOW_SQL_RESTORE_DRILL=true untuk menjalankan restore backup SQL terisolasi.');
}

const backupFile = path.resolve(process.env.BACKUP_FILE || '');
if (!backupFile.endsWith('.sql.gz') || !path.basename(backupFile).includes('veinstock')) {
  throw new Error('BACKUP_FILE harus menunjuk backup veinstock berekstensi .sql.gz.');
}

const compressed = fs.readFileSync(backupFile);
const sql = zlib.gunzipSync(compressed).toString('utf8');
const restoreSql = sql.replace(/\/\*M![\s\S]*?\*\/\s*;?/g, '');
if (!/CREATE TABLE `app_state`/i.test(sql) || !/CREATE TABLE `users`/i.test(sql)) {
  throw new Error('Backup tidak memiliki struktur inti MENENGS.');
}
if (/\b(?:DROP|CREATE)\s+DATABASE\b/i.test(sql) || /^\s*USE\s+/im.test(sql)) {
  throw new Error('Backup berisi perintah database-level yang tidak diizinkan untuk drill.');
}

const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const restoreDatabase = `veinstock_restore_f4b_${suffix}`;
if (!/^veinstock_restore_f4b_\d{14}$/.test(restoreDatabase)) throw new Error('Nama database restore tidak aman.');

const options = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectTimeout: 10_000,
  timezone: 'Z',
};

const admin = await mysql.createConnection(options);
let restore;
try {
  await admin.query(`CREATE DATABASE ${mysql.escapeId(restoreDatabase)}`);
  restore = await mysql.createConnection({ ...options, database: restoreDatabase, multipleStatements: true });
  await restore.query(restoreSql);

  const [tables] = await restore.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = ? ORDER BY table_name',
    [restoreDatabase, 'BASE TABLE'],
  );
  const tableNames = tables.map((row) => row.TABLE_NAME || row.table_name);
  const rowCounts = [];
  for (const table of tableNames) {
    const [rows] = await restore.query(`SELECT COUNT(*) count FROM ${mysql.escapeId(table)}`);
    rowCounts.push({ table, rows: Number(rows[0].count) });
  }

  const requiredTables = ['app_state', 'balances', 'locations', 'organizations', 'products', 'users', 'variants'];
  const missingTables = requiredTables.filter((table) => !tableNames.includes(table));
  const totalRows = rowCounts.reduce((total, table) => total + table.rows, 0);
  const ok = missingTables.length === 0 && totalRows > 0;

  console.log(JSON.stringify({
    ok,
    backupFile,
    backupSha256: crypto.createHash('sha256').update(compressed).digest('hex'),
    restoreDatabase,
    tableCount: tableNames.length,
    totalRows,
    rowCounts,
    missingTables,
  }, null, 2));
  if (!ok) process.exitCode = 2;
} finally {
  if (restore) await restore.end();
  await admin.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(restoreDatabase)}`);
  await admin.end();
}
