"""
Dashboard aggregation endpoint.

Everything the redesigned frontend dashboard renders (KPI cards, the risk
trend chart, the activity feed, repository health table) comes from ONE call
to GET /api/v1/dashboard/stats, computed live from this user's scan_history
documents in Mongo. Nothing here is hardcoded or mocked — an account with no
scans yet gets back real zeros and empty arrays, which the frontend renders
as an empty state.
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Any, Optional

from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.logging import get_logger
from app.core.security import CurrentUser, require_auth

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])
logger = get_logger()

SEVERITY_WEIGHT = {"CRITICAL": 10, "HIGH": 4, "MEDIUM": 1.5, "LOW": 0.5}


def _finding_status(scan_doc: dict, finding_id: str) -> str:
    return ((scan_doc.get("fixes") or {}).get(finding_id) or {}).get("status") or "AWAITING_APPROVAL"


def _is_open(status: str) -> bool:
    return status != "FIX_VERIFIED"


def _parse_dt(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# Every field this endpoint actually reads below — deliberately excludes the
# heavy AI-generated text on each finding (description, suggestedFix) and the
# report blob URI, which this computation never touches but which were
# previously pulled over the wire (and held in memory) for every scan a user
# has ever run, on every dashboard load.
_STATS_PROJECTION = {
    "_id": 0,
    "scanId": 1,
    "repo": 1,
    "branch": 1,
    "scannedAt": 1,
    "findingsCount": 1,
    "fixes": 1,
    "findings.id": 1,
    "findings.title": 1,
    "findings.severity": 1,
}

# Bounds how much history a single dashboard load will ever process. A
# heavy user's most recent scans are what the KPIs/activity feed/trend chart
# actually reflect (activity is already truncated to 15, the trend chart to
# 7 days) — there's no product reason to keep pulling and re-aggregating
# years of scan history on every load.
_STATS_SCAN_LIMIT = 300


@router.get("/stats")
async def get_dashboard_stats(user: CurrentUser = Depends(require_auth)) -> dict[str, Any]:
    db = get_db()
    cursor = (
        db.scan_history.find({"ownerId": user.id}, _STATS_PROJECTION)
        .sort("scannedAt", -1)
        .limit(_STATS_SCAN_LIMIT)
    )
    scans = [doc async for doc in cursor]

    now = datetime.datetime.now(datetime.timezone.utc)
    week_ago = now - datetime.timedelta(days=7)

    # Latest scan per repo -> repository health rows + "connected repos"
    latest_by_repo: dict[str, dict] = {}
    for scan in scans:
        repo = scan.get("repo") or "unknown"
        if repo not in latest_by_repo:
            latest_by_repo[repo] = scan

    open_findings = 0
    critical_open = 0
    high_open = 0
    medium_open = 0
    fixes_applied_total = 0
    fixes_applied_last7 = 0
    repos_added_last7 = 0
    activity: list[dict] = []
    risk_by_day: dict[str, float] = defaultdict(float)

    for scan in scans:
        scanned_at = _parse_dt(scan.get("scannedAt"))
        findings = scan.get("findings") or []
        is_latest_for_repo = latest_by_repo.get(scan.get("repo")) is scan

        for f in findings:
            status = _finding_status(scan, f.get("id"))
            severity = (f.get("severity") or "").upper()
            if is_latest_for_repo and _is_open(status):
                open_findings += 1
                if severity == "CRITICAL":
                    critical_open += 1
                elif severity == "HIGH":
                    high_open += 1
                elif severity == "MEDIUM":
                    medium_open += 1
            if status == "FIX_VERIFIED":
                fixes_applied_total += 1
                if scanned_at and scanned_at >= week_ago:
                    fixes_applied_last7 += 1

        if scanned_at and scanned_at >= week_ago:
            day_key = scanned_at.strftime("%a")
            for f in findings:
                sev = (f.get("severity") or "").upper()
                risk_by_day[day_key] += SEVERITY_WEIGHT.get(sev, 0)

        if scanned_at and scanned_at >= week_ago and is_latest_for_repo:
            repos_added_last7 += 1

        # Activity feed: one entry per scan, plus one per verified/failed fix already
        # recorded on that scan doc — real events, not synthetic ones.
        activity.append(
            {
                "id": f"scan-{scan.get('scanId')}",
                "type": "scan_completed",
                "message": "Full repository scan completed",
                "repo": scan.get("repo"),
                "findingsCount": scan.get("findingsCount", len(findings)),
                "timestamp": scan.get("scannedAt"),
            }
        )
        for finding_id, fix in (scan.get("fixes") or {}).items():
            finding = next((f for f in findings if f.get("id") == finding_id), None)
            if fix.get("status") == "FIX_VERIFIED":
                activity.append(
                    {
                        "id": f"fix-{scan.get('scanId')}-{finding_id}",
                        "type": "fix_verified",
                        "message": f"AI fix verified: {finding.get('title') if finding else finding_id}",
                        "repo": scan.get("repo"),
                        "timestamp": fix.get("verifiedAt") or fix.get("queuedAt") or scan.get("scannedAt"),
                    }
                )
            elif fix.get("status") == "FIX_FAILED":
                activity.append(
                    {
                        "id": f"fixfail-{scan.get('scanId')}-{finding_id}",
                        "type": "fix_failed",
                        "message": f"AI fix failed verification: {finding.get('title') if finding else finding_id}",
                        "repo": scan.get("repo"),
                        "timestamp": fix.get("failedAt") or fix.get("queuedAt") or scan.get("scannedAt"),
                    }
                )
        for f in findings:
            if (f.get("severity") or "").upper() == "CRITICAL" and _is_open(_finding_status(scan, f.get("id"))):
                activity.append(
                    {
                        "id": f"crit-{scan.get('scanId')}-{f.get('id')}",
                        "type": "critical_detected",
                        "message": f"Critical vulnerability detected: {f.get('title')}",
                        "repo": scan.get("repo"),
                        "timestamp": scan.get("scannedAt"),
                    }
                )

    activity.sort(key=lambda a: a.get("timestamp") or "", reverse=True)

    # Repo health table
    repo_health = []
    for repo, scan in latest_by_repo.items():
        findings = scan.get("findings") or []
        open_count = sum(1 for f in findings if _is_open(_finding_status(scan, f.get("id"))))
        has_critical = any(
            (f.get("severity") or "").upper() == "CRITICAL" and _is_open(_finding_status(scan, f.get("id")))
            for f in findings
        )
        has_high = any(
            (f.get("severity") or "").upper() == "HIGH" and _is_open(_finding_status(scan, f.get("id")))
            for f in findings
        )
        if has_critical:
            risk_level = "Critical"
        elif has_high:
            risk_level = "High"
        elif open_count > 0:
            risk_level = "Medium"
        else:
            risk_level = "Low"
        repo_health.append(
            {
                "repo": repo,
                "branch": scan.get("branch"),
                "riskLevel": risk_level,
                "findings": open_count,
                "lastScan": scan.get("scannedAt"),
                "status": "Action Required" if has_critical else ("Review Fixes" if open_count else "Healthy"),
            }
        )
    repo_health.sort(key=lambda r: {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}[r["riskLevel"]])

    # Risk score over time, oldest -> newest, last 7 days actually present
    days_order = []
    d = week_ago
    while d <= now:
        days_order.append(d.strftime("%a"))
        d += datetime.timedelta(days=1)
    seen = set()
    ordered_days = [d for d in days_order if not (d in seen or seen.add(d))]
    risk_series = [{"day": day, "score": round(risk_by_day.get(day, 0), 1)} for day in ordered_days]

    global_risk_score = min(100, round(critical_open * 10 + high_open * 4 + medium_open * 1.5))

    return {
        "kpis": {
            "connectedRepos": {"value": len(latest_by_repo), "deltaLabel": f"+{repos_added_last7}" if repos_added_last7 else None},
            "openFindings": {"value": open_findings},
            "criticalIssues": {"value": critical_open},
            "aiFixesApplied": {"value": fixes_applied_total, "windowLabel": f"+{fixes_applied_last7} last 7d"},
        },
        "globalRiskScore": global_risk_score,
        "riskScoreSeries": risk_series,
        "activityFeed": activity[:15],
        "repoHealth": repo_health,
        "severityBreakdown": {"critical": critical_open, "high": high_open, "medium": medium_open},
    }
