#!/usr/bin/env python3
"""Dongren work-report HTTP server.

This module intentionally uses only Python's standard library.  It serves the
single-page application and keeps permissions, quantity-source data, and work
reports in one SQLite database so multiple devices see the same records.
"""

from __future__ import annotations

import argparse
import json
import math
import mimetypes
import re
import sqlite3
import sys
import threading
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlsplit


APP_ROOT = Path(__file__).resolve().parent
DEFAULT_DB_PATH = APP_ROOT / "data" / "app.db"
MANAGER_IDENTIFIER = "yuan0914"
MAX_REQUEST_BODY = 50 * 1024 * 1024
PERMISSION_CODE_RE = re.compile(r"^UG015[0-9]{3}$")


class APIError(Exception):
    """An expected client-facing API failure."""

    def __init__(self, status: int, message: str, code: str = "request_error") -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_json(raw: bytes) -> Any:
    def reject_constant(value: str) -> None:
        raise ValueError(f"invalid JSON number: {value}")

    try:
        return json.loads(raw.decode("utf-8"), parse_constant=reject_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise APIError(HTTPStatus.BAD_REQUEST, "請傳送有效的 UTF-8 JSON", "invalid_json") from exc


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def clean_text(
    value: Any,
    field: str,
    *,
    required: bool = True,
    max_length: int = 200,
) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise APIError(HTTPStatus.BAD_REQUEST, f"{field} 必須是文字", "invalid_field")
    result = value.strip()
    if required and not result:
        raise APIError(HTTPStatus.BAD_REQUEST, f"請填寫{field}", "missing_field")
    if len(result) > max_length:
        raise APIError(HTTPStatus.BAD_REQUEST, f"{field}過長", "invalid_field")
    return result


def bool_field(value: Any, field: str) -> bool:
    if isinstance(value, bool):
        return value
    if value in (0, 1):
        return bool(value)
    raise APIError(HTTPStatus.BAD_REQUEST, f"{field} 必須是布林值", "invalid_field")


def finite_number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise APIError(HTTPStatus.BAD_REQUEST, f"{field} 必須是數字", "invalid_field")
    result = float(value)
    if not math.isfinite(result):
        raise APIError(HTTPStatus.BAD_REQUEST, f"{field} 必須是有限數字", "invalid_field")
    return result


def initialize_database(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=30)
    try:
        connection.executescript(
            """
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 30000;

            CREATE TABLE IF NOT EXISTS app_counters (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                next_user_no INTEGER NOT NULL CHECK (next_user_no >= 1),
                next_code_seq INTEGER NOT NULL CHECK (next_code_seq >= 1)
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                user_no INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'front')),
                front INTEGER NOT NULL DEFAULT 1 CHECK (front IN (0, 1)),
                code TEXT NOT NULL UNIQUE,
                active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
                created_at TEXT NOT NULL,
                disabled_at TEXT
            );

            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                report_date TEXT NOT NULL,
                reporter TEXT NOT NULL,
                reporter_id TEXT NOT NULL,
                floor TEXT NOT NULL,
                work TEXT NOT NULL,
                items_json TEXT NOT NULL,
                locations_json TEXT NOT NULL DEFAULT '[]',
                workers REAL NOT NULL,
                materials_json TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS reports_date_index
                ON reports (report_date DESC, created_at DESC);

            CREATE TABLE IF NOT EXISTS source_state (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                source_json TEXT NOT NULL DEFAULT '[]',
                source_name TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );

            INSERT OR IGNORE INTO app_counters(singleton, next_user_no, next_code_seq)
            VALUES (1, 1, 1);

            INSERT OR IGNORE INTO source_state(singleton, source_json, source_name, updated_at)
            VALUES (1, '[]', '', '');
            """
        )

        report_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(reports)").fetchall()
        }
        if "locations_json" not in report_columns:
            connection.execute(
                "ALTER TABLE reports ADD COLUMN locations_json TEXT NOT NULL DEFAULT '[]'"
            )

        # If an existing database was copied or edited, counters still advance
        # past every identifier ever present. Disabled users remain in the table,
        # so their numbers can never be issued again.
        max_user_no = connection.execute(
            "SELECT COALESCE(MAX(user_no), 0) FROM users"
        ).fetchone()[0]
        max_code_seq = connection.execute(
            "SELECT COALESCE(MAX(CAST(SUBSTR(code, 6) AS INTEGER)), 0) FROM users"
        ).fetchone()[0]
        connection.execute("UPDATE users SET front = 1 WHERE role = 'admin' AND front = 0")
        counters = connection.execute(
            "SELECT next_user_no, next_code_seq FROM app_counters WHERE singleton = 1"
        ).fetchone()
        next_sequence = max(
            int(counters[0]), int(counters[1]), max_user_no + 1, max_code_seq + 1
        )
        connection.execute(
            """
            UPDATE app_counters
               SET next_user_no = ?, next_code_seq = ?
             WHERE singleton = 1
            """,
            (next_sequence, next_sequence),
        )
        connection.commit()
    finally:
        connection.close()


