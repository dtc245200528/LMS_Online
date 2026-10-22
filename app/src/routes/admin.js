'use strict';

const express = require('express');
const { requireRole, flash } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

const LEVELS = ['Cơ bản', 'Trung cấp', 'Nâng cao'];

function toId(v) {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validateCourse(body) {
  const form = {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    instructor: String(body.instructor || '').trim(),
    level: LEVELS.includes(body.level) ? body.level : LEVELS[0],
    is_published: body.is_published === '1' ? 1 : 0,
  };
  const errors = [];
  if (form.title.length < 3 || form.title.length > 200) errors.push('Tên khóa học từ 3 đến 200 ký tự.');
  if (form.description.length > 5000) errors.push('Mô tả tối đa 5000 ký tự.');
  if (!form.instructor || form.instructor.length > 100) errors.push('Vui lòng nhập giảng viên (tối đa 100 ký tự).');
  return { form, errors };
}

function validateLesson(body) {
  const form = {
    title: String(body.title || '').trim(),
    content: String(body.content || '').trim(),
    video_url: String(body.video_url || '').trim(),
    duration_minutes: Number.parseInt(body.duration_minutes, 10) || 0,
    position: Number.parseInt(body.position, 10) || 1,
  };
  const errors = [];
  if (form.title.length < 3 || form.title.length > 200) errors.push('Tên bài học từ 3 đến 200 ký tự.');
  if (form.content.length > 50000) errors.push('Nội dung quá dài.');
  if (form.video_url && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(form.video_url)) errors.push('Chỉ chấp nhận link YouTube (https).');
  if (form.duration_minutes < 0 || form.duration_minutes > 600) errors.push('Thời lượng 0 - 600 phút.');
  if (form.position < 1 || form.position > 1000) errors.push('Thứ tự 1 - 1000.');
  return { form, errors };
}

// ----- Tổng quan -----
router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const [stats] = await db.query(
      `SELECT (SELECT COUNT(*) FROM courses) AS courses,
              (SELECT COUNT(*) FROM lessons) AS lessons,
              (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
              (SELECT COUNT(*) FROM enrollments) AS enrollments`,
    );
    const recent = await db.query(
      `SELECT e.id, e.enrolled_at, u.full_name, u.email, c.title
         FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
        ORDER BY e.enrolled_at DESC LIMIT 8`,
    );
    res.render('admin/dashboard', { title: 'Quản trị', stats, recent });
  } catch (err) { next(err); }
});

// ----- Khóa học -----
router.get('/courses', async (req, res, next) => {
  try {
    const courses = await req.app.locals.db.query(
      `SELECT c.*, (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count
         FROM courses c ORDER BY c.created_at DESC`,
    );
    res.render('admin/courses', { title: 'Quản lý khóa học', courses });
  } catch (err) { next(err); }
});

router.get('/courses/new', (req, res) => {
  res.render('admin/course-form', { title: 'Thêm khóa học', form: { level: LEVELS[0], is_published: 1 }, errors: [], action: '/admin/courses', levels: LEVELS });
});

router.post('/courses', async (req, res, next) => {
  try {
    const { form, errors } = validateCourse(req.body);
    if (errors.length) return res.status(400).render('admin/course-form', { title: 'Thêm khóa học', form, errors, action: '/admin/courses', levels: LEVELS });
    const r = await req.app.locals.db.query(
      'INSERT INTO courses (title, description, instructor, level, is_published) VALUES (?, ?, ?, ?, ?)',
      [form.title, form.description, form.instructor, form.level, form.is_published],
    );
    req.log.info({ event: 'course_created', courseId: r.insertId, adminId: req.session.user.id }, 'Tạo khóa học');
    flash(req, 'ok', 'Đã thêm khóa học.');
    res.redirect(`/admin/courses/${r.insertId}/lessons`);
  } catch (err) { next(err); }
});

router.get('/courses/:id/edit', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const rows = await req.app.locals.db.query('SELECT * FROM courses WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).render('error', { title: 'Không tìm thấy', message: 'Khóa học không tồn tại.' });
    res.render('admin/course-form', { title: 'Sửa khóa học', form: rows[0], errors: [], action: `/admin/courses/${id}`, levels: LEVELS });
  } catch (err) { next(err); }
});

