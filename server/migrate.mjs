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

  console.log("Starting Migration...");
  
  const [states] = await pool.execute('SELECT id, payload FROM app_state');
  console.log(`Found ${states.length} organizations in app_state.`);

  for (const state of states) {
    const orgId = state.id;
    const data = state.payload;
    if (!data) continue;

    console.log(`Migrating Org: ${orgId}`);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Locations
      for (const loc of data.locations || []) {
        await conn.execute(
          `INSERT IGNORE INTO locations (id, organization_id, name, type, address, active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), address=VALUES(address), active=VALUES(active)`,
          [loc.id ?? 'unknown', orgId, loc.name ?? 'Unknown', loc.type ?? 'warehouse', loc.address ?? '', loc.active !== false]
        );
      }

      // 2. Products and Variants
      for (const prod of data.products || []) {
        await conn.execute(
          `INSERT IGNORE INTO products (id, organization_id, name, category, unit, active, image_url) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), unit=VALUES(unit), active=VALUES(active), image_url=VALUES(image_url)`,
          [prod.id ?? 'unknown', orgId, prod.name ?? 'Unknown', prod.category ?? '', prod.unit ?? 'Pcs', prod.active !== false, prod.image ?? null]
        );
        for (const v of prod.variants || []) {
          await conn.execute(
            `INSERT IGNORE INTO variants (id, product_id, organization_id, name, sku, cost, price, reseller_price, min_stock, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), sku=VALUES(sku), cost=VALUES(cost), price=VALUES(price), reseller_price=VALUES(reseller_price), min_stock=VALUES(min_stock), active=VALUES(active)`,
            [v.id ?? 'unknown', prod.id ?? 'unknown', orgId, v.name ?? 'Unknown', v.sku ?? '', v.cost ?? 0, v.price ?? 0, v.resellerPrice ?? 0, v.minStock ?? 0, v.active !== false]
          );
        }
      }

      // 3. Balances
      for (const b of data.balances || []) {
        await conn.execute(
          `INSERT IGNORE INTO balances (organization_id, location_id, variant_id, quantity) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`,
          [orgId, b.locationId ?? 'unknown', b.variantId ?? 'unknown', b.quantity ?? 0]
        );
      }

      // 4. Sales
      for (const sale of data.sales || []) {
         await conn.execute(
           `INSERT IGNORE INTO sales (id, organization_id, location_id, total, method, status, note, cashier_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
           [sale.id ?? 'unknown', orgId, sale.locationId ?? 'unknown', sale.total ?? 0, sale.method ?? 'Tunai', sale.status ?? 'completed', sale.note ?? null, sale.cashierId || 'system-migration', sale.createdAt ?? new Date().toISOString()]
         );
         for (const item of sale.items || []) {
           await conn.execute(
             `INSERT IGNORE INTO sale_items (sale_id, variant_id, quantity, price, discount, subtotal) VALUES (?, ?, ?, ?, ?, ?)`,
             [sale.id ?? 'unknown', item.variantId ?? 'unknown', item.quantity ?? 0, item.price ?? 0, item.discount ?? 0, item.subtotal ?? 0]
           );
         }
      }

      // 5. Transfers
      for (const t of data.transfers || []) {
        await conn.execute(
          `INSERT IGNORE INTO transfers (id, organization_id, from_id, to_id, variant_id, quantity, status, created_at, received_at, cancelled_at, cancel_reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.id ?? 'unknown', orgId, t.fromId ?? 'unknown', t.toId ?? 'unknown', t.variantId ?? 'unknown', t.quantity ?? 0, t.status ?? 'pending', t.createdAt ?? new Date().toISOString(), t.receivedAt ?? null, t.cancelledAt ?? null, t.cancelReason ?? null, t.createdBy ?? null]
        );
      }

      // 6. Movements (Audit)
      for (const m of data.movements || []) {
        await conn.execute(
          `INSERT IGNORE INTO stock_movements (id, organization_id, location_id, variant_id, quantity, type, reason, reference_id, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [m.id ?? 'unknown', orgId, m.locationId ?? 'unknown', m.variantId ?? 'unknown', m.quantity ?? 0, m.type ?? 'unknown', m.reason ?? null, m.referenceId ?? null, m.date ?? new Date().toISOString(), m.createdBy ?? null]
        );
      }
      
      // 7. Stock Counts (Opname)
      for (const sc of data.stockCounts || []) {
        await conn.execute(
          `INSERT IGNORE INTO stock_counts (id, organization_id, location_id, variant_id, expected, actual, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sc.id ?? 'unknown', orgId, sc.locationId ?? 'unknown', sc.variantId ?? 'unknown', sc.expectedQty ?? 0, sc.actualQty ?? 0, sc.reason ?? null, sc.createdBy ?? null, sc.date ?? new Date().toISOString()]
        );
      }

      await conn.commit();
      console.log(`Migrated Org: ${orgId} Successfully`);
    } catch (err) {
      await conn.rollback();
      console.error(`Failed to migrate org ${orgId}:`, err);
    } finally {
      conn.release();
    }
  }

  console.log("Migration finished.");
  process.exit(0);
}

run();
