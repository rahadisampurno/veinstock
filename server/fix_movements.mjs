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

    console.log(`Fixing Movements for Org: ${orgId}`);
    
    // Clear existing stock_movements for this org to re-migrate properly
    await pool.execute('DELETE FROM stock_movements WHERE organization_id = ?', [orgId]);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const m of data.movements || []) {
        await conn.execute(
          `INSERT IGNORE INTO stock_movements (id, organization_id, location_id, variant_id, quantity, type, reason, reference_id, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [m.id ?? 'unknown', orgId, m.locationId ?? 'unknown', m.variantId ?? 'unknown', m.quantity ?? 0, m.type ?? 'other', m.note ?? null, m.referenceId ?? null, m.createdAt ?? new Date().toISOString(), m.user ?? null]
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
