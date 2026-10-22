# Truy vấn log bằng LogQL (Loki)

Mở **Grafana → Explore → chọn datasource `Loki`**, dán từng truy vấn dưới đây.
Hoặc mở dashboard **LMS › LMS - Log tập trung (Loki)**.

Nhãn (label) Promtail gắn cho mỗi dòng log:

| Nhãn | Ý nghĩa | Ví dụ |
|---|---|---|
| `project` | Tên project Compose | `lms` |
| `service` | Tên service trong docker-compose | `app`, `nginx`, `mysql`, `grafana` |
| `container` | Tên container | `lms-app-1` |
| `stream` | stdout / stderr | `stdout` |
| `level` | Mức log của ứng dụng (chỉ service `app`) | `info`, `warn`, `error` |
| `status_class` | Nhóm mã HTTP của Nginx | `2xx`, `4xx`, `5xx` |

Ứng dụng ghi log JSON, mỗi dòng có trường `event` mô tả nghiệp vụ:
`login_success`, `login_failed`, `user_registered`, `course_enrolled`, `course_unenrolled`,
`lesson_completed`, `course_created`, `course_deleted`, `access_denied`, `csrf_rejected`, `http_request`...

---

## 1. Xem toàn bộ log của ứng dụng LMS

```logql
{service="app"}
```

## 2. Lọc các lần đăng nhập thất bại (phát hiện dò mật khẩu)

```logql
{service="app"} | json | event="login_failed"
```

Đếm số lần thất bại theo email trong 15 phút, sắp xếp giảm dần:

```logql
sort_desc(sum by (email) (count_over_time({service="app"} | json | event="login_failed" [15m])))
```

## 3. Request lỗi trên Nginx (mã >= 400)

```logql
{service="nginx", stream="stdout"} | json | status >= 400
```

Số request mỗi phút theo nhóm mã trạng thái:

```logql
sum by (status_class) (count_over_time({service="nginx", stream="stdout"}[1m]))
```

## 4. Hoạt động học tập: ai đăng ký khóa học nào

```logql
{service="app"} | json | event="course_enrolled"
  | line_format "Học viên #{{.userId}} đăng ký khóa #{{.courseId}}"
```

## 5. Tìm lỗi / cảnh báo trên toàn hệ thống

```logql
{project="lms"} |~ "(?i)(error|denied|fail)"
```

Chỉ log mức `error` hoặc `warn` của ứng dụng:

```logql
{service="app", level=~"error|warn"}
```

## 6. Top 5 đường dẫn được truy cập nhiều nhất trong 1 giờ

```logql
topk(5, sum by (uri) (count_over_time({service="nginx", stream="stdout"} | json [1h])))
```

## 7. Request chậm (> 0.5 giây)

```logql
{service="nginx", stream="stdout"} | json | request_time > 0.5
```

---

### Sinh dữ liệu để demo

```bash
./scripts/demo-traffic.sh      # tạo lượt xem trang, đăng nhập sai, lỗi 404
```

Sau khoảng 15–30 giây, chạy lại các truy vấn trên sẽ thấy kết quả.
