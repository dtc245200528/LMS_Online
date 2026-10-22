'use strict';

const express = require('express');
const metrics = require('../metrics');
const { requireLogin, flash } = require('../middleware/auth');

const router = express.Router();

function toId(v) {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Chuyển link YouTube thường -> link nhúng (chỉ chấp nhận YouTube)
function embedUrl(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

async function isEnrolled(db, userId, courseId) {
  const rows = await db.query('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
  return rows.length > 0;
}

// Trang chủ: danh sách khóa học đã xuất bản + tìm kiếm
router.get('/', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const q = String(req.query.q || '').trim().slice(0, 100);
    const params = [];
    let where = 'WHERE c.is_published = 1';
    if (q) {
      where += ' AND (c.title LIKE ? OR c.description LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    const courses = await db.query(
      `SELECT c.id, c.title, c.description, c.instructor, c.level,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count
         FROM courses c ${where}
        ORDER BY c.created_at DESC`,
      params,
    );
    res.render('courses/index', { title: 'Khóa học', courses, q });
  } catch (err) { next(err); }
});

// Chi tiết khóa học
router.get('/courses/:id', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const id = toId(req.params.id);
    if (!id) return res.status(404).render('error', { title: 'Không tìm thấy', message: 'Khóa học không tồn tại.' });
    const user = req.session.user;
    const isAdmin = user && user.role === 'admin';
    const rows = await db.query('SELECT * FROM courses WHERE id = ?', [id]);
    const course = rows[0];
    if (!course || (!course.is_published && !isAdmin)) {
      return res.status(404).render('error', { title: 'Không tìm thấy', message: 'Khóa học không tồn tại.' });
    }
    const lessons = await db.query(
      'SELECT id, title, duration_minutes, position FROM lessons WHERE course_id = ? ORDER BY position, id',
      [id],
    );
    let enrolled = false;
    let completed = new Set();
    if (user) {
      enrolled = await isEnrolled(db, user.id, id);
      if (enrolled) {
        const done = await db.query(
          `SELECT lp.lesson_id FROM lesson_progress lp
             JOIN lessons l ON l.id = lp.lesson_id
            WHERE lp.user_id = ? AND l.course_id = ?`,
          [user.id, id],
        );
        completed = new Set(done.map((r) => r.lesson_id));
      }
    }
    const countRows = await db.query('SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ?', [id]);
    res.render('courses/show', {
      title: course.title,
      course,
      lessons,
      enrolled,
      canView: enrolled || isAdmin,
      completed,
      studentCount: Number(countRows[0].c),
    });
  } catch (err) { next(err); }
});

// Học viên đăng ký khóa học
router.post('/courses/:id/enroll', requireLogin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const id = toId(req.params.id);
    const user = req.session.user;
    if (user.role !== 'student') {
      flash(req, 'warn', 'Chỉ tài khoản học viên mới đăng ký khóa học.');
      return res.redirect(`/courses/${id}`);
    }
    const rows = await db.query('SELECT id, title FROM courses WHERE id = ? AND is_published = 1', [id]);
    if (!rows.length) return res.status(404).render('error', { title: 'Không tìm thấy', message: 'Khóa học không tồn tại.' });
    const result = await db.query('INSERT IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)', [user.id, id]);
    if (result.affectedRows) {
      metrics.enrollments.inc({ action: 'enroll' });
      req.log.info({ event: 'course_enrolled', userId: user.id, courseId: id }, 'Học viên đăng ký khóa học');
      flash(req, 'ok', `Đăng ký thành công khóa "${rows[0].title}".`);
    }
    res.redirect(`/courses/${id}`);
  } catch (err) { next(err); }
});

// Học viên hủy đăng ký
router.post('/courses/:id/unenroll', requireLogin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const id = toId(req.params.id);
    const user = req.session.user;
    const result = await db.query('DELETE FROM enrollments WHERE user_id = ? AND course_id = ?', [user.id, id]);
    if (result.affectedRows) {
      metrics.enrollments.inc({ action: 'unenroll' });
      req.log.info({ event: 'course_unenrolled', userId: user.id, courseId: id }, 'Học viên hủy đăng ký');
      flash(req, 'ok', 'Đã hủy đăng ký khóa học.');
    }
    res.redirect(`/courses/${id}`);
  } catch (err) { next(err); }
});

// Xem bài học (chỉ học viên đã đăng ký hoặc admin)
router.get('/courses/:id/lessons/:lessonId', requireLogin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const id = toId(req.params.id);
    const lessonId = toId(req.params.lessonId);
    const user = req.session.user;
    const courseRows = await db.query('SELECT id, title, is_published FROM courses WHERE id = ?', [id]);
    const course = courseRows[0];
    if (!course) return res.status(404).render('error', { title: 'Không tìm thấy', message: 'Khóa học không tồn tại.' });
    if (user.role !== 'admin' && !(await isEnrolled(db, user.id, id))) {
      flash(req, 'warn', 'Bạn cần đăng ký khóa học để xem bài học.');
      return res.redirect(`/courses/${id}`);
    }
    const lessons = await db.query('SELECT id, title FROM lessons WHERE course_id = ? ORDER BY position, id', [id]);
    const idx = lessons.findIndex((l) => l.id === lessonId);
    if (idx === -1) return res.status(404).render('error', { title: 'Không tìm thấy', message: 'Bài học không tồn tại.' });
    const lessonRows = await db.query('SELECT * FROM lessons WHERE id = ?', [lessonId]);
    const lesson = lessonRows[0];
    const done = await db.query('SELECT 1 FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', [user.id, lessonId]);
    res.render('courses/lesson', {
      title: lesson.title,
      course,
      lesson,
      video: embedUrl(lesson.video_url),
      prev: lessons[idx - 1] || null,
      next: lessons[idx + 1] || null,
      position: idx + 1,
      total: lessons.length,
      isDone: done.length > 0,
    });
  } catch (err) { next(err); }
});

// Đánh dấu hoàn thành bài học
router.post('/courses/:id/lessons/:lessonId/complete', requireLogin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const id = toId(req.params.id);
    const lessonId = toId(req.params.lessonId);
    const user = req.session.user;
    if (!(await isEnrolled(db, user.id, id))) return res.redirect(`/courses/${id}`);
    const check = await db.query('SELECT id FROM lessons WHERE id = ? AND course_id = ?', [lessonId, id]);
    if (!check.length) return res.status(404).render('error', { title: 'Không tìm thấy', message: 'Bài học không tồn tại.' });
    const result = await db.query('INSERT IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)', [user.id, lessonId]);
    if (result.affectedRows) {
      metrics.lessonCompletions.inc();
      req.log.info({ event: 'lesson_completed', userId: user.id, courseId: id, lessonId }, 'Hoàn thành bài học');
    }
    res.redirect(`/courses/${id}/lessons/${lessonId}`);
  } catch (err) { next(err); }
});

// Khóa học của tôi + tiến độ
router.get('/my-courses', requireLogin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const courses = await db.query(
      `SELECT c.id, c.title, c.instructor, e.enrolled_at,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS total,
              (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
                WHERE lp.user_id = e.user_id AND l.course_id = c.id) AS done
         FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = ?
        ORDER BY e.enrolled_at DESC`,
      [req.session.user.id],
    );
    res.render('courses/my', { title: 'Khóa học của tôi', courses });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.embedUrl = embedUrl;
