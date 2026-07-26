
const BASE_URL = 'http://localhost:8787';
let token = '';

async function login() {
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@meneng.id', password: 'VeinStock123!' })
  });
  if (!res.ok) throw new Error('Failed to login: ' + await res.text());
  const data = await res.json();
  token = data.token;
  console.log('✅ Logged in successfully');
}

async function runTests() {
  await login();
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  console.log('\n--- 1. Testing Duplicate Locations ---');
  let res = await fetch(`${BASE_URL}/api/state`, { headers });
  let stateBody = await res.json();
  let state = stateBody.data;

  // Add duplicate locations
  const locName = 'Test Gudang ' + Date.now();
  state.locations.push({ id: 'loc-test1', name: locName, type: 'warehouse', address: '', active: true });
  state.locations.push({ id: 'loc-test2', name: locName, type: 'warehouse', address: '', active: true });

  res = await fetch(`${BASE_URL}/api/state`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ version: stateBody.version, data: state })
  });

  if (res.status === 400) {
    const errorBody = await res.json();
    if (errorBody.message.includes('duplikat')) {
      console.log('✅ Duplicate location rejected successfully (Status: ' + res.status + ')');
    } else {
      throw new Error('❌ PUT /api/state returned 400 but wrong error: ' + errorBody.message);
    }
  } else {
    throw new Error('❌ Duplicate location was allowed! Status: ' + res.status);
  }

  console.log('\n--- 2. Testing User Creation (Missing Role) ---');
  res = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Test User', email: `test${Date.now()}@test.com`, password: 'password123', role: '' })
  });
  if (res.status === 400) {
    console.log('✅ User with empty role rejected successfully');
  } else {
    throw new Error('❌ User with empty role was allowed!');
  }

  console.log('\n--- 3. Testing User Creation (Role vs Location Type Mismatch) ---');
  
  // Re-fetch state and add an outlet
  res = await fetch(`${BASE_URL}/api/state`, { headers });
  stateBody = await res.json();
  state = stateBody.data;
  
  const outletId = 'loc-outlet-' + Date.now();
  state.locations.push({ id: outletId, name: 'Test Outlet ' + Date.now(), type: 'outlet', address: '', active: true });
  res = await fetch(`${BASE_URL}/api/state`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ version: stateBody.version, data: state })
  });
  if (!res.ok) throw new Error('Failed to create outlet: ' + await res.text());
  console.log('✅ Outlet created');
  
  // Try to assign warehouse role to the outlet
  res = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ 
      name: 'Test Warehouse User', 
      email: `warehouse${Date.now()}@test.com`, 
      password: 'password123', 
      role: 'warehouse', 
      outletId: outletId 
    })
  });
  if (res.status === 400) {
    console.log('✅ Warehouse user rejected when assigned to an outlet location');
  } else {
    throw new Error('❌ Warehouse user was allowed to be assigned to an outlet! Status: ' + res.status);
  }

  console.log('\n--- 4. Testing Business Profile Persistence ---');
  const orgUpdate = {
    name: 'Meneng Kopi Updated ' + Date.now(),
    ownerName: 'Pak Rahadi',
    phone: '08123456789',
    email: 'hello@meneng.com'
  };
  res = await fetch(`${BASE_URL}/api/organization`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(orgUpdate)
  });
  if (!res.ok) throw new Error('Failed to update organization: ' + await res.text());
  console.log('✅ Organization updated');

  res = await fetch(`${BASE_URL}/api/state`, { headers });
  const newState = await res.json();
  if (newState.data.business.name === orgUpdate.name && newState.data.business.phone === orgUpdate.phone) {
    console.log('✅ Organization data persisted and retrieved from /api/state successfully');
  } else {
    throw new Error('❌ Organization data mismatch in /api/state');
  }

  console.log('\n🎉 All P0 automated tests passed successfully!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
