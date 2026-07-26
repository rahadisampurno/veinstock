import mysql from 'mysql2/promise';
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'veinstock'
  });
  const [rows] = await pool.query("SHOW COLUMNS FROM users LIKE 'role'");
  console.log(rows[0].Type);
  process.exit(0);
})();
