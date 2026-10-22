'use strict';

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bcrypt = require('bcryptjs');

const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const metrics = require('./metrics');
const { createApp } = require('./app');

// Tạo tài khoản admin từ biến môi trường nếu chưa có
async function ensureAdmin() {
  const { name, email, password } = config.admin;
  if (!email || !password) {
    logger.warn({ event: 'admin_seed_skipped' }, 'Chưa đặt ADMIN_EMAIL/ADMIN_PASSWORD, bỏ qua tạo admin');
    return;
  }
  const rows = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length) return;
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
    [name, email, hash],
  );
  logger.info({ event: 'admin_seeded', email }, 'Đã tạo tài khoản admin');
}

async function main() {
  await db.waitForDb(logger);
  await ensureAdmin();
  metrics.registerDbGauges(db);

  // Lưu session trong MySQL (không dùng MemoryStore khi chạy thật)
  const sessionStore = new MySQLStore({
    createDatabaseTable: false, // bảng sessions đã tạo trong db/init/01-schema.sql
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
  }, db.getPool());

  const app = createApp({ db, sessionStore });
  const server = app.listen(config.port, () => {
    logger.info({ event: 'app_started', port: config.port, env: config.env }, `LMS đang chạy ở cổng ${config.port}`);
  });

  // Tắt êm khi Docker gửi SIGTERM
  const shutdown = (signal) => {
    logger.info({ event: 'app_stopping', signal }, 'Đang dừng ứng dụng');
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ event: 'app_crash', err }, 'Không khởi động được ứng dụng');
  process.exit(1);
});
