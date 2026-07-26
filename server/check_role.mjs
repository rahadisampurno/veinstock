import mysql from 'mysql2/promise';
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'veinstock'
  });
  
  await pool.execute("INSERT IGNORE INTO users (id,organization_id,name,email,password_hash,role,active) VALUES ('test-id-1','org-meneng','test','test@test.com','hash','admin',TRUE)");
  const [rows] = await pool.query("SELECT role FROM users WHERE id='test-id-1'");
  console.log('Role is:', rows[0].role);
  process.exit(0);
})();
