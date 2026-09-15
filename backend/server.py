"""TRACE - Transparent Resolution & Accountability Civic Engine.

FastAPI backend with JWT auth, MongoDB storage, tamper-evident hash-chain
event ledger, and lightweight AI signals via the Emergent LLM key.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from math import atan2, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any, Literal, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
try:
    from mongomock_motor import AsyncMongoMockClient
except ImportError:
    AsyncMongoMockClient = None
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncMongoMockClient() if (os.environ.get("TRACE_DEMO_MODE", "1").lower() in {"1", "true", "yes"} and AsyncMongoMockClient) else AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="TRACE Civic Engine")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("trace")


# ---------- utils ----------
def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now() + timedelta(days=30), "iat": now()}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def sha256_hex(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


def scrub(doc: dict) -> dict:
    """Remove Mongo _id from any doc before returning it."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


async def get_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not cred:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(401, "User missing")
    return user


def require_role(*roles: str):
    async def _dep(user: dict = Depends(get_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, f"Requires role: {roles}")
        return user
    return _dep


# ---------- models ----------
Role = Literal["citizen", "authority", "admin"]
Mode = Literal["civic", "women", "environment"]

CASE_STATUSES = [
    "SUBMITTED", "UNDER_REVIEW", "INTERVENTION", "PROOF_SUBMITTED",
    "OBSERVATION", "OUTCOME_PENDING", "RESOLVED", "DISPUTED", "REOPENED", "CLOSED",
]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Role = "citizen"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CaseCreateIn(BaseModel):
    category: str
    title: str
    description: str
    severity: Literal["low", "medium", "high"] = "medium"
    mode: Mode = "civic"
    location: Optional[dict] = None
    evidence_urls: list[str] = []
    evidence_meta: list[dict] = []
    idempotency_key: Optional[str] = None


class InterventionIn(BaseModel):
    description: str
    proof_urls: list[str] = []


class ReviewIn(BaseModel):
    decision: Literal["accept", "dispute"]
    reason: Optional[str] = None
    note: Optional[str] = None


class DisputeResolutionIn(BaseModel):
    resolution: Literal["UPHELD", "OVERTURNED", "WITHDRAWN"]
    note: Optional[str] = None


class OutcomeIn(BaseModel):
    outcome: Literal["PASSED", "FAILED", "INCONCLUSIVE"]
    note: Optional[str] = None


class CorrectiveIn(BaseModel):
    intervention: str
    observation_days: int = 60
    required_evidence: str = "Before + after evidence"


class CheckpointIn(BaseModel):
    day: int  # 7, 30, 60, 90
    status: Literal["pending", "on_track", "at_risk", "met", "missed"] = "pending"
    note: Optional[str] = None


class AdvanceIn(BaseModel):
    days: int


class ReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class EvidenceAnalyzeIn(BaseModel):
    hash: Optional[str] = None
    size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    exif_present: Optional[bool] = None
    category: Optional[str] = None


class SyncCaseIn(BaseModel):
    idempotency_key: str
    category: str
    title: str
    description: str
    severity: Literal["low", "medium", "high"] = "medium"
    mode: Mode = "civic"
    location: Optional[dict] = None
    evidence_urls: list[str] = []
    evidence_meta: list[dict] = []  # optional per-evidence metadata
    created_at_local: Optional[str] = None


class DuplicateCheckIn(BaseModel):
    category: str
    title: str
    description: str


# ---------- hash-chain ledger ----------
async def append_event(
    case_id: str,
    event_type: str,
    actor: dict,
    payload: dict,
) -> dict:
    prev = await db.events.find_one(
        {"case_id": case_id}, sort=[("seq", -1)], projection={"_id": 0, "hash": 1, "seq": 1}
    )
    prev_hash = prev["hash"] if prev else "0" * 64
    seq = (prev["seq"] + 1) if prev else 1
    body = {
        "id": new_id(),
        "case_id": case_id,
        "seq": seq,
        "type": event_type,
        "actor_id": actor.get("id"),
        "actor_role": actor.get("role"),
        "actor_name": actor.get("name"),
        "payload": payload,
        "prev_hash": prev_hash,
        "created_at": iso(now()),
    }
    body["hash"] = sha256_hex(body)
    body["anchored"] = False
    body["anchor_tx"] = None
    await db.events.insert_one(dict(body))
    return scrub(body)


async def next_case_number(mode: Mode) -> str:
    counter = await db.counters.find_one_and_update(
        {"_id": "case_seq"},
        {"$inc": {"n": 1}},
        upsert=True,
        return_document=True,
    )
    n = 2048 + counter["n"]
    prefix = {"civic": "TRC", "women": "TRC-W", "environment": "TRC-E"}[mode]
    return f"{prefix}-{n}"


# ---------- category presets ----------
COMMITMENTS: dict[str, dict] = {
    "Pothole": {"intervention": "Road surface repaired", "observation_days": 90, "target_hours": 72, "acceptance": "No confirmed recurrence during observation period."},
    "Waterlogging": {"intervention": "Drainage cleared and water dispersed", "observation_days": 30, "target_hours": 48, "acceptance": "No standing water after next rainfall event."},
    "Garbage / Waste": {"intervention": "Waste collected and site cleaned", "observation_days": 14, "target_hours": 24, "acceptance": "No recurrence of dumping within 14 days."},
    "Water Leak": {"intervention": "Pipe repaired and pressure restored", "observation_days": 30, "target_hours": 48, "acceptance": "No leak recurrence within 30 days."},
    "Broken Streetlight": {"intervention": "Light restored and verified after dark", "observation_days": 60, "target_hours": 96, "acceptance": "Light functioning during night observation."},
    "Unsafe Civic Infrastructure": {"intervention": "Hazard removed or barricaded and repaired", "observation_days": 60, "target_hours": 72, "acceptance": "Hazard resolved with structural evidence."},
    "Women's Safety / Civic Safety": {"intervention": "Civic condition improved (lighting/repair)", "observation_days": 90, "target_hours": 120, "acceptance": "Condition verified during evening observation."},
    "Environmental Issue": {"intervention": "Environmental remediation performed", "observation_days": 180, "target_hours": 168, "acceptance": "No further degradation during observation."},
    "Deforestation / Tree Removal": {"intervention": "Compensatory planting or verification of legality", "observation_days": 180, "target_hours": 168, "acceptance": "Verification of authorization or remediation."},
    "Washroom": {"intervention": "Facility restocked and cleaned", "observation_days": 30, "target_hours": 24, "acceptance": "No recurring stock/cleanliness issues within 30 days."},
    "Other": {"intervention": "Reported condition resolved", "observation_days": 30, "target_hours": 72, "acceptance": "No recurrence within observation window."},
}


# ---------- helpers: haversine, evidence signals, recurrence ----------
def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    R = 6371000.0
    lat1, lon1 = radians(a[0]), radians(a[1])
    lat2, lon2 = radians(b[0]), radians(b[1])
    dl, dp = lon2 - lon1, lat2 - lat1
    x = sin(dp / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dl / 2) ** 2
    return 2 * R * atan2(sqrt(x), sqrt(1 - x))


def evidence_signals(case: dict) -> list[dict]:
    """Compute non-certifying evidence signals. Never says 'AI proves'."""
    ev = case.get("evidence") or []
    signals: list[dict] = []
    has_before = any(e.get("type") == "before" for e in ev)
    has_after = any(e.get("type") == "after" for e in ev)
    with_ts = [e for e in ev if e.get("captured_at")]

    if with_ts:
        signals.append({"key": "timestamp", "label": "Timestamp available", "tone": "good"})
    else:
        signals.append({"key": "timestamp", "label": "No timestamp on evidence", "tone": "warn"})

    if has_before and has_after:
        signals.append({"key": "pair", "label": "Before/after pair available", "tone": "good"})
    elif has_before:
        signals.append({"key": "pair", "label": "Awaiting after evidence", "tone": "warn"})

    if case.get("location") and case["location"].get("precision"):
        prec = case["location"]["precision"]
        tone = "good" if prec == "EXACT" else "info"
        signals.append({"key": "location", "label": f"Location: {prec.title()}", "tone": tone})
    else:
        signals.append({"key": "location", "label": "Location unavailable", "tone": "warn"})

    # Freshness: newest evidence age
    newest = None
    for e in with_ts:
        try:
            t = datetime.fromisoformat(e["captured_at"].replace("Z", "+00:00"))
            if newest is None or t > newest:
                newest = t
        except Exception:
            pass
    if newest:
        age_days = (now() - newest).days
        if age_days <= 7:
            signals.append({"key": "freshness", "label": "Evidence fresh (≤7d)", "tone": "good"})
        elif age_days <= 30:
            signals.append({"key": "freshness", "label": f"Evidence age: {age_days}d", "tone": "info"})
        else:
            signals.append({"key": "freshness", "label": "Evidence outdated (>30d)", "tone": "warn"})

    # Observation coverage
    obs = case.get("observation")
    if obs:
        pct = int(100 * obs.get("days_elapsed", 0) / max(1, obs.get("days_total", 1)))
        if pct >= 100:
            signals.append({"key": "coverage", "label": "Observation window complete", "tone": "good"})
        elif pct >= 30:
            signals.append({"key": "coverage", "label": f"Observation coverage {pct}%", "tone": "info"})
        else:
            signals.append({"key": "coverage", "label": "Observation early", "tone": "warn"})
    return signals


def integrity_score(case: dict) -> dict:
    """Transparent multi-signal integrity score with explainable subs."""
    ev = case.get("evidence") or []
    subs: list[dict] = []
    def add(key: str, label: str, ok: bool, weight: int = 10, warn: Optional[str] = None):
        subs.append({"key": key, "label": label, "ok": ok, "weight": weight, "note": warn})

    add("file_integrity", "File integrity", bool(ev), 15)
    add("timestamp", "Timestamp consistency", any(e.get("captured_at") for e in ev), 15)
    add("location", "Location consistency", bool((case.get("location") or {}).get("area")), 12)
    hashes = [e.get("hash") for e in ev if e.get("hash")]
    unique = len(set(hashes)) == len(hashes) if hashes else True
    add("unique_image", "Unique image", unique, 15, warn=None if unique else "Duplicate hash within case")
    add("before_after", "Before/after available", any(e.get("type") == "before" for e in ev) and any(e.get("type") == "after" for e in ev), 15)
    obs = case.get("observation")
    obs_ok = bool(obs and obs.get("days_elapsed", 0) >= 7)
    add("observation", "Multiple observations", obs_ok, 10, warn=None if obs_ok else "Only one observation after repair")
    add("independent_verification", "Independent verification", bool(case.get("intervention") and case.get("outcome")), 8, warn="Awaiting verification")
    exif = any(e.get("exif_present") for e in ev)
    add("metadata", "Metadata available", exif, 10, warn=None if exif else "Metadata unavailable")

    total_weight = sum(s["weight"] for s in subs)
    ok_weight = sum(s["weight"] for s in subs if s["ok"])
    score = int(round(100 * ok_weight / max(1, total_weight)))
    band = "high" if score >= 80 else ("medium" if score >= 55 else "low")
    return {"score": score, "band": band, "subs": subs}


def visual_detection(case: dict) -> dict:
    """DEMO deterministic detection based on first evidence hash → issue/confidence.
    This is a PROTOTYPE. It never certifies truth."""
    ev = case.get("evidence") or []
    if not ev:
        return {"issue": None, "confidence": 0, "quality": "unknown", "demo": True}
    seed = None
    for e in ev:
        if e.get("hash"):
            try: seed = int(e["hash"][:8], 16); break
            except Exception: pass
    if seed is None:
        seed = abs(hash((ev[0].get("url") or "")[:64])) & 0xFFFFFFFF
    cat = (case.get("category") or "").lower()
    if "pothole" in cat: issue = "Pothole"
    elif "water" in cat and "leak" in cat: issue = "Water leak"
    elif "waterlog" in cat: issue = "Waterlogging"
    elif "garbage" in cat or "waste" in cat: issue = "Waste accumulation"
    elif "streetlight" in cat: issue = "Broken streetlight"
    elif "environment" in cat or "tree" in cat: issue = "Environmental change"
    else: issue = "Civic condition"
    confidence = 55 + (seed % 40)  # 55-94
    quality = "strong" if confidence >= 80 else ("moderate" if confidence >= 65 else "weak")
    return {
        "issue": issue,
        "confidence": confidence,
        "quality": quality,
        "recommendation": "Human verification required",
        "demo": True,
    }


async def check_recurrence(new_case: dict, actor: dict) -> Optional[dict]:
    """If a similar case was RESOLVED in same category within 30 days and 100m OR same area, mark recurrence."""
    if new_case.get("mode") == "women":
        return None  # skip privacy-sensitive
    since = now() - timedelta(days=30)
    q: dict[str, Any] = {
        "id": {"$ne": new_case["id"]},
        "category": new_case["category"],
        "outcome": "PASSED",
        "created_at": {"$gte": iso(since)},
    }
    candidates = await db.cases.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)
    match: Optional[dict] = None
    new_loc = new_case.get("location") or {}
    new_area = new_loc.get("area")
    new_ll = (new_loc.get("lat"), new_loc.get("lng")) if new_loc.get("lat") is not None else None
    for c in candidates:
        cl = c.get("location") or {}
        if new_ll and cl.get("lat") is not None:
            d = haversine_m(new_ll, (cl["lat"], cl["lng"]))
            if d <= 100:
                match = c
                break
        if not match and new_area and cl.get("area") == new_area:
            match = c
            break
    if not match:
        return None
    await append_event(
        new_case["id"], "RECURRENCE_DETECTED", actor,
        {"related_case": match["case_number"], "related_id": match["id"], "note": "Possible recurrence — requires review"},
    )
    # Notify the original reporter and assigned authority of the resolved case
    for uid in filter(None, [match.get("created_by"), match.get("assigned_authority")]):
        await push_notification(
            uid,
            f"Possible recurrence near {match['case_number']}",
            f"New report {new_case['case_number']} filed. Recurrence requires investigation.",
            new_case["id"],
        )
    return {"related_case": match["case_number"], "related_id": match["id"]}


