'use strict';

const pino = require('pino');
const config = require('./config');

// Log JSON ra stdout -> Docker -> Promtail -> Loki.
// Mỗi dòng log có trường "event" để truy vấn LogQL dễ dàng, ví dụ:
//   {service="app"} | json | event="login_failed"
const logger = pino({
  level: config.logLevel,
  base: { service: 'lms-app' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Không bao giờ ghi mật khẩu / cookie ra log
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', '*.password'],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
