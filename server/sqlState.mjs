import crypto from "node:crypto";

// Transaksi yang dibuat sebelum field `cashierId` diterapkan tidak boleh
// membuat seluruh sinkronisasi organisasi gagal. Nilai ini sengaja bukan ID
// owner agar riwayat lama tidak keliru terlihat dibuat oleh seorang pengguna.
const LEGACY_CASHIER_ID = "system-migration";
const marketplaceOrderDigest = (platform, orderId) =>
  crypto
    .createHash("sha256")
    .update(`${String(platform).toLowerCase()}\0${String(orderId)}`)
    .digest()
    .subarray(0, 16);
const marketplaceTenantDigest = (organizationId) =>
  crypto.createHash("sha256").update(String(organizationId)).digest().subarray(0, 16);

const changedRecords = (next = [], previous = [], keyOf = (item) => item.id) => {
  if (!previous) return next;
  const previousByKey = new Map(
    previous.map((item) => [keyOf(item), JSON.stringify(item)]),
  );
  return next.filter(
    (item) => previousByKey.get(keyOf(item)) !== JSON.stringify(item),
  );
};

export async function syncStateToSQL(conn, orgId, data, previousData = null) {
  const locationsToSync = changedRecords(
    data.locations,
    previousData?.locations,
  );
  const productsToSync = changedRecords(data.products, previousData?.products);
  const balancesToSync = changedRecords(
    data.balances,
    previousData?.balances,
    (item) => `${item.locationId}\0${item.variantId}`,
  );
  const salesToSync = changedRecords(data.sales, previousData?.sales);
  const transfersToSync = changedRecords(
    data.transfers,
    previousData?.transfers,
  );
  const movementsToSync = changedRecords(
    data.movements,
    previousData?.movements,
  );
  const stockCountsToSync = changedRecords(
    data.stockCounts,
    previousData?.stockCounts,
  );
  const mappingsToSync = changedRecords(
    data.marketplaceSkuMappings,
    previousData?.marketplaceSkuMappings,
    (item) => `${item.platform}\0${item.externalSku}`,
  );
  const importsToSync = changedRecords(
    data.marketplaceImports,
    previousData?.marketplaceImports,
  );
  // 1. Locations
  for (const loc of locationsToSync) {
    await conn.execute(
      `INSERT INTO locations (id, organization_id, name, type, address, active, is_central_warehouse) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), address=VALUES(address), active=VALUES(active), is_central_warehouse=VALUES(is_central_warehouse)`,
      [
        loc.id ?? "unknown",
        orgId,
        loc.name ?? "Unknown",
        loc.type ?? "warehouse",
        loc.address ?? "",
        loc.active !== false,
        loc.isCentralWarehouse === true,
      ],
    );
  }

  // 2. Products and Variants
  for (const prod of productsToSync) {
    await conn.execute(
      `INSERT INTO products (id, organization_id, name, category, unit, active, image_url) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), unit=VALUES(unit), active=VALUES(active), image_url=VALUES(image_url)`,
      // Frontend memakai `imageUrl`. Tetap baca `image` untuk data lama yang
      // pernah tersimpan sebelum nama properti distandarkan.
      [
        prod.id ?? "unknown",
        orgId,
        prod.name ?? "Unknown",
        prod.category ?? "",
        prod.unit ?? "Pcs",
        prod.active !== false,
        prod.imageUrl ?? prod.image ?? null,
      ],
    );
    for (const v of prod.variants || []) {
      await conn.execute(
        `INSERT INTO variants (id, product_id, organization_id, name, sku, barcode, package_weight, flavor, spice_level, cost, online_cost, price, online_price, reseller_price, min_stock, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), sku=VALUES(sku), barcode=VALUES(barcode), package_weight=VALUES(package_weight), flavor=VALUES(flavor), spice_level=VALUES(spice_level), cost=VALUES(cost), online_cost=VALUES(online_cost), price=VALUES(price), online_price=VALUES(online_price), reseller_price=VALUES(reseller_price), min_stock=VALUES(min_stock), active=VALUES(active)`,
        [
          v.id ?? "unknown",
          prod.id ?? "unknown",
          orgId,
          v.name ?? "Unknown",
          v.sku ?? "",
          v.barcode ?? null,
          v.packageWeight ?? null,
          v.flavor ?? null,
          v.spiceLevel ?? null,
          v.cost ?? 0,
          v.onlineCost ?? v.cost ?? 0,
          v.price ?? 0,
          v.onlinePrice ?? v.price ?? 0,
          v.resellerPrice ?? 0,
          v.minStock ?? 0,
          v.active !== false,
        ],
      );
    }
  }

  // 3. Balances
  for (const b of balancesToSync) {
    await conn.execute(
      `INSERT INTO balances (organization_id, location_id, variant_id, quantity) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`,
      [
        orgId,
        b.locationId ?? "unknown",
        b.variantId ?? "unknown",
        b.quantity ?? 0,
      ],
    );
  }

  // 4. Sales
  for (const sale of salesToSync) {
    const lineGrossTotal = (sale.items || []).reduce(
      (sum, item) => sum + Number(item.subtotal || 0),
      0,
    );
    await conn.execute(
      `INSERT INTO sales (id, organization_id, location_id, gross_total, discount_amount, discount_type, discount_value, total, platform_fee, net_payout, source_platform, source_import_id, channel, method, status, note, cashier_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE gross_total=VALUES(gross_total), discount_amount=VALUES(discount_amount), discount_type=VALUES(discount_type), discount_value=VALUES(discount_value), total=VALUES(total), platform_fee=VALUES(platform_fee), net_payout=VALUES(net_payout), source_platform=VALUES(source_platform), source_import_id=VALUES(source_import_id), channel=VALUES(channel), method=VALUES(method), status=VALUES(status), note=VALUES(note), cashier_id=VALUES(cashier_id)`,
      [
        sale.id ?? "unknown",
        orgId,
        sale.locationId ?? "unknown",
        sale.grossTotal ??
          (lineGrossTotal ||
            Number(sale.total || 0) + Number(sale.discountAmount || 0)),
        sale.discountAmount ?? 0,
        sale.discountType === "percentage" ? "percentage" : "nominal",
        sale.discountValue ?? sale.discountAmount ?? 0,
        sale.total ?? 0,
        sale.platformFee ?? 0,
        sale.netPayout ?? Math.max(0, Number(sale.total || 0) - Number(sale.platformFee || 0)),
        sale.sourcePlatform ?? null,
        sale.sourceImportId ?? null,
        sale.channel ?? "offline",
        sale.payment ?? sale.method ?? "Tunai",
        sale.status ?? "completed",
        sale.note ?? null,
        sale.cashierId || LEGACY_CASHIER_ID,
        sale.createdAt ?? new Date().toISOString(),
      ],
    );
    // `sale_items` tidak memiliki primary key sendiri pada instalasi lama.
    // Menambahkan ulang seluruh state dengan INSERT IGNORE menyebabkan setiap
    // refresh menambah baris duplikat. Jadikan detail setiap transaksi sebagai
    // snapshot idempoten: hapus detail lama lalu tulis satu kali per item unik.
    await conn.execute("DELETE FROM sale_items WHERE sale_id = ?", [
      sale.id ?? "unknown",
    ]);
    const uniqueItems = Array.from(
      new Map(
        (sale.items || []).map((item) => {
          const key = [
            item.variantId,
            item.quantity,
            item.unitCost ?? "",
            item.price ?? 0,
            item.discount ?? 0,
            item.subtotal ?? 0,
          ].join("|");
          return [key, item];
        }),
      ).values(),
    );
    for (const item of uniqueItems) {
      const quantity = Number(item.quantity || 0);
      const subtotal = Number(item.subtotal || 0);
      const price =
        item.price != null &&
        Number.isFinite(Number(item.price)) &&
        !(Number(item.price) <= 0 && quantity > 0 && subtotal > 0)
          ? Number(item.price)
          : quantity > 0
            ? Math.round(subtotal / quantity)
            : 0;
      await conn.execute(
        `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_cost, price, discount, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          sale.id ?? "unknown",
          item.variantId ?? "unknown",
          quantity,
          Number.isFinite(Number(item.unitCost)) ? Number(item.unitCost) : null,
          price,
          item.discount ?? 0,
          subtotal,
        ],
      );
    }
  }

  // 5. Transfers
  for (const t of transfersToSync) {
    await conn.execute(
      `INSERT INTO transfers (id, transfer_code, organization_id, from_id, to_id, variant_id, quantity, status, created_at, received_at, cancelled_at, cancel_reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE transfer_code=VALUES(transfer_code), status=VALUES(status), received_at=VALUES(received_at), cancelled_at=VALUES(cancelled_at), cancel_reason=VALUES(cancel_reason)`,
      [
        t.id ?? "unknown",
        t.transferCode ?? null,
        orgId,
        t.fromId ?? "unknown",
        t.toId ?? "unknown",
        t.variantId ?? "unknown",
        t.quantity ?? 0,
        t.status ?? "pending",
        t.createdAt ?? new Date().toISOString(),
        t.receivedAt ?? null,
        t.cancelledAt ?? null,
        t.cancelReason ?? null,
        t.createdBy ?? null,
      ],
    );
  }

  // 6. Movements
  for (const m of movementsToSync) {
    await conn.execute(
      `INSERT IGNORE INTO stock_movements (id, organization_id, location_id, variant_id, quantity, type, reason, reference_id, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.id ?? "unknown",
        orgId,
        m.locationId ?? "unknown",
        m.variantId ?? "unknown",
        m.quantity ?? 0,
        m.type ?? "other",
        m.note ?? null,
        m.referenceId ?? null,
        m.createdAt ?? new Date().toISOString(),
        m.user ?? null,
      ],
    );
  }

  // 7. Stock Counts (Opname)
  for (const sc of stockCountsToSync) {
    await conn.execute(
      `INSERT IGNORE INTO stock_counts (id, organization_id, location_id, variant_id, expected, actual, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sc.id ?? "unknown",
        orgId,
        sc.locationId ?? "unknown",
        sc.variantId ?? "unknown",
        sc.systemQty ?? 0,
        sc.actualQty ?? 0,
        sc.reason ?? null,
        sc.createdBy ?? null,
        sc.createdAt ?? new Date().toISOString(),
      ],
    );
  }

  // Ledger marketplace sengaja dinormalisasi. Satu file tetap satu transaksi
  // dan satu baris per varian, sedangkan ribuan ID order hanya disimpan sebagai
  // hash 16 byte yang terindeks agar snapshot aplikasi tetap kecil.
  for (const mapping of mappingsToSync) {
    await conn.execute(
      `INSERT INTO marketplace_sku_mappings (organization_id, platform, external_sku, variant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE variant_id=VALUES(variant_id), updated_at=VALUES(updated_at)`,
      [
        orgId,
        String(mapping.platform || "").toLowerCase(),
        mapping.externalSku,
        mapping.variantId,
        mapping.createdAt,
        mapping.updatedAt,
      ],
    );
  }
  for (const record of importsToSync) {
    await conn.execute(
      `INSERT INTO marketplace_imports (id, organization_id, platform, fingerprint, income_fingerprint, source_file_name, income_file_name, location_id, sale_id, row_count, ignored_row_count, duplicate_order_count, total_quantity, gross_total, discount_amount, platform_fee, net_payout, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE income_fingerprint=VALUES(income_fingerprint), income_file_name=VALUES(income_file_name), row_count=VALUES(row_count), ignored_row_count=VALUES(ignored_row_count), duplicate_order_count=VALUES(duplicate_order_count), total_quantity=VALUES(total_quantity), gross_total=VALUES(gross_total), discount_amount=VALUES(discount_amount), platform_fee=VALUES(platform_fee), net_payout=VALUES(net_payout)`,
      [
        record.id,
        orgId,
        String(record.platform || "").toLowerCase(),
        record.fingerprint,
        record.incomeFingerprint || null,
        record.sourceFileName,
        record.incomeFileName || null,
        record.locationId,
        record.saleId,
        record.rowCount || 0,
        record.ignoredRowCount || 0,
        record.duplicateOrderCount || 0,
        record.totalQuantity || 0,
        record.grossTotal || 0,
        record.discountAmount || 0,
        record.platformFee || 0,
        record.netPayout || 0,
        record.createdAt,
        record.createdBy || null,
      ],
    );
    const orderIds = Array.from(
      new Set((record.externalOrderIds || []).map(String).filter(Boolean)),
    );
    for (let offset = 0; offset < orderIds.length; offset += 500) {
      const chunk = orderIds.slice(offset, offset + 500);
      const placeholders = chunk.map(() => "(?, ?)").join(",");
      await conn.execute(
        `INSERT IGNORE INTO marketplace_order_hashes (organization_hash, order_hash) VALUES ${placeholders}`,
        chunk.flatMap((orderId) => [
          marketplaceTenantDigest(orgId),
          marketplaceOrderDigest(record.platform, orderId),
        ]),
      );
    }
  }
}

export async function getStateFromSQL(conn, orgId) {
  const [locations] = await conn.execute(
    "SELECT id, name, type, address, active, is_central_warehouse as isCentralWarehouse FROM locations WHERE organization_id = ?",
    [orgId],
  );
  const [products] = await conn.execute(
    "SELECT id, name, category, unit, active, image_url as imageUrl FROM products WHERE organization_id = ?",
    [orgId],
  );
  const [variants] = await conn.execute(
    "SELECT id, product_id, name, sku, barcode, package_weight as packageWeight, flavor, spice_level as spiceLevel, cost, online_cost as onlineCost, price, online_price as onlinePrice, reseller_price as resellerPrice, min_stock as minStock, active FROM variants WHERE organization_id = ?",
    [orgId],
  );

  for (const p of products) {
    p.active = p.active === 1;
    p.variants = variants
      .filter((v) => v.product_id === p.id)
      .map((v) => {
        const copy = { ...v, active: v.active === 1 };
        delete copy.product_id;
        return copy;
      });
  }

  const [balances] = await conn.execute(
    "SELECT location_id as locationId, variant_id as variantId, quantity FROM balances WHERE organization_id = ?",
    [orgId],
  );

  const [sales] = await conn.execute(
    "SELECT id, location_id as locationId, gross_total as grossTotal, discount_amount as discountAmount, discount_type as discountType, discount_value as discountValue, total, platform_fee as platformFee, net_payout as netPayout, source_platform as sourcePlatform, source_import_id as sourceImportId, channel, method, status, note, cashier_id as cashierId, created_at as createdAt FROM sales WHERE organization_id = ?",
    [orgId],
  );
  const saleIds = sales.map((s) => s.id);
  let saleItems = [];
  if (saleIds.length > 0) {
    const [items] = await conn.query(
      "SELECT sale_id, variant_id as variantId, quantity, unit_cost as unitCost, price, discount, subtotal FROM sale_items WHERE sale_id IN (?)",
      [saleIds],
    );
    saleItems = items;
  }
  for (const s of sales) {
    s.discountAmount = Number(s.discountAmount || 0);
    s.discountValue = Number(s.discountValue ?? s.discountAmount);
    s.platformFee = Number(s.platformFee || 0);
    s.netPayout = Number(
      s.netPayout ?? Math.max(0, Number(s.total || 0) - s.platformFee),
    );
    s.payment = s.method;
    const seenItems = new Set();
    s.items = saleItems
      .filter((i) => i.sale_id === s.id)
      .filter((item) => {
        const key = [
          item.variantId,
          item.quantity,
          item.unitCost ?? "",
          item.price ?? 0,
          item.discount ?? 0,
          item.subtotal ?? 0,
        ].join("|");
        if (seenItems.has(key)) return false;
        seenItems.add(key);
        return true;
      })
      .map((i) => {
        const copy = { ...i };
        delete copy.sale_id;
        return copy;
      });
  }

  const [transfers] = await conn.execute(
    "SELECT id, transfer_code as transferCode, from_id as fromId, to_id as toId, variant_id as variantId, quantity, status, created_at as createdAt, received_at as receivedAt, cancelled_at as cancelledAt, cancel_reason as cancelReason, created_by as createdBy FROM transfers WHERE organization_id = ?",
    [orgId],
  );

  const [movements] = await conn.execute(
    "SELECT id, location_id as locationId, variant_id as variantId, quantity, type, reason as note, reference_id as referenceId, date as createdAt, created_by as user FROM stock_movements WHERE organization_id = ?",
    [orgId],
  );

  const [stockCountsRows] = await conn.execute(
    "SELECT id, location_id as locationId, variant_id as variantId, expected, actual as actualQty, reason, created_by as createdBy, created_at FROM stock_counts WHERE organization_id = ?",
    [orgId],
  );
  const stockCounts = stockCountsRows.map((sc) => ({
    ...sc,
    systemQty: sc.expected,
    difference: sc.actualQty - sc.expected,
    createdAt: sc.created_at,
  }));

  const [orgs] = await conn.execute(
    "SELECT name, owner_name, phone, email, address, logo_url, negative_stock_policy FROM organizations WHERE id = ?",
    [orgId],
  );
  const business = orgs[0]
    ? {
        name: orgs[0].name,
        ownerName: orgs[0].owner_name || "",
        phone: orgs[0].phone || "",
        email: orgs[0].email || "",
        address: orgs[0].address || "",
        logoUrl: orgs[0].logo_url || "",
        negativeStockPolicy: orgs[0].negative_stock_policy || "BLOCK",
      }
    : { name: "MENENGS" };

  const [states] = await conn.execute(
    "SELECT version, payload FROM app_state WHERE id = ?",
    [orgId],
  );
  const rawState = states[0]?.payload || {};
  const version = Number(states[0]?.version || 0);
  const [marketplaceSkuMappings] = await conn.execute(
    "SELECT platform, external_sku as externalSku, variant_id as variantId, created_at as createdAt, updated_at as updatedAt FROM marketplace_sku_mappings WHERE organization_id = ?",
    [orgId],
  );
  const [marketplaceImports] = await conn.execute(
    "SELECT id, platform, fingerprint, income_fingerprint as incomeFingerprint, source_file_name as sourceFileName, income_file_name as incomeFileName, location_id as locationId, sale_id as saleId, row_count as rowCount, ignored_row_count as ignoredRowCount, duplicate_order_count as duplicateOrderCount, total_quantity as totalQuantity, gross_total as grossTotal, discount_amount as discountAmount, platform_fee as platformFee, net_payout as netPayout, created_at as createdAt, created_by as createdBy FROM marketplace_imports WHERE organization_id = ? ORDER BY created_at DESC",
    [orgId],
  );
  for (const record of marketplaceImports) {
    for (const field of [
      "rowCount",
      "ignoredRowCount",
      "duplicateOrderCount",
      "totalQuantity",
      "grossTotal",
      "discountAmount",
      "platformFee",
      "netPayout",
    ])
      record[field] = Number(record[field] || 0);
  }

  const mergeLegacy = (sqlArr, rawArr) => {
    const map = new Map();
    (rawArr || []).forEach((item) => map.set(item.id, item));
    // Kolom yang belum dimodelkan pada skema relasional (mis. channel) tetap
    // dipertahankan dari snapshot, sementara angka/status SQL menjadi sumber
    // kebenaran saat tersedia.
    (sqlArr || []).forEach((item) =>
      map.set(item.id, { ...(map.get(item.id) || {}), ...item }),
    );
    return Array.from(map.values());
  };

  const mergeProducts = (sqlProducts, rawProducts) => {
    const rawById = new Map(
      (rawProducts || []).map((product) => [product.id, product]),
    );
    const sqlById = new Map(
      (sqlProducts || []).map((product) => [product.id, product]),
    );
    return mergeLegacy(sqlProducts, rawProducts).map((product) => ({
      ...product,
      // HPP menyimpan referensi profile/batch/kemasan pada varian. Kolom
      // tersebut belum menjadi kolom relasional, sehingga harus digabungkan
      // kembali dari snapshot. Nilai harga, status, dan SKU dari SQL tetap
      // menjadi sumber kebenaran saat tersedia.
      variants: mergeLegacy(
        sqlById.get(product.id)?.variants || [],
        rawById.get(product.id)?.variants || [],
      ),
    }));
  };

  const mergeLegacyBalances = (sqlArr, rawArr) => {
    const map = new Map();
    (rawArr || []).forEach((item) =>
      map.set(`${item.locationId}-${item.variantId}`, item),
    );
    (sqlArr || []).forEach((item) =>
      map.set(`${item.locationId}-${item.variantId}`, item),
    );
    return Array.from(map.values());
  };

  const sqlLocations = locations.map((l) => ({
    ...l,
    active: l.active === 1,
    isCentralWarehouse: l.isCentralWarehouse === 1,
  }));

  return {
    version,
    data: {
      business,
      securityMigrations: rawState.securityMigrations || {},
      locations: mergeLegacy(sqlLocations, rawState.locations),
      products: mergeProducts(products, rawState.products),
      balances: mergeLegacyBalances(balances, rawState.balances),
      sales: mergeLegacy(sales, rawState.sales),
      transfers: mergeLegacy(transfers, rawState.transfers),
      movements: mergeLegacy(movements, rawState.movements),
      stockCounts: mergeLegacy(stockCounts, rawState.stockCounts),
      receipts: rawState.receipts || [],
      returns: rawState.returns || [],
      stockOuts: rawState.stockOuts || [],
      suppliers: rawState.suppliers || [],
      employees: rawState.employees || [],
      attendanceSettings: rawState.attendanceSettings || [],
      attendances: rawState.attendances || [],
      liveSessions: rawState.liveSessions || [],
      loans: rawState.loans || [],
      payrolls: rawState.payrolls || [],
      // Buku kas memakai snapshot app_state sebagai penyimpanan kanonis. Setiap
      // command tetap dikomit dalam transaksi database dan memiliki versi.
      cashEntries: rawState.cashEntries || [],
      debtEntries: rawState.debtEntries || [],
      // Pengiriman belum memiliki tabel relasional tersendiri. Selama itu,
      // snapshot app_state adalah sumber kebenaran agar hasil scan packing dan
      // batch serah-terima tidak hilang ketika state dibaca ulang dari SQL.
      shipments: rawState.shipments || [],
      shipmentHandovers: rawState.shipmentHandovers || [],
      marketplaceSkuMappings: marketplaceSkuMappings.length
        ? marketplaceSkuMappings
        : rawState.marketplaceSkuMappings || [],
      marketplaceImports: marketplaceImports.length
        ? marketplaceImports
        : (rawState.marketplaceImports || []).map(
            ({ externalOrderIds: _externalOrderIds, ...record }) => record,
          ),
      pricing: rawState.pricing || {
        hppProductProfiles: [],
        hppMasterItems: [],
        hppPackages: [],
        hppBatches: [],
        hppRecipes: [],
        marketplaceConfigs: [],
      },
      rolePolicies: rawState.rolePolicies || {},
    },
  };
}