# ---------- acceptance engine ----------
def evaluate_outcome(case: dict) -> dict:
    obs=case.get("observation") or {}; commitment=case.get("commitment") or {}
    complete=int(obs.get("days_elapsed",0)) >= int(obs.get("days_total",commitment.get("observation_days",0)) or 0)
    if not complete: return {"outcome":"INCONCLUSIVE","rule_type":"window_complete","reasons":[f"Observation is day {obs.get('days_elapsed',0)} of {obs.get('days_total',0)}."]}
    signals=case.get("recurrence_signals") or []
    if any(x.get("confirmed") for x in signals): return {"outcome":"FAILED","rule_type":"confirmed_recurrence","reasons":["A recurrence signal was confirmed during the observation window."]}
    rule=(commitment.get("acceptance_rule") or "").lower()
    checks=case.get("night_checks") or []
    if "night" in rule and not checks: return {"outcome":"INCONCLUSIVE","rule_type":"night_verification","reasons":["Independent night verification is required."]}
    if "night" in rule and any(x.get("outcome")=="off" for x in checks): return {"outcome":"FAILED","rule_type":"night_verification","reasons":["A night verification found the light off."]}
    if "night" in rule: return {"outcome":"PASSED","rule_type":"night_verification","reasons":["Independent night verification found the light on."]}
    if "rainfall" in rule and not case.get("rainfall_observations"): return {"outcome":"INCONCLUSIVE","rule_type":"rainfall_recurrence","reasons":["No rainfall observation has been recorded."]}
    if "rainfall" in rule and any(x.get("standing_water") for x in case.get("rainfall_observations",[])): return {"outcome":"FAILED","rule_type":"rainfall_recurrence","reasons":["Standing water was recorded after rainfall."]}
    return {"outcome":"PASSED","rule_type":"no_confirmed_recurrence","reasons":["The observation window completed with no confirmed recurrence."]}

