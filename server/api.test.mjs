import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';

const port = 18787;
const base = `http://127.0.0.1:${port}`;
let server;

const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  return { status: response.status, body: await response.json() };
};
const post = (path, body, token) => request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

beforeAll(async () => {
  server = spawn(process.execPath, ['server/index.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DB_HOST: '', JWT_SECRET: 'integration-test-secret' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* server belum siap */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Server pengujian tidak siap');
});
afterAll(() => server?.kill('SIGTERM'));

describe('multi-tenant API', () => {
  it('isolates organizations and enforces finance read-only access', async () => {
    const suffix = Date.now();
    const a = await post('/api/register', { organizationName: 'Tenant A', name: 'Owner A', email: `owner-a-${suffix}@test.local`, password: 'Password123!' });
    const b = await post('/api/register', { organizationName: 'Tenant B', name: 'Owner B', email: `owner-b-${suffix}@test.local`, password: 'Password123!' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.user.organizationId).not.toBe(b.body.user.organizationId);

    const stateA = await request('/api/state', { headers: { authorization: `Bearer ${a.body.token}` } });
    const stateB = await request('/api/state', { headers: { authorization: `Bearer ${b.body.token}` } });
    expect(stateA.body.data.locations[0].name).toContain('Tenant A');
    expect(stateB.body.data.locations[0].name).toContain('Tenant B');

    stateA.body.data.locations.push({ id: 'outlet-a', name: 'Outlet A', type: 'outlet', active: true });
    const saved = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.body.token}` }, body: JSON.stringify({ data: stateA.body.data, version: stateA.body.version }) });
    expect(saved.status).toBe(200);
    const unchangedB = await request('/api/state', { headers: { authorization: `Bearer ${b.body.token}` } });
    expect(unchangedB.body.data.locations).toHaveLength(1);

    const financeEmail = `finance-${suffix}@test.local`;
    expect((await post('/api/users', { name: 'Finance', email: financeEmail, password: 'Password123!', role: 'finance' }, a.body.token)).status).toBe(201);
    const finance = await post('/api/login', { email: financeEmail, password: 'Password123!' });
    const financeWrite = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${finance.body.token}` }, body: JSON.stringify({ data: stateA.body.data, version: saved.body.version }) });
    expect(financeWrite.status).toBe(403);
  });
});
