'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const metrics = require('../metrics');
const { flash } = require('../middleware/auth');

const router = express.Router();

// Giới hạn brute-force ở tầng app (Nginx cũng giới hạn thêm một lớp)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    req.log.warn({ event: 'login_rate_limited', ip: req.ip, email: req.body && req.body.email }, 'Đăng nhập quá nhiều lần');
    res.status(429).render('auth/login', { title: 'Đăng nhập', error: 'Bạn thử quá nhiều lần, vui lòng đợi 15 phút.', email: '', next: '' });
  },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Chỉ cho redirect nội bộ, chống open-redirect
function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/register', { title: 'Đăng ký tài khoản', errors: [], form: {} });
});

router.post('/register', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const form = {
      full_name: String(req.body.full_name || '').trim(),
      email: String(req.body.email || '').trim().toLowerCase(),
    };
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');
    const errors = [];
    if (form.full_name.length < 2 || form.full_name.length > 100) errors.push('Họ tên phải từ 2 đến 100 ký tự.');
    if (!EMAIL_RE.test(form.email) || form.email.length > 150) errors.push('Email không hợp lệ.');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.push('Mật khẩu tối thiểu 8 ký tự, gồm cả chữ và số.');
    if (password !== confirm) errors.push('Mật khẩu nhập lại không khớp.');
    if (!errors.length) {
      const exists = await db.query('SELECT id FROM users WHERE email = ?', [form.email]);
      if (exists.length) errors.push('Email này đã được đăng ký.');
    }
    if (errors.length) return res.status(400).render('auth/register', { title: 'Đăng ký tài khoản', errors, form });

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'student')",
      [form.full_name, form.email, hash],
    );
    metrics.registrations.inc();
    req.log.info({ event: 'user_registered', userId: result.insertId, email: form.email }, 'Học viên mới đăng ký');

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = { id: result.insertId, name: form.full_name, email: form.email, role: 'student' };
      flash(req, 'ok', 'Tạo tài khoản thành công. Chào mừng bạn!');
      res.redirect('/');
    });
  } catch (err) { next(err); }
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { title: 'Đăng nhập', error: null, email: '', next: safeNext(req.query.next) });
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const nextUrl = safeNext(req.body.next);
    const rows = await db.query('SELECT id, full_name, email, password_hash, role, is_active FROM users WHERE email = ?', [email]);
    const user = rows[0];
    const ok = user && user.is_active && await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      metrics.logins.inc({ result: 'failed' });
      req.log.warn({ event: 'login_failed', email, ip: req.ip }, 'Đăng nhập thất bại');
      return res.status(401).render('auth/login', { title: 'Đăng nhập', error: 'Email hoặc mật khẩu không đúng.', email, next: nextUrl });
    }

    metrics.logins.inc({ result: 'success' });
    req.log.info({ event: 'login_success', userId: user.id, role: user.role, ip: req.ip }, 'Đăng nhập thành công');
    // Tạo session mới sau khi đăng nhập -> chống session fixation
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = { id: user.id, name: user.full_name, email: user.email, role: user.role };
      res.redirect(user.role === 'admin' && nextUrl === '/' ? '/admin' : nextUrl);
    });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  const userId = req.session.user && req.session.user.id;
  req.session.destroy(() => {
    req.log.info({ event: 'logout', userId }, 'Đăng xuất');
    res.clearCookie('lms.sid');
    res.redirect('/');
  });
});

module.exports = router;