async def run_engine(case: dict, actor: dict, source: str="engine") -> dict:
    result=evaluate_outcome(case); outcome=result["outcome"]; status_value="RESOLVED" if outcome=="PASSED" else ("REOPENED" if outcome=="FAILED" else "OUTCOME_PENDING")
    await db.cases.update_one({"id":case["id"]},{"$set":{"outcome":outcome,"outcome_source":source,"outcome_evaluation":result,"status":status_value,"updated_at":iso(now())}})
    await append_event(case["id"],"OUTCOME_EVALUATED",actor,{**result,"source":source})
    if outcome=="FAILED" and not any(x.get("status")=="OPEN" for x in (case.get("corrective") or [])):
        ob={"id":new_id(),"intervention":"Corrective action required","observation_days":60,"required_evidence":"Before + after evidence","created_at":iso(now()),"status":"OPEN","auto_created":True,"checkpoints":[{"day":d,"status":"pending","note":None,"updated_at":None} for d in (7,30,60)]}
        await db.cases.update_one({"id":case["id"]},{"$push":{"corrective":ob}}); await append_event(case["id"],"CORRECTIVE_OBLIGATION_CREATED",actor,ob)
    return result

# ---------- auth ----------
@api.post("/auth/register")
async def register(inp: RegisterIn):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    user = {
        "id": new_id(),
        "email": inp.email.lower(),
        "name": inp.name,
        "role": inp.role,
        "password": hash_password(inp.password),
        "created_at": iso(now()),
    }
    await db.users.insert_one(dict(user))
    token = make_token(user["id"])
    return {"token": token, "user": {k: user[k] for k in ("id", "email", "name", "role")}}


@api.post("/auth/login")
async def login(inp: LoginIn):
    user = await db.users.find_one({"email": inp.email.lower()})
    if not user or not verify_password(inp.password, user["password"]):
        # Generic message
        raise HTTPException(401, "Invalid email or password")
    token = make_token(user["id"])
    return {"token": token, "user": {k: user[k] for k in ("id", "email", "name", "role")}}


@api.get("/auth/me")
async def me(user: dict = Depends(get_user)):
    return {"user": user}


# ---------- cases ----------
@api.post("/cases")
async def create_case(inp: CaseCreateIn, user: dict = Depends(get_user)):
    # Idempotency: same key returns same case
    if inp.idempotency_key:
        existing = await db.cases.find_one({"idempotency_key": inp.idempotency_key}, {"_id": 0})
        if existing:
            existing["evidence_signals"] = evidence_signals(existing)
            return {"case": existing, "recurrence": None, "duplicated": True}

    case_no = await next_case_number(inp.mode)
    cat_key = inp.category if inp.category in COMMITMENTS else "Other"
    commitment = COMMITMENTS[cat_key]

    loc = inp.location
    if loc and inp.mode == "women":
        loc = {**loc, "precision": "APPROXIMATE"}
    elif loc and "precision" not in loc:
        loc["precision"] = "EXACT"

    evidence_items = []
    for i, u in enumerate(inp.evidence_urls):
        meta = inp.evidence_meta[i] if i < len(inp.evidence_meta) else {}
        evidence_items.append({
            "id": new_id(),
            "type": "before",
            "url": u,
            "captured_at": iso(now()),
            "hash": meta.get("hash"),
            "size": meta.get("size"),
            "width": meta.get("width"),
            "height": meta.get("height"),
            "exif_present": bool(meta.get("exif_present")),
        })

    case = {
        "id": new_id(),
        "case_number": case_no,
        "category": inp.category,
        "mode": inp.mode,
        "title": inp.title,
        "description": inp.description,
        "severity": inp.severity,
        "status": "SUBMITTED",
        "outcome": None,
        "review_status": "NONE",
        "dispute_resolution": None,
        "outcome_source": None,
        "outcome_evaluation": None,
        "recurrence_signals": [],
        "created_by": user["id"],
        "created_by_name": user["name"],
        "assigned_authority": None,
        "location": loc,
        "commitment": {
            "asset": inp.title,
            "problem": inp.description,
            "intervention": commitment["intervention"],
            "target_hours": commitment["target_hours"],
            "observation_days": commitment["observation_days"],
            "acceptance_rule": commitment["acceptance"],
            "required_evidence": "Before + after evidence",
        },
        "intervention": None,
        "observation": None,
        "corrective": [],
        "replies": [],
        "evidence": evidence_items,
        "idempotency_key": inp.idempotency_key,
        "created_at": iso(now()),
        "updated_at": iso(now()),
        "demo": False,
    }
    await db.cases.insert_one(dict(case))
    await append_event(
        case["id"], "CASE_CREATED", user,
        {"case_number": case_no, "category": inp.category, "title": inp.title, "mode": inp.mode},
    )
    recurrence = await check_recurrence(case, user)
    await push_notification(user["id"], f"Case {case_no} created", "Your report is now in the TRACE outcome trail.", case["id"])
    resp_case = scrub(case)
    resp_case["evidence_signals"] = evidence_signals(case)
    return {"case": resp_case, "recurrence": recurrence, "duplicated": False}


@api.get("/cases")
async def list_cases(
    mine: bool = False,
    mode: Optional[str] = None,
    status_filter: Optional[str] = None,
    user: dict = Depends(get_user),
):
    q: dict = {}
    if mine or user["role"] == "citizen":
        q["created_by"] = user["id"]
    if user["role"] == "authority" and not mine:
        # authorities see everything
        q = {}
    if mode:
        q["mode"] = mode
    if status_filter:
        q["status"] = status_filter
    docs = await db.cases.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"cases": docs}


@api.get("/cases/public")
async def public_cases(mode: Optional[str] = None):
    """Public preview (no auth) — used by home page."""
    q: dict = {}
    if mode:
        q["mode"] = mode
    docs = await db.cases.find(q, {"_id": 0, "created_by": 0, "location.lat": 0, "location.lng": 0}).sort("created_at", -1).limit(20).to_list(20)
    # Redact women mode locations
    for d in docs:
        if d.get("mode") == "women" and d.get("location"):
            d["location"] = {"precision": "APPROXIMATE", "area": d["location"].get("area", "Approximate area")}
    return {"cases": docs}


@api.get("/cases/{case_id}")
async def get_case(case_id: str, user: dict = Depends(get_user)):
    case = await db.cases.find_one({"$or": [{"id": case_id}, {"case_number": case_id}]}, {"_id": 0})
    if not case:
        raise HTTPException(404, "Case not found")
    events = await db.events.find({"case_id": case["id"]}, {"_id": 0}).sort("seq", 1).to_list(500)
    case["evidence_signals"] = evidence_signals(case)
    case["integrity_score"] = integrity_score(case)
    case["detection"] = visual_detection(case)
    share_base = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or ""
    case["share_url"] = f"{share_base}/api/share/{case['case_number']}" if share_base else f"/api/share/{case['case_number']}"
    return {"case": case, "events": events}


async def get_case_or_404(case_id: str) -> dict:
    case = await db.cases.find_one({"$or": [{"id": case_id}, {"case_number": case_id}]}, {"_id": 0})
    if not case:
        raise HTTPException(404, "Case not found")
    return case


