# Đề 17 – Hệ thống Học trực tuyến (LMS đơn giản)

Môn **Triển khai và Quản trị Hệ thống Phần mềm** · Sinh viên: **Hoàng Đức Hiếu – DTC245200528**

Website **EduLite LMS** quản lý khóa học, bài học, học viên và đăng ký học, được triển khai hoàn toàn bằng **Docker Compose** cùng reverse proxy, giám sát, log tập trung và các biện pháp hardening.

| Thành phần | Công nghệ |
|---|---|
| Ứng dụng web | Node.js 22 + Express + EJS |
| Cơ sở dữ liệu | MySQL 8.4 |
| Quản lý DB | phpMyAdmin 5.2 |
| Reverse proxy | Nginx 1.27 (unprivileged) + HTTPS tự ký |
| Cảnh báo | Alertmanager 0.27 (webhook về ứng dụng, hiện trên trang quản trị) |
| Giám sát | Prometheus 2.55 + Grafana 11.3, node-exporter, cAdvisor, mysqld-exporter, nginx-exporter |
| Log tập trung | Loki 3.3 + Promtail 3.3, truy vấn bằng LogQL |

## Kiến trúc

```
                    Trình duyệt
                         │ HTTPS 443 (HTTP 80 → 301)
                ┌────────▼─────────┐
                │      Nginx       │  reverse proxy, TLS, security headers, rate limit
                └─┬──────┬───────┬─┘
     frontend     │      │       │
        ┌─────────▼┐ ┌───▼────┐ ┌▼──────────────────┐
        │ LMS app  │ │phpMyAdm│ │ Grafana/Prometheus│
        └────┬─────┘ └───┬────┘ └───┬───────────────┘
 backend     │ (internal)│          │ monitoring (internal)
        ┌────▼───────────▼┐   ┌─────▼───────────────────────────────┐
        │    MySQL 8.4    │◄──┤ mysqld-exporter, nginx-exporter,     │
        └─────────────────┘   │ cAdvisor, node-exporter, Loki,       │
                              │ Promtail (đọc log mọi container)     │
                              └──────────────────────────────────────┘
```

## Chức năng ứng dụng

- **Học viên:** đăng ký tài khoản, xem/tìm khóa học, đăng ký học, học bài (video YouTube + nội dung), đánh dấu hoàn thành, xem tiến độ ở *Khóa học của tôi*.
- **Quản trị viên:** thống kê tổng quan, thêm/sửa/xóa khóa học và bài học, quản lý học viên (khóa/mở/xóa), quản lý lượt đăng ký.

## Chạy hệ thống

**Yêu cầu:** Docker + Docker Compose v2 (Docker Desktop hoặc Docker Engine trên WSL2/Linux), cổng **80** và **443** còn trống.

```bash
git clone https://github.com/dtc245200528/LMS_Online.git
cd LMS_Online
chmod +x scripts/*.sh db/init/*.sh
./scripts/setup.sh              # sinh .env (mật khẩu mạnh), chứng chỉ HTTPS, .htpasswd; in ra thông tin đăng nhập
docker compose up -d --build    # khởi động 12 dịch vụ
docker compose ps               # chờ app, mysql, nginx ở trạng thái healthy (~1 phút lần đầu)
```

| Địa chỉ | Dịch vụ | Đăng nhập |
|---|---|---|
| https://localhost/ | Website LMS | Admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `.env`; học viên tự đăng ký |
| https://localhost/phpmyadmin/ | phpMyAdmin | Basic Auth (`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`) → MySQL `lms_dba` / `DBA_PASSWORD` |
| https://localhost/grafana/ | Grafana – thư mục dashboard **LMS** | `admin` / `GRAFANA_ADMIN_PASSWORD` |
| https://localhost/prometheus/ | Prometheus (Status → Targets, Alerts) | Basic Auth như phpMyAdmin |
| https://localhost/alertmanager/ | Alertmanager (cảnh báo đang kích hoạt) | Basic Auth như phpMyAdmin |

Trình duyệt cảnh báo chứng chỉ tự ký → chọn *Advanced → Proceed to localhost*.
Xem lại mật khẩu bất cứ lúc nào: `cat .env`.

### Lưu ý khi chạy trên WSL

