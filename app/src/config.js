'use strict';

// Đọc cấu hình từ biến môi trường (12-factor). Không hard-code mật khẩu trong code.
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  return v;
}

const env = process.env.NODE_ENV || 'development';

module.exports = {
  env,
  port: parseInt(process.env.PORT || '3000', 10),
  db: {
    host: process.env.DB_HOST || 'mysql',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'lms_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lms',
  },
  sessionSecret: env === 'production' ? required('SESSION_SECRET') : (process.env.SESSION_SECRET || 'dev-only-secret'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  admin: {
    name: process.env.ADMIN_NAME || 'Quản trị viên',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};