@api.post("/cases/{case_id}/intervention")
async def submit_intervention(case_id: str, inp: InterventionIn, user: dict = Depends(require_role("authority", "admin"))):
    case = await get_case_or_404(case_id)
    case_id = case["id"]
    intervention = {
        "id": new_id(),
        "description": inp.description,
        "submitted_by": user["id"],
        "submitted_by_name": user["name"],
        "submitted_at": iso(now()),
        "proof_urls": inp.proof_urls,
    }
    after_evidence = [
        {"id": new_id(), "type": "after", "url": u, "captured_at": iso(now()), "submitted_by": user["id"]}
        for u in inp.proof_urls
    ]
    observation = {
        "started_at": iso(now()),
        "days_total": case["commitment"]["observation_days"],
        "days_elapsed": 0,
        "review_points": [d for d in (7, 30, 60, 90) if d <= case["commitment"]["observation_days"]],
        "review_points_reached": [],
        "last_advance": iso(now()),
    }
    await db.cases.update_one(
        {"id": case_id},
        {"$set": {
            "intervention": intervention,
            "status": "OBSERVATION",
            "observation": observation,
            "assigned_authority": user["id"],
            "updated_at": iso(now()),
        }, "$push": {"evidence": {"$each": after_evidence}}},
    )
    await append_event(case_id, "INTERVENTION_SUBMITTED", user, {"description": inp.description, "proof_count": len(inp.proof_urls)})
    await append_event(case_id, "OBSERVATION_STARTED", user, {"days_total": observation["days_total"]})
    await push_notification(case["created_by"], f"Intervention submitted for {case['case_number']}", "Evidence available. Please review.", case_id)
    # Streetlight cases: prompt reporter to run a night check after dark.
    if (case.get("category") or "").lower().startswith("broken streetlight"):
        await push_notification(
            case["created_by"],
            f"Night check tonight · {case['case_number']}",
            "After dark, tap the case and confirm the light is on. Independent verification strengthens the outcome.",
            case_id,
        )
    return {"ok": True}


@api.post("/cases/{case_id}/observation/advance")
async def advance_observation(case_id: str, inp: AdvanceIn, user: dict = Depends(get_user)):
    """Demo simulation — clearly labeled on frontend."""
    case = await get_case_or_404(case_id)
    case_id = case["id"]
    if not case.get("observation"):
        raise HTTPException(400, "No active observation")
    obs = case["observation"]
    new_elapsed = min(obs["days_total"], obs["days_elapsed"] + max(0, inp.days))
    reached = sorted(set(obs.get("review_points_reached", [])) | {d for d in obs.get("review_points", []) if obs["days_elapsed"] < d <= new_elapsed})
    await db.cases.update_one({"id": case_id}, {"$set": {"observation.days_elapsed": new_elapsed, "observation.last_advance": iso(now()), "observation.review_points_reached": reached, "updated_at": iso(now())}})
    await append_event(case_id, "OBSERVATION_ADVANCED", user, {"by_days": inp.days, "days_elapsed": new_elapsed, "days_total": obs["days_total"], "crossed_review_points": reached, "simulated": True})
    if 30 in reached and not any(x.get("day") == 30 for x in (case.get("recurrence_signals") or [])):
        signal={"id":new_id(),"day":30,"kind":"possible_recurrence","confirmed":False,"note":"Possible recurrence requires human confirmation.","created_at":iso(now())}
        await db.cases.update_one({"id":case_id},{"$push":{"recurrence_signals":signal}})
        await append_event(case_id,"RECURRENCE_SIGNAL",user,signal)
    return {"ok": True, "days_elapsed": new_elapsed, "days_total": obs["days_total"], "review_points_reached": reached}


@api.post("/cases/{case_id}/review")
async def citizen_review(case_id: str, inp: ReviewIn, user: dict = Depends(get_user)):
    case = await get_case_or_404(case_id)
    case_id = case["id"]
    if user["role"] == "citizen" and case["created_by"] != user["id"]:
        raise HTTPException(403, "Only the reporter can review")
    if inp.decision == "accept":
        await db.cases.update_one({"id": case_id}, {"$set": {"review_status": "NONE",
        "dispute_resolution": None,
        "outcome_source": None,
        "outcome_evaluation": None,
        "recurrence_signals": [], "updated_at": iso(now())}})
        await append_event(case_id, "CITIZEN_ACCEPT", user, {"note": inp.note})
    else:
        await db.cases.update_one(
            {"id": case_id},
            {"$set": {"review_status": "DISPUTED", "dispute_resolution": "OPEN", "status": "DISPUTED", "updated_at": iso(now())}},
        )
        await append_event(case_id, "CITIZEN_CHALLENGE", user, {"reason": inp.reason, "note": inp.note})
        assignee = case.get("assigned_authority")
        if assignee:
            await push_notification(assignee, f"Case {case['case_number']} disputed", inp.reason or "Citizen questioned resolution.", case_id)
    return {"ok": True}


@api.post("/cases/{case_id}/dispute/resolve")
async def resolve_dispute(case_id: str, inp: DisputeResolutionIn, user: dict = Depends(require_role("authority", "admin"))):
    case=await get_case_or_404(case_id)
    if case.get("review_status")!="DISPUTED": raise HTTPException(400,"Case is not disputed")
    await db.cases.update_one({"id":case["id"]},{"$set":{"dispute_resolution":inp.resolution,"review_status":"RESOLVED","status":"OUTCOME_PENDING","updated_at":iso(now())}})
    await append_event(case["id"],"DISPUTE_RESOLVED",user,{"resolution":inp.resolution,"note":inp.note})
    result=await run_engine(await get_case_or_404(case["id"]),user,"dispute_resolution") if inp.resolution!="WITHDRAWN" else None
    return {"ok":True,"resolution":inp.resolution,"evaluation":result}

@api.post("/cases/{case_id}/evaluate")
async def evaluate_case(case_id: str, user: dict = Depends(require_role("authority", "admin"))):
    return {"ok":True,"evaluation":await run_engine(await get_case_or_404(case_id),user)}

@api.post("/cases/{case_id}/recurrence/{signal_id}/confirm")
async def confirm_recurrence(case_id: str, signal_id: str, user: dict = Depends(get_user)):
    case=await get_case_or_404(case_id); signals=case.get("recurrence_signals") or []; signal=next((x for x in signals if x.get("id")==signal_id),None)
    if not signal: raise HTTPException(404,"Recurrence signal not found")
    signal.update({"confirmed":True,"confirmed_by":user["id"],"confirmed_at":iso(now())}); await db.cases.update_one({"id":case["id"]},{"$set":{"recurrence_signals":signals}}); await append_event(case["id"],"RECURRENCE_CONFIRMED",user,{"signal_id":signal_id}); return {"ok":True,"signal":signal}

@api.post("/cases/{case_id}/outcome")
async def set_outcome(case_id: str, inp: OutcomeIn, user: dict = Depends(require_role("authority", "admin"))):
    case = await get_case_or_404(case_id)
    case_id = case["id"]
    new_status = "RESOLVED" if inp.outcome == "PASSED" else ("REOPENED" if inp.outcome == "FAILED" else "OUTCOME_PENDING")
    engine_result=evaluate_outcome(case)
    await db.cases.update_one({"id": case_id}, {"$set": {"outcome": inp.outcome, "outcome_source": "manual", "outcome_evaluation": engine_result, "status": new_status, "updated_at": iso(now())}})
    await append_event(case_id, "OUTCOME_REVIEWED", user, {"outcome": inp.outcome, "note": inp.note})
    if inp.outcome != engine_result["outcome"]: await append_event(case_id, "OUTCOME_OVERRIDDEN", user, {"manual_outcome": inp.outcome, "engine_outcome": engine_result["outcome"], "engine_reasons": engine_result["reasons"]})
    await push_notification(case["created_by"], f"Outcome: {inp.outcome} — {case['case_number']}", "Review the evidence and observation coverage.", case_id)
    return {"ok": True}


@api.post("/cases/{case_id}/corrective")
async def create_corrective(case_id: str, inp: CorrectiveIn, user: dict = Depends(require_role("authority", "admin"))):
    case = await get_case_or_404(case_id)
    case_id = case["id"]
    # Seed checkpoints based on observation window
    seed_days = [7, 30, 60] if inp.observation_days >= 60 else [7, 30]
    checkpoints = [
        {"day": d, "status": "pending", "note": None, "updated_at": None}
        for d in seed_days if d <= inp.observation_days
    ]
    ob = {
        "id": new_id(),
        "intervention": inp.intervention,
        "observation_days": inp.observation_days,
        "required_evidence": inp.required_evidence,
        "created_at": iso(now()),
        "status": "OPEN",
        "checkpoints": checkpoints,
    }
    await db.cases.update_one(
        {"id": case_id},
        {"$push": {"corrective": ob}, "$set": {"status": "INTERVENTION", "outcome": None, "updated_at": iso(now())}},
    )
    await append_event(case_id, "CORRECTIVE_OBLIGATION_CREATED", user, ob)
    await push_notification(case["created_by"], f"Corrective obligation on {case['case_number']}", inp.intervention, case_id)
    return {"ok": True, "corrective": ob}


