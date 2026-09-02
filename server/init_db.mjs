import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function getColumn(pool, table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` LIKE ?`,
    [column],
  );
  return rows[0] || null;
}

async function ensureColumnDefinition(
  pool,
  table,
  column,
  expectedType,
  nullable,
  alterStatement,
) {
  const current = await getColumn(pool, table, column);
  if (!current) throw new Error(`Kolom database ${table}.${column} tidak ditemukan`);
  const typeMatches =
    String(current.Type || '').toLowerCase() === expectedType.toLowerCase();
  const nullabilityMatches = current.Null === (nullable ? 'YES' : 'NO');
  if (!typeMatches || !nullabilityMatches) await pool.execute(alterStatement);
}

async function init() {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'veinstock',
    waitForConnections: true,
    connectionLimit: 4
  });
  
  const ddls = [
    `CREATE TABLE IF NOT EXISTS app_state (
      id VARCHAR(40) PRIMARY KEY,
      version BIGINT NOT NULL DEFAULT 1,
      payload JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS organizations (
      id VARCHAR(40) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('owner','pic','finance','admin','warehouse','cashier','employee') NOT NULL,
      outlet_id VARCHAR(40) NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_users_org_created (organization_id, created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS locations (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(150) NOT NULL,
      type ENUM('warehouse', 'outlet') NOT NULL,
      address TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      INDEX idx_org (organization_id),
      UNIQUE KEY uq_org_loc_name (organization_id, name, type)
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(100),
      unit VARCHAR(20) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      image_url TEXT,
      INDEX idx_org (organization_id)
    )`,
    `CREATE TABLE IF NOT EXISTS variants (
      id VARCHAR(40) PRIMARY KEY,
      product_id VARCHAR(40) NOT NULL,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(150) NOT NULL,
      sku VARCHAR(100) NOT NULL,
      barcode VARCHAR(20) NULL,
      package_weight VARCHAR(100) NULL,
      flavor VARCHAR(100) NULL,
      spice_level VARCHAR(50) NULL,
      cost INT NOT NULL DEFAULT 0,
      online_cost INT NOT NULL DEFAULT 0,
      price INT NOT NULL DEFAULT 0,
      online_price INT NOT NULL DEFAULT 0,
      reseller_price INT NOT NULL DEFAULT 0,
      min_stock INT NOT NULL DEFAULT 0,
      grams_per_cup INT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      INDEX idx_org (organization_id),
      INDEX idx_product (product_id)
    )`,
    `CREATE TABLE IF NOT EXISTS variant_location_min_stock (
      variant_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      min_stock INT NOT NULL DEFAULT 0,
      PRIMARY KEY (variant_id, location_id)
    )`,
    `CREATE TABLE IF NOT EXISTS balances (
      organization_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      variant_id VARCHAR(40) NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      PRIMARY KEY (location_id, variant_id),
      INDEX idx_org (organization_id)
    )`,
    `CREATE TABLE IF NOT EXISTS stock_movements (
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
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      gross_total BIGINT NOT NULL DEFAULT 0,
      discount_amount BIGINT NOT NULL DEFAULT 0,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'nominal',
      discount_value DECIMAL(18,2) NOT NULL DEFAULT 0,
      total BIGINT NOT NULL,
      platform_fee BIGINT NOT NULL DEFAULT 0,
      net_payout BIGINT NULL,
      source_platform VARCHAR(40) NULL,
      source_import_id VARCHAR(80) NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'offline',
      method VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL,
      note TEXT,
      cashier_id VARCHAR(40) NOT NULL,
      created_at VARCHAR(100) NOT NULL,
      INDEX idx_org_loc (organization_id, location_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sale_items (
      sale_id VARCHAR(40) NOT NULL,
      variant_id VARCHAR(40) NOT NULL,
      quantity INT NOT NULL,
      unit_cost BIGINT NULL,
      price BIGINT NOT NULL,
      discount BIGINT NOT NULL DEFAULT 0,
      subtotal BIGINT NOT NULL,
      INDEX idx_sale (sale_id)
    )`,
    `CREATE TABLE IF NOT EXISTS marketplace_sku_mappings (
      organization_id VARCHAR(40) NOT NULL,
      platform VARCHAR(40) NOT NULL,
      external_sku VARCHAR(190) NOT NULL,
      variant_id VARCHAR(40) NOT NULL,
      created_at VARCHAR(100) NOT NULL,
      updated_at VARCHAR(100) NOT NULL,
      PRIMARY KEY (organization_id, platform, external_sku),
      INDEX idx_marketplace_mapping_variant (organization_id, variant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS marketplace_imports (
      id VARCHAR(80) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      platform VARCHAR(40) NOT NULL,
      fingerprint VARCHAR(128) NOT NULL,
      income_fingerprint VARCHAR(128) NULL,
      source_file_name VARCHAR(180) NOT NULL,
      income_file_name VARCHAR(180) NULL,
      location_id VARCHAR(40) NOT NULL,
      sale_id VARCHAR(40) NOT NULL,
      row_count INT NOT NULL DEFAULT 0,
      ignored_row_count INT NOT NULL DEFAULT 0,
      duplicate_order_count INT NOT NULL DEFAULT 0,
      total_quantity BIGINT NOT NULL DEFAULT 0,
      gross_total BIGINT NOT NULL DEFAULT 0,
      discount_amount BIGINT NOT NULL DEFAULT 0,
      platform_fee BIGINT NOT NULL DEFAULT 0,
      net_payout BIGINT NOT NULL DEFAULT 0,
      created_at VARCHAR(100) NOT NULL,
      created_by VARCHAR(40) NULL,
      UNIQUE KEY uq_marketplace_import_file (organization_id, platform, fingerprint),
      INDEX idx_marketplace_import_org_date (organization_id, created_at),
      INDEX idx_marketplace_import_sale (sale_id)
    )`,
    `CREATE TABLE IF NOT EXISTS marketplace_order_hashes (
      organization_hash BINARY(16) NOT NULL,
      order_hash BINARY(16) NOT NULL,
      PRIMARY KEY (organization_hash, order_hash)
    )`,
    `CREATE TABLE IF NOT EXISTS transfers (
      id VARCHAR(40) PRIMARY KEY,
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
    )`,
    `CREATE TABLE IF NOT EXISTS stock_counts (
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
    )`,
    `CREATE TABLE IF NOT EXISTS user_location_assignments (
      id VARCHAR(40) PRIMARY KEY,
      user_id VARCHAR(40) NOT NULL,
      location_id VARCHAR(40) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      INDEX idx_user (user_id)
    )`
  ];
  
  for (const q of ddls) {
    await pool.execute(q);
  }
  try { await pool.execute("ALTER TABLE sales ADD COLUMN channel VARCHAR(20) NOT NULL DEFAULT 'offline' AFTER total"); } catch (error) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  const onlineCostColumn = await getColumn(pool, 'variants', 'online_cost');
  if (!onlineCostColumn) {
    await pool.execute("ALTER TABLE variants ADD COLUMN online_cost INT NULL AFTER cost");
  }
  if (!onlineCostColumn || onlineCostColumn.Null === 'YES') {
    await pool.execute("UPDATE variants SET online_cost = cost WHERE online_cost IS NULL");
    await pool.execute("ALTER TABLE variants MODIFY online_cost INT NOT NULL DEFAULT 0");
  }
  const onlinePriceColumn = await getColumn(pool, 'variants', 'online_price');
  if (!onlinePriceColumn) {
    await pool.execute("ALTER TABLE variants ADD COLUMN online_price INT NULL AFTER price");
  }
  if (!onlinePriceColumn || onlinePriceColumn.Null === 'YES') {
    await pool.execute("UPDATE variants SET online_price = price WHERE online_price IS NULL");
    await pool.execute("ALTER TABLE variants MODIFY online_price INT NOT NULL DEFAULT 0");
  }
  const grossTotalColumn = await getColumn(pool, 'sales', 'gross_total');
  if (!grossTotalColumn) {
    await pool.execute("ALTER TABLE sales ADD COLUMN gross_total BIGINT NULL AFTER location_id");
  }
  if (!grossTotalColumn || grossTotalColumn.Null === 'YES') {
    await pool.execute("UPDATE sales SET gross_total = total WHERE gross_total IS NULL");
    await pool.execute("ALTER TABLE sales MODIFY gross_total BIGINT NOT NULL DEFAULT 0");
  }
  try { await pool.execute("ALTER TABLE sales ADD COLUMN discount_amount BIGINT NOT NULL DEFAULT 0 AFTER gross_total"); } catch (error) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try { await pool.execute("ALTER TABLE sales ADD COLUMN discount_type VARCHAR(20) NOT NULL DEFAULT 'nominal' AFTER discount_amount"); } catch (error) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  try {
    await pool.execute("ALTER TABLE sales ADD COLUMN discount_value DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER discount_type");
    await pool.execute("UPDATE sales SET discount_value = discount_amount");
  } catch (error) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  for (const statement of [
    "ALTER TABLE sales ADD COLUMN platform_fee BIGINT NOT NULL DEFAULT 0 AFTER total",
    "ALTER TABLE sales ADD COLUMN net_payout BIGINT NULL AFTER platform_fee",
    "ALTER TABLE sales ADD COLUMN source_platform VARCHAR(40) NULL AFTER net_payout",
    "ALTER TABLE sales ADD COLUMN source_import_id VARCHAR(80) NULL AFTER source_platform",
  ]) {
    try { await pool.execute(statement); }
    catch (error) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  for (const migration of [
    ['sales', 'gross_total', 'bigint', false, "ALTER TABLE sales MODIFY gross_total BIGINT NOT NULL DEFAULT 0"],
    ['sales', 'discount_amount', 'bigint', false, "ALTER TABLE sales MODIFY discount_amount BIGINT NOT NULL DEFAULT 0"],
    ['sales', 'total', 'bigint', false, "ALTER TABLE sales MODIFY total BIGINT NOT NULL"],
    ['sales', 'platform_fee', 'bigint', false, "ALTER TABLE sales MODIFY platform_fee BIGINT NOT NULL DEFAULT 0"],
    ['sales', 'net_payout', 'bigint', true, "ALTER TABLE sales MODIFY net_payout BIGINT NULL"],
    ['sales', 'discount_value', 'decimal(18,2)', false, "ALTER TABLE sales MODIFY discount_value DECIMAL(18,2) NOT NULL DEFAULT 0"],
    ['sale_items', 'unit_cost', 'bigint', true, "ALTER TABLE sale_items MODIFY unit_cost BIGINT NULL"],
    ['sale_items', 'price', 'bigint', false, "ALTER TABLE sale_items MODIFY price BIGINT NOT NULL"],
    ['sale_items', 'discount', 'bigint', false, "ALTER TABLE sale_items MODIFY discount BIGINT NOT NULL DEFAULT 0"],
    ['sale_items', 'subtotal', 'bigint', false, "ALTER TABLE sale_items MODIFY subtotal BIGINT NOT NULL"],
  ]) await ensureColumnDefinition(pool, ...migration);
  console.log("All tables created successfully");
  await pool.end();
}
init().catch(console.error);
