"""Standard-library integration tests for server.py."""

from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from server import MANAGER_IDENTIFIER, build_server


class ServerIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temporary_directory.name) / "app.db"
        self.server = build_server("127.0.0.1", 0, db_path=self.db_path)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temporary_directory.cleanup()

    def request(self, method: str, path: str, payload=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        request_headers = dict(headers or {})
        body = None
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        connection.request(method, path, body=body, headers=request_headers)
        response = connection.getresponse()
        raw = response.read()
        connection.close()
        decoded = json.loads(raw.decode("utf-8")) if raw else None
        return response.status, decoded

    def test_permissions_reports_source_and_access(self) -> None:
        self.assertEqual(MANAGER_IDENTIFIER, "yuan0914")
        manager_header = {"X-Manager-Identifier": MANAGER_IDENTIFIER}
        status, health = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(health["ok"])
        status, _ = self.request("GET", "/api/state")
        self.assertEqual(status, 401)

        status, wrong = self.request(
            "POST", "/api/manager-login", {"identifier": "wrong"}
        )
        self.assertEqual(status, 401)
        self.assertFalse(wrong["ok"])

        status, _ = self.request(
            "POST", "/api/manager-login", {"identifier": "yuan0313$gmail.com.tw"}
        )
        self.assertEqual(status, 401)

        status, _ = self.request(
            "POST", "/api/manager-login", {"identifier": MANAGER_IDENTIFIER}
        )
        self.assertEqual(status, 200)

        status, created_front = self.request(
            "POST",
            "/api/users",
            {"name": "前台人員", "admin": False, "front": True},
            manager_header,
        )
        self.assertEqual(status, 201)
        front = created_front["user"]
        self.assertEqual((front["id"], front["code"], front["role"]), ("01", "UG015001", "front"))

        status, created_admin = self.request(
            "POST",
            "/api/users",
            {"name": "管理人員", "admin": True, "front": False},
            manager_header,
        )
        self.assertEqual(status, 201)
        admin = created_admin["user"]
        self.assertEqual((admin["id"], admin["code"], admin["role"]), ("02", "UG015002", "admin"))
        self.assertTrue(admin["front"])

        status, logged_in = self.request("POST", "/api/login", {"code": front["code"]})
        self.assertEqual(status, 200)
        self.assertEqual(logged_in["currentUser"]["name"], "前台人員")

        status, suffix_login = self.request("POST", "/api/login", {"suffix": "001"})
        self.assertEqual(status, 200)
        self.assertEqual(suffix_login["currentUser"]["id"], "01")
        for invalid_suffix in ("01", "000", "1000", "A01"):
            status, invalid_login = self.request(
                "POST", "/api/login", {"suffix": invalid_suffix}
            )
            self.assertEqual(status, 400)
            self.assertEqual(
                invalid_login["error"]["code"], "invalid_permission_code_format"
            )

        front_header = {"X-Permission-Code": front["code"]}
        status, unauthorized_update = self.request(
            "POST",
            f"/api/users/{front['code']}/permissions",
            {"admin": True, "front": True},
            front_header,
        )
        self.assertEqual(status, 403)
        self.assertEqual(unauthorized_update["error"]["code"], "manager_required")

        status, upgraded = self.request(
            "POST",
            f"/api/users/{front['code']}/permissions",
            {"admin": True, "front": False},
            manager_header,
        )
        self.assertEqual(status, 200)
        self.assertEqual(upgraded["user"]["role"], "admin")
        self.assertTrue(upgraded["user"]["front"])
        status, upgraded_state = self.request("GET", "/api/state", headers=front_header)
        self.assertEqual(status, 200)
        self.assertIn("reports", upgraded_state)
        self.assertNotIn("users", upgraded_state)

        status, invalid_permissions = self.request(
            "POST",
            f"/api/users/{front['code']}/permissions",
            {"admin": False, "front": False},
            manager_header,
        )
        self.assertEqual(status, 400)
        self.assertEqual(invalid_permissions["error"]["code"], "permission_required")

        status, missing_user = self.request(
            "POST",
            "/api/users/UG015999/permissions",
            {"admin": True, "front": True},
            manager_header,
        )
        self.assertEqual(status, 404)
        self.assertEqual(missing_user["error"]["code"], "user_not_found")

        status, downgraded = self.request(
            "POST",
            f"/api/users/{front['code']}/permissions",
            {"admin": False, "front": True},
            manager_header,
        )
        self.assertEqual(status, 200)
        self.assertEqual(downgraded["user"]["role"], "front")
        status, downgraded_state = self.request("GET", "/api/state", headers=front_header)
        self.assertEqual(status, 200)
        self.assertNotIn("reports", downgraded_state)
        self.assertNotIn("users", downgraded_state)

        status, invalid = self.request(
            "POST",
            "/api/reports",
            {
                "date": "2026-08-17",
                "floor": "3",
                "work": "磁磚-地磚",
                "items": [{"room": "A01", "spaces": [{"label": "室內", "code": "I"}]}],
                "workers": 0.7,
                "materials": [],
            },
            front_header,
        )
        self.assertEqual(status, 400)
        self.assertEqual(invalid["error"]["code"], "invalid_workers")

        status, saved = self.request(
            "POST",
            "/api/reports",
            {
                "date": "2026-08-17",
                "reporter": "偽造姓名",
                "reporterId": "999",
                "floor": "3",
                "work": "磁磚-地磚",
                "items": [{"room": "A01", "spaces": [{"label": "室內", "code": "I"}]}],
                "workers": 0.5,
                "materials": [],
                "note": "worker-only is valid",
            },
            front_header,
        )
        self.assertEqual(status, 201)
        report = saved["report"]
        self.assertEqual((report["reporter"], report["reporterId"]), ("前台人員", "01"))

        location = {
            "work": "磁磚-壁磚",
            "floor": "3",
            "room": "A01",
            "code": "B",
            "position": "W",
            "labels": ["廁所"],
        }
        status, saved_with_snapshot = self.request(
            "POST",
            "/api/reports",
            {
                "date": "2026-08-17",
                "floor": "3",
                "work": "磁磚-壁磚",
                "items": [{"room": "A01", "spaces": [{"label": "廁所", "code": "B"}]}],
                "locations": [location],
                "workers": 1,
                "materials": [{
                    "name": "TF850",
                    "category": "黏著劑",
                    "unit": "包",
                    "qty": 1.2,
                    "allocations": [{**location, "qty": 1.2}],
                }],
            },
            front_header,
        )
        self.assertEqual(status, 201)
        self.assertEqual(saved_with_snapshot["report"]["locations"][0]["position"], "W")
        self.assertEqual(
            saved_with_snapshot["report"]["materials"][0]["allocations"][0]["qty"], 1.2
        )

        status, front_state = self.request("GET", "/api/state", headers=front_header)
        self.assertEqual(status, 200)
        self.assertNotIn("reports", front_state)
        self.assertNotIn("users", front_state)

        status, _ = self.request(
            "POST", "/api/source", {"source": [{"id": 1}], "sourceName": "source.xlsx"}, front_header
        )
        self.assertEqual(status, 403)

        admin_header = {"X-Permission-Code": admin["code"]}
        status, source_result = self.request(
            "POST", "/api/source", {"source": [{"id": 1}], "sourceName": "source.xlsx"}, admin_header
        )
        self.assertEqual(status, 200)
        self.assertEqual(source_result["sourceCount"], 1)

        status, admin_state = self.request("GET", "/api/state", headers=admin_header)
        self.assertEqual(status, 200)
        self.assertEqual(len(admin_state["reports"]), 2)
        self.assertNotIn("users", admin_state)

        status, manager_state = self.request("GET", "/api/state", headers=manager_header)
        self.assertEqual(status, 200)
        self.assertEqual(manager_state["nextUserId"], "03")
        self.assertEqual(manager_state["nextPermissionCode"], "UG015003")
        self.assertEqual(len(manager_state["users"]), 2)

        status, disabled = self.request(
            "POST", f"/api/users/{front['code']}/disable", {}, manager_header
        )
        self.assertEqual(status, 200)
        self.assertFalse(disabled["user"]["active"])
        self.assertIsNotNone(disabled["user"]["disabledAt"])

        status, edited_while_disabled = self.request(
            "POST",
            f"/api/users/{front['code']}/permissions",
            {"admin": True, "front": True},
            manager_header,
        )
        self.assertEqual(status, 200)
        self.assertEqual(edited_while_disabled["user"]["role"], "admin")
        self.assertFalse(edited_while_disabled["user"]["active"])
        status, _ = self.request("POST", "/api/login", {"code": front["code"]})
        self.assertEqual(status, 401)

        status, unauthorized_enable = self.request(
            "POST", f"/api/users/{front['code']}/enable", {}, admin_header
        )
        self.assertEqual(status, 403)
        self.assertEqual(unauthorized_enable["error"]["code"], "manager_required")

        status, enabled = self.request(
            "POST", f"/api/users/{front['code']}/enable", {}, manager_header
        )
        self.assertEqual(status, 200)
        self.assertTrue(enabled["user"]["active"])
        self.assertIsNone(enabled["user"]["disabledAt"])
        status, reenabled_login = self.request(
            "POST", "/api/login", {"suffix": front["code"][-3:]}
        )
        self.assertEqual(status, 200)
        self.assertEqual(reenabled_login["currentUser"]["role"], "admin")

        status, enabled_again = self.request(
            "POST", f"/api/users/{front['code']}/enable", {}, manager_header
        )
        self.assertEqual(status, 200)
        self.assertTrue(enabled_again["user"]["active"])

        status, third_user = self.request(
            "POST",
            "/api/users",
            {"name": "下一位", "admin": False, "front": True},
            manager_header,
        )
        self.assertEqual(status, 201)
        self.assertEqual(third_user["user"]["code"], "UG015003")

        status, deleted = self.request(
            "DELETE", f"/api/reports/{report['id']}", headers=admin_header
        )
        self.assertEqual(status, 200)
        self.assertEqual(deleted["deletedId"], report["id"])

    def test_device_and_permission_sequences_stay_linked(self) -> None:
        manager_header = {"X-Manager-Identifier": MANAGER_IDENTIFIER}
        import sqlite3

        connection = sqlite3.connect(self.db_path)
        try:
            connection.execute(
                "UPDATE app_counters SET next_user_no = 4, next_code_seq = 7 WHERE singleton = 1"
            )
            connection.commit()
        finally:
            connection.close()
        status, created = self.request(
            "POST",
            "/api/users",
            {"name": "連動測試", "admin": False, "front": True},
            manager_header,
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["user"]["id"], "07")
        self.assertEqual(created["user"]["code"], "UG015007")
        status, state = self.request("GET", "/api/state", headers=manager_header)
        self.assertEqual(status, 200)
        self.assertEqual(state["nextUserId"], "08")
        self.assertEqual(state["nextPermissionCode"], "UG015008")

    def test_static_origin_and_migration(self) -> None:
        manager_header = {"X-Manager-Identifier": MANAGER_IDENTIFIER}
        connection = http.client.HTTPConnection(
            "127.0.0.1", self.server.server_port, timeout=5
        )
        connection.request("GET", "/app.js")
        response = connection.getresponse()
        body = response.read()
        connection.close()
        self.assertEqual(response.status, 200)
        self.assertIn(b"initialize();", body)

        status, _ = self.request("GET", "/assets/../server.py")
        self.assertIn(status, {403, 404})

        bad_origin_headers = {
            "Origin": "https://attacker.example",
            "Host": f"127.0.0.1:{self.server.server_port}",
        }
        status, blocked = self.request(
            "POST", "/api/manager-login", {"identifier": MANAGER_IDENTIFIER}, bad_origin_headers
        )
        self.assertEqual(status, 403)
        self.assertEqual(blocked["error"]["code"], "origin_not_allowed")

        legacy_report = {
            "id": "legacy-1",
            "date": "2026-08-16",
            "reporter": "舊填表人",
            "reporterId": "old-01",
            "floor": "2",
            "work": "防水",
            "items": [{"room": "A02", "spaces": ["廁所"]}],
            "workers": 1,
            "materials": [],
            "note": "舊資料",
        }
        status, migrated = self.request(
            "POST",
            "/api/migrate",
            {"reports": [legacy_report], "source": [{"id": 259}], "sourceName": "old.xlsx"},
            manager_header,
        )
        self.assertEqual(status, 200)
        self.assertEqual(migrated["migratedReports"], 1)
        self.assertTrue(migrated["migratedSource"])

        status, retried = self.request(
            "POST",
            "/api/migrate",
            {"reports": [legacy_report], "source": [{"id": 260}], "sourceName": "new.xlsx"},
            manager_header,
        )
        self.assertEqual(status, 200)
        self.assertEqual(retried["migratedReports"], 0)
        self.assertFalse(retried["migratedSource"])
        self.assertTrue(retried["reportsSkippedBecauseNotEmpty"])
        self.assertTrue(retried["sourceSkippedBecauseNotEmpty"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