@api.post("/cases/{case_id}/corrective/{cid}/checkpoint")
async def update_checkpoint(case_id: str, cid: str, inp: CheckpointIn, user: dict = Depends(require_role("authority", "admin"))):
    case = await get_case_or_404(case_id)
    case_id = case["id"]
    corr = None
    for c in (case.get("corrective") or []):
        if c["id"] == cid:
            corr = c
            break
    if not corr:
        raise HTTPException(404, "Corrective obligation not found")
    # find checkpoint by day, upsert
    existing = next((cp for cp in corr.get("checkpoints", []) if cp["day"] == inp.day), None)
    if existing:
        existing["status"] = inp.status
        existing["note"] = inp.note
        existing["updated_at"] = iso(now())
    else:
        corr.setdefault("checkpoints", []).append({"day": inp.day, "status": inp.status, "note": inp.note, "updated_at": iso(now())})
    # rewrite corrective array
    new_corr = [c if c["id"] != cid else corr for c in case["corrective"]]
    await db.cases.update_one({"id": case_id}, {"$set": {"corrective": new_corr, "updated_at": iso(now())}})
    await append_event(case_id, "CHECKPOINT_UPDATED", user, {"corrective_id": cid, "day": inp.day, "status": inp.status, "note": inp.note})
    await push_notification(case["created_by"], f"Checkpoint update on {case['case_number']}", f"Day {inp.day}: {inp.status.replace('_', ' ')}", case_id)
    return {"ok": True, "corrective": corr}


# ---------- public share ----------
from fastapi.responses import HTMLResponse


@api.get("/share/{case_id}.json")
async def share_card_json(case_id: str):
    case = await db.cases.find_one({"$or": [{"id": case_id}, {"case_number": case_id}]}, {"_id": 0})
    if not case:
        raise HTTPException(404, "Case not found")
    return {
        "case_number": case["case_number"],
        "title": case["title"],
        "category": case["category"],
        "outcome": case.get("outcome"),
        "status": case["status"],
        "observation": case.get("observation"),
        "event_count": await db.events.count_documents({"case_id": case["id"]}),
    }


@api.get("/share/{case_id}", response_class=HTMLResponse)
async def share_card(case_id: str):
    case = await db.cases.find_one({"$or": [{"id": case_id}, {"case_number": case_id}]}, {"_id": 0})
    if not case:
        return HTMLResponse("<h1>Case not found</h1>", status_code=404)
    # redact sensitive info
    is_women = case.get("mode") == "women"
    location = "Approximate area" if is_women else ((case.get("location") or {}).get("area") or "Location approximate")
    outcome = case.get("outcome") or ("DISPUTED" if case.get("review_status") == "DISPUTED" else case.get("status"))
    outcome_color = {"PASSED": "#10B981", "FAILED": "#EF4444", "INCONCLUSIVE": "#F59E0B"}.get(outcome, "#00C2D6")
    events = await db.events.count_documents({"case_id": case["id"]})
    steps = ["REPORT", "ACTION", "PROOF", "OBSERVE", "OUTCOME"]
    active = 4 if case.get("outcome") else 3 if case.get("observation") else 2 if case.get("intervention") else 0
    steps_html = " → ".join(
        f'<span style="color:{"#F8FAFC" if i<=active else "#64748B"};font-weight:{800 if i==active else 600};">{s}</span>'
        for i, s in enumerate(steps)
    )
    html = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=390"/>