router.post('/courses/:id', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const { form, errors } = validateCourse(req.body);
    if (errors.length) return res.status(400).render('admin/course-form', { title: 'Sửa khóa học', form, errors, action: `/admin/courses/${id}`, levels: LEVELS });
    await req.app.locals.db.query(
      'UPDATE courses SET title = ?, description = ?, instructor = ?, level = ?, is_published = ? WHERE id = ?',
      [form.title, form.description, form.instructor, form.level, form.is_published, id],
    );
    req.log.info({ event: 'course_updated', courseId: id, adminId: req.session.user.id }, 'Sửa khóa học');
    flash(req, 'ok', 'Đã cập nhật khóa học.');
    res.redirect('/admin/courses');
  } catch (err) { next(err); }
});

router.post('/courses/:id/delete', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    await req.app.locals.db.query('DELETE FROM courses WHERE id = ?', [id]);
    req.log.warn({ event: 'course_deleted', courseId: id, adminId: req.session.user.id }, 'Xóa khóa học');
    flash(req, 'ok', 'Đã xóa khóa học (kèm bài học và lượt đăng ký).');
    res.redirect('/admin/courses');
  } catch (err) { next(err); }
});

// ----- Bài học -----
async function loadCourse(req, res) {
  const id = toId(req.params.id);
  const rows = await req.app.locals.db.query('SELECT id, title FROM courses WHERE id = ?', [id]);
  if (!rows.length) {
    res.status(404).render('error', { title: 'Không tìm thấy', message: 'Khóa học không tồn tại.' });
    return null;
  }
  return rows[0];
}

router.get('/courses/:id/lessons', async (req, res, next) => {
  try {
    const course = await loadCourse(req, res);
    if (!course) return;
    const lessons = await req.app.locals.db.query(
      'SELECT id, title, duration_minutes, position FROM lessons WHERE course_id = ? ORDER BY position, id',
      [course.id],
    );
    res.render('admin/lessons', { title: `Bài học - ${course.title}`, course, lessons });
  } catch (err) { next(err); }
});

router.get('/courses/:id/lessons/new', async (req, res, next) => {
  try {
    const course = await loadCourse(req, res);
    if (!course) return;
    const [{ n }] = await req.app.locals.db.query('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM lessons WHERE course_id = ?', [course.id]);
    res.render('admin/lesson-form', { title: 'Thêm bài học', course, form: { position: n, duration_minutes: 10 }, errors: [], action: `/admin/courses/${course.id}/lessons` });
  } catch (err) { next(err); }
});

router.post('/courses/:id/lessons', async (req, res, next) => {
  try {
    const course = await loadCourse(req, res);
    if (!course) return;
    const { form, errors } = validateLesson(req.body);
    if (errors.length) return res.status(400).render('admin/lesson-form', { title: 'Thêm bài học', course, form, errors, action: `/admin/courses/${course.id}/lessons` });
    const r = await req.app.locals.db.query(
      'INSERT INTO lessons (course_id, title, content, video_url, duration_minutes, position) VALUES (?, ?, ?, ?, ?, ?)',
      [course.id, form.title, form.content, form.video_url || null, form.duration_minutes, form.position],
    );
    req.log.info({ event: 'lesson_created', lessonId: r.insertId, courseId: course.id, adminId: req.session.user.id }, 'Tạo bài học');
    flash(req, 'ok', 'Đã thêm bài học.');
    res.redirect(`/admin/courses/${course.id}/lessons`);
  } catch (err) { next(err); }
});

router.get('/courses/:id/lessons/:lessonId/edit', async (req, res, next) => {
  try {
    const course = await loadCourse(req, res);
    if (!course) return;
    const rows = await req.app.locals.db.query('SELECT * FROM lessons WHERE id = ? AND course_id = ?', [toId(req.params.lessonId), course.id]);
    if (!rows.length) return res.status(404).render('error', { title: 'Không tìm thấy', message: 'Bài học không tồn tại.' });
    res.render('admin/lesson-form', { title: 'Sửa bài học', course, form: rows[0], errors: [], action: `/admin/courses/${course.id}/lessons/${rows[0].id}` });
  } catch (err) { next(err); }
});

