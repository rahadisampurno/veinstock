import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'veinstock',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function db() { return pool; }

async function cleanup() {
  const conn = await db();
  const connection = await conn.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT id, payload as data FROM app_state');
    for (const row of rows) {
      if (!row.data) continue;
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      
      let changed = false;

      // Clean up duplicate locations
      const locationNames = new Set();
      const uniqueLocations = [];
      for (const loc of data.locations || []) {
        const key = (loc.name||'').toLowerCase().trim() + '|' + (loc.type||'');
        if (!locationNames.has(key)) {
          uniqueLocations.push(loc);
          locationNames.add(key);
        } else {
          changed = true;
          console.log(`Removed duplicate location: ${loc.name} in org ${row.id}`);
        }
      }
      data.locations = uniqueLocations;

      // Clean up users with empty roles
      const validUsers = [];
      for (const user of data.users || []) {
        if (!user.role) {
          changed = true;
          console.log(`Removed user with empty role: ${user.name} in org ${row.id}`);
        } else {
          validUsers.push(user);
        }
      }
      data.users = validUsers;

      if (changed) {
        await connection.execute('UPDATE app_state SET payload=? WHERE id=?', [JSON.stringify(data), row.id]);
        console.log(`Updated state for org ${row.id}`);
      }
    }
    
    // Also clean up locations table
    // Delete duplicate locations
    await connection.execute(`
      DELETE t1 FROM locations t1
      INNER JOIN locations t2 
      WHERE t1.id > t2.id AND t1.organization_id = t2.organization_id AND t1.name = t2.name AND t1.type = t2.type
    `);
    
    // Also delete users with empty roles in users table
    await connection.execute(`DELETE FROM users WHERE role = '' OR role IS NULL`);

    await connection.commit();
    console.log('✅ Cleanup completed successfully');
  } catch (error) {
    await connection.rollback();
    console.error('❌ Cleanup failed:', error);
  } finally {
    connection.release();
    pool.end();
  }
}

cleanup();
