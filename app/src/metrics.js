'use strict';

const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ app: 'lms' });
client.collectDefaultMetrics({ register, prefix: 'lms_node_' });

// ---- Metrics kỹ thuật (RED: Rate - Errors - Duration) ----
const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Tổng số HTTP request',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý HTTP request (giây)',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// ---- Metrics nghiệp vụ LMS ----
const logins = new client.Counter({
  name: 'lms_logins_total',
  help: 'Số lần đăng nhập theo kết quả',
  labelNames: ['result'],
  registers: [register],
});

const registrations = new client.Counter({
  name: 'lms_registrations_total',
  help: 'Số tài khoản học viên được tạo',
  registers: [register],
});

const enrollments = new client.Counter({
  name: 'lms_enrollments_total',
  help: 'Số lượt đăng ký / hủy đăng ký khóa học',
  labelNames: ['action'],
  registers: [register],
});

const lessonCompletions = new client.Counter({
  name: 'lms_lesson_completions_total',
  help: 'Số lượt hoàn thành bài học',
  registers: [register],
});

// Gauge đọc trực tiếp từ DB mỗi lần Prometheus scrape
function registerDbGauges(db) {
  const defs = [
    ['lms_courses', 'Số khóa học hiện có', 'SELECT COUNT(*) AS c FROM courses'],
    ['lms_lessons', 'Số bài học hiện có', 'SELECT COUNT(*) AS c FROM lessons'],
    ['lms_students', 'Số học viên', "SELECT COUNT(*) AS c FROM users WHERE role = 'student'"],
    ['lms_active_enrollments', 'Số lượt đăng ký đang hoạt động', 'SELECT COUNT(*) AS c FROM enrollments'],
  ];
  for (const [name, help, sql] of defs) {
    new client.Gauge({
      name,
      help,
      registers: [register],
      async collect() {
        try {
          const rows = await db.query(sql);
          this.set(Number(rows[0].c));
        } catch {
          // DB lỗi thì bỏ qua, không làm hỏng /metrics
        }
      },
    });
  }
}

// Middleware đo request. Dùng route pattern (/courses/:id) thay vì URL thật
// để tránh bùng nổ số lượng label (high cardinality).
function httpMetricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : (res.statusCode === 404 ? 'not_found' : 'other');
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequests.inc(labels);
    end(labels);
  });
  next();
}

module.exports = {
  register,
  registerDbGauges,
  httpMetricsMiddleware,
  logins,
  registrations,
  enrollments,
  lessonCompletions,
};
