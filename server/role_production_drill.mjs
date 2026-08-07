import crypto from 'node:crypto';

if (process.env.ALLOW_PRODUCTION_ROLE_DRILL !== 'true') {
  throw new Error('Set ALLOW_PRODUCTION_ROLE_DRILL=true untuk menjalankan role drill production.');
}

const baseUrl = String(process.env.UAT_BASE_URL || '').replace(/\/$/, '');
const ownerEmail = process.env.UAT_OWNER_EMAIL;
const ownerPassword = process.env.UAT_OWNER_PASSWORD;
if (!baseUrl || !ownerEmail || !ownerPassword) throw new Error('Konfigurasi UAT production belum lengkap.');

const jsonRequest = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
};

const login = async (email, password) => {
  const result = await jsonRequest('/api/login', { method: 'POST', body: { email, password } });
  if (result.status !== 200 || !result.payload.token) throw new Error(`Login ${email} gagal (${result.status}).`);
  return result.payload;
};

const owner = await login(ownerEmail, ownerPassword);
const ownerStateResult = await jsonRequest('/api/state', { token: owner.token });
if (ownerStateResult.status !== 200) throw new Error('State Owner tidak dapat dibaca.');

const ownerState = ownerStateResult.payload.data;
const warehouse = ownerState.locations.find((location) => location.type === 'warehouse' && location.active !== false);
const outlet = ownerState.locations.find((location) => location.type === 'outlet' && location.active !== false);
if (!warehouse || !outlet) throw new Error('Role drill membutuhkan satu gudang dan satu outlet aktif.');

const password = `F4b!${crypto.randomBytes(12).toString('base64url')}`;
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const specs = [
  { role: 'admin', name: 'UAT F4B Admin' },
  { role: 'finance', name: 'UAT F4B Finance' },
  { role: 'warehouse', name: 'UAT F4B Warehouse', outletId: warehouse.id },
  { role: 'pic', name: 'UAT F4B PIC', outletId: outlet.id },
  { role: 'cashier', name: 'UAT F4B Cashier', outletId: outlet.id },
].map((spec) => ({ ...spec, email: `uat.f4b.${spec.role}.${stamp}@meneng.id`, password }));

const created = [];
const results = [];

try {
  for (const spec of specs) {
    const creation = await jsonRequest('/api/users', {
      token: owner.token,
      method: 'POST',
      body: spec,
    });
    if (creation.status !== 201) throw new Error(`Pembuatan akun ${spec.role} gagal (${creation.status}).`);
    created.push({ ...creation.payload.user, password });
  }

  for (const account of created) {
    const session = await login(account.email, account.password);
    const stateResult = await jsonRequest('/api/state', { token: session.token });
    if (stateResult.status !== 200) throw new Error(`State ${account.role} gagal dibaca.`);
    const data = stateResult.payload.data;
    const locationIds = data.locations.map((location) => location.id);

    let gates;
    if (account.role === 'admin') {
      gates = {
        permittedInvalidPricing: await jsonRequest('/api/commands/pricing', {
          token: session.token, method: 'POST', body: { pricing: { hppRecipes: [{ id: 'invalid' }] } },
        }),
        invalidUserCreation: await jsonRequest('/api/users', {
          token: session.token, method: 'POST', body: {},
        }),
      };
    } else if (account.role === 'finance') {
      gates = {
        mutationDenied: await jsonRequest('/api/commands/sales', {
          token: session.token, method: 'POST', body: { locationId: warehouse.id, channel: 'offline', items: [] },
        }),
      };
    } else if (account.role === 'warehouse') {
      gates = {
        ownReceiptPermission: await jsonRequest('/api/commands/receipts', {
          token: session.token, method: 'POST', body: { locationId: warehouse.id, items: [] },
        }),
        otherLocationDenied: await jsonRequest('/api/commands/opnames', {
          token: session.token, method: 'POST', body: { locationId: outlet.id, items: [] },
        }),
        saleDenied: await jsonRequest('/api/commands/sales', {
          token: session.token, method: 'POST', body: { locationId: warehouse.id, channel: 'offline', items: [] },
        }),
      };
    } else if (account.role === 'pic') {
      gates = {
        ownSalePermission: await jsonRequest('/api/commands/sales', {
          token: session.token, method: 'POST', body: { locationId: outlet.id, channel: 'offline', items: [] },
        }),
        otherLocationDenied: await jsonRequest('/api/commands/sales', {
          token: session.token, method: 'POST', body: { locationId: warehouse.id, channel: 'offline', items: [] },
        }),
      };
    } else {
      gates = {
        ownSalePermission: await jsonRequest('/api/commands/sales', {
          token: session.token, method: 'POST', body: { locationId: outlet.id, channel: 'offline', items: [] },
        }),
        opnameDenied: await jsonRequest('/api/commands/opnames', {
          token: session.token, method: 'POST', body: { locationId: outlet.id, items: [] },
        }),
      };
    }

    results.push({
      role: account.role,
      login: 200,
      state: stateResult.status,
      visibleLocations: locationIds,
      balanceLocations: [...new Set(data.balances.map((balance) => balance.locationId))],
      gates: Object.fromEntries(Object.entries(gates).map(([key, value]) => [key, {
        status: value.status,
        message: value.payload.message,
      }])),
    });
  }

  const expected = {
    admin: { permittedInvalidPricing: 400, invalidUserCreation: 400 },
    finance: { mutationDenied: 403 },
    warehouse: { ownReceiptPermission: 400, otherLocationDenied: 403, saleDenied: 403 },
    pic: { ownSalePermission: 400, otherLocationDenied: 403 },
    cashier: { ownSalePermission: 400, opnameDenied: 403 },
  };
  const mismatches = results.flatMap((result) => Object.entries(expected[result.role])
    .filter(([gate, status]) => result.gates[gate]?.status !== status)
    .map(([gate, status]) => ({ role: result.role, gate, expected: status, actual: result.gates[gate]?.status })));

  console.log(JSON.stringify({ ok: mismatches.length === 0, results, mismatches }, null, 2));
  if (mismatches.length) process.exitCode = 2;
} finally {
  for (const account of created) {
    const deactivation = await jsonRequest(`/api/users/${encodeURIComponent(account.id)}`, {
      token: owner.token,
      method: 'PATCH',
      body: {
        name: account.name,
        email: account.email,
        role: account.role,
        outletId: account.outletId || null,
        active: false,
      },
    });
    if (deactivation.status !== 200) console.error(`Gagal menonaktifkan akun UAT ${account.role}.`);
  }
}
