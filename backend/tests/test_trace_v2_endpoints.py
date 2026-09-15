"""TRACE v2 backend endpoints: replies, sync, analyze, leaderboard, digest, cluster,
plus integrity_score / detection on GET /cases/{id} and idempotency on POST /cases."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://trace-civic.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- session fixtures ----------
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


# ---------- 1. replies ----------
class TestReplies:
    def test_authority_can_add_reply(self, s, authority_tok, citizen_tok):
        body = f"TEST_Water tanker dispatched at 3pm {uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/cases/TRC-2048/replies", json={"body": body}, headers=_h(authority_tok))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        rep = j.get("reply")
        assert rep and rep.get("body") == body
        assert rep.get("author_role") in ("authority", "admin")
        assert rep.get("id") and rep.get("author_id") and rep.get("created_at")
        # verify persisted in case
        r2 = s.get(f"{API}/cases/TRC-2048", headers=_h(citizen_tok))
        assert r2.status_code == 200
        replies = r2.json()["case"].get("replies") or []
        assert any(rp.get("body") == body for rp in replies), f"reply not persisted: {replies}"
        # audit event
        types = [e["type"] for e in r2.json()["events"]]
        assert "CASE_REPLY" in types

    def test_citizen_forbidden(self, s, citizen_tok):
        r = s.post(
            f"{API}/cases/TRC-2048/replies",
            json={"body": "TEST_citizen_should_be_blocked"},
            headers=_h(citizen_tok),
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------- 2. /cases/sync idempotency ----------
class TestCasesSync:
    def test_sync_creates_and_is_idempotent(self, s, citizen_tok):
        key = f"TEST_sync_{uuid.uuid4().hex}"
        payload = {
            "idempotency_key": key,
            "category": "Pothole",
            "title": "TEST_sync pothole",
            "description": "Offline queued report",
            "severity": "medium",
            "mode": "civic",
            "location": {"lat": 12.9720, "lng": 77.5950, "area": "TEST_Sync Road", "precision": "EXACT"},
            "evidence_urls": [],
            "evidence_meta": [],
        }
        r1 = s.post(f"{API}/cases/sync", json=payload, headers=_h(citizen_tok))
        assert r1.status_code == 200, r1.text
        j1 = r1.json()
        assert j1.get("duplicated") is False
        cn1 = j1["case"]["case_number"]

        r2 = s.post(f"{API}/cases/sync", json=payload, headers=_h(citizen_tok))
        assert r2.status_code == 200, r2.text
        j2 = r2.json()
        assert j2.get("duplicated") is True, j2
        assert j2["case"]["case_number"] == cn1

    def test_sync_missing_key_400(self, s, citizen_tok):
        # Pydantic rejects missing required field with 422; test with empty string instead
        payload = {
            "idempotency_key": "",
            "category": "Pothole",
            "title": "TEST_no key",
            "description": "no key",
            "severity": "low",
            "mode": "civic",
            "location": {"lat": 12.9, "lng": 77.5, "area": "TEST_area", "precision": "EXACT"},
        }
        r = s.post(f"{API}/cases/sync", json=payload, headers=_h(citizen_tok))
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"


# ---------- 3. /cases idempotency ----------
class TestCasesIdempotency:
    def test_post_cases_idempotency_key(self, s, citizen_tok):
        key = f"TEST_idem_{uuid.uuid4().hex}"
        payload = {
            "category": "Pothole",
            "title": "TEST_idempotent case",
            "description": "same key twice",
            "severity": "medium",
            "mode": "civic",
            "location": {"lat": 12.98, "lng": 77.60, "area": "TEST_Idem Road", "precision": "EXACT"},
            "idempotency_key": key,
            "evidence_urls": [],
            "evidence_meta": [],
        }
        r1 = s.post(f"{API}/cases", json=payload, headers=_h(citizen_tok))
        assert r1.status_code == 200, r1.text
        j1 = r1.json()
        assert j1.get("duplicated") is False
        cn1 = j1["case"]["case_number"]

        r2 = s.post(f"{API}/cases", json=payload, headers=_h(citizen_tok))
        assert r2.status_code == 200, r2.text
        j2 = r2.json()
        assert j2.get("duplicated") is True
        assert j2["case"]["case_number"] == cn1


# ---------- 4 & 5. /evidence/analyze ----------
class TestEvidenceAnalyze:
    def test_analyze_basic_pothole(self, s, citizen_tok):
        payload = {
            "hash": "abc123def456789012345678",
            "size": 500000,
            "width": 800,
            "height": 600,
            "exif_present": True,
            "category": "Pothole",
        }
        r = s.post(f"{API}/evidence/analyze", json=payload, headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        j = r.json()
        det = j.get("detection") or {}
        assert "Pothole" in (det.get("issue") or ""), det
        conf = det.get("confidence")
        assert isinstance(conf, int) and 55 <= conf <= 94, det
        assert det.get("demo") is True
        integ = j.get("integrity") or {}
        assert isinstance(integ.get("score"), int) and 0 <= integ["score"] <= 100
        assert integ.get("band") in ("high", "medium", "low")
        sigs = j.get("signals")
        assert isinstance(sigs, list) and len(sigs) > 0
        assert j.get("prototype") is True
        # no duplicate for fresh hash
        assert j.get("duplicate") in (None, {}) or j.get("duplicate") is None

    def test_analyze_detects_duplicate(self, s, citizen_tok):
        # Fetch a real seeded evidence hash from TRC-2048
        r0 = s.get(f"{API}/cases/TRC-2048", headers=_h(citizen_tok))
        assert r0.status_code == 200
        evs = r0.json()["case"].get("evidence") or []
        seeded_hash = next((e.get("hash") for e in evs if e.get("hash")), None)
        assert seeded_hash, f"no seeded hash on TRC-2048 evidence: {evs}"

        payload = {
            "hash": seeded_hash,
            "size": 480000,
            "width": 1024,
            "height": 768,
            "exif_present": True,
            "category": "Pothole",
        }
        r = s.post(f"{API}/evidence/analyze", json=payload, headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        j = r.json()
        dup = j.get("duplicate")
        assert isinstance(dup, dict) and dup.get("case_number") == "TRC-2048", j


# ---------- 6. leaderboard ----------
class TestLeaderboard:
    def test_leaderboard_shape_and_sort(self):
        r = requests.get(f"{API}/memory/leaderboard")
        assert r.status_code == 200, r.text
        j = r.json()
        assert "top" in j and "bottom" in j
        assert isinstance(j["top"], list) and isinstance(j["bottom"], list)
        for row in j["top"] + j["bottom"]:
            assert set(["area", "total", "resolved", "failed", "disputed", "resolution_rate"]).issubset(row.keys()), row
            assert 0 <= row["resolution_rate"] <= 100
            assert row["total"] >= 1
        # top sorted desc by resolution_rate (allow ties)
        rates = [r["resolution_rate"] for r in j["top"]]
        assert rates == sorted(rates, reverse=True), f"top not sorted desc: {rates}"


# ---------- 7. digest ----------
class TestDigest:
    def test_digest_shape(self, s, citizen_tok):
        r = s.get(f"{API}/notifications/digest", headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("new_cases", "outcomes_verified", "disputes", "recurrences", "checkpoints"):
            assert k in j, f"missing key {k}: {j}"
            assert isinstance(j[k], int), f"{k} not int: {j[k]!r}"
            assert j[k] >= 0


# ---------- 8. memory cluster ----------
class TestMemoryCluster:
    def test_cluster_by_area(self, s, citizen_tok):
        # Seed a case in Market Road area to guarantee non-empty (idempotent)
        key = "TEST_cluster_seed_market_road_v2"
        s.post(f"{API}/cases", json={
            "category": "Pothole", "title": "TEST_market road case",
            "description": "cluster seed", "severity": "low", "mode": "civic",
            "location": {"lat": 12.97, "lng": 77.60, "area": "Market Road", "precision": "EXACT"},
            "idempotency_key": key,
        }, headers=_h(citizen_tok))
        r = requests.get(f"{API}/memory/cluster", params={"area": "Market Road"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("area") == "Market Road"
        cases = j.get("cases")
        assert isinstance(cases, list) and len(cases) >= 1, j
        for c in cases:
            assert "timeline_events" in c and isinstance(c["timeline_events"], list), c


# ---------- 9. GET /cases/{id} integrity_score & detection ----------
class TestCaseDetailNewFields:
    def test_integrity_score_and_detection(self, s, citizen_tok):
        r = s.get(f"{API}/cases/TRC-2048", headers=_h(citizen_tok))
        assert r.status_code == 200, r.text
        case = r.json()["case"]
        integ = case.get("integrity_score")
        assert isinstance(integ, dict), case.keys()
        assert isinstance(integ.get("score"), int) and 0 <= integ["score"] <= 100
        assert integ.get("band") in ("high", "medium", "low"), integ
        subs = integ.get("subs")
        assert isinstance(subs, list) and len(subs) > 0
        for sub in subs:
            assert set(["key", "label", "ok", "weight"]).issubset(sub.keys()), sub
        det = case.get("detection")
        assert isinstance(det, dict), det
        assert det.get("issue"), det
        assert det.get("demo") is True
