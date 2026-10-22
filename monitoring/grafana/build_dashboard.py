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


def stat(title, expr, x, w=4, unit="none", mapping_updown=False):
    p = {
        "type": "stat", "title": title, "id": nid(), "datasource": DS,
        "gridPos": {"h": 4, "w": w, "x": x, "y": y},
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

out = pathlib.Path(__file__).parent / "dashboards" / "lms-overview.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Đã ghi {out} ({len(panels)} panel)")
