'use strict';

const crypto = require('crypto');

// Gắn thông tin người dùng + CSRF token cho mọi view
function locals(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.currentUser = req.session.user || null;
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

// Chống CSRF: mọi form POST phải gửi kèm _csrf trùng với token trong session
function csrfProtection(req, res, next) {
  if (req.method !== 'POST') return next();
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.session.csrfToken || '';
  const ok = sent.length === expected.length && expected.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) {
    req.log.warn({ event: 'csrf_rejected', path: req.path }, 'CSRF token không hợp lệ');
    return res.status(403).render('error', { title: 'Lỗi 403', message: 'Phiên làm việc không hợp lệ, vui lòng tải lại trang.' });
  }
  next();
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'warn', text: 'Vui lòng đăng nhập để tiếp tục.' };
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return requireLogin(req, res, next);
    if (req.session.user.role !== role) {
      req.log.warn({ event: 'access_denied', userId: req.session.user.id, path: req.originalUrl }, 'Truy cập bị từ chối');
      return res.status(403).render('error', { title: 'Lỗi 403', message: 'Bạn không có quyền truy cập trang này.' });
    }
    next();
  };
}

function flash(req, type, text) {
  req.session.flash = { type, text };
}

module.exports = { locals, csrfProtection, requireLogin, requireRole, flash };
