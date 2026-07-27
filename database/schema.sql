CREATE DATABASE IF NOT EXISTS veinstock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE veinstock;

CREATE TABLE IF NOT EXISTS app_state (
  id VARCHAR(40) PRIMARY KEY COMMENT 'organization_id',
  version BIGINT NOT NULL DEFAULT 1,
  payload JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(40) PRIMARY KEY,
  organization_id VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner','pic','finance','admin','warehouse','cashier') NOT NULL,
  outlet_id VARCHAR(40) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_email (organization_id, email),
  INDEX idx_users_email (email),
  CONSTRAINT fk_users_organization FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
