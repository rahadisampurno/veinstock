import 'dotenv/config';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

if (process.env.ALLOW_RESTORE_DRILL !== 'true') {
  throw new Error('Set ALLOW_RESTORE_DRILL=true untuk menjalankan restore drill terisolasi.');
}

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} belum dikonfigurasi.`);
if (!Object.hasOwn(process.env, 'DB_PASSWORD')) throw new Error('DB_PASSWORD belum dikonfigurasi.');

const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const restoreDatabase = `veinstock_restore_f4b_${suffix}`;
if (!/^veinstock_restore_f4b_\d{14}$/.test(restoreDatabase)) throw new Error('Nama database restore tidak aman.');

const connectionOptions = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectTimeout: 10_000,
  timezone: 'Z',
};

const normalize = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  }
  return value;
};

const digestRows = (rows) => crypto
  .createHash('sha256')
  .update(JSON.stringify(rows.map(normalize).map((row) => JSON.stringify(row)).sort()))
  .digest('hex');

const toSqlValue = (value) => {
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }
  return value;
};

const source = await mysql.createConnection({ ...connectionOptions, database: process.env.DB_NAME });
let restore;

try {
  const [tableRows] = await source.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = ? ORDER BY table_name',
    [process.env.DB_NAME, 'BASE TABLE'],
  );
  const tables = tableRows.map((row) => row.TABLE_NAME || row.table_name);
  if (!tables.length) throw new Error('Database sumber tidak memiliki tabel.');

  const backup = [];
  for (const table of tables) {
    const [createRows] = await source.query(`SHOW CREATE TABLE ${mysql.escapeId(table)}`);
    const createSql = createRows[0]['Create Table'];
    const [rows, fields] = await source.query(`SELECT * FROM ${mysql.escapeId(table)}`);
    backup.push({ table, createSql, columns: fields.map((field) => field.name), rows });
  }

  const sourceSummary = backup.map(({ table, rows }) => ({
    table,
    rows: rows.length,
    sha256: digestRows(rows),
  }));
  const backupSha256 = crypto.createHash('sha256').update(JSON.stringify(sourceSummary)).digest('hex');

  await source.query(`CREATE DATABASE ${mysql.escapeId(restoreDatabase)}`);
  restore = await mysql.createConnection({ ...connectionOptions, database: restoreDatabase });
  await restore.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const { table, createSql, columns, rows } of backup) {
    await restore.query(createSql);
    if (!rows.length) continue;
    const columnSql = columns.map(mysql.escapeId).join(', ');
    const placeholders = `(${columns.map(() => '?').join(', ')})`;
    for (let offset = 0; offset < rows.length; offset += 250) {
      const chunk = rows.slice(offset, offset + 250);
      const values = chunk.flatMap((row) => columns.map((column) => toSqlValue(row[column])));
      const rowSql = chunk.map(() => placeholders).join(', ');
      await restore.query(`INSERT INTO ${mysql.escapeId(table)} (${columnSql}) VALUES ${rowSql}`, values);
    }
  }
  await restore.query('SET FOREIGN_KEY_CHECKS = 1');

  const restoredSummary = [];
  for (const { table } of backup) {
    const [rows] = await restore.query(`SELECT * FROM ${mysql.escapeId(table)}`);
    restoredSummary.push({ table, rows: rows.length, sha256: digestRows(rows) });
  }

  const mismatches = sourceSummary.filter((sourceTable) => {
    const restoredTable = restoredSummary.find((item) => item.table === sourceTable.table);
    return !restoredTable || restoredTable.rows !== sourceTable.rows || restoredTable.sha256 !== sourceTable.sha256;
  });

  console.log(JSON.stringify({
    ok: mismatches.length === 0,
    sourceDatabase: process.env.DB_NAME,
    restoreDatabase,
    backupSha256,
    tableCount: sourceSummary.length,
    totalRows: sourceSummary.reduce((total, table) => total + table.rows, 0),
    tables: sourceSummary,
    mismatches,
  }, null, 2));

  if (mismatches.length) process.exitCode = 2;
} finally {
  if (restore) await restore.end();
  await source.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(restoreDatabase)}`);
  await source.end();
}
