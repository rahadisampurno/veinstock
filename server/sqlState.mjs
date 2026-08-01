export async function syncStateToSQL(conn, orgId, data) {
  // 1. Locations
  for (const loc of data.locations || []) {
    await conn.execute(
      `INSERT INTO locations (id, organization_id, name, type, address, active, is_central_warehouse) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), address=VALUES(address), active=VALUES(active), is_central_warehouse=VALUES(is_central_warehouse)`,
      [loc.id ?? 'unknown', orgId, loc.name ?? 'Unknown', loc.type ?? 'warehouse', loc.address ?? '', loc.active !== false, loc.isCentralWarehouse === true]
    );
  }

  // 2. Products and Variants
  for (const prod of data.products || []) {
    await conn.execute(
      `INSERT INTO products (id, organization_id, name, category, unit, active, image_url) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), unit=VALUES(unit), active=VALUES(active), image_url=VALUES(image_url)`,
      // Frontend memakai `imageUrl`. Tetap baca `image` untuk data lama yang
      // pernah tersimpan sebelum nama properti distandarkan.
      [prod.id ?? 'unknown', orgId, prod.name ?? 'Unknown', prod.category ?? '', prod.unit ?? 'Pcs', prod.active !== false, prod.imageUrl ?? prod.image ?? null]
    );
    for (const v of prod.variants || []) {
      await conn.execute(
        `INSERT INTO variants (id, product_id, organization_id, name, sku, barcode, cost, price, reseller_price, min_stock, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), sku=VALUES(sku), barcode=VALUES(barcode), cost=VALUES(cost), price=VALUES(price), reseller_price=VALUES(reseller_price), min_stock=VALUES(min_stock), active=VALUES(active)`,
        [v.id ?? 'unknown', prod.id ?? 'unknown', orgId, v.name ?? 'Unknown', v.sku ?? '', v.barcode ?? null, v.cost ?? 0, v.price ?? 0, v.resellerPrice ?? 0, v.minStock ?? 0, v.active !== false]
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
       `INSERT INTO sales (id, organization_id, location_id, total, channel, method, status, note, cashier_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE total=VALUES(total), channel=VALUES(channel), method=VALUES(method), status=VALUES(status), note=VALUES(note), cashier_id=VALUES(cashier_id)`,
       [sale.id ?? 'unknown', orgId, sale.locationId ?? 'unknown', sale.total ?? 0, sale.channel ?? 'offline', sale.payment ?? sale.method ?? 'Tunai', sale.status ?? 'completed', sale.note ?? null, sale.cashierId ?? null, sale.createdAt ?? new Date().toISOString()]
     );
     // `sale_items` tidak memiliki primary key sendiri pada instalasi lama.
     // Menambahkan ulang seluruh state dengan INSERT IGNORE menyebabkan setiap
     // refresh menambah baris duplikat. Jadikan detail setiap transaksi sebagai
     // snapshot idempoten: hapus detail lama lalu tulis satu kali per item unik.
     await conn.execute('DELETE FROM sale_items WHERE sale_id = ?', [sale.id ?? 'unknown']);
     const uniqueItems = Array.from(new Map((sale.items || []).map(item => {
       const key = [item.variantId, item.quantity, item.price ?? 0, item.discount ?? 0, item.subtotal ?? 0].join('|');
       return [key, item];
     })).values());
     for (const item of uniqueItems) {
       await conn.execute(
         `INSERT INTO sale_items (sale_id, variant_id, quantity, price, discount, subtotal) VALUES (?, ?, ?, ?, ?, ?)`,
         [sale.id ?? 'unknown', item.variantId ?? 'unknown', item.quantity ?? 0, item.price ?? 0, item.discount ?? 0, item.subtotal ?? 0]
       );
     }
  }

  // 5. Transfers
  for (const t of data.transfers || []) {
    await conn.execute(
      `INSERT INTO transfers (id, transfer_code, organization_id, from_id, to_id, variant_id, quantity, status, created_at, received_at, cancelled_at, cancel_reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE transfer_code=VALUES(transfer_code), status=VALUES(status), received_at=VALUES(received_at), cancelled_at=VALUES(cancelled_at), cancel_reason=VALUES(cancel_reason)`,
      [t.id ?? 'unknown', t.transferCode ?? null, orgId, t.fromId ?? 'unknown', t.toId ?? 'unknown', t.variantId ?? 'unknown', t.quantity ?? 0, t.status ?? 'pending', t.createdAt ?? new Date().toISOString(), t.receivedAt ?? null, t.cancelledAt ?? null, t.cancelReason ?? null, t.createdBy ?? null]
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
  const [locations] = await conn.execute('SELECT id, name, type, address, active, is_central_warehouse as isCentralWarehouse FROM locations WHERE organization_id = ?', [orgId]);
  const [products] = await conn.execute('SELECT id, name, category, unit, active, image_url as imageUrl FROM products WHERE organization_id = ?', [orgId]);
  const [variants] = await conn.execute('SELECT id, product_id, name, sku, barcode, cost, price, reseller_price as resellerPrice, min_stock as minStock, active FROM variants WHERE organization_id = ?', [orgId]);
  
  for (const p of products) {
    p.active = p.active === 1;
    p.variants = variants.filter(v => v.product_id === p.id).map(v => {
      const copy = { ...v, active: v.active === 1 };
      delete copy.product_id;
      return copy;
    });
  }

  const [balances] = await conn.execute('SELECT location_id as locationId, variant_id as variantId, quantity FROM balances WHERE organization_id = ?', [orgId]);
  
  const [sales] = await conn.execute('SELECT id, location_id as locationId, total, channel, method, status, note, cashier_id as cashierId, created_at as createdAt FROM sales WHERE organization_id = ?', [orgId]);
  const saleIds = sales.map(s => s.id);
  let saleItems = [];
  if (saleIds.length > 0) {
    const [items] = await conn.query('SELECT sale_id, variant_id as variantId, quantity, price, discount, subtotal FROM sale_items WHERE sale_id IN (?)', [saleIds]);
    saleItems = items;
  }
  for (const s of sales) {
    const seenItems = new Set();
    s.items = saleItems.filter(i => i.sale_id === s.id).filter(item => {
      const key = [item.variantId, item.quantity, item.price ?? 0, item.discount ?? 0, item.subtotal ?? 0].join('|');
      if (seenItems.has(key)) return false;
      seenItems.add(key);
      return true;
    }).map(i => {
      const copy = { ...i };
      delete copy.sale_id;
      return copy;
    });
  }

  const [transfers] = await conn.execute('SELECT id, transfer_code as transferCode, from_id as fromId, to_id as toId, variant_id as variantId, quantity, status, created_at as createdAt, received_at as receivedAt, cancelled_at as cancelledAt, cancel_reason as cancelReason, created_by as createdBy FROM transfers WHERE organization_id = ?', [orgId]);

  const [movements] = await conn.execute('SELECT id, location_id as locationId, variant_id as variantId, quantity, type, reason as note, reference_id as referenceId, date as createdAt, created_by as user FROM stock_movements WHERE organization_id = ?', [orgId]);

  const [stockCountsRows] = await conn.execute('SELECT id, location_id as locationId, variant_id as variantId, expected, actual as actualQty, reason, created_by as createdBy, created_at FROM stock_counts WHERE organization_id = ?', [orgId]);
  const stockCounts = stockCountsRows.map(sc => ({
    ...sc,
    systemQty: sc.expected,
    difference: sc.actualQty - sc.expected,
    createdAt: sc.created_at
  }));

  const [orgs] = await conn.execute('SELECT name, owner_name, phone, email, address, logo_url, negative_stock_policy FROM organizations WHERE id = ?', [orgId]);
  const business = orgs[0] ? { 
    name: orgs[0].name,
    ownerName: orgs[0].owner_name || '',
    phone: orgs[0].phone || '',
    email: orgs[0].email || '',
    address: orgs[0].address || '',
    logoUrl: orgs[0].logo_url || '',
    negativeStockPolicy: orgs[0].negative_stock_policy || 'BLOCK'
  } : { name: "MENENGS" };

  const [states] = await conn.execute('SELECT version, payload FROM app_state WHERE id = ?', [orgId]);
  const rawState = states[0]?.payload || {};
  const version = Number(states[0]?.version || 0);

  const mergeLegacy = (sqlArr, rawArr) => {
    const map = new Map();
    (rawArr || []).forEach(item => map.set(item.id, item));
    // Kolom yang belum dimodelkan pada skema relasional (mis. channel) tetap
    // dipertahankan dari snapshot, sementara angka/status SQL menjadi sumber
    // kebenaran saat tersedia.
    (sqlArr || []).forEach(item => map.set(item.id, { ...(map.get(item.id) || {}), ...item }));
    return Array.from(map.values());
  };

  const mergeLegacyBalances = (sqlArr, rawArr) => {
    const map = new Map();
    (rawArr || []).forEach(item => map.set(`${item.locationId}-${item.variantId}`, item));
    (sqlArr || []).forEach(item => map.set(`${item.locationId}-${item.variantId}`, item));
    return Array.from(map.values());
  };

  const sqlLocations = locations.map(l => ({ ...l, active: l.active === 1, isCentralWarehouse: l.isCentralWarehouse === 1 }));

  return {
    version,
    data: {
      business,
      locations: mergeLegacy(sqlLocations, rawState.locations),
      products: mergeLegacy(products, rawState.products),
      balances: mergeLegacyBalances(balances, rawState.balances),
      sales: mergeLegacy(sales, rawState.sales),
      transfers: mergeLegacy(transfers, rawState.transfers),
      movements: mergeLegacy(movements, rawState.movements),
      stockCounts: mergeLegacy(stockCounts, rawState.stockCounts),
      receipts: rawState.receipts || [],
      returns: rawState.returns || [],
      suppliers: rawState.suppliers || [],
      employees: rawState.employees || [],
      attendanceSettings: rawState.attendanceSettings || [],
      attendances: rawState.attendances || [],
      loans: rawState.loans || [],
      payrolls: rawState.payrolls || [],
      pricing: rawState.pricing || { hppRecipes: [], marketplaceConfigs: [] },
    }
  };
}
