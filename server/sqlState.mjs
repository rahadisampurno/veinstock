export async function syncStateToSQL(conn, orgId, data) {
  // 1. Locations
  for (const loc of data.locations || []) {
    await conn.execute(
      `INSERT INTO locations (id, organization_id, name, type, address, active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), address=VALUES(address), active=VALUES(active)`,
      [loc.id ?? 'unknown', orgId, loc.name ?? 'Unknown', loc.type ?? 'warehouse', loc.address ?? '', loc.active !== false]
    );
  }

  // 2. Products and Variants
  for (const prod of data.products || []) {
    await conn.execute(
      `INSERT INTO products (id, organization_id, name, category, unit, active, image_url) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), unit=VALUES(unit), active=VALUES(active), image_url=VALUES(image_url)`,
      [prod.id ?? 'unknown', orgId, prod.name ?? 'Unknown', prod.category ?? '', prod.unit ?? 'Pcs', prod.active !== false, prod.image ?? null]
    );
    for (const v of prod.variants || []) {
      await conn.execute(
        `INSERT INTO variants (id, product_id, organization_id, name, sku, cost, price, reseller_price, min_stock, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), sku=VALUES(sku), cost=VALUES(cost), price=VALUES(price), reseller_price=VALUES(reseller_price), min_stock=VALUES(min_stock), active=VALUES(active)`,
        [v.id ?? 'unknown', prod.id ?? 'unknown', orgId, v.name ?? 'Unknown', v.sku ?? '', v.cost ?? 0, v.price ?? 0, v.resellerPrice ?? 0, v.minStock ?? 0, v.active !== false]
      );
    }
  }

  // 3. Balances
  for (const b of data.balances || []) {
    await conn.execute(
      `INSERT INTO balances (organization_id, location_id, variant_id, quantity) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`,
      [orgId, b.locationId ?? 'unknown', b.variantId ?? 'unknown', b.quantity ?? 0]
    );
  }

  // 4. Sales
  for (const sale of data.sales || []) {
     await conn.execute(
       `INSERT INTO sales (id, organization_id, location_id, total, method, status, note, cashier_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status)`,
       [sale.id ?? 'unknown', orgId, sale.locationId ?? 'unknown', sale.total ?? 0, sale.method ?? 'Tunai', sale.status ?? 'completed', sale.note ?? null, sale.cashierId ?? null, sale.createdAt ?? new Date().toISOString()]
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
      `INSERT INTO transfers (id, organization_id, from_id, to_id, variant_id, quantity, status, created_at, received_at, cancelled_at, cancel_reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=VALUES(status), received_at=VALUES(received_at), cancelled_at=VALUES(cancelled_at), cancel_reason=VALUES(cancel_reason)`,
      [t.id ?? 'unknown', orgId, t.fromId ?? 'unknown', t.toId ?? 'unknown', t.variantId ?? 'unknown', t.quantity ?? 0, t.status ?? 'pending', t.createdAt ?? new Date().toISOString(), t.receivedAt ?? null, t.cancelledAt ?? null, t.cancelReason ?? null, t.createdBy ?? null]
    );
  }

  // 6. Movements
  for (const m of data.movements || []) {
    await conn.execute(
      `INSERT IGNORE INTO stock_movements (id, organization_id, location_id, variant_id, quantity, type, reason, reference_id, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.id ?? 'unknown', orgId, m.locationId ?? 'unknown', m.variantId ?? 'unknown', m.quantity ?? 0, m.type ?? 'other', m.note ?? null, m.referenceId ?? null, m.createdAt ?? new Date().toISOString(), m.user ?? null]
    );
  }
  
  // 7. Stock Counts (Opname)
  for (const sc of data.stockCounts || []) {
    await conn.execute(
      `INSERT IGNORE INTO stock_counts (id, organization_id, location_id, variant_id, expected, actual, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sc.id ?? 'unknown', orgId, sc.locationId ?? 'unknown', sc.variantId ?? 'unknown', sc.systemQty ?? 0, sc.actualQty ?? 0, sc.reason ?? null, sc.createdBy ?? null, sc.createdAt ?? new Date().toISOString()]
    );
  }
}

export async function getStateFromSQL(conn, orgId) {
  const [locations] = await conn.execute('SELECT id, name, type, address, active FROM locations WHERE organization_id = ?', [orgId]);
  const [products] = await conn.execute('SELECT id, name, category, unit, active, image_url as image FROM products WHERE organization_id = ?', [orgId]);
  const [variants] = await conn.execute('SELECT id, product_id, name, sku, cost, price, reseller_price as resellerPrice, min_stock as minStock, active FROM variants WHERE organization_id = ?', [orgId]);
  
  for (const p of products) {
    p.active = p.active === 1;
    p.variants = variants.filter(v => v.product_id === p.id).map(v => {
      const copy = { ...v, active: v.active === 1 };
      delete copy.product_id;
      return copy;
    });
  }

  const [balances] = await conn.execute('SELECT location_id as locationId, variant_id as variantId, quantity FROM balances WHERE organization_id = ?', [orgId]);
  
  const [sales] = await conn.execute('SELECT id, location_id as locationId, total, method, status, note, cashier_id as cashierId, created_at as createdAt FROM sales WHERE organization_id = ?', [orgId]);
  const saleIds = sales.map(s => s.id);
  let saleItems = [];
  if (saleIds.length > 0) {
    const [items] = await conn.query('SELECT sale_id, variant_id as variantId, quantity, price, discount, subtotal FROM sale_items WHERE sale_id IN (?)', [saleIds]);
    saleItems = items;
  }
  for (const s of sales) {
    s.items = saleItems.filter(i => i.sale_id === s.id).map(i => {
      const copy = { ...i };
      delete copy.sale_id;
      return copy;
    });
  }

  const [transfers] = await conn.execute('SELECT id, from_id as fromId, to_id as toId, variant_id as variantId, quantity, status, created_at as createdAt, received_at as receivedAt, cancelled_at as cancelledAt, cancel_reason as cancelReason, created_by as createdBy FROM transfers WHERE organization_id = ?', [orgId]);

  const [movements] = await conn.execute('SELECT id, location_id as locationId, variant_id as variantId, quantity, type, reason as note, reference_id as referenceId, date as createdAt, created_by as user FROM stock_movements WHERE organization_id = ?', [orgId]);

  const [stockCountsRows] = await conn.execute('SELECT id, location_id as locationId, variant_id as variantId, expected, actual as actualQty, reason, created_by as createdBy, created_at FROM stock_counts WHERE organization_id = ?', [orgId]);
  const stockCounts = stockCountsRows.map(sc => ({
    ...sc,
    systemQty: sc.expected,
    difference: sc.actualQty - sc.expected,
    createdAt: sc.created_at
  }));

  const [orgs] = await conn.execute('SELECT name FROM organizations WHERE id = ?', [orgId]);
  const business = orgs[0] ? { name: orgs[0].name } : { name: "VEINSTOCK" };

  const [states] = await conn.execute('SELECT version, payload FROM app_state WHERE id = ?', [orgId]);
  const rawState = states[0]?.payload || {};
  const version = Number(states[0]?.version || 0);

  return {
    version,
    data: {
      business,
      locations: locations.map(l => ({ ...l, active: l.active === 1 })),
      products,
      balances,
      sales,
      transfers,
      movements,
      stockCounts,
      receipts: rawState.receipts || [],
      returns: rawState.returns || [],
      suppliers: rawState.suppliers || [],
    }
  };
}
