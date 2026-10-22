'use strict';

const mysql = require('mysql2/promise');
const config = require('./config');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
      timezone: 'Z',
    });
  }
  return pool;
}

// Luôn dùng câu lệnh tham số hóa (?) -> chống SQL Injection
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function ping() {
  await getPool().query('SELECT 1');
  return true;
}

// Chờ MySQL sẵn sàng khi container vừa khởi động
async function waitForDb(logger, retries = 30, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await ping();
      logger.info({ event: 'db_connected' }, 'Kết nối MySQL thành công');
      return;
    } catch (err) {
      logger.warn({ event: 'db_wait', attempt: i, err: err.message }, 'Đang chờ MySQL...');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Không kết nối được MySQL');
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { query, ping, waitForDb, close, getPool };