- Nên clone repo vào thư mục Linux (`~/lms-devops`), **không** để trong `/mnt/c/...` (chậm và lỗi phân quyền file).
- Nếu đang chạy project khác chiếm cổng 80/443, tắt trước: `docker compose -p <tên_project> stop`.
- Lỗi `bad interpreter: /bin/bash^M` → file bị đổi sang CRLF: `sed -i 's/\r$//' scripts/*.sh db/init/*.sh`.

## Dữ liệu

Hệ thống **không dùng dữ liệu tĩnh/dữ liệu mẫu**: CSDL chỉ được tạo lược đồ (bảng rỗng). Toàn bộ khóa học, bài học do quản trị viên nhập qua trang `/admin`; tài khoản học viên, lượt đăng ký học và tiến độ do học viên tạo trên website, tất cả được ghi vào MySQL và xem được trong phpMyAdmin. Chỉ tài khoản quản trị đầu tiên được ứng dụng tạo khi khởi động từ `ADMIN_EMAIL`/`ADMIN_PASSWORD` trong `.env`.

## Demo theo tiêu chí chấm

| Tiêu chí | Cách demo |
|---|---|
| 1. GitHub | 3 commit: (1) App + DB + Nginx, (2) Prometheus + Grafana, (3) Loki + Promtail – `git log --oneline` |
| 2. App + DB | Admin tạo khóa học + bài học tại `/admin`; học viên đăng ký tài khoản, đăng ký khóa học, học bài; xem dữ liệu bảng `users`, `enrollments` trong phpMyAdmin |
| 3. Nginx | `curl -I http://localhost` → 301; `curl -skI https://localhost` → security headers; `/metrics` → 404 |
| 4. Giám sát | Prometheus → *Status › Targets* (6 target UP); Grafana → dashboard **LMS - Tổng quan hệ thống** |
| 5. Log | Chạy `./scripts/demo-traffic.sh`, Grafana → *Explore › Loki*, dùng truy vấn trong [docs/LOGQL.md](docs/LOGQL.md); dashboard **LMS - Log tập trung (Loki)** |
| Sự cố ATTT + Cảnh báo | `./scripts/demo-traffic.sh` mô phỏng dò mật khẩu → cảnh báo hiện ở trang Quản trị và `/alertmanager/`, truy vết trên Loki. Chi tiết: [docs/SECURITY-INCIDENT.md](docs/SECURITY-INCIDENT.md) |
| 6. Hardening | Theo bảng trong [docs/HARDENING.md](docs/HARDENING.md), ví dụ `docker compose exec app id`, `docker network inspect lms_backend` |

## Lệnh hữu ích

```bash
docker compose logs -f app                 # xem log ứng dụng
docker compose exec mysql mysql -ulms_dba -p lms   # vào MySQL bằng tài khoản DBA
docker compose restart nginx               # nạp lại cấu hình Nginx
docker compose down                        # dừng hệ thống (giữ dữ liệu)
docker compose down -v                     # dừng và XÓA dữ liệu (MySQL, Grafana, Loki...)
```

Kiểm thử ứng dụng (không cần MySQL):

```bash
cd app && npm install && npm test
```

## Cấu trúc thư mục

```
lms-devops/
├── app/                      # Ứng dụng Node.js + Dockerfile (multi-stage, non-root)
│   ├── src/                  # app.js, routes/, middleware/, metrics.js, logger.js
│   ├── views/                # Giao diện EJS
│   └── test/                 # Kiểm thử (node:test + supertest)
├── db/init/                  # Lược đồ, phân quyền MySQL, user exporter
├── nginx/                    # nginx.conf, conf.d/, snippets/ (security headers, proxy)
├── phpmyadmin/               # Cấu hình hardening phpMyAdmin
├── monitoring/
│   ├── prometheus/           # prometheus.yml, alert.rules.yml
│   ├── alertmanager/         # alertmanager.yml (webhook cảnh báo)
│   ├── grafana/              # provisioning + 2 dashboard JSON
│   ├── loki/                 # loki-config.yml
│   └── promtail/             # promtail-config.yml
├── scripts/                  # setup.sh, demo-traffic.sh
├── docs/                     # LOGQL.md, HARDENING.md
└── docker-compose.yml
```

## Đưa lên GitHub

```bash
git remote add origin https://github.com/dtc245200528/LMS_Online.git
git push -u origin main
```
