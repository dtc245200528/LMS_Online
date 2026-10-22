'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const pinoHttp = require('pino-http');

const config = require('./config');
const logger = require('./logger');
const metrics = require('./metrics');
const { locals, csrfProtection } = require('./middleware/auth');

/**
 * Tạo Express app. Cho phép truyền db / sessionStore giả để viết test.
 */
function createApp({ db, sessionStore } = {}) {
  db = db || require('./db');
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', 1); // Đứng sau Nginx -> lấy IP thật từ X-Forwarded-For
  app.disable('x-powered-by');
  app.locals.db = db;

  // ---------- Hardening tầng ứng dụng ----------
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        frameSrc: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: false, // HSTS do Nginx đặt
  }));

  // ---------- Observability ----------
  app.use(pinoHttp({
    logger,
    customProps: (req) => ({ userId: req.session && req.session.user ? req.session.user.id : null }),
    autoLogging: { ignore: (req) => ['/metrics', '/healthz', '/readyz'].includes(req.url) },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessObject: (req, res, val) => ({ ...val, event: 'http_request' }),
    customErrorObject: (req, res, err, val) => ({ ...val, event: 'http_request' }),
    serializers: {
      req: (req) => ({ method: req.method, url: req.url, ip: req.remoteAddress, ua: req.headers['user-agent'] }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }));
  app.use(metrics.httpMetricsMiddleware);

  // ---------- Health & metrics (Nginx chặn /metrics từ bên ngoài) ----------
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (req, res) => {
    try {
      await db.ping();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));

  app.use(session({
    name: 'lms.sid',
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: 2 * 60 * 60 * 1000, // 2 giờ
    },
  }));
  app.use(locals);
  app.use(csrfProtection);

  // ---------- Routes ----------
  app.use('/', require('./routes/auth'));
  app.use('/', require('./routes/courses'));
  app.use('/admin', require('./routes/admin'));

  // 404
  app.use((req, res) => {
    res.status(404).render('error', { title: 'Không tìm thấy', message: 'Trang bạn tìm không tồn tại.' });
  });

  // 500 - không lộ stack trace ra ngoài
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    req.log.error({ event: 'unhandled_error', err }, 'Lỗi không xử lý được');
    res.status(500).render('error', { title: 'Lỗi hệ thống', message: 'Đã xảy ra lỗi, vui lòng thử lại sau.' });
  });

  return app;
}

module.exports = { createApp };
