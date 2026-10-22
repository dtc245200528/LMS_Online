# Đề 17 – Hệ thống Học trực tuyến (LMS đơn giản)

Môn **Triển khai và Quản trị Hệ thống Phần mềm** · Sinh viên: **Hoàng Đức Hiếu – DTC245200528**

Website **EduLite LMS** quản lý khóa học, bài học, học viên và đăng ký học. Toàn bộ hệ thống chạy bằng **Docker Compose**.

| Thành phần | Công nghệ |
|---|---|
| Ứng dụng web | Node.js 22 + Express + EJS |
| Cơ sở dữ liệu | MySQL 8.4 |
| Quản lý DB | phpMyAdmin 5.2 |
| Reverse proxy | Nginx 1.27 (unprivileged) + HTTPS tự ký |

## Chức năng

- **Học viên:** đăng ký tài khoản, xem/tìm khóa học, đăng ký học, học bài (video YouTube + nội dung), đánh dấu hoàn thành, xem tiến độ.
- **Quản trị viên:** thống kê tổng quan, CRUD khóa học và bài học, quản lý học viên (khóa/mở/xóa), quản lý lượt đăng ký.

## Chạy hệ thống

Yêu cầu: Docker + Docker Compose (Docker Desktop hoặc Docker Engine trên WSL2/Linux), cổng 80 và 443 còn trống.

```bash
git clone https://github.com/<MSSV>/lms-devops.git
cd lms-devops
./scripts/setup.sh              # sinh .env (mật khẩu mạnh), chứng chỉ HTTPS, .htpasswd
docker compose up -d --build    # khởi động toàn bộ dịch vụ
docker compose ps               # kiểm tra trạng thái (healthy)
```

| Địa chỉ | Dịch vụ | Đăng nhập |
|---|---|---|
| https://localhost/ | Website LMS | Admin: xem `ADMIN_EMAIL`/`ADMIN_PASSWORD` trong `.env` |
| https://localhost/phpmyadmin/ | phpMyAdmin | Basic Auth (`BASIC_AUTH_*`) rồi MySQL `lms_dba` / `DBA_PASSWORD` |

Trình duyệt sẽ cảnh báo chứng chỉ tự ký → chọn *Advanced → Proceed to localhost*.

## Cấu trúc thư mục

```
lms-devops/
├── app/                  # Mã nguồn ứng dụng Node.js + Dockerfile
├── db/init/              # Lược đồ, phân quyền MySQL
├── nginx/                # nginx.conf, virtual host, security headers
├── phpmyadmin/           # Cấu hình hardening phpMyAdmin
├── scripts/setup.sh      # Sinh bí mật, chứng chỉ
└── docker-compose.yml
```
