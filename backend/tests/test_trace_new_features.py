"""TRACE new features: evidence_signals, recurrence, corrective checkpoints, public share."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://trace-civic.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- session-scoped auth ----------
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def citizen_tok(s):
    r = s.post(f"{API}/auth/login", json={"email": "citizen@trace.demo", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def authority_tok(s):
    r = s.post(f"{API}/auth/login", json={"email": "authority@trace.demo", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- evidence_signals & checkpoints seed verification ----------
class TestSeededSignalsAndCheckpoints:
    """Runs first — read-only checks on seeded flagship cases (TRC-2048, TRC-2051)."""

    def test_evidence_signals_on_2048(self, s, citizen_tok):
        r = s.get(f"{API}/cases/TRC-2048", headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        case = r.json()["case"]
        assert case["case_number"] == "TRC-2048"
        sig = case.get("evidence_signals")
        assert isinstance(sig, list) and len(sig) > 0, f"evidence_signals empty: {sig}"
        for item in sig:
            assert set(["key", "label", "tone"]).issubset(item.keys()), item
            assert item["tone"] in ("good", "warn", "info"), item

    def test_checkpoints_on_2051(self, s, citizen_tok):
        r = s.get(f"{API}/cases/TRC-2051", headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        case = r.json()["case"]
        corr_list = case.get("corrective") or []
        assert len(corr_list) >= 1, "expected at least one corrective obligation on TRC-2051"
        corr = corr_list[0]
        cps = corr.get("checkpoints") or []
        days = sorted([c["day"] for c in cps])
        assert days == [7, 30, 60], f"expected [7,30,60], got {days}"
        for cp in cps:
            assert set(["day", "status", "note", "updated_at"]).issubset(cp.keys()), cp


# ---------- checkpoint update endpoint ----------
class TestCheckpointUpdate:
    @pytest.fixture(scope="class")
    def corrective_id(self, s, citizen_tok):
        r = s.get(f"{API}/cases/TRC-2051", headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        corr = r.json()["case"]["corrective"][0]
        return r.json()["case"]["id"], corr["id"]

    def test_checkpoint_update_as_citizen_forbidden(self, s, citizen_tok, corrective_id):
        case_id, cid = corrective_id
        r = s.post(
            f"{API}/cases/{case_id}/corrective/{cid}/checkpoint",
            json={"day": 30, "status": "met"},
            headers=_h(citizen_tok),
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_checkpoint_update_as_authority_ok(self, s, authority_tok, citizen_tok, corrective_id):
        case_id, cid = corrective_id
        r = s.post(
            f"{API}/cases/{case_id}/corrective/{cid}/checkpoint",
            json={"day": 30, "status": "met", "note": "TEST_verified"},
            headers=_h(authority_tok),
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        assert payload.get("ok") is True
        # verify via GET
        r2 = s.get(f"{API}/cases/{case_id}", headers=_h(citizen_tok))
        assert r2.status_code == 200
        corr = next(c for c in r2.json()["case"]["corrective"] if c["id"] == cid)
        day30 = next(cp for cp in corr["checkpoints"] if cp["day"] == 30)
        assert day30["status"] == "met"
        assert day30["note"] == "TEST_verified"
        assert day30["updated_at"] is not None
        # verify audit event appended
        types = [e["type"] for e in r2.json()["events"]]
        assert "CHECKPOINT_UPDATED" in types


# ---------- recurrence detection ----------
class TestRecurrence:
    """Order matters: pass 2048 first, then submit a new similar pothole (recurrence),
    then submit a women-mode case (must NOT trigger recurrence)."""

    def test_a_pass_trc_2048(self, s, authority_tok, citizen_tok):
        # BUG: POST /cases/{case_id}/outcome only matches internal UUID, not case_number.
        # Workaround: resolve internal id via GET (which supports $or lookup) first.
        r0 = s.get(f"{API}/cases/TRC-2048", headers=_h(citizen_tok))
        assert r0.status_code == 200, r0.text
        internal_id = r0.json()["case"]["id"]
        # Attempt with case_number (documents the bug — expected to be 200 per PRD)
        r_bug = s.post(
            f"{API}/cases/TRC-2048/outcome",
            json={"outcome": "PASSED", "note": "TEST_via_case_number"},
            headers=_h(authority_tok),
        )
        if r_bug.status_code != 200:
            # fall back to internal id so downstream tests can proceed
            r = s.post(
                f"{API}/cases/{internal_id}/outcome",
                json={"outcome": "PASSED", "note": "TEST_via_internal_id"},
                headers=_h(authority_tok),
            )
            assert r.status_code == 200, r.text
        # Assert PRD expectation (will fail until fixed)
        assert r_bug.status_code == 200, f"POST /cases/TRC-2048/outcome should work by case_number, got {r_bug.status_code}: {r_bug.text}"

    def test_b_new_pothole_triggers_recurrence(self, s, citizen_tok):
        payload = {
            "category": "Pothole",
            "title": "TEST_Another pothole on MG Road",
            "description": "New pothole appeared near the same segment.",
            "severity": "medium",
            "mode": "civic",
            "location": {"lat": 12.9716, "lng": 77.5946, "area": "MG Road · Segment 14", "precision": "EXACT"},
        }
        r = s.post(f"{API}/cases", json=payload, headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        body = r.json()
        rec = body.get("recurrence")
        assert rec is not None, f"expected recurrence, got: {body}"
        assert rec.get("related_case") == "TRC-2048", rec
        new_id = body["case"]["id"]
        # verify RECURRENCE_DETECTED event on the new case
        r2 = s.get(f"{API}/cases/{new_id}", headers=_h(citizen_tok))
        assert r2.status_code == 200
        types = [e["type"] for e in r2.json()["events"]]
        assert "RECURRENCE_DETECTED" in types, f"types={types}"

    def test_c_women_mode_skips_recurrence(self, s, citizen_tok):
        payload = {
            "category": "Pothole",
            "title": "TEST_Women mode report",
            "description": "Report under women mode.",
            "severity": "medium",
            "mode": "women",
            "location": {"lat": 12.9716, "lng": 77.5946, "area": "MG Road · Segment 14", "precision": "EXACT"},
        }
        r = s.post(f"{API}/cases", json=payload, headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        assert r.json().get("recurrence") is None, r.json()


# ---------- public share ----------
class TestPublicShare:
    def test_share_html_no_auth(self):
        r = requests.get(f"{API}/share/TRC-2048")
        assert r.status_code == 200, r.text[:200]
        ctype = r.headers.get("content-type", "")
        assert "text/html" in ctype.lower(), f"content-type={ctype}"
        body = r.text
        assert "TRC-2048" in body, "case_number missing in share html"
        assert "TRACE" in body, "brand missing in share html"

    def test_share_json_no_auth(self):
        r = requests.get(f"{API}/share/TRC-2048.json")
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("case_number") == "TRC-2048"
        assert j.get("title")
        assert j.get("category")
        assert isinstance(j.get("event_count"), int) and j["event_count"] >= 1

    def test_share_html_404_unknown(self):
        r = requests.get(f"{API}/share/TRC-NOPE-9999")
        assert r.status_code == 404


# ---------- regression on previously-passing endpoints ----------
class TestRegression:
    def test_login(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "citizen@trace.demo", "password": "demo1234"})
        assert r.status_code == 200

    def test_cases_list(self, s, authority_tok):
        r = s.get(f"{API}/cases", headers=_h(authority_tok))
        assert r.status_code == 200
        assert len(r.json()["cases"]) >= 7

    def test_integrity(self, s, citizen_tok):
        r = s.get(f"{API}/cases/TRC-2048", headers=_h(citizen_tok))
        cid = r.json()["case"]["id"]
        r2 = requests.get(f"{API}/integrity/{cid}")
        assert r2.status_code == 200
        assert r2.json()["verified"] is True

    def test_activity(self):
        r = requests.get(f"{API}/activity")
        assert r.status_code == 200
        assert len(r.json()["events"]) >= 1

    def test_memory(self):
        r = requests.get(f"{API}/memory")
        assert r.status_code == 200

    def test_washrooms(self):
        r = requests.get(f"{API}/washrooms")
        assert r.status_code == 200
        assert len(r.json()["washrooms"]) == 4
