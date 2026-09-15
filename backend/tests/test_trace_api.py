"""TRACE backend end-to-end tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://trace-civic.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def citizen_token(session):
    r = session.post(f"{API}/auth/login", json={"email": "citizen@trace.demo", "password": "demo1234"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["role"] == "citizen"
    return data["token"]


@pytest.fixture(scope="module")
def authority_token(session):
    r = session.post(f"{API}/auth/login", json={"email": "authority@trace.demo", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": "admin@trace.demo", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------- auth ----------
class TestAuth:
    def test_login_wrong_password(self, session, workflow_case_id):
        r = session.post(f"{API}/auth/login", json={"email": "citizen@trace.demo", "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_requires_token(self, session, workflow_case_id):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_ok(self, session, citizen_token, workflow_case_id):
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {citizen_token}"})
        assert r.status_code == 200
        assert r.json()["user"]["email"] == "citizen@trace.demo"

    def test_register_new(self, session, workflow_case_id):
        import uuid
        email = f"test_{uuid.uuid4().hex[:8]}@trace.demo"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "demo1234", "name": "Test User"})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["email"] == email


# ---------- cases ----------
class TestCases:
    def test_public_cases_no_auth(self, session, workflow_case_id):
        r = requests.get(f"{API}/cases/public")
        assert r.status_code == 200
        assert isinstance(r.json()["cases"], list)

    def test_list_seeded_cases(self, session, authority_token, workflow_case_id):
        r = session.get(f"{API}/cases", headers={"Authorization": f"Bearer {authority_token}"})
        assert r.status_code == 200
        cases = r.json()["cases"]
        assert len(cases) >= 7, f"expected >=7 seeded, got {len(cases)}"
        # check flagship TRC-2048 exists (civic first seed)
        civic_nos = [c["case_number"] for c in cases if c.get("mode") == "civic"]
        # First civic seeded case should be TRC-2049 (counter starts at n=0, increments to 1 -> 2049).
        # Problem statement accepts TRC-2048 or TRC-*-2048/2049 series.
        assert any("2048" in n or "2049" in n for n in civic_nos), f"flagship not found: {civic_nos}"

    def test_create_case_and_chain(self, session, citizen_token, workflow_case_id):
        headers = {"Authorization": f"Bearer {citizen_token}"}
        cid = workflow_case_id
        r2 = session.get(f"{API}/cases/{cid}", headers=headers)
        assert r2.status_code == 200
        events = r2.json()["events"]
        assert len(events) == 1
        assert events[0]["type"] == "CASE_CREATED"
        assert events[0]["prev_hash"] == "0" * 64
        assert events[0]["seq"] == 1


@pytest.fixture(scope="module")
def workflow_case_id(session, citizen_token):
    headers = {"Authorization": f"Bearer {citizen_token}"}
    payload = {"category": "Pothole", "title": "TEST_pothole", "description": "test desc",
               "severity": "medium", "mode": "civic",
               "location": {"lat": 12.9, "lng": 77.5, "area": "TestArea"}}
    r = requests.post(f"{API}/cases", json=payload, headers=headers)
    assert r.status_code == 200
    return r.json()["case"]["id"]


# ---------- workflow ----------
class TestWorkflow:
    def test_intervention_requires_role(self, session, citizen_token, workflow_case_id):
        cid = workflow_case_id
        r = session.post(f"{API}/cases/{cid}/intervention",
                         json={"description": "fix", "proof_urls": []},
                         headers={"Authorization": f"Bearer {citizen_token}"})
        assert r.status_code == 403

    def test_intervention_as_authority(self, session, authority_token, workflow_case_id):
        cid = workflow_case_id
        r = session.post(f"{API}/cases/{cid}/intervention",
                         json={"description": "Road repaired", "proof_urls": ["https://x/p.jpg"]},
                         headers={"Authorization": f"Bearer {authority_token}"})
        assert r.status_code == 200
        r2 = session.get(f"{API}/cases/{cid}", headers={"Authorization": f"Bearer {authority_token}"})
        case = r2.json()["case"]
        assert case["status"] == "OBSERVATION"
        types = [e["type"] for e in r2.json()["events"]]
        assert "INTERVENTION_SUBMITTED" in types and "OBSERVATION_STARTED" in types

    def test_observation_advance(self, session, authority_token, workflow_case_id):
        cid = workflow_case_id
        r = session.post(f"{API}/cases/{cid}/observation/advance",
                         json={"days": 30},
                         headers={"Authorization": f"Bearer {authority_token}"})
        assert r.status_code == 200
        assert r.json()["days_elapsed"] == 30

    def test_outcome_as_authority(self, session, authority_token, workflow_case_id):
        cid = workflow_case_id
        r = session.post(f"{API}/cases/{cid}/outcome",
                         json={"outcome": "PASSED", "note": "ok"},
                         headers={"Authorization": f"Bearer {authority_token}"})
        assert r.status_code == 200

    def test_review_dispute(self, session, citizen_token, workflow_case_id):
        cid = workflow_case_id
        r = session.post(f"{API}/cases/{cid}/review",
                         json={"decision": "dispute", "reason": "still broken"},
                         headers={"Authorization": f"Bearer {citizen_token}"})
        assert r.status_code == 200
        r2 = session.get(f"{API}/cases/{cid}", headers={"Authorization": f"Bearer {citizen_token}"})
        case = r2.json()["case"]
        assert case["review_status"] == "DISPUTED"
        assert case["outcome"] == "INCONCLUSIVE"

    def test_corrective_as_authority(self, session, authority_token, workflow_case_id):
        cid = workflow_case_id
        r = session.post(f"{API}/cases/{cid}/corrective",
                         json={"intervention": "redo", "observation_days": 30,
                               "required_evidence": "photos"},
                         headers={"Authorization": f"Bearer {authority_token}"})
        assert r.status_code == 200
        r2 = session.get(f"{API}/cases/{cid}", headers={"Authorization": f"Bearer {authority_token}"})
        case = r2.json()["case"]
        assert case["status"] == "INTERVENTION"
        assert len(case["corrective"]) >= 1


# ---------- integrity ----------
class TestIntegrity:
    def test_integrity_verified(self, session, workflow_case_id):
        cid = workflow_case_id
        r = requests.get(f"{API}/integrity/{cid}")
        assert r.status_code == 200
        d = r.json()
        assert d["verified"] is True
        assert d["event_count"] >= 1

    def test_anchor_as_authority(self, session, authority_token, workflow_case_id):
        cid = workflow_case_id
        r = session.post(f"{API}/integrity/{cid}/anchor",
                         headers={"Authorization": f"Bearer {authority_token}"})
        assert r.status_code == 200
        d = r.json()
        assert d.get("prototype") is True
        assert "anchor_tx" not in d
        # verify INTEGRITY_ANCHORED event appended
        r2 = session.get(f"{API}/cases/{cid}", headers={"Authorization": f"Bearer {authority_token}"})
        types = [e["type"] for e in r2.json()["events"]]
        assert "INTEGRITY_ANCHORED" in types

    def test_anchor_requires_role(self, session, citizen_token, workflow_case_id):
        cid = workflow_case_id
        r = session.post(f"{API}/integrity/{cid}/anchor",
                         headers={"Authorization": f"Bearer {citizen_token}"})
        assert r.status_code == 403


# ---------- misc ----------
class TestMisc:
    def test_activity(self, session, workflow_case_id):
        r = requests.get(f"{API}/activity")
        assert r.status_code == 200
        assert len(r.json()["events"]) >= 1

    def test_memory(self, session, workflow_case_id):
        r = requests.get(f"{API}/memory")
        assert r.status_code == 200
        assert isinstance(r.json()["memory"], list)

    def test_washrooms_seeded(self, session, workflow_case_id):
        r = requests.get(f"{API}/washrooms")
        assert r.status_code == 200
        w = r.json()["washrooms"]
        assert len(w) == 4

    def test_duplicate_check(self, session, citizen_token, workflow_case_id):
        r = session.post(f"{API}/ai/duplicate-check",
                         json={"category": "Pothole", "title": "hole", "description": "on road"},
                         headers={"Authorization": f"Bearer {citizen_token}"})
        assert r.status_code == 200
        assert "candidates" in r.json()
