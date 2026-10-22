// Hỏi xác nhận trước khi xóa (không dùng inline script vì CSP chặn)
document.addEventListener('submit', function (e) {
  var msg = e.target.getAttribute('data-confirm');
  if (msg && !window.confirm(msg)) e.preventDefault();
});
