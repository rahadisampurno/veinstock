import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 8,
    timezone: 'Z',
  });

  const [states] = await pool.execute('SELECT id, payload FROM app_state');

  for (const state of states) {
    const orgId = state.id;
    const data = state.payload;
    if (!data) continue;

    console.log(`Fixing Opname for Org: ${orgId}`);
    
    // Clear existing stock_counts for this org to re-migrate properly
    await pool.execute('DELETE FROM stock_counts WHERE organization_id = ?', [orgId]);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const sc of data.stockCounts || []) {
        await conn.execute(
          `INSERT IGNORE INTO stock_counts (id, organization_id, location_id, variant_id, expected, actual, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sc.id ?? 'unknown', orgId, sc.locationId ?? 'unknown', sc.variantId ?? 'unknown', sc.systemQty ?? 0, sc.actualQty ?? 0, sc.reason ?? null, sc.createdBy ?? null, sc.createdAt ?? new Date().toISOString()]
        );
      }

      await conn.commit();
      console.log(`Fixed Org: ${orgId} Successfully`);
    } catch (err) {
      await conn.rollback();
      console.error(`Failed to fix org ${orgId}:`, err);
    } finally {
      conn.release();
    }
  }

  process.exit(0);
}

run();