router.post('/courses/:id/lessons/:lessonId', async (req, res, next) => {
  try {
    const course = await loadCourse(req, res);
    if (!course) return;
    const lessonId = toId(req.params.lessonId);
    const { form, errors } = validateLesson(req.body);
    if (errors.length) return res.status(400).render('admin/lesson-form', { title: 'Sửa bài học', course, form, errors, action: `/admin/courses/${course.id}/lessons/${lessonId}` });
    await req.app.locals.db.query(
      'UPDATE lessons SET title = ?, content = ?, video_url = ?, duration_minutes = ?, position = ? WHERE id = ? AND course_id = ?',
      [form.title, form.content, form.video_url || null, form.duration_minutes, form.position, lessonId, course.id],
    );
    req.log.info({ event: 'lesson_updated', lessonId, courseId: course.id, adminId: req.session.user.id }, 'Sửa bài học');
    flash(req, 'ok', 'Đã cập nhật bài học.');
    res.redirect(`/admin/courses/${course.id}/lessons`);
  } catch (err) { next(err); }
});

router.post('/courses/:id/lessons/:lessonId/delete', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const lessonId = toId(req.params.lessonId);
    await req.app.locals.db.query('DELETE FROM lessons WHERE id = ? AND course_id = ?', [lessonId, id]);
    req.log.warn({ event: 'lesson_deleted', lessonId, courseId: id, adminId: req.session.user.id }, 'Xóa bài học');
    flash(req, 'ok', 'Đã xóa bài học.');
    res.redirect(`/admin/courses/${id}/lessons`);
  } catch (err) { next(err); }
});

// ----- Học viên -----
router.get('/students', async (req, res, next) => {
  try {
    const students = await req.app.locals.db.query(
      `SELECT u.id, u.full_name, u.email, u.is_active, u.created_at,
              (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS course_count
         FROM users u WHERE u.role = 'student' ORDER BY u.created_at DESC`,
    );
    res.render('admin/students', { title: 'Quản lý học viên', students });
  } catch (err) { next(err); }
});

router.post('/students/:id/toggle', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    await req.app.locals.db.query("UPDATE users SET is_active = 1 - is_active WHERE id = ? AND role = 'student'", [id]);
    req.log.warn({ event: 'student_toggled', studentId: id, adminId: req.session.user.id }, 'Khóa/mở khóa học viên');
    flash(req, 'ok', 'Đã cập nhật trạng thái học viên.');
    res.redirect('/admin/students');
  } catch (err) { next(err); }
});

router.post('/students/:id/delete', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    await req.app.locals.db.query("DELETE FROM users WHERE id = ? AND role = 'student'", [id]);
    req.log.warn({ event: 'student_deleted', studentId: id, adminId: req.session.user.id }, 'Xóa học viên');
    flash(req, 'ok', 'Đã xóa học viên.');
    res.redirect('/admin/students');
  } catch (err) { next(err); }
});

// ----- Đăng ký học -----
router.get('/enrollments', async (req, res, next) => {
  try {
    const enrollments = await req.app.locals.db.query(
      `SELECT e.id, e.enrolled_at, u.full_name, u.email, c.id AS course_id, c.title,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS total,
              (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
                WHERE lp.user_id = u.id AND l.course_id = c.id) AS done
         FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
        ORDER BY e.enrolled_at DESC`,
    );
    res.render('admin/enrollments', { title: 'Danh sách đăng ký', enrollments });
  } catch (err) { next(err); }
});

router.post('/enrollments/:id/delete', async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    await req.app.locals.db.query('DELETE FROM enrollments WHERE id = ?', [id]);
    req.log.warn({ event: 'enrollment_deleted', enrollmentId: id, adminId: req.session.user.id }, 'Admin hủy đăng ký');
    flash(req, 'ok', 'Đã hủy lượt đăng ký.');
    res.redirect('/admin/enrollments');
  } catch (err) { next(err); }
});

module.exports = router;
