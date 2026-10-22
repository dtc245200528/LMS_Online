# Kịch bản sự cố an toàn thông tin: Dò mật khẩu (Brute-force)

Phần này minh họa chu trình **phát hiện → cảnh báo → truy vết** một sự cố ATTT thật trên hệ thống.

## 1. Tình huống

Kẻ tấn công thử đăng nhập tài khoản quản trị bằng nhiều mật khẩu khác nhau
(tấn công dò mật khẩu / brute-force) vào `https://localhost/login`.

Mô phỏng bằng script có sẵn (gửi 8 lần đăng nhập sai liên tiếp):

```bash
./scripts/demo-traffic.sh
```

## 2. Hệ thống phản ứng theo nhiều lớp

| Lớp | Cơ chế | Kết quả |
|---|---|---|
| Ứng dụng | Đếm `lms_logins_total{result="failed"}`, ghi log JSON `event="login_failed"` | Mỗi lần sai được ghi nhận |
| Nginx | `limit_req` 10 req/phút cho POST /login | Sau vài lần, trả **HTTP 429** |
| Ứng dụng | `express-rate-limit`, ghi `event="login_rate_limited"`, `lms_logins_total{result="blocked"}` | Chặn ở tầng ứng dụng |

## 3. Cảnh báo qua Alert

- **Prometheus** đánh giá luật `LoginBruteForce` (nhóm `lms-security`):
  `sum(increase(lms_logins_total{result=~"failed|blocked"}[5m])) > 10`.
  Khi vượt ngưỡng, luật chuyển sang trạng thái **FIRING**.
- Prometheus đẩy cảnh báo sang **Alertmanager**. Alertmanager gom nhóm,
  chống lặp (repeat sau 1 giờ) rồi gửi webhook tới ứng dụng
  (`http://app:3000/internal/alerts`).
- Cảnh báo hiển thị ngay trên **trang Quản trị** (khung đỏ "Cảnh báo an ninh
  đang kích hoạt" + bảng "Nhật ký cảnh báo") và trên giao diện
  `https://localhost/alertmanager/`.

## 4. Truy vết log (Loki)

Mỗi cảnh báo nhận được còn được ứng dụng ghi log JSON `event="security_alert"`,
nên từ cảnh báo có thể lần ngược về log gốc. Trên **Grafana → Explore → Loki**:

```logql
# Các lần đăng nhập thất bại và bị chặn
{service="app"} | json | event=~"login_failed|login_rate_limited"

# Xem IP nào gây ra, đếm theo email bị thử
sum by (email) (count_over_time({service="app"} | json | event="login_failed" [15m]))

# Lịch sử cảnh báo mà hệ thống đã bắn
{service="app"} | json | event="security_alert"
```

Từ log xác định được: thời điểm, IP nguồn (`remote_addr`), các email bị thử và
số lần. Đây chính là bằng chứng để xử lý sự cố.

## 5. Khi tấn công dừng

Số lần đăng nhập sai trong 5 phút giảm về dưới ngưỡng → luật chuyển **RESOLVED**,
Alertmanager gửi webhook `status="resolved"`, dòng trong "Nhật ký cảnh báo"
đổi sang màu xanh.
