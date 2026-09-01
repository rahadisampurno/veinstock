import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  if (!process.env.DB_HOST) {
    console.log("No DB_HOST configured.");
    return;
  }
  
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 4,
    timezone: 'Z',
  });

  console.log("Starting migration to V2 relational tables...");

  try {
    const [orgs] = await pool.execute('SELECT id FROM organizations');
    for (const org of orgs) {
      const orgId = org.id;
      console.log(`Migrating organization: ${orgId}`);
      
      const [stateRows] = await pool.execute('SELECT payload FROM app_state WHERE id = ?', [orgId]);
      if (!stateRows.length || !stateRows[0].payload) {
        console.log(`No state found for ${orgId}. Skipping.`);
        continue;
      }
      
      const data = stateRows[0].payload;
      if (typeof data !== 'object') continue;
      
      // 1. Locations
      if (Array.isArray(data.locations)) {
        for (const loc of data.locations) {
          await pool.execute(
            'INSERT IGNORE INTO locations (id, organization_id, name, type, address, active) VALUES (?, ?, ?, ?, ?, ?)',
            [loc.id, orgId, loc.name, loc.type || 'outlet', loc.address || '', loc.active !== false]
          );
        }
      }
      
      // 2. Products & Variants
      if (Array.isArray(data.products)) {
        for (const prod of data.products) {
          await pool.execute(
            'INSERT IGNORE INTO products (id, organization_id, name, category, unit, active, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [prod.id, orgId, prod.name, prod.category || '', prod.unit || 'pcs', prod.active !== false, prod.imageUrl || null]
          );
          
          if (Array.isArray(prod.variants)) {
            for (const varnt of prod.variants) {
              await pool.execute(
                'INSERT IGNORE INTO variants (id, product_id, organization_id, name, sku, cost, online_cost, price, online_price, reseller_price, min_stock, grams_per_cup, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [varnt.id, prod.id, orgId, varnt.name, varnt.sku || '', Number(varnt.cost)||0, Number(varnt.onlineCost ?? varnt.cost)||0, Number(varnt.price)||0, Number(varnt.onlinePrice ?? varnt.price)||0, Number(varnt.resellerPrice)||0, Number(varnt.minStock)||0, varnt.gramsPerCup?Number(varnt.gramsPerCup):null, varnt.active !== false]
              );
              
              if (varnt.minStockByLocation) {
                for (const [locId, minStk] of Object.entries(varnt.minStockByLocation)) {
                  await pool.execute(
                    'INSERT IGNORE INTO variant_location_min_stock (variant_id, location_id, min_stock) VALUES (?, ?, ?)',
                    [varnt.id, locId, Number(minStk)]
                  );
                }
              }
            }
          }
        }
      }
      
      // 3. Balances
      if (Array.isArray(data.balances)) {
        for (const bal of data.balances) {
          await pool.execute(
            'INSERT IGNORE INTO balances (organization_id, location_id, variant_id, quantity) VALUES (?, ?, ?, ?)',
            [orgId, bal.locationId, bal.variantId, Number(bal.quantity)||0]
          );
        }
      }
      
      // 4. Sales
      if (Array.isArray(data.sales)) {
        for (const sale of data.sales) {
          const lineGrossTotal = (sale.items || []).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
          await pool.execute(
            'INSERT IGNORE INTO sales (id, organization_id, location_id, gross_total, discount_amount, discount_type, discount_value, total, channel, method, status, note, cashier_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [sale.id, orgId, sale.locationId, Number(sale.grossTotal ?? (lineGrossTotal || Number(sale.total || 0) + Number(sale.discountAmount || 0)))||0, Number(sale.discountAmount)||0, sale.discountType === 'percentage' ? 'percentage' : 'nominal', Number(sale.discountValue ?? sale.discountAmount)||0, Number(sale.total)||0, sale.channel || 'offline', sale.payment || sale.method || 'cash', sale.status || 'completed', sale.note || '', sale.cashierId || 'unknown', sale.createdAt || new Date().toISOString()]
          );
          
          if (Array.isArray(sale.items)) {
            for (const item of sale.items) {
              const quantity = Number(item.quantity)||0;
              const subtotal = Number(item.subtotal)||0;
              const price = item.price != null && Number.isFinite(Number(item.price)) && !(Number(item.price) <= 0 && quantity > 0 && subtotal > 0) ? Number(item.price) : quantity > 0 ? Math.round(subtotal / quantity) : 0;
              await pool.execute(
                'INSERT IGNORE INTO sale_items (sale_id, variant_id, quantity, unit_cost, price, discount, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [sale.id, item.variantId, quantity, Number.isFinite(Number(item.unitCost)) ? Number(item.unitCost) : null, price, Number(item.discount)||0, subtotal]
              );
            }
          }
        }
      }
      
      // 5. Movements
      if (Array.isArray(data.movements)) {
        for (const mov of data.movements) {
          await pool.execute(
            'INSERT IGNORE INTO stock_movements (id, organization_id, location_id, variant_id, quantity, type, reason, reference_id, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [mov.id, orgId, mov.locationId, mov.variantId, Number(mov.quantity)||0, mov.type || 'ADJUSTMENT', mov.reason || '', mov.referenceId || null, mov.date || new Date().toISOString(), mov.createdBy || 'unknown']
          );
        }
      }
      
      // 6. Transfers
      if (Array.isArray(data.transfers)) {
        for (const tr of data.transfers) {
          await pool.execute(
            'INSERT IGNORE INTO transfers (id, organization_id, from_id, to_id, variant_id, quantity, status, created_at, received_at, cancelled_at, cancel_reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [tr.id, orgId, tr.fromId, tr.toId, tr.variantId, Number(tr.quantity)||0, tr.status || 'sent', tr.createdAt || new Date().toISOString(), tr.receivedAt || null, tr.cancelledAt || null, tr.cancelReason || null, tr.createdBy || null]
          );
        }
      }
      
      // 7. Stock Counts (Opname)
      if (Array.isArray(data.stockCounts)) {
        for (const sc of data.stockCounts) {
          await pool.execute(
            'INSERT IGNORE INTO stock_counts (id, organization_id, location_id, variant_id, expected, actual, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [sc.id, orgId, sc.locationId, sc.variantId, Number(sc.expected)||0, Number(sc.actual)||0, sc.reason || '', sc.createdBy || null, sc.createdAt || new Date().toISOString()]
          );
        }
      }
      
      console.log(`Completed migration for ${orgId}`);
    }
    console.log("All organizations migrated successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    pool.end();
  }
}

migrate();
