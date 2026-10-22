#!/usr/bin/env python3
"""Sinh dashboard Grafana (lms-overview.json) từ danh sách panel.

Chạy lại khi muốn sửa dashboard:  python3 monitoring/grafana/build_dashboard.py
"""
import json
import pathlib

DS = {"type": "prometheus", "uid": "prometheus"}
panels = []
pid = 0
y = 0


def nid():
    global pid
    pid += 1
    return pid


def row(title):
    global y
    panels.append({"type": "row", "title": title, "id": nid(), "collapsed": False,
                   "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}, "panels": []})
    y += 1


def stat(title, expr, x, w=4, unit="none", mapping_updown=False, h=4):
    p = {
        "type": "stat", "title": title, "id": nid(), "datasource": DS,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "targets": [{"refId": "A", "expr": expr, "datasource": DS, "instant": True}],
        "options": {"reduceOptions": {"calcs": ["lastNotNull"]}, "colorMode": "background", "graphMode": "none"},
        "fieldConfig": {"defaults": {"unit": unit, "color": {"mode": "thresholds"},
                                     "thresholds": {"mode": "absolute", "steps": [{"color": "blue", "value": None}]}},
                        "overrides": []},
    }
    if mapping_updown:
        d = p["fieldConfig"]["defaults"]
        d["thresholds"]["steps"] = [{"color": "red", "value": None}, {"color": "green", "value": 1}]
        d["mappings"] = [{"type": "value", "options": {"0": {"text": "DOWN"}, "1": {"text": "UP"}}}]
    panels.append(p)


def ts(title, targets, x, w=12, h=8, unit="short"):
    panels.append({
        "type": "timeseries", "title": title, "id": nid(), "datasource": DS,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "targets": [{"refId": chr(65 + i), "expr": e, "legendFormat": lf, "datasource": DS}
                    for i, (e, lf) in enumerate(targets)],
        "fieldConfig": {"defaults": {"unit": unit, "custom": {"lineWidth": 2, "fillOpacity": 10}}, "overrides": []},
        "options": {"legend": {"displayMode": "list", "placement": "bottom"}, "tooltip": {"mode": "multi"}},
    })


# ---------------- Tổng quan ----------------
row("Tổng quan hệ thống")
stat("Ứng dụng LMS", 'up{job="lms-app"}', 0, mapping_updown=True)
stat("MySQL", "mysql_up", 4, mapping_updown=True)
stat("Nginx", "nginx_up", 8, mapping_updown=True)
stat("Học viên", "lms_students", 12)
stat("Khóa học", "lms_courses", 16)
stat("Lượt đăng ký học", "lms_active_enrollments", 20)
y += 4

# ---------------- Cảnh báo & an ninh ----------------
row("Cảnh báo & an ninh")
stat("Cảnh báo đang kích hoạt", 'count(ALERTS{alertstate="firing"}) or vector(0)', 0, w=6, h=8)
panels[-1]["fieldConfig"]["defaults"]["thresholds"]["steps"] = [{"color": "green", "value": None}, {"color": "red", "value": 1}]
ts("Cảnh báo theo thời gian", [('sum by (alertname) (ALERTS{alertstate="firing"})', "{{alertname}}")], 6, w=9, h=8)
ts("Đăng nhập thất bại / bị chặn (5 phút)", [('sum by (result) (increase(lms_logins_total{result=~"failed|blocked"}[5m]))', "{{result}}")], 15, w=9, h=8)
y += 8

# ---------------- Ứng dụng ----------------
row("Ứng dụng LMS (Rate - Errors - Duration)")
ts("Request/giây theo route", [('sum by (route) (rate(http_requests_total[1m]))', "{{route}}")], 0, unit="reqps")
ts("Độ trễ p50 / p95", [
    ('histogram_quantile(0.5, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', "p50"),
    ('histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', "p95"),
], 12, unit="s")
y += 8
ts("Request theo mã trạng thái", [('sum by (status) (rate(http_requests_total[1m]))', "{{status}}")], 0, w=8, unit="reqps")
ts("Đăng nhập (thành công / thất bại)", [('sum by (result) (increase(lms_logins_total[5m]))', "{{result}}")], 8, w=8)
ts("Đăng ký học & hoàn thành bài", [
    ('sum by (action) (increase(lms_enrollments_total[5m]))', "{{action}}"),
    ('sum(increase(lms_lesson_completions_total[5m]))', "lesson completed"),
], 16, w=8)
y += 8

# ---------------- Nginx ----------------
row("Web server Nginx")
ts("Kết nối Nginx", [
    ("nginx_connections_active", "active"),
    ("nginx_connections_reading", "reading"),
    ("nginx_connections_writing", "writing"),
    ("nginx_connections_waiting", "waiting"),
], 0)
ts("Request Nginx/giây", [("rate(nginx_http_requests_total[1m])", "requests")], 12, unit="reqps")
y += 8

# ---------------- MySQL ----------------
row("Cơ sở dữ liệu MySQL")
ts("Kết nối MySQL", [
    ("mysql_global_status_threads_connected", "connected"),
    ("mysql_global_status_threads_running", "running"),
], 0, w=8)
ts("Truy vấn/giây (QPS)", [("rate(mysql_global_status_questions[1m])", "QPS")], 8, w=8, unit="ops")
ts("Lệnh theo loại", [
    ('sum by (command) (rate(mysql_global_status_commands_total{command=~"select|insert|update|delete"}[1m]))', "{{command}}"),
], 16, w=8, unit="ops")
y += 8

# ---------------- Container ----------------
row("Container (cAdvisor)")
ts("CPU theo container", [('sum by (name) (rate(container_cpu_usage_seconds_total{name=~"lms-.*"}[1m]))', "{{name}}")], 0, w=8, unit="percentunit")
ts("RAM theo container", [('sum by (name) (container_memory_working_set_bytes{name=~"lms-.*"})', "{{name}}")], 8, w=8, unit="bytes")
ts("Mạng nhận theo container", [('sum by (name) (rate(container_network_receive_bytes_total{name=~"lms-.*"}[1m]))', "{{name}}")], 16, w=8, unit="Bps")
y += 8

# ---------------- Host ----------------
row("Máy chủ (node-exporter)")
ts("CPU host", [('1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m]))', "CPU")], 0, unit="percentunit")
ts("RAM host", [('1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes', "RAM")], 12, unit="percentunit")
y += 8

dashboard = {
    "uid": "lms-overview",
    "title": "LMS - Tổng quan hệ thống",
    "tags": ["lms", "de17"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "refresh": "10s",
    "time": {"from": "now-30m", "to": "now"},
    "panels": panels,
    "templating": {"list": []},
    "annotations": {"list": []},
}

def write(name, dash):
    out = pathlib.Path(__file__).parent / "dashboards" / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(dash, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Đã ghi {out} ({len(dash['panels'])} panel)")


write("lms-overview.json", dashboard)

# =================== Dashboard log (Loki) ===================
LOKI = {"type": "loki", "uid": "loki"}


def loki_ts(title, targets, x, w, h=8, unit="short", stacked=False):
    return {
        "type": "timeseries", "title": title, "datasource": LOKI,
        "gridPos": {"h": h, "w": w, "x": x, "y": 0},
        "targets": [{"refId": chr(65 + i), "expr": e, "legendFormat": lf, "datasource": LOKI, "queryType": "range"}
                    for i, (e, lf) in enumerate(targets)],
        "fieldConfig": {"defaults": {"unit": unit, "custom": {
            "drawStyle": "bars", "fillOpacity": 60,
            "stacking": {"mode": "normal" if stacked else "none"}}}, "overrides": []},
        "options": {"legend": {"displayMode": "list", "placement": "bottom"}},
    }


def logs(title, expr, x, y, w, h):
    return {
        "type": "logs", "title": title, "datasource": LOKI,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "targets": [{"refId": "A", "expr": expr, "datasource": LOKI, "queryType": "range"}],
        "options": {"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending", "enableLogDetails": True},
    }


log_panels = [
    loki_ts("Số dòng log ứng dụng theo level", [('sum by (level) (count_over_time({service="app"}[1m]))', "{{level}}")], 0, 8, stacked=True),
    loki_ts("Request Nginx theo nhóm status", [('sum by (status_class) (count_over_time({service="nginx", stream="stdout"}[1m]))', "{{status_class}}")], 8, 8, stacked=True),
    loki_ts("Đăng nhập thất bại", [('sum(count_over_time({service="app"} | json | event="login_failed" [1m]))', "login_failed")], 16, 8),
    logs("Log ứng dụng LMS (app)", '{service="app"} | json | line_format "{{.event}} {{.msg}}"', 0, 8, 12, 12),
    logs("Lỗi & cảnh báo toàn hệ thống", '{project="lms"} |~ "(?i)(error|warn|denied|fail)"', 12, 8, 12, 12),
    logs("Nginx: request lỗi (status >= 400)", '{service="nginx", stream="stdout"} | json | status >= 400', 0, 20, 24, 10),
    logs("Truy vết sự cố: đăng nhập thất bại, bị chặn và cảnh báo", '{service="app"} | json | event=~"login_failed|login_rate_limited|security_alert"', 0, 30, 24, 10),
]
for i, p in enumerate(log_panels, start=1):
    p["id"] = i

write("lms-logs.json", {
    "uid": "lms-logs",
    "title": "LMS - Log tập trung (Loki)",
    "tags": ["lms", "loki", "de17"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "refresh": "10s",
    "time": {"from": "now-1h", "to": "now"},
    "panels": log_panels,
    "templating": {"list": []},
    "annotations": {"list": []},
})