<title>{case['case_number']} · TRACE</title>
<meta property="og:title" content="{case['case_number']} · TRACE"/>
<meta property="og:description" content="{case['title']}"/>
<meta property="og:type" content="website"/>
<style>
  html,body {{ margin:0;padding:0;background:#060B14;color:#F8FAFC;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }}
  .wrap {{ max-width:520px;margin:0 auto;padding:24px; }}
  .card {{ background:#0A1220;border:1px solid #1E293B;border-radius:20px;padding:24px;position:relative;overflow:hidden; }}
  .glow {{ position:absolute;top:-80px;right:-80px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(0,229,255,0.25),transparent 70%); }}
  .brand {{ display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:2px;color:#00C2D6; }}
  .brand .box {{ width:28px;height:28px;border-radius:8px;background:#003D47;border:1px solid #00C2D6;display:flex;align-items:center;justify-content:center;color:#00E5FF; }}
  h1 {{ font-size:28px;line-height:1.15;margin:16px 0 6px 0; }}
  .case-no {{ color:#00C2D6;font-weight:800;letter-spacing:1px;font-size:12px; }}
  .meta {{ color:#64748B;font-size:13px; }}
  .pill {{ display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:0.5px;color:#060B14;background:{outcome_color}; }}
  .steps {{ display:flex;gap:6px;margin-top:18px;font-size:11px;letter-spacing:1px;flex-wrap:wrap; }}
  .stats {{ display:flex;gap:14px;margin-top:20px;padding-top:16px;border-top:1px solid #1E293B; }}
  .stat b {{ display:block;font-size:20px;font-weight:800;color:#F8FAFC; }}
  .stat s {{ display:block;font-size:10px;letter-spacing:0.6px;color:#64748B;text-transform:uppercase;text-decoration:none; }}
  .tag {{ color:#64748B;font-size:11px;margin-top:14px;letter-spacing:0.5px;text-transform:uppercase; }}
  a {{ color:#00E5FF;text-decoration:none; }}
</style></head>
<body>
  <div class="wrap"><div class="card">
    <div class="glow"></div>
    <div class="brand"><div class="box">◈</div>TRACE</div>
    <div class="case-no" style="margin-top:20px">{case['case_number']}</div>
    <h1>{case['title']}</h1>
    <div class="meta">{case['category']} · {location}</div>
    <div style="margin-top:14px"><span class="pill">{outcome}</span></div>
    <div class="steps">{steps_html}</div>
    <div class="stats">
      <div class="stat"><b>{events}</b><s>Recorded events</s></div>
      <div class="stat"><b>{len(case.get('evidence') or [])}</b><s>Evidence items</s></div>
      <div class="stat"><b>{(case.get('observation') or {}).get('days_elapsed', 0)}/{(case.get('observation') or {}).get('days_total', case.get('commitment', {}).get('observation_days', 0))}</b><s>Observation days</s></div>
    </div>
    <div class="tag">Tamper-evident prototype ledger · TRACE turns "Resolved" from a button into a verifiable outcome.</div>
  </div></div>
</body></html>"""
    return HTMLResponse(content=html)


# ---------- replies (authority public updates) ----------
@api.post("/cases/{case_id}/replies")
async def add_reply(case_id: str, inp: ReplyIn, user: dict = Depends(require_role("authority", "admin"))):
    case = await get_case_or_404(case_id)
    case_id = case["id"]
    reply = {
        "id": new_id(),
        "body": inp.body.strip(),
        "author_id": user["id"],
        "author_name": user["name"],
        "author_role": user["role"],
        "created_at": iso(now()),
    }
    await db.cases.update_one({"id": case_id}, {"$push": {"replies": reply}, "$set": {"updated_at": iso(now())}})
    await append_event(case_id, "CASE_REPLY", user, {"body": reply["body"], "reply_id": reply["id"]})
    await push_notification(case["created_by"], f"Update on {case['case_number']}", inp.body[:120], case_id)
    return {"ok": True, "reply": reply}


# ---------- sync (offline queue) ----------
@api.post("/cases/sync")
async def sync_case(inp: SyncCaseIn, user: dict = Depends(get_user)):
    """Idempotent case creation for offline-queued reports."""
    if not inp.idempotency_key:
        raise HTTPException(400, "idempotency_key required")
    payload = CaseCreateIn(
        category=inp.category, title=inp.title, description=inp.description,
        severity=inp.severity, mode=inp.mode, location=inp.location,
        evidence_urls=inp.evidence_urls, evidence_meta=inp.evidence_meta,
        idempotency_key=inp.idempotency_key,
    )
    return await create_case(payload, user)


# ---------- evidence analysis (DEMO) ----------
@api.post("/evidence/analyze")
async def analyze_evidence(inp: EvidenceAnalyzeIn, user: dict = Depends(get_user)):
    """Prototype: takes evidence metadata (hash, size, ...) and returns explainable signals.
    Never claims to certify truth."""
    signals: list[dict] = []
    def add(key, label, ok, note=None):
        signals.append({"key": key, "label": label, "ok": ok, "note": note})
    add("file_present", "File attached", True)
    add("size_ok", "Reasonable file size", bool(inp.size and 20_000 <= inp.size <= 20_000_000), None if inp.size else "Size unknown")
    add("dimensions", "Image dimensions available", bool(inp.width and inp.height))
    add("metadata", "Metadata (EXIF) present", bool(inp.exif_present), "EXIF not always required")
    dup = None
    if inp.hash:
        add("hash", "Content hash computed", True)
        dup_case = await db.cases.find_one({"evidence.hash": inp.hash}, {"_id": 0, "id": 1, "case_number": 1, "title": 1})
        if dup_case:
            add("duplicate", "Identical image previously submitted", False, f"Matches case {dup_case['case_number']}")
            dup = dup_case
        else:
            add("duplicate", "No duplicate detected", True)
    detection_seed = int(inp.hash[:8], 16) if inp.hash and len(inp.hash) >= 8 else abs(hash(inp.category or "civic")) & 0xFFFFFFFF
    cat = (inp.category or "").lower()
    issue = ("Pothole" if "pothole" in cat else
             "Waterlogging" if "waterlog" in cat else
             "Waste accumulation" if "garbage" in cat or "waste" in cat else
             "Water leak" if "water" in cat and "leak" in cat else
             "Broken streetlight" if "streetlight" in cat else
             "Environmental change" if "environment" in cat else "Civic condition")
    confidence = 55 + (detection_seed % 40)
    # score
    ok_count = sum(1 for s in signals if s["ok"])
    integrity_pct = int(round(100 * ok_count / max(1, len(signals))))
    return {
        "detection": {"issue": issue, "confidence": confidence, "recommendation": "Human verification required", "demo": True},
        "integrity": {"score": integrity_pct, "band": "high" if integrity_pct >= 80 else ("medium" if integrity_pct >= 55 else "low")},
        "signals": signals,
        "duplicate": dup,
        "prototype": True,
    }


# ---------- leaderboard & digest ----------
@api.get("/memory/leaderboard")
async def leaderboard():
    cases = await db.cases.find({}, {"_id": 0}).to_list(500)
    buckets: dict[str, dict] = {}
    for c in cases:
        area = (c.get("location") or {}).get("area") or "Unspecified area"
        b = buckets.setdefault(area, {"area": area, "total": 0, "resolved": 0, "failed": 0, "disputed": 0})
        b["total"] += 1
        if c.get("outcome") == "PASSED":
            b["resolved"] += 1
        elif c.get("outcome") == "FAILED":
            b["failed"] += 1
        if c.get("review_status") == "DISPUTED":
            b["disputed"] += 1
    rows = [{**b, "resolution_rate": int(round(100 * b["resolved"] / max(1, b["total"])))} for b in buckets.values() if b["total"] >= 1]
    rows.sort(key=lambda x: (x["resolution_rate"], x["total"]), reverse=True)
    return {"top": rows[:5], "bottom": sorted(rows, key=lambda x: x["resolution_rate"])[:5]}


@api.get("/notifications/digest")
async def digest(user: dict = Depends(get_user)):
    since = now() - timedelta(days=7)
    since_iso = iso(since)
    q_own = {"created_by": user["id"]}
    total_new = await db.cases.count_documents({**q_own, "created_at": {"$gte": since_iso}})
    outcomes = await db.cases.count_documents({**q_own, "outcome": {"$ne": None}, "updated_at": {"$gte": since_iso}})
    disputed = await db.cases.count_documents({**q_own, "review_status": "DISPUTED", "updated_at": {"$gte": since_iso}})
    # recurrences from events
    my_case_ids = [c["id"] for c in await db.cases.find(q_own, {"_id": 0, "id": 1}).to_list(500)]
    recurrences = await db.events.count_documents({"case_id": {"$in": my_case_ids}, "type": "RECURRENCE_DETECTED", "created_at": {"$gte": since_iso}})
    checkpoints = await db.events.count_documents({"case_id": {"$in": my_case_ids}, "type": "CHECKPOINT_UPDATED", "created_at": {"$gte": since_iso}})
    return {
        "week_start": since_iso,
        "new_cases": total_new,
        "outcomes_verified": outcomes,
        "disputes": disputed,
        "recurrences": recurrences,
        "checkpoints": checkpoints,
    }


# ---------- memory cluster ----------
@api.get("/memory/cluster")
async def memory_cluster(area: str):
    cases = await db.cases.find({"location.area": area}, {"_id": 0}).sort("created_at", 1).to_list(200)
    ids = [c["id"] for c in cases]
    events = await db.events.find({"case_id": {"$in": ids}, "type": {"$in": ["RECURRENCE_DETECTED", "OUTCOME_REVIEWED", "CORRECTIVE_OBLIGATION_CREATED"]}}, {"_id": 0}).to_list(500)
    for c in cases:
        c["timeline_events"] = [e for e in events if e["case_id"] == c["id"]]
    return {"area": area, "cases": cases}


@api.get("/memory/nearby")
async def memory_nearby(mode: Optional[str] = "civic"):
    """Areas with active recurrence / open corrective / disputed cases — a lightweight radar for the Home chip."""
    q: dict = {}
    if mode: q["mode"] = mode
    cases = await db.cases.find(q, {"_id": 0}).to_list(500)
    hot: dict[str, dict] = {}
    for c in cases:
        area = (c.get("location") or {}).get("area")
        if not area:
            continue
        why = None
        if c.get("corrective"):
            why = "open corrective"
        elif c.get("review_status") == "DISPUTED":
            why = "disputed"
        elif c.get("outcome") == "FAILED":
            why = "failed"
        if not why:
            continue
        b = hot.setdefault(area, {"area": area, "cases": 0, "reasons": set()})
        b["cases"] += 1
        b["reasons"].add(why)
    out = [{"area": b["area"], "cases": b["cases"], "reasons": sorted(b["reasons"])} for b in hot.values()]
    out.sort(key=lambda x: x["cases"], reverse=True)
    return {"count": sum(b["cases"] for b in out), "areas": out[:5]}


class NightCheckIn(BaseModel):
    outcome: Literal["on", "off"]
    note: Optional[str] = None


@api.post("/cases/{case_id}/night-check")
async def night_check(case_id: str, inp: NightCheckIn, user: dict = Depends(get_user)):
    case = await get_case_or_404(case_id)
    case_id = case["id"]
    entry = {"id": new_id(), "outcome": inp.outcome, "note": inp.note, "at": iso(now()), "by": user["id"]}
    await db.cases.update_one({"id": case_id}, {"$push": {"night_checks": entry}, "$set": {"updated_at": iso(now())}})
    await append_event(case_id, "NIGHT_CHECK", user, entry)
    # Notify authority if the light is still off
    if inp.outcome == "off" and case.get("assigned_authority"):
        await push_notification(case["assigned_authority"], f"Night check reports light still OFF · {case['case_number']}", inp.note or "Citizen verified after dark that the streetlight is not working.", case_id)
    return {"ok": True, "night_check": entry}


# ---------- activity, memory, integrity ----------
@api.get("/activity")
async def activity(limit: int = 50):
    events = await db.events.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    # attach case titles
    ids = list({e["case_id"] for e in events})
    cases = await db.cases.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "case_number": 1, "title": 1, "mode": 1}).to_list(500)
    idx = {c["id"]: c for c in cases}
    for e in events:
        e["case"] = idx.get(e["case_id"])
    return {"events": events}


@api.get("/memory")
async def memory():
    """Aggregate Civic Memory by location area."""
    cases = await db.cases.find({}, {"_id": 0}).to_list(500)
    buckets: dict[str, dict] = {}
    for c in cases:
        area = (c.get("location") or {}).get("area") or "Unspecified area"
        b = buckets.setdefault(area, {"area": area, "interventions": 0, "recurrences": 0, "open_corrective": 0, "cases": []})
        b["cases"].append({"id": c["id"], "case_number": c["case_number"], "title": c["title"], "status": c["status"], "outcome": c.get("outcome"), "created_at": c["created_at"]})
        if c.get("intervention"):
            b["interventions"] += 1
        if c.get("corrective"):
            b["open_corrective"] += len(c["corrective"])
        if c.get("review_status") == "DISPUTED" or c.get("outcome") == "FAILED":
            b["recurrences"] += 1
    result = list(buckets.values())
    for b in result:
        b["evidence_coverage"] = min(100, 40 + b["interventions"] * 20)
    result.sort(key=lambda x: (x["recurrences"] + x["interventions"]), reverse=True)
    return {"memory": result}


@api.get("/integrity/{case_id}")
async def integrity(case_id: str):
    case = await db.cases.find_one({"$or": [{"id": case_id}, {"case_number": case_id}]}, {"_id": 0, "id": 1, "case_number": 1, "title": 1, "mode": 1})
    if not case:
        raise HTTPException(404, "Case not found")
    events = await db.events.find({"case_id": case["id"]}, {"_id": 0}).sort("seq", 1).to_list(500)
    # verify chain
    verified = True
    prev = "0" * 64
    for e in events:
        if e["prev_hash"] != prev:
            verified = False
            break
        # recompute hash
        recomputed = sha256_hex({k: v for k, v in e.items() if k not in ("hash", "anchored", "anchor_tx")})
        if recomputed != e["hash"]:
            verified = False
            break
        prev = e["hash"]
    last = events[-1] if events else None
    return {
        "case": case,
        "events": events,
        "verified": verified,
        "event_count": len(events),
        "last_hash": last["hash"] if last else None,
        "last_committed": last["created_at"] if last else None,
        "network": "TAMPER-EVIDENT PROTOTYPE LEDGER",
        "chain_id": None,
        "note": "Blockchain anchoring is available when the Sepolia contract is configured.",
    }


@api.post("/integrity/{case_id}/anchor")
async def anchor(case_id: str, user: dict = Depends(require_role("authority", "admin"))):
    """Prototype anchor: locks the current chain hash and marks events anchored.
    Does NOT produce a fake Ethereum tx hash."""
    events = await db.events.find({"case_id": case_id}, {"_id": 0}).sort("seq", 1).to_list(500)
    if not events:
        raise HTTPException(400, "Nothing to anchor")
    last = events[-1]
    marker_id = new_id()
    await db.integrity_anchors.insert_one({
        "id": marker_id,
        "case_id": case_id,
        "anchored_hash": last["hash"],
        "anchored_at": iso(now()),
        "anchored_by": user["id"],
        "network": "prototype",
    })
    await db.events.update_many({"case_id": case_id}, {"$set": {"anchored": True}})
    await append_event(case_id, "INTEGRITY_ANCHORED", user, {"anchored_hash": last["hash"], "marker": marker_id, "prototype": True})
    return {"ok": True, "anchored_hash": last["hash"], "marker": marker_id, "prototype": True}


# ---------- notifications ----------
async def push_notification(user_id: Optional[str], title: str, body: str, case_id: Optional[str] = None):
    if not user_id:
        return
    await db.notifications.insert_one({
        "id": new_id(),
        "user_id": user_id,
        "title": title,
        "body": body,
        "case_id": case_id,
        "read": False,
        "created_at": iso(now()),
    })


@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_user)):
    docs = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"notifications": docs}


@api.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- women mode: washrooms ----------
@api.get("/washrooms")
async def washrooms():
    docs = await db.washrooms.find({}, {"_id": 0}).sort("name", 1).to_list(50)
    return {"washrooms": docs}


# ---------- AI: duplicate & completeness signals ----------
@api.post("/ai/duplicate-check")
async def duplicate_check(inp: DuplicateCheckIn, user: dict = Depends(get_user)):
    """Lightweight duplicate hint: keyword overlap + geographic clue.
    Uses Emergent LLM (Gemini flash) if key configured, else deterministic fallback.
    """
    recent = await db.cases.find(
        {"category": inp.category},
        {"_id": 0, "id": 1, "case_number": 1, "title": 1, "description": 1, "created_at": 1},
    ).sort("created_at", -1).limit(15).to_list(15)

    def score(a: str, b: str) -> float:
        wa = set(a.lower().split())
        wb = set(b.lower().split())
        if not wa or not wb:
            return 0.0
        return len(wa & wb) / max(1, len(wa | wb))

    ranked = sorted(
        recent,
        key=lambda c: score(inp.title + " " + inp.description, c["title"] + " " + c.get("description", "")),
        reverse=True,
    )
    top = ranked[:3]

    ai_note = None
    if EMERGENT_LLM_KEY and top:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"dup-{new_id()[:8]}",
                system_message="You are a civic-tech assistant. Reply with ONE short sentence hinting whether the new report likely duplicates an existing one. Never say 'AI proves'. Use cautious language like 'possible duplicate' or 'looks distinct'.",
            ).with_model("gemini", "gemini-3-flash-preview")
            prompt = f"NEW: {inp.title}. {inp.description}\nCANDIDATES:\n" + "\n".join(f"- {c['case_number']}: {c['title']} — {c.get('description','')[:120]}" for c in top)
            resp = await chat.send_message(UserMessage(text=prompt))
            ai_note = str(resp).strip()[:220]
        except Exception as e:
            log.warning(f"ai duplicate check failed: {e}")
    return {"candidates": top, "ai_note": ai_note}


# ---------- seeding ----------
async def seed_if_empty():
    if await db.users.count_documents({}) > 0:
        return
    log.info("Seeding TRACE demo data…")
    users_seed = [
        {"email": "citizen@trace.demo", "name": "Aarav Citizen", "role": "citizen"},
        {"email": "authority@trace.demo", "name": "Priya Authority", "role": "authority"},
        {"email": "admin@trace.demo", "name": "Trace Admin", "role": "admin"},
    ]
    users = {}
    for u in users_seed:
        doc = {"id": new_id(), "email": u["email"], "name": u["name"], "role": u["role"], "password": hash_password("demo1234"), "created_at": iso(now())}
        await db.users.insert_one(dict(doc))
        users[u["role"]] = doc

    citizen = users["citizen"]
    authority = users["authority"]

    # Reset case counter
    await db.counters.delete_many({})

    seeds = [
        {"category": "Pothole", "title": "Large pothole on MG Road", "description": "Deep pothole causing unsafe road conditions near segment 14.", "mode": "civic", "location": {"lat": 12.9716, "lng": 77.5946, "precision": "EXACT", "area": "MG Road · Segment 14"}, "stage": "observation"},
        {"category": "Waterlogging", "title": "Waterlogging outside Sector 14 gate", "description": "Standing water 20+ cm after every rainfall.", "mode": "civic", "location": {"lat": 12.9420, "lng": 77.6100, "precision": "EXACT", "area": "Sector 14"}, "stage": "review"},
        {"category": "Broken Streetlight", "title": "Streetlight out on Park Road", "description": "Pole 47 dark since last week; unsafe for evening pedestrians.", "mode": "civic", "location": {"lat": 12.9550, "lng": 77.5900, "precision": "EXACT", "area": "Park Road"}, "stage": "resolved"},
        {"category": "Garbage / Waste", "title": "Recurring waste dump on Market Road", "description": "Waste dumped again three weeks after cleanup.", "mode": "civic", "location": {"lat": 12.9600, "lng": 77.6000, "precision": "EXACT", "area": "Market Road"}, "stage": "recurrence"},
        {"category": "Water Leak", "title": "Water leak in Block C", "description": "Continuous leak near main line; possible pipe fracture.", "mode": "civic", "location": {"lat": 12.9700, "lng": 77.5850, "precision": "EXACT", "area": "Block C"}, "stage": "intervention"},
        {"category": "Environmental Issue", "title": "Unauthorized tree removal in Green Belt", "description": "Large tree cut without visible authorization notice.", "mode": "environment", "location": {"lat": 12.9800, "lng": 77.6100, "precision": "APPROXIMATE", "area": "Green Belt"}, "stage": "new"},
        {"category": "Washroom", "title": "Dispenser empty at Central Metro washroom", "description": "Sanitary pad dispenser reported empty for 3 days.", "mode": "women", "location": {"precision": "APPROXIMATE", "area": "Central Metro Station"}, "stage": "new"},
    ]

    # Flagship TRC-2048 first — initialize counter to -1 so first next_case_number gives 2048.
    await db.counters.insert_one({"_id": "case_seq", "n": -1})

    for s in seeds:
        case_no = await next_case_number(s["mode"])
        # Force first civic case to be TRC-2048
        cat = s["category"]
        commitment = COMMITMENTS.get(cat, COMMITMENTS["Other"])
        cid = new_id()
        case = {
            "id": cid,
            "case_number": case_no,
            "category": cat,
            "mode": s["mode"],
            "title": s["title"],
            "description": s["description"],
            "severity": "high" if s["stage"] in ("recurrence", "review") else "medium",
            "status": "SUBMITTED",
            "outcome": None,
            "review_status": "NONE",
        "dispute_resolution": None,
        "outcome_source": None,
        "outcome_evaluation": None,
        "recurrence_signals": [],
            "created_by": citizen["id"],
            "created_by_name": citizen["name"],
            "assigned_authority": None,
            "location": s["location"],
            "commitment": {
                "asset": s["title"],
                "problem": s["description"],
                "intervention": commitment["intervention"],
                "target_hours": commitment["target_hours"],
                "observation_days": commitment["observation_days"],
                "acceptance_rule": commitment["acceptance"],
                "required_evidence": "Before + after evidence",
            },
            "intervention": None,
            "observation": None,
            "corrective": [],
            "evidence": [{"id": new_id(), "type": "before", "url": "https://images.pexels.com/photos/2612386/pexels-photo-2612386.jpeg", "captured_at": iso(now()), "hash": hashlib.sha256(f"before-{s['title']}".encode()).hexdigest(), "size": 480_000, "width": 1024, "height": 768, "exif_present": True}],
            "replies": [],
            "created_at": iso(now()),
            "updated_at": iso(now()),
            "demo": True,
        }
        await db.cases.insert_one(dict(case))
        await append_event(cid, "CASE_CREATED", citizen, {"case_number": case_no, "category": cat, "title": s["title"], "mode": s["mode"]})

        if s["stage"] in ("intervention", "observation", "review", "recurrence", "resolved"):
            iv = {"id": new_id(), "description": commitment["intervention"], "submitted_by": authority["id"], "submitted_by_name": authority["name"], "submitted_at": iso(now()), "proof_urls": ["https://images.unsplash.com/photo-1517511620798-cec17d428bc0?w=800"]}
            obs_days = commitment["observation_days"]
            elapsed = {"intervention": 2, "observation": 30, "review": 30, "recurrence": 45, "resolved": obs_days}[s["stage"]]
            obs = {"started_at": iso(now()), "days_total": obs_days, "days_elapsed": min(elapsed, obs_days), "review_points": [d for d in (7, 30, 60, 90) if d <= case["commitment"]["observation_days"]],
        "review_points_reached": [], "last_advance": iso(now())}
            after_ev = {"id": new_id(), "type": "after", "url": "https://images.unsplash.com/photo-1517511620798-cec17d428bc0?w=800", "captured_at": iso(now()), "submitted_by": authority["id"], "hash": hashlib.sha256(f"after-{cid}".encode()).hexdigest(), "size": 320_000, "width": 800, "height": 600, "exif_present": True}
            await db.cases.update_one({"id": cid}, {"$set": {"intervention": iv, "status": "OBSERVATION", "observation": obs, "assigned_authority": authority["id"]}, "$push": {"evidence": after_ev}})
            await append_event(cid, "INTERVENTION_SUBMITTED", authority, {"description": iv["description"]})
            await append_event(cid, "OBSERVATION_STARTED", authority, {"days_total": obs_days})
            # authority reply thread starter
            reply = {"id": new_id(), "body": "Work crew dispatched. Repair completed and photographed on site.", "author_id": authority["id"], "author_name": authority["name"], "author_role": "authority", "created_at": iso(now())}
            await db.cases.update_one({"id": cid}, {"$push": {"replies": reply}})
            await append_event(cid, "CASE_REPLY", authority, {"body": reply["body"], "reply_id": reply["id"]})

        if s["stage"] == "review":
            await db.cases.update_one({"id": cid}, {"$set": {"review_status": "DISPUTED", "status": "DISPUTED", "outcome": "INCONCLUSIVE"}})
            await append_event(cid, "CITIZEN_CHALLENGE", citizen, {"reason": "Issue still exists after rain", "note": "Water still pools near gate"})

        if s["stage"] == "recurrence":
            await db.cases.update_one({"id": cid}, {"$set": {"status": "DISPUTED", "outcome": "FAILED"}})
            await append_event(cid, "RECURRENCE_DETECTED", citizen, {"related_case": "TRC-2048", "note": "Similar case within 30 days"})
            await append_event(cid, "CITIZEN_CHALLENGE", citizen, {"reason": "Waste dumped again", "note": "Recurrence within 30 days"})
            await append_event(cid, "OUTCOME_REVIEWED", authority, {"outcome": "FAILED", "note": "Recurrence confirmed"})
            corr = {
                "id": new_id(),
                "intervention": "Install fencing and increase collection frequency",
                "observation_days": 60,
                "required_evidence": "Weekly photo evidence",
                "created_at": iso(now()),
                "status": "OPEN",
                "checkpoints": [
                    {"day": 7, "status": "on_track", "note": None, "updated_at": iso(now())},
                    {"day": 30, "status": "pending", "note": None, "updated_at": None},
                    {"day": 60, "status": "pending", "note": None, "updated_at": None},
                ],
            }
            await db.cases.update_one({"id": cid}, {"$push": {"corrective": corr}, "$set": {"status": "INTERVENTION"}})
            await append_event(cid, "CORRECTIVE_OBLIGATION_CREATED", authority, corr)

        if s["stage"] == "resolved":
            await db.cases.update_one({"id": cid}, {"$set": {"outcome": "PASSED", "status": "RESOLVED"}})
            await append_event(cid, "OUTCOME_REVIEWED", authority, {"outcome": "PASSED", "note": "Verified after full observation window"})
            if s["category"] == "Broken Streetlight":
                nc = {"id": new_id(), "outcome": "on", "note": "Verified at 8:15 PM", "at": iso(now()), "by": citizen["id"]}
                await db.cases.update_one({"id": cid}, {"$push": {"night_checks": nc}})
                await append_event(cid, "NIGHT_CHECK", citizen, nc)

    # Seed washrooms
    for w in [
        {"name": "Central Metro Station", "distance_m": 180, "cleanliness": "verified", "pad_dispenser": "empty", "water": "verified", "accessibility": "verified", "last_verified": iso(now())},
        {"name": "City Hospital Ground Floor", "distance_m": 420, "cleanliness": "verified", "pad_dispenser": "verified", "water": "verified", "accessibility": "review", "last_verified": iso(now())},
        {"name": "Public Library Wing B", "distance_m": 640, "cleanliness": "review", "pad_dispenser": "not_recent", "water": "verified", "accessibility": "not_recent", "last_verified": iso(now())},
        {"name": "MG Road Bus Terminal", "distance_m": 900, "cleanliness": "issue", "pad_dispenser": "not_recent", "water": "review", "accessibility": "not_recent", "last_verified": iso(now())},
    ]:
        await db.washrooms.insert_one({"id": new_id(), **w})

    log.info("Seed complete.")


@app.on_event("startup")
async def on_start():
    try:
        await seed_if_empty()
    except Exception as e:
        log.exception(f"seed failed: {e}")


@app.on_event("shutdown")
async def on_stop():
    client.close()


@api.get("/")
async def root():
    return {"service": "TRACE", "message": "Don't just mark it resolved. Prove it."}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
