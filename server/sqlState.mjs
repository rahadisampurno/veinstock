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


const SQL_WRITE_BATCH_SIZE = 250;
const executeBatchedValues = async (
  conn,
  rows,
  valuesPerRow,
  statement,
) => {
  for (
    let offset = 0;
    offset < rows.length;
    offset += SQL_WRITE_BATCH_SIZE
  ) {
    const batch = rows.slice(offset, offset + SQL_WRITE_BATCH_SIZE);
    const placeholders = batch
      .map(() => `(${Array(valuesPerRow).fill("?").join(", ")})`)
      .join(", ");
    await conn.execute(
      statement(placeholders),
      batch.flatMap((row) => row),
    );
  }
};
const variantValues = (variant, product, organizationId) => [
  variant.id ?? "unknown",
  product.id ?? "unknown",
  organizationId,
  variant.name ?? "Unknown",
  variant.sku ?? "",
  variant.barcode ?? null,
  variant.packageWeight ?? null,
  variant.flavor ?? null,
  variant.spiceLevel ?? null,
  variant.cost ?? 0,
  variant.onlineCost ?? variant.cost ?? 0,
  variant.price ?? 0,
  variant.onlinePrice ?? variant.price ?? 0,
  variant.resellerPrice ?? 0,
  variant.minStock ?? 0,
  variant.active !== false,
];

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
  await executeBatchedValues(
    conn,
    locationsToSync.map((loc) => [
        loc.id ?? "unknown",
        orgId,
        loc.name ?? "Unknown",
        loc.type ?? "warehouse",
        loc.address ?? "",
        loc.active !== false,
        loc.isCentralWarehouse === true,
    ]),
    7,
    (values) =>
      `INSERT INTO locations (id, organization_id, name, type, address, active, is_central_warehouse) VALUES ${values} ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), address=VALUES(address), active=VALUES(active), is_central_warehouse=VALUES(is_central_warehouse)`,
  );

  // 2. Products and Variants
  await executeBatchedValues(
    conn,
    productsToSync.map((prod) => [
        prod.id ?? "unknown",
        orgId,
        prod.name ?? "Unknown",
        prod.category ?? "",
        prod.unit ?? "Pcs",
        prod.active !== false,
        // Frontend memakai `imageUrl`. Tetap baca `image` untuk data lama yang
        // pernah tersimpan sebelum nama properti distandarkan.
        prod.imageUrl ?? prod.image ?? null,
    ]),
    7,
    (values) =>
      `INSERT INTO products (id, organization_id, name, category, unit, active, image_url) VALUES ${values} ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), unit=VALUES(unit), active=VALUES(active), image_url=VALUES(image_url)`,
  );
  await executeBatchedValues(
    conn,
    productsToSync.flatMap((product) =>
      (product.variants || []).map((variant) =>
        variantValues(variant, product, orgId),
      ),
    ),
    16,
    (values) =>
      `INSERT INTO variants (id, product_id, organization_id, name, sku, barcode, package_weight, flavor, spice_level, cost, online_cost, price, online_price, reseller_price, min_stock, active) VALUES ${values} ON DUPLICATE KEY UPDATE name=VALUES(name), sku=VALUES(sku), barcode=VALUES(barcode), package_weight=VALUES(package_weight), flavor=VALUES(flavor), spice_level=VALUES(spice_level), cost=VALUES(cost), online_cost=VALUES(online_cost), price=VALUES(price), online_price=VALUES(online_price), reseller_price=VALUES(reseller_price), min_stock=VALUES(min_stock), active=VALUES(active)`,
  );

  // 3. Balances
  await executeBatchedValues(
    conn,
    balancesToSync.map((balance) => [
        orgId,
        balance.locationId ?? "unknown",
        balance.variantId ?? "unknown",
        balance.quantity ?? 0,
    ]),
    4,
    (values) =>
      `INSERT INTO balances (organization_id, location_id, variant_id, quantity) VALUES ${values} ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)`,
  );

  // 4. Sales
  const saleRows = salesToSync.map((sale) => {
    const lineGrossTotal = (sale.items || []).reduce(
      (sum, item) => sum + Number(item.subtotal || 0),
      0,
    );
    return [
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
      sale.netPayout ??
        Math.max(
          0,
          Number(sale.total || 0) - Number(sale.platformFee || 0),
        ),
      sale.sourcePlatform ?? null,
      sale.sourceImportId ?? null,
      sale.channel ?? "offline",
      sale.payment ?? sale.method ?? "Tunai",
      sale.status ?? "completed",
      sale.note ?? null,
      sale.cashierId || LEGACY_CASHIER_ID,
      sale.createdAt ?? new Date().toISOString(),
    ];
  });
  await executeBatchedValues(
    conn,
    saleRows,
    18,
    (values) =>
      `INSERT INTO sales (id, organization_id, location_id, gross_total, discount_amount, discount_type, discount_value, total, platform_fee, net_payout, source_platform, source_import_id, channel, method, status, note, cashier_id, created_at) VALUES ${values} ON DUPLICATE KEY UPDATE gross_total=VALUES(gross_total), discount_amount=VALUES(discount_amount), discount_type=VALUES(discount_type), discount_value=VALUES(discount_value), total=VALUES(total), platform_fee=VALUES(platform_fee), net_payout=VALUES(net_payout), source_platform=VALUES(source_platform), source_import_id=VALUES(source_import_id), channel=VALUES(channel), method=VALUES(method), status=VALUES(status), note=VALUES(note), cashier_id=VALUES(cashier_id)`,
  );
  for (
    let offset = 0;
    offset < salesToSync.length;
    offset += SQL_WRITE_BATCH_SIZE
  ) {
    // `sale_items` tidak memiliki primary key sendiri pada instalasi lama.
    // Hapus snapshot detail seluruh penjualan yang berubah dalam satu query,
    // kemudian tulis ulang baris uniknya secara batch.
    const batch = salesToSync.slice(offset, offset + SQL_WRITE_BATCH_SIZE);
    await conn.execute(
      `DELETE FROM sale_items WHERE sale_id IN (${batch.map(() => "?").join(", ")})`,
      batch.map((sale) => sale.id ?? "unknown"),
    );
  }
  const saleItemRows = salesToSync.flatMap((sale) => {
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
    return uniqueItems.map((item) => {
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
      return [
        sale.id ?? "unknown",
        item.variantId ?? "unknown",
        quantity,
        Number.isFinite(Number(item.unitCost)) ? Number(item.unitCost) : null,
        price,
        item.discount ?? 0,
        subtotal,
      ];
    });
  });
  await executeBatchedValues(
    conn,
    saleItemRows,
    7,
    (values) =>
      `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_cost, price, discount, subtotal) VALUES ${values}`,
  );

  // 5. Transfers
  await executeBatchedValues(
    conn,
    transfersToSync.map((transfer) => [
        transfer.id ?? "unknown",
        transfer.transferCode ?? null,
        orgId,
        transfer.fromId ?? "unknown",
        transfer.toId ?? "unknown",
        transfer.variantId ?? "unknown",
        transfer.quantity ?? 0,
        transfer.status ?? "pending",
        transfer.createdAt ?? new Date().toISOString(),
        transfer.receivedAt ?? null,
        transfer.cancelledAt ?? null,
        transfer.cancelReason ?? null,
        transfer.createdBy ?? null,
    ]),
    13,
    (values) =>
      `INSERT INTO transfers (id, transfer_code, organization_id, from_id, to_id, variant_id, quantity, status, created_at, received_at, cancelled_at, cancel_reason, created_by) VALUES ${values} ON DUPLICATE KEY UPDATE transfer_code=VALUES(transfer_code), status=VALUES(status), received_at=VALUES(received_at), cancelled_at=VALUES(cancelled_at), cancel_reason=VALUES(cancel_reason)`,
  );

  // 6. Movements
  await executeBatchedValues(
    conn,
    movementsToSync.map((movement) => [
        movement.id ?? "unknown",
        orgId,
        movement.locationId ?? "unknown",
        movement.variantId ?? "unknown",
        movement.quantity ?? 0,
        movement.type ?? "other",
        movement.note ?? null,
        movement.referenceId ?? null,
        movement.createdAt ?? new Date().toISOString(),
        movement.user ?? null,
    ]),
    10,
    (values) =>
      `INSERT IGNORE INTO stock_movements (id, organization_id, location_id, variant_id, quantity, type, reason, reference_id, date, created_by) VALUES ${values}`,
  );

  // 7. Stock Counts (Opname)
  await executeBatchedValues(
    conn,
    stockCountsToSync.map((stockCount) => [
        stockCount.id ?? "unknown",
        orgId,
        stockCount.locationId ?? "unknown",
        stockCount.variantId ?? "unknown",
        stockCount.systemQty ?? 0,
        stockCount.actualQty ?? 0,
        stockCount.reason ?? null,
        stockCount.createdBy ?? null,
        stockCount.createdAt ?? new Date().toISOString(),
    ]),
    9,
    (values) =>
      `INSERT IGNORE INTO stock_counts (id, organization_id, location_id, variant_id, expected, actual, reason, created_by, created_at) VALUES ${values}`,
  );

  // Ledger marketplace sengaja dinormalisasi. Satu file tetap satu transaksi
  // dan satu baris per varian, sedangkan ribuan ID order hanya disimpan sebagai
  // hash 16 byte yang terindeks agar snapshot aplikasi tetap kecil.
  await executeBatchedValues(
    conn,
    mappingsToSync.map((mapping) => [
        orgId,
        String(mapping.platform || "").toLowerCase(),
        mapping.externalSku,
        mapping.variantId,
        mapping.createdAt,
        mapping.updatedAt,
    ]),
    6,
    (values) =>
      `INSERT INTO marketplace_sku_mappings (organization_id, platform, external_sku, variant_id, created_at, updated_at) VALUES ${values} ON DUPLICATE KEY UPDATE variant_id=VALUES(variant_id), updated_at=VALUES(updated_at)`,
  );
  await executeBatchedValues(
    conn,
    importsToSync.map((record) => [
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
    ]),
    19,
    (values) =>
      `INSERT INTO marketplace_imports (id, organization_id, platform, fingerprint, income_fingerprint, source_file_name, income_file_name, location_id, sale_id, row_count, ignored_row_count, duplicate_order_count, total_quantity, gross_total, discount_amount, platform_fee, net_payout, created_at, created_by) VALUES ${values} ON DUPLICATE KEY UPDATE income_fingerprint=VALUES(income_fingerprint), source_file_name=VALUES(source_file_name), income_file_name=VALUES(income_file_name), location_id=VALUES(location_id), sale_id=VALUES(sale_id), row_count=VALUES(row_count), ignored_row_count=VALUES(ignored_row_count), duplicate_order_count=VALUES(duplicate_order_count), total_quantity=VALUES(total_quantity), gross_total=VALUES(gross_total), discount_amount=VALUES(discount_amount), platform_fee=VALUES(platform_fee), net_payout=VALUES(net_payout), created_at=VALUES(created_at), created_by=VALUES(created_by)`,
  );
  const marketplaceOrderRows = importsToSync.flatMap((record) =>
    Array.from(
      new Set((record.externalOrderIds || []).map(String).filter(Boolean)),
    ).map((orderId) => [
          marketplaceTenantDigest(orgId),
          marketplaceOrderDigest(record.platform, orderId),
          record.id,
    ]),
  );
  await executeBatchedValues(
    conn,
    marketplaceOrderRows,
    3,
    (values) =>
      `INSERT INTO marketplace_order_hashes (organization_hash, order_hash, import_id) VALUES ${values} ON DUPLICATE KEY UPDATE import_id=VALUES(import_id)`,
  );
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
