const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '50.116.27.100',
  user: 'lobomats_angeldani23',
  password: 'Mimosa34.',
  database: 'lobomats_tienda2',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool; 