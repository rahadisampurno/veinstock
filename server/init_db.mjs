import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

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
      role ENUM('owner','pic','finance','admin','warehouse','cashier') NOT NULL,
      outlet_id VARCHAR(40) NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS locations (
      id VARCHAR(40) PRIMARY KEY,
      organization_id VARCHAR(40) NOT NULL,
      name VARCHAR(150) NOT NULL,
      type ENUM('warehouse', 'outlet') NOT NULL,
      address TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      INDEX idx_org (organization_id)
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
      cost INT NOT NULL DEFAULT 0,
      price INT NOT NULL DEFAULT 0,
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
      total INT NOT NULL,
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
      price INT NOT NULL,
      discount INT NOT NULL DEFAULT 0,
      subtotal INT NOT NULL,
      INDEX idx_sale (sale_id)
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
  console.log("All tables created successfully");
  await pool.end();
}
init().catch(console.error);
