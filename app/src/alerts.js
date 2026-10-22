'use strict';

// Nhận cảnh báo từ Alertmanager (webhook) và giữ 50 cảnh báo gần nhất trong bộ nhớ
// để hiển thị trên trang quản trị. Mỗi cảnh báo đồng thời được ghi log JSON
// (event="security_alert") nên luôn truy vết lại được trên Loki.
const express = require('express');

const MAX = 50;
const store = [];

function recent(limit = 10) {
  return store.slice(0, limit);
}

function firing() {
  const latest = new Map();
  for (const a of store) if (!latest.has(a.fingerprint)) latest.set(a.fingerprint, a);
  return [...latest.values()].filter((a) => a.status === 'firing');
}

const router = express.Router();

router.post('/internal/alerts', express.json({ limit: '256kb' }), (req, res) => {
  // Chỉ nhận gọi trực tiếp trong mạng Docker nội bộ (Alertmanager -> app:3000).
  // Request đi qua Nginx luôn có X-Forwarded-For -> từ chối (Nginx cũng chặn /internal/).
  if (req.get('x-forwarded-for')) return res.status(404).end();

  const alerts = (req.body && Array.isArray(req.body.alerts)) ? req.body.alerts : [];
  for (const a of alerts) {
    const item = {
      fingerprint: a.fingerprint || `${a.labels && a.labels.alertname}-${a.startsAt}`,
      status: a.status,
      alertname: a.labels && a.labels.alertname,
      severity: a.labels && a.labels.severity,
      category: a.labels && a.labels.category,
      summary: a.annotations && a.annotations.summary,
      description: a.annotations && a.annotations.description,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      receivedAt: new Date().toISOString(),
    };
    store.unshift(item);
    const level = item.status === 'firing' ? 'error' : 'info';
    req.log[level]({ event: 'security_alert', ...item }, `[ALERT ${String(item.status).toUpperCase()}] ${item.alertname}: ${item.summary}`);
  }
  store.splice(MAX);
  res.json({ received: alerts.length });
});

module.exports = { router, recent, firing };
