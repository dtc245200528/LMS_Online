# Các biện pháp Hardening đã áp dụng

| # | Biện pháp | Áp dụng ở đâu | Cách kiểm tra khi demo |
|---|---|---|---|
| 1 | **Container chạy non-root** | `app` (UID 1000 – user `node`), `nginx` (image *unprivileged*, UID 101), `prometheus`/`node-exporter` (UID 65534), `grafana` (472), `loki` (10001) | `docker compose exec app id` → `uid=1000(node)` |
| 2 | **Filesystem chỉ đọc** | `read_only: true` cho app, nginx, prometheus, loki, promtail, exporter; chỉ `/tmp` là tmpfs | `docker compose exec app touch /app/x` → *Read-only file system* |
| 3 | **Bỏ Linux capabilities** | `cap_drop: [ALL]` + `no-new-privileges:true` cho mọi service | `docker inspect lms-app-1 --format '{{.HostConfig.CapDrop}}'` |
| 4 | **Cô lập mạng** | 3 mạng: `frontend`, `backend` (internal), `monitoring` (internal). MySQL chỉ nằm trong `backend`, không publish cổng 3306. Chỉ Nginx mở cổng 80/443 | `docker compose ps` chỉ thấy cổng của nginx; `docker network inspect lms_backend` → `"Internal": true` |
| 5 | **Mật khẩu mạnh, không nằm trong Git** | `scripts/setup.sh` sinh mật khẩu ngẫu nhiên 24–64 ký tự vào `.env` (quyền 600); `.env`, chứng chỉ, `.htpasswd` nằm trong `.gitignore`. Mật khẩu người dùng băm **bcrypt** (cost 12) và yêu cầu ≥ 8 ký tự gồm chữ + số | `git status` không thấy `.env`; xem bảng `users` trong phpMyAdmin chỉ có hash |
| 6 | **Hạn chế quyền CSDL** | `lms_app` chỉ có SELECT/INSERT/UPDATE/DELETE trên DB `lms`; `lms_dba` (phpMyAdmin) chỉ quyền trên DB `lms`; `exporter` chỉ đọc, tối đa 3 kết nối; `root` chỉ đăng nhập từ localhost trong container; phpMyAdmin cấm đăng nhập root | phpMyAdmin → tab *User accounts* hoặc `SHOW GRANTS FOR 'lms_app'@'%';` |
| 7 | **HTTPS + security headers Nginx** | TLS 1.2/1.3, HTTP → HTTPS 301, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, ẩn phiên bản (`server_tokens off`) | `curl -skI https://localhost/` |
| 8 | **Chặn endpoint nội bộ** | `/metrics`, `/readyz`, file ẩn (`/.env`, `/.git`) trả 404 qua Nginx; stub_status chỉ cho mạng nội bộ | `curl -sk -o /dev/null -w '%{http_code}' https://localhost/metrics` → 404 |
| 9 | **Chống brute-force / DoS** | Nginx `limit_req` 10 req/phút cho `/login`, 20 req/s chung, `limit_conn`; ứng dụng giới hạn 10 lần đăng nhập / 15 phút; cảnh báo Prometheus `LoginBruteForce` | Chạy `scripts/demo-traffic.sh` hoặc gửi liên tục POST /login → HTTP 429 |
| 10 | **Basic Auth cho công cụ quản trị** | `/phpmyadmin/` và `/prometheus/` yêu cầu Basic Auth trước | Mở trình duyệt → hộp thoại đăng nhập |
| 11 | **Bảo mật ứng dụng** | Helmet (CSP chặn inline script), CSRF token cho mọi form POST, cookie `HttpOnly` + `Secure` + `SameSite=Lax`, tạo lại session khi đăng nhập, truy vấn SQL tham số hóa, kiểm tra dữ liệu đầu vào, ẩn stack trace | Xem header `Content-Security-Policy`; POST thiếu `_csrf` → 403 |
| 12 | **Giới hạn tài nguyên & log** | `deploy.resources.limits` (RAM/CPU) cho từng service; log Docker xoay vòng 10 MB × 3 file | `docker stats` |

## Ngoại lệ có chủ đích (và lý do)

- **cAdvisor** chạy `privileged` vì phải đọc cgroup và thông tin Docker của máy chủ. Container này chỉ nằm trong mạng `monitoring` (internal), không publish cổng.
- **Promtail** mount `/var/run/docker.sock` để đọc log container. Mount `:ro` chỉ ngăn ghi file socket, **không** chặn được lệnh gửi qua Docker API, nên Promtail không được expose ra ngoài. Môi trường production nên dùng *docker-socket-proxy* chỉ cho phép đọc container/log.
- **MySQL, phpMyAdmin** khởi động bằng root rồi tự hạ quyền xuống user `mysql` / `www-data` (cơ chế của image chính thức).
