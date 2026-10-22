'use strict';

// Chạy: npm test  (dùng node:test có sẵn + supertest, không cần MySQL thật)
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.LOG_LEVEL = 'silent';
const { createApp } = require('../src/app');
const { embedUrl } = require('../src/routes/courses');

// DB giả: trả dữ liệu theo nội dung câu SQL
const fakeDb = {
  async ping() { return true; },
  async query(sql) {
    if (/FROM courses c/.test(sql)) {
      return [{ id: 1, title: 'Docker cơ bản', description: 'Học Docker', instructor: 'GV A', level: 'Cơ bản', lesson_count: 3, student_count: 5 }];
    }
    if (/FROM users WHERE email/.test(sql)) return [];
    return [{ c: 0 }];
  },
};

const app = createApp({ db: fakeDb });

function csrfFrom(html) {
  const m = html.match(/name="_csrf" value="([a-f0-9]+)"/);
  return m && m[1];
}

test('GET /healthz trả 200', async () => {
  const res = await request(app).get('/healthz');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
});

test('GET /readyz kiểm tra DB', async () => {
  const res = await request(app).get('/readyz');
  assert.strictEqual(res.status, 200);
});

test('GET /metrics có metrics Prometheus', async () => {
  await request(app).get('/healthz');
  const res = await request(app).get('/metrics');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /http_requests_total/);
  assert.match(res.text, /lms_logins_total/);
});

test('Trang chủ hiển thị khóa học + security headers', async () => {
  const res = await request(app).get('/');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Docker cơ bản/);
  assert.ok(res.headers['content-security-policy']);
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(res.headers['x-powered-by'], undefined);
});

test('POST không có CSRF token bị chặn 403', async () => {
  const res = await request(app).post('/login').type('form').send({ email: 'a@b.com', password: 'x' });
  assert.strictEqual(res.status, 403);
});

test('Đăng nhập sai trả 401', async () => {
  const agent = request.agent(app);
  const page = await agent.get('/login');
  const token = csrfFrom(page.text);
  assert.ok(token, 'form phải có CSRF token');
  const res = await agent.post('/login').type('form').send({ _csrf: token, email: 'nobody@test.vn', password: 'Sai12345' });
  assert.strictEqual(res.status, 401);
});

test('Đăng ký với dữ liệu không hợp lệ trả 400', async () => {
  const agent = request.agent(app);
  const token = csrfFrom((await agent.get('/register')).text);
  const res = await agent.post('/register').type('form').send({ _csrf: token, full_name: 'A', email: 'sai', password: '123', confirm: '456' });
  assert.strictEqual(res.status, 400);
  assert.match(res.text, /Email không hợp lệ/);
});

test('Trang cần đăng nhập chuyển hướng về /login', async () => {
  const res = await request(app).get('/my-courses');
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.location, /^\/login/);
  const admin = await request(app).get('/admin');
  assert.strictEqual(admin.status, 302);
});

test('URL lạ trả 404', async () => {
  const res = await request(app).get('/khong-ton-tai');
  assert.strictEqual(res.status, 404);
});

test('embedUrl chỉ nhận link YouTube', () => {
  assert.strictEqual(embedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.strictEqual(embedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.strictEqual(embedUrl('https://evil.com/x'), null);
});