def public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "front": bool(row["front"]),
        "code": row["code"],
        "active": bool(row["active"]),
        "createdAt": row["created_at"],
        "disabledAt": row["disabled_at"],
    }


def report_from_row(row: sqlite3.Row) -> dict[str, Any]:
    try:
        items = json.loads(row["items_json"])
        locations = json.loads(row["locations_json"])
        materials = json.loads(row["materials_json"])
    except json.JSONDecodeError:
        items, locations, materials = [], [], []
    return {
        "id": row["id"],
        "date": row["report_date"],
        "reporter": row["reporter"],
        "reporterId": row["reporter_id"],
        "floor": row["floor"],
        "work": row["work"],
        "items": items,
        "locations": locations,
        "workers": row["workers"],
        "materials": materials,
        "note": row["note"],
        "createdAt": row["created_at"],
    }


class WorkReportServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class WorkReportHandler(BaseHTTPRequestHandler):
    server_version = "DongrenWorkReport/1.0"
    protocol_version = "HTTP/1.1"
    app_root = APP_ROOT
    db_path = DEFAULT_DB_PATH

    def log_message(self, format: str, *args: Any) -> None:
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sys.stderr.write(f"[{stamp}] {self.client_address[0]} {format % args}\n")

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection

    @contextmanager
    def _database(self):
        """Yield a transaction and always release its SQLite file handle."""

        connection = self._connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _origin_is_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        parsed = urlsplit(origin)
        host = self.headers.get("Host", "").lower()
        return parsed.scheme in {"http", "https"} and parsed.netloc.lower() == host

    def _cors_origin(self) -> str | None:
        origin = self.headers.get("Origin")
        return origin if origin and self._origin_is_allowed() else None

    def _common_headers(self, *, cache_control: str = "no-store") -> None:
        self.send_header("Cache-Control", cache_control)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        cors_origin = self._cors_origin()
        if cors_origin:
            self.send_header("Access-Control-Allow-Origin", cors_origin)
            self.send_header("Vary", "Origin")

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json_text(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if self.close_connection:
            self.send_header("Connection", "close")
        self._common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_api_error(self, error: APIError) -> None:
        # Some errors occur before the body is consumed (for example, failed
        # authorization). Closing avoids parsing unread body bytes as a request.
        self.close_connection = True
        self._send_json(
            error.status,
            {"ok": False, "error": {"code": error.code, "message": error.message}},
        )

    def _read_json_body(self) -> dict[str, Any]:
        transfer_encoding = self.headers.get("Transfer-Encoding")
        if transfer_encoding:
            raise APIError(
                HTTPStatus.BAD_REQUEST,
                "不支援 Transfer-Encoding；請提供 Content-Length",
                "unsupported_transfer_encoding",
            )
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise APIError(HTTPStatus.LENGTH_REQUIRED, "缺少 Content-Length", "length_required")
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise APIError(HTTPStatus.BAD_REQUEST, "Content-Length 無效", "invalid_length") from exc
        if length < 0:
            raise APIError(HTTPStatus.BAD_REQUEST, "Content-Length 無效", "invalid_length")
        if length > MAX_REQUEST_BODY:
            raise APIError(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                "資料超過 50MB 上限",
                "body_too_large",
            )
        content_type = self.headers.get_content_type()
        if content_type != "application/json":
            raise APIError(
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                "Content-Type 必須是 application/json",
                "unsupported_media_type",
            )
        value = parse_json(self.rfile.read(length))
        if not isinstance(value, dict):
            raise APIError(HTTPStatus.BAD_REQUEST, "JSON 最外層必須是物件", "invalid_json")
        return value

    def _manager_authorized(self) -> bool:
        value = self.headers.get("X-Manager-Identifier")
        return isinstance(value, str) and value.casefold() == MANAGER_IDENTIFIER.casefold()

    def _permission_code(self) -> str:
        return (self.headers.get("X-Permission-Code") or "").strip().upper()

    def _active_user(self, *, required: bool = True) -> sqlite3.Row | None:
        code = self._permission_code()
        if not code:
            if required:
                raise APIError(HTTPStatus.UNAUTHORIZED, "缺少有效權限碼", "authentication_required")
            return None
        with self._database() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE code = ? AND active = 1", (code,)
            ).fetchone()
        if row is None and required:
            raise APIError(HTTPStatus.UNAUTHORIZED, "權限碼無效或已停用", "invalid_permission_code")
        return row

    def _require_manager(self) -> None:
        if not self._manager_authorized():
            raise APIError(HTTPStatus.FORBIDDEN, "僅權限主管可執行此操作", "manager_required")

    def _require_admin_or_manager(self) -> sqlite3.Row | None:
        if self._manager_authorized():
            return None
        user = self._active_user()
        assert user is not None
        if user["role"] != "admin":
            raise APIError(HTTPStatus.FORBIDDEN, "需要後台管理權限", "admin_required")
        return user

    def _check_api_origin(self) -> None:
        if not self._origin_is_allowed():
            raise APIError(HTTPStatus.FORBIDDEN, "不允許跨來源請求", "origin_not_allowed")

    def do_OPTIONS(self) -> None:
        if not self.path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not self._origin_is_allowed():
            self._send_api_error(
                APIError(HTTPStatus.FORBIDDEN, "不允許跨來源請求", "origin_not_allowed")
            )
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Permission-Code, X-Manager-Identifier",
        )
        self.send_header("Access-Control-Max-Age", "600")
        self._common_headers()
        self.end_headers()

    def do_HEAD(self) -> None:
        self._dispatch("HEAD")

    def do_GET(self) -> None:
        self._dispatch("GET")

    def do_POST(self) -> None:
        self._dispatch("POST")

    def do_DELETE(self) -> None:
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        path = urlsplit(self.path).path
        try:
            if path.startswith("/api/"):
                self._check_api_origin()
                self._dispatch_api(method, path)
            elif method in {"GET", "HEAD"}:
                self._serve_static(path)
            else:
                raise APIError(HTTPStatus.NOT_FOUND, "找不到此路徑", "not_found")
        except APIError as error:
            self._send_api_error(error)
        except BrokenPipeError:
            return
        except sqlite3.Error as error:
            self.log_error("database error: %s", error)
            self._send_api_error(
                APIError(HTTPStatus.INTERNAL_SERVER_ERROR, "資料庫操作失敗", "database_error")
            )
        except Exception as error:  # pragma: no cover - final safety boundary
            self.log_error("unexpected error: %r", error)
            self._send_api_error(
                APIError(HTTPStatus.INTERNAL_SERVER_ERROR, "伺服器發生未預期錯誤", "server_error")
            )

    def _dispatch_api(self, method: str, path: str) -> None:
        if method == "GET" and path == "/api/health":
            self._send_json(HTTPStatus.OK, {"ok": True})
            return
        if method == "POST" and path == "/api/login":
            self._api_login()
            return
        if method == "POST" and path == "/api/manager-login":
            self._api_manager_login()
            return
        if method == "GET" and path == "/api/state":
            self._api_state()
            return
        if method == "POST" and path == "/api/users":
            self._api_create_user()
            return
        match = re.fullmatch(r"/api/users/(UG015[0-9]{3})/permissions", path, re.IGNORECASE)
        if method == "POST" and match:
            self._api_update_user_permissions(match.group(1).upper())
            return
        match = re.fullmatch(r"/api/users/(UG015[0-9]{3})/disable", path, re.IGNORECASE)
        if method == "POST" and match:
            self._api_disable_user(match.group(1).upper())
            return
        match = re.fullmatch(r"/api/users/(UG015[0-9]{3})/enable", path, re.IGNORECASE)
        if method == "POST" and match:
            self._api_enable_user(match.group(1).upper())
            return
        if method == "POST" and path == "/api/reports":
            self._api_create_report()
            return
        match = re.fullmatch(r"/api/reports/([^/]+)", path)
        if method == "DELETE" and match:
            self._api_delete_report(unquote(match.group(1)))
            return
        if method == "POST" and path == "/api/source":
            self._api_source()
            return
        if method == "POST" and path == "/api/migrate":
            self._api_migrate()
            return
        raise APIError(HTTPStatus.NOT_FOUND, "找不到此 API", "not_found")

    def _api_login(self) -> None:
        body = self._read_json_body()
        if body.get("suffix") is not None:
            raw_suffix = body.get("suffix")
            suffix = raw_suffix.strip() if isinstance(raw_suffix, str) else ""
            if not re.fullmatch(r"[0-9]{3}", suffix) or suffix == "000":
                raise APIError(
                    HTTPStatus.BAD_REQUEST,
                    "請輸入權限碼末三碼 001～999",
                    "invalid_permission_code_format",
                )
            code = f"UG015{suffix}"
        else:
            code = clean_text(body.get("code"), "權限碼", max_length=9).upper()
        if not PERMISSION_CODE_RE.fullmatch(code) or code.endswith("000"):
            raise APIError(
                HTTPStatus.BAD_REQUEST,
                "權限碼格式應為末三碼 001～999",
                "invalid_permission_code_format",
            )
        with self._database() as connection:
            user = connection.execute(
                "SELECT * FROM users WHERE code = ? AND active = 1", (code,)
            ).fetchone()
        if user is None:
            raise APIError(HTTPStatus.UNAUTHORIZED, "權限碼無效或已停用", "invalid_permission_code")
        self._send_json(HTTPStatus.OK, {"ok": True, "currentUser": public_user(user)})

    def _api_manager_login(self) -> None:
        body = self._read_json_body()
        identifier = body.get("identifier")
        if not isinstance(identifier, str) or identifier.casefold() != MANAGER_IDENTIFIER.casefold():
            raise APIError(HTTPStatus.UNAUTHORIZED, "主管識別資料不正確", "invalid_manager_identifier")
        self._send_json(HTTPStatus.OK, {"ok": True, "manager": True})

    def _api_state(self) -> None:
        manager = self._manager_authorized()
        user = None if manager else self._active_user()
        with self._database() as connection:
            source_row = connection.execute(
                "SELECT source_json, source_name, updated_at FROM source_state WHERE singleton = 1"
            ).fetchone()
            try:
                source = json.loads(source_row["source_json"]) if source_row else []
            except json.JSONDecodeError:
                source = []
            payload: dict[str, Any] = {
                "ok": True,
                "manager": manager,
                "currentUser": public_user(user) if user is not None else None,
                "source": source,
                "sourceName": source_row["source_name"] if source_row else "",
                "sourceUpdatedAt": source_row["updated_at"] if source_row else "",
            }
            if manager or (user is not None and user["role"] == "admin"):
                report_rows = connection.execute(
                    "SELECT * FROM reports ORDER BY report_date DESC, created_at DESC"
                ).fetchall()
                payload["reports"] = [report_from_row(row) for row in report_rows]
            if manager:
                user_rows = connection.execute(
                    "SELECT * FROM users ORDER BY user_no"
                ).fetchall()
                counters = connection.execute(
                    "SELECT next_user_no, next_code_seq FROM app_counters WHERE singleton = 1"
                ).fetchone()
                payload["users"] = [public_user(row) for row in user_rows]
                payload["nextUserNumber"] = counters["next_user_no"]
                payload["nextPermissionSequence"] = counters["next_code_seq"]
                payload["nextUserId"] = f"{counters['next_user_no']:02d}"
                payload["nextPermissionCode"] = (
                    f"UG015{counters['next_code_seq']:03d}"
                    if counters["next_code_seq"] <= 999
                    else None
                )
        self._send_json(HTTPStatus.OK, payload)

    def _api_create_user(self) -> None:
        self._require_manager()
        body = self._read_json_body()
        name = clean_text(body.get("name"), "姓名", max_length=100)
        role_value = body.get("role")
        admin_default = role_value == "admin"
        front_default = role_value in {"admin", "front"}
        admin = bool_field(body.get("admin", admin_default), "後台管理權限")
        front = bool_field(body.get("front", front_default), "前端登錄權限")
        if admin:
            front = True
        if not admin and not front:
            raise APIError(HTTPStatus.BAD_REQUEST, "請至少勾選一項權限", "permission_required")

        with self._database() as connection:
            connection.execute("BEGIN IMMEDIATE")
            counters = connection.execute(
                "SELECT next_user_no, next_code_seq FROM app_counters WHERE singleton = 1"
            ).fetchone()
            sequence = max(int(counters["next_user_no"]), int(counters["next_code_seq"]))
            user_no = sequence
            code_sequence = sequence
            if code_sequence > 999:
                raise APIError(
                    HTTPStatus.CONFLICT,
                    "權限碼流水號已達 999，無法再新增",
                    "permission_code_exhausted",
                )
            user_id = f"{user_no:02d}"
            code = f"UG015{code_sequence:03d}"
            created_at = utc_now()
            role = "admin" if admin else "front"
            connection.execute(
                """
                INSERT INTO users(id, user_no, name, role, front, code, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (user_id, user_no, name, role, int(front), code, created_at),
            )
            connection.execute(
                """
                UPDATE app_counters
                   SET next_user_no = ?, next_code_seq = ?
                 WHERE singleton = 1
                """,
                (user_no + 1, code_sequence + 1),
            )
            user = connection.execute("SELECT * FROM users WHERE code = ?", (code,)).fetchone()
        self._send_json(HTTPStatus.CREATED, {"ok": True, "user": public_user(user)})

    def _api_update_user_permissions(self, code: str) -> None:
        self._require_manager()
        body = self._read_json_body()
        admin = bool_field(body.get("admin"), "後台管理權限")
        front = bool_field(body.get("front", True), "前端登錄權限")
        if admin:
            front = True
        if not admin and not front:
            raise APIError(HTTPStatus.BAD_REQUEST, "請至少勾選一項權限", "permission_required")
        role = "admin" if admin else "front"
        with self._database() as connection:
            row = connection.execute("SELECT * FROM users WHERE code = ?", (code,)).fetchone()
            if row is None:
                raise APIError(HTTPStatus.NOT_FOUND, "找不到此權限碼", "user_not_found")
            connection.execute(
                "UPDATE users SET role = ?, front = ? WHERE code = ?",
                (role, int(front), code),
            )
            updated = connection.execute("SELECT * FROM users WHERE code = ?", (code,)).fetchone()
        self._send_json(HTTPStatus.OK, {"ok": True, "user": public_user(updated)})

    def _api_disable_user(self, code: str) -> None:
        self._api_set_user_active(code, False)

    def _api_enable_user(self, code: str) -> None:
        self._api_set_user_active(code, True)

    def _api_set_user_active(self, code: str, active: bool) -> None:
        self._require_manager()
        # Consume an optional empty JSON object when a caller sends one; the
        # endpoint also accepts a zero-length body for convenience.
        if self.headers.get("Content-Length") not in (None, "0"):
            self._read_json_body()
        with self._database() as connection:
            row = connection.execute("SELECT * FROM users WHERE code = ?", (code,)).fetchone()
            if row is None:
                raise APIError(HTTPStatus.NOT_FOUND, "找不到此權限碼", "user_not_found")
            disabled_at = None if active else (row["disabled_at"] or utc_now())
            connection.execute(
                "UPDATE users SET active = ?, disabled_at = ? WHERE code = ?",
                (int(active), disabled_at, code),
            )
            updated = connection.execute("SELECT * FROM users WHERE code = ?", (code,)).fetchone()
        self._send_json(HTTPStatus.OK, {"ok": True, "user": public_user(updated)})

    def _validate_items(self, value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list) or not value:
            raise APIError(HTTPStatus.BAD_REQUEST, "請至少選擇一個施作區域", "invalid_items")
        if len(value) > 100:
            raise APIError(HTTPStatus.BAD_REQUEST, "施作區域數量過多", "invalid_items")
        items: list[dict[str, Any]] = []
        for entry in value:
            if not isinstance(entry, dict):
                raise APIError(HTTPStatus.BAD_REQUEST, "施作區域格式不正確", "invalid_items")
            room = clean_text(entry.get("room"), "房號", max_length=30)
            raw_spaces = entry.get("spaces")
            if not isinstance(raw_spaces, list) or not raw_spaces:
                raise APIError(HTTPStatus.BAD_REQUEST, f"{room} 尚未選擇空間", "invalid_items")
            if len(raw_spaces) > 20:
                raise APIError(HTTPStatus.BAD_REQUEST, f"{room} 的空間數量過多", "invalid_items")
            spaces: list[dict[str, str]] = []
            for raw_space in raw_spaces:
                if isinstance(raw_space, str):
                    label = clean_text(raw_space, "空間", max_length=50)
                    code = ""
                elif isinstance(raw_space, dict):
                    label = clean_text(raw_space.get("label"), "空間", max_length=50)
                    code = clean_text(
                        raw_space.get("code", ""), "空間代碼", required=False, max_length=10
                    )
                else:
                    raise APIError(HTTPStatus.BAD_REQUEST, "空間格式不正確", "invalid_items")
                spaces.append({"label": label, "code": code})
            items.append({"room": room, "spaces": spaces})
        return items

    def _validate_locations(
        self,
        value: Any,
        *,
        floor: str,
        work: str,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if value is None:
            return []
        if not isinstance(value, list) or len(value) > 200:
            raise APIError(HTTPStatus.BAD_REQUEST, "施作位置格式不正確", "invalid_locations")
        allowed_rooms = {item["room"] for item in items}
        locations: list[dict[str, Any]] = []
        seen: set[tuple[str, str, str]] = set()
        for entry in value:
            if not isinstance(entry, dict):
                raise APIError(HTTPStatus.BAD_REQUEST, "施作位置格式不正確", "invalid_locations")
            room = clean_text(entry.get("room"), "房號", max_length=30)
            code = clean_text(entry.get("code"), "空間代碼", max_length=10)
            position = clean_text(entry.get("position"), "位置", max_length=30)
            if room not in allowed_rooms:
                raise APIError(HTTPStatus.BAD_REQUEST, "施作位置與已選房號不一致", "invalid_locations")
            raw_labels = entry.get("labels", [])
            if not isinstance(raw_labels, list) or len(raw_labels) > 20:
                raise APIError(HTTPStatus.BAD_REQUEST, "空間名稱格式不正確", "invalid_locations")
            labels = [clean_text(label, "空間名稱", max_length=50) for label in raw_labels]
            key = (room, code, position)
            if key in seen:
                continue
            seen.add(key)
            locations.append(
                {
                    "work": work,
                    "floor": floor,
                    "room": room,
                    "code": code,
                    "position": position,
                    "labels": labels,
                }
            )
        return locations

    def _validate_materials(
        self,
        value: Any,
        *,
        locations: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise APIError(HTTPStatus.BAD_REQUEST, "材料用量格式不正確", "invalid_materials")
        if len(value) > 500:
            raise APIError(HTTPStatus.BAD_REQUEST, "材料項目數量過多", "invalid_materials")
        materials: list[dict[str, Any]] = []
        for entry in value:
            if not isinstance(entry, dict):
                raise APIError(HTTPStatus.BAD_REQUEST, "材料項目格式不正確", "invalid_materials")
            name = clean_text(entry.get("name"), "材料名稱", max_length=100)
            quantity = finite_number(entry.get("qty"), f"{name}用量")
            if quantity <= 0:
                raise APIError(
                    HTTPStatus.BAD_REQUEST,
                    f"{name}用量必須大於 0；未使用的材料請留空",
                    "invalid_material_quantity",
                )
            material: dict[str, Any] = {
                "name": name,
                "category": clean_text(
                    entry.get("category", ""), "材料分類", required=False, max_length=100
                ),
                "unit": clean_text(entry.get("unit", ""), "材料單位", required=False, max_length=30),
                "qty": quantity,
            }
            source_rows = entry.get("sourceRows", [])
            if source_rows is None:
                source_rows = []
            if not isinstance(source_rows, list) or len(source_rows) > 100:
                raise APIError(HTTPStatus.BAD_REQUEST, "材料來源格式不正確", "invalid_materials")
            material["sourceRows"] = [
                clean_text(row, "材料來源", max_length=50) for row in source_rows
            ]
            raw_allocations = entry.get("allocations", [])
            if raw_allocations is None:
                raw_allocations = []
            if not isinstance(raw_allocations, list) or len(raw_allocations) > 200:
                raise APIError(HTTPStatus.BAD_REQUEST, "材料分配格式不正確", "invalid_materials")
            allowed_keys = {
                (location["work"], location["floor"], location["room"], location["code"], location["position"])
                for location in (locations or [])
            }
            allocations: list[dict[str, Any]] = []
            allocation_total = 0.0
            for allocation in raw_allocations:
                if not isinstance(allocation, dict):
                    raise APIError(HTTPStatus.BAD_REQUEST, "材料分配格式不正確", "invalid_materials")
                allocation_qty = finite_number(allocation.get("qty"), "材料分配量")
                if allocation_qty <= 0:
                    raise APIError(HTTPStatus.BAD_REQUEST, "材料分配量必須大於 0", "invalid_materials")
                normalized = {
                    "work": clean_text(allocation.get("work"), "施工工項", max_length=100),
                    "floor": clean_text(allocation.get("floor"), "樓層", max_length=20),
                    "room": clean_text(allocation.get("room"), "房號", max_length=30),
                    "code": clean_text(allocation.get("code"), "空間代碼", max_length=10),
                    "position": clean_text(allocation.get("position"), "位置", max_length=30),
                    "qty": allocation_qty,
                }
                key = (
                    normalized["work"], normalized["floor"], normalized["room"],
                    normalized["code"], normalized["position"],
                )
                if allowed_keys and key not in allowed_keys:
                    raise APIError(HTTPStatus.BAD_REQUEST, "材料分配位置與施作位置不一致", "invalid_materials")
                allocations.append(normalized)
                allocation_total += allocation_qty
            if allocations and not math.isclose(allocation_total, quantity, rel_tol=1e-7, abs_tol=1e-7):
                raise APIError(HTTPStatus.BAD_REQUEST, "材料分配總量與實際用量不一致", "invalid_materials")
            material["allocations"] = allocations
            materials.append(material)
        return materials

    def _api_create_report(self) -> None:
        user = self._active_user()
        assert user is not None
        body = self._read_json_body()
        report_date = clean_text(body.get("date"), "施工日期", max_length=10)
        try:
            date.fromisoformat(report_date)
        except ValueError as exc:
            raise APIError(HTTPStatus.BAD_REQUEST, "施工日期格式必須為 YYYY-MM-DD", "invalid_date") from exc
        floor = clean_text(body.get("floor"), "樓層", max_length=20)
        work = clean_text(body.get("work"), "施工工項", max_length=100)
        items = self._validate_items(body.get("items"))
        locations = self._validate_locations(
            body.get("locations", []), floor=floor, work=work, items=items
        )
        workers = finite_number(body.get("workers"), "出工人數")
        if workers < 0.5 or abs(workers * 2 - round(workers * 2)) > 1e-9:
            raise APIError(
                HTTPStatus.BAD_REQUEST,
                "出工人數至少 0.5 工，且必須以 0.5 工為單位",
                "invalid_workers",
            )
        if workers > 10000:
            raise APIError(HTTPStatus.BAD_REQUEST, "出工人數超出合理範圍", "invalid_workers")
        materials = self._validate_materials(body.get("materials", []), locations=locations)
        note = clean_text(body.get("note", ""), "備註", required=False, max_length=5000)
        report_id = str(uuid.uuid4())
        created_at = utc_now()
        with self._database() as connection:
            connection.execute(
                """
                INSERT INTO reports(
                    id, report_date, reporter, reporter_id, floor, work,
                    items_json, locations_json, workers, materials_json, note, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    report_id,
                    report_date,
                    user["name"],
                    user["id"],
                    floor,
                    work,
                    json_text(items),
                    json_text(locations),
                    workers,
                    json_text(materials),
                    note,
                    created_at,
                ),
            )
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        self._send_json(HTTPStatus.CREATED, {"ok": True, "report": report_from_row(row)})

    def _api_delete_report(self, report_id: str) -> None:
        self._require_admin_or_manager()
        if not report_id or len(report_id) > 100:
            raise APIError(HTTPStatus.BAD_REQUEST, "回報編號無效", "invalid_report_id")
        with self._database() as connection:
            cursor = connection.execute("DELETE FROM reports WHERE id = ?", (report_id,))
            if cursor.rowcount == 0:
                raise APIError(HTTPStatus.NOT_FOUND, "找不到此施工回報", "report_not_found")
        self._send_json(HTTPStatus.OK, {"ok": True, "deletedId": report_id})

    def _api_source(self) -> None:
        self._require_admin_or_manager()
        body = self._read_json_body()
        source = body.get("source")
        if not isinstance(source, list):
            raise APIError(HTTPStatus.BAD_REQUEST, "source 必須是陣列", "invalid_source")
        source_name = clean_text(
            body.get("sourceName", ""), "來源檔名", required=False, max_length=260
        )
        try:
            source_json = json_text(source)
        except (TypeError, ValueError) as exc:
            raise APIError(HTTPStatus.BAD_REQUEST, "source 含有無法儲存的資料", "invalid_source") from exc
        updated_at = utc_now()
        with self._database() as connection:
            connection.execute(
                """
                UPDATE source_state
                   SET source_json = ?, source_name = ?, updated_at = ?
                 WHERE singleton = 1
                """,
                (source_json, source_name, updated_at),
            )
        self._send_json(
            HTTPStatus.OK,
            {
                "ok": True,
                "sourceName": source_name,
                "sourceCount": len(source),
                "sourceUpdatedAt": updated_at,
            },
        )

    def _api_migrate(self) -> None:
        """Import legacy local-browser records once into empty server tables.

        The manager credential is required. Reports and source data are handled
        independently: a non-empty destination is left untouched, while an empty
        destination is populated. This makes retrying a partially completed
        migration safe and prevents an old browser snapshot from overwriting
        central data.
        """

        self._require_manager()
        body = self._read_json_body()
        raw_reports = body.get("reports", [])
        raw_source = body.get("source", [])
        if not isinstance(raw_reports, list):
            raise APIError(HTTPStatus.BAD_REQUEST, "reports 必須是陣列", "invalid_migration")
        if not isinstance(raw_source, list):
            raise APIError(HTTPStatus.BAD_REQUEST, "source 必須是陣列", "invalid_migration")
        if len(raw_reports) > 100000:
            raise APIError(HTTPStatus.BAD_REQUEST, "reports 筆數過多", "invalid_migration")
        source_name = clean_text(
            body.get("sourceName", ""), "來源檔名", required=False, max_length=260
        )

        validated_reports: list[dict[str, Any]] = []
        for raw in raw_reports:
            if not isinstance(raw, dict):
                raise APIError(HTTPStatus.BAD_REQUEST, "舊回報格式不正確", "invalid_migration")
            report_date = clean_text(raw.get("date"), "施工日期", max_length=10)
            try:
                date.fromisoformat(report_date)
            except ValueError as exc:
                raise APIError(
                    HTTPStatus.BAD_REQUEST,
                    "舊回報的施工日期格式必須為 YYYY-MM-DD",
                    "invalid_migration",
                ) from exc
            workers = finite_number(raw.get("workers"), "出工人數")
            if workers < 0.5 or abs(workers * 2 - round(workers * 2)) > 1e-9:
                raise APIError(
                    HTTPStatus.BAD_REQUEST,
                    "舊回報的出工人數至少 0.5 工，且必須以 0.5 工為單位",
                    "invalid_migration",
                )
            report_id = clean_text(
                str(raw.get("id") or uuid.uuid4()), "回報編號", max_length=100
            )
            created_at = raw.get("createdAt")
            if not isinstance(created_at, str) or not created_at.strip():
                created_at = utc_now()
            else:
                created_at = clean_text(created_at, "建立時間", max_length=50)
            migrated_items = self._validate_items(raw.get("items"))
            migrated_floor = clean_text(raw.get("floor"), "樓層", max_length=20)
            migrated_work = clean_text(raw.get("work"), "施工工項", max_length=100)
            migrated_locations = self._validate_locations(
                raw.get("locations", []),
                floor=migrated_floor,
                work=migrated_work,
                items=migrated_items,
            )
            validated_reports.append(
                {
                    "id": report_id,
                    "date": report_date,
                    "reporter": clean_text(raw.get("reporter"), "填表人", max_length=100),
                    "reporterId": clean_text(
                        str(raw.get("reporterId", "legacy")), "填表人編號", max_length=30
                    ),
                    "floor": migrated_floor,
                    "work": migrated_work,
                    "items": migrated_items,
                    "locations": migrated_locations,
                    "workers": workers,
                    "materials": self._validate_materials(
                        raw.get("materials", []), locations=migrated_locations
                    ),
                    "note": clean_text(
                        raw.get("note", ""), "備註", required=False, max_length=5000
                    ),
                    "createdAt": created_at,
                }
            )
        try:
            source_json = json_text(raw_source)
        except (TypeError, ValueError) as exc:
            raise APIError(HTTPStatus.BAD_REQUEST, "source 含有無法儲存的資料", "invalid_migration") from exc

        migrated_reports = 0
        migrated_source = False
        with self._database() as connection:
            connection.execute("BEGIN IMMEDIATE")
            reports_empty = connection.execute("SELECT COUNT(*) FROM reports").fetchone()[0] == 0
            source_row = connection.execute(
                "SELECT source_json FROM source_state WHERE singleton = 1"
            ).fetchone()
            try:
                current_source = json.loads(source_row["source_json"]) if source_row else []
            except json.JSONDecodeError:
                current_source = []
            source_empty = not current_source
            if reports_empty:
                seen_ids: set[str] = set()
                for report in validated_reports:
                    report_id = report["id"]
                    if report_id in seen_ids:
                        report_id = str(uuid.uuid4())
                    seen_ids.add(report_id)
                    connection.execute(
                        """
                        INSERT INTO reports(
                            id, report_date, reporter, reporter_id, floor, work,
                            items_json, locations_json, workers, materials_json, note, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            report_id,
                            report["date"],
                            report["reporter"],
                            report["reporterId"],
                            report["floor"],
                            report["work"],
                            json_text(report["items"]),
                            json_text(report["locations"]),
                            report["workers"],
                            json_text(report["materials"]),
                            report["note"],
                            report["createdAt"],
                        ),
                    )
                    migrated_reports += 1
            if source_empty and raw_source:
                connection.execute(
                    """
                    UPDATE source_state
                       SET source_json = ?, source_name = ?, updated_at = ?
                     WHERE singleton = 1
                    """,
                    (source_json, source_name, utc_now()),
                )
                migrated_source = True
        self._send_json(
            HTTPStatus.OK,
            {
                "ok": True,
                "migratedReports": migrated_reports,
                "migratedSource": migrated_source,
                "reportsSkippedBecauseNotEmpty": not reports_empty,
                "sourceSkippedBecauseNotEmpty": not source_empty,
            },
        )

    def _serve_static(self, raw_path: str) -> None:
        try:
            path = unquote(raw_path, errors="strict")
        except UnicodeDecodeError as exc:
            raise APIError(HTTPStatus.BAD_REQUEST, "網址編碼無效", "invalid_path") from exc
        if path in {"", "/", "/index.html"}:
            target = (self.app_root / "index.html").resolve()
        elif path == "/app.js":
            target = (self.app_root / "app.js").resolve()
        elif path.startswith("/assets/"):
            relative = path[len("/assets/") :]
            if not relative or "\\" in relative or "\x00" in relative:
                raise APIError(HTTPStatus.NOT_FOUND, "找不到檔案", "not_found")
            parts = PurePosixPath(relative).parts
            if any(part in {"", ".", ".."} for part in parts):
                raise APIError(HTTPStatus.FORBIDDEN, "不允許此檔案路徑", "invalid_path")
            assets_root = (self.app_root / "assets").resolve()
            target = assets_root.joinpath(*parts).resolve()
            try:
                target.relative_to(assets_root)
            except ValueError as exc:
                raise APIError(HTTPStatus.FORBIDDEN, "不允許此檔案路徑", "invalid_path") from exc
        else:
            raise APIError(HTTPStatus.NOT_FOUND, "找不到檔案", "not_found")

        if not target.is_file():
            raise APIError(HTTPStatus.NOT_FOUND, "找不到檔案", "not_found")
        try:
            body = target.read_bytes()
        except OSError as exc:
            raise APIError(HTTPStatus.INTERNAL_SERVER_ERROR, "無法讀取檔案", "file_error") from exc
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {
            "application/javascript",
            "application/json",
        }:
            content_type += "; charset=utf-8"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        cache_control = (
            "no-cache"
            if target.name in {"index.html", "app.js"}
            else "public, max-age=3600"
        )
        self._common_headers(cache_control=cache_control)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


def build_server(
    host: str = "127.0.0.1",
    port: int = 8765,
    *,
    app_root: Path = APP_ROOT,
    db_path: Path = DEFAULT_DB_PATH,
) -> WorkReportServer:
    resolved_root = Path(app_root).resolve()
    resolved_db = Path(db_path).resolve()
    initialize_database(resolved_db)

    class ConfiguredHandler(WorkReportHandler):
        pass

    ConfiguredHandler.app_root = resolved_root
    ConfiguredHandler.db_path = resolved_db
    return WorkReportServer((host, port), ConfiguredHandler)


def main() -> int:
    parser = argparse.ArgumentParser(description="東仁安居工務回報系統伺服器")
    parser.add_argument("--host", default="127.0.0.1", help="監聽位址；分享給區網裝置時使用 0.0.0.0")
    parser.add_argument("--port", type=int, default=8765, help="HTTP 連接埠（預設 8765）")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH, help="SQLite 資料庫路徑")
    args = parser.parse_args()
    server = build_server(args.host, args.port, db_path=args.db)
    shown_host = "127.0.0.1" if args.host in {"0.0.0.0", "::"} else args.host
    print(f"工務回報系統已啟動：http://{shown_host}:{server.server_port}/", flush=True)
    if args.host in {"0.0.0.0", "::"}:
        print("已允許區域網路連線；請以本機區網 IP 加上相同連接埠開啟。", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在關閉伺服器…", flush=True)
    finally:
        server.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
