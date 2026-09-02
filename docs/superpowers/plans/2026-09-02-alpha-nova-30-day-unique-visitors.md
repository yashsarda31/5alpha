# Alpha Nova 30-Day Unique Visitors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a distinct-browser count across the latest 30 IST calendar days and display it as a separate growth-dashboard KPI.

**Architecture:** Extend the existing `aggregate_visitors` result with `unique_30d`; the protected admin endpoint already forwards that object unchanged. Render the new field in a ninth optional dashboard card while preserving the daily visitor KPI and older-backend compatibility.

**Tech Stack:** Python `sqlite3`, pytest, self-contained HTML/CSS/JavaScript, and existing Alpha Nova analytics storage.

## Global Constraints

- Count distinct anonymous browser UUIDs across today and the previous 29 IST calendar days.
- Count the same browser once across the whole window.
- Ignore events outside the window, future or invalid timestamps, and non-`site_visit` events.
- Keep existing daily visitor and registered-user metrics unchanged.
- Use the exact KPI label `Unique visitors · 30 days` and context `One browser counted once`.
- Keep the field optional for older backend payloads and show `Backend update required` when absent.
- Preserve 90-day retention, anonymous-device deletion, admin authentication, and privacy boundaries.
- Do not deploy, rotate secrets, or alter unrelated dirty files.

---

### Task 1: Aggregate distinct browsers across 30 IST days

**Files:**
- Modify: `api/analytics_events.py:178-211`
- Modify: `api/test_analytics_events.py:106-143`
- Modify: `api/test_admin_metrics.py:109-132`

**Interfaces:**
- Consumes: valid `site_visit` rows and the existing IST date conversion in `aggregate_visitors`.
- Produces: `visitors.unique_30d: int` in the existing protected admin metrics payload.

- [ ] **Step 1: Write failing aggregation and payload assertions**

Add `"unique_30d": 4` to the existing exact result assertion in `test_site_visit_aggregation_counts_distinct_browsers_by_ist_day`, add `"unique_30d": 1` to the exact visitors assertion in `test_admin_metrics_includes_daily_unique_visitors`, and add this boundary test to `api/test_analytics_events.py`:

```python
def test_site_visit_aggregation_deduplicates_the_latest_thirty_ist_days(conn):
    now = datetime(2026, 9, 2, 18, 45, tzinfo=timezone.utc)  # 3 Sep, 00:15 IST
    repeat = "7d1c74ef-8da5-4a78-9eab-8f35145d172f"

    def add(device, occurred_at, event="site_visit", route="/"):
        record_event(conn, {
            "event": event,
            "device_id": device,
            "occurred_at": occurred_at,
            "route": route,
            "market": "" if event == "site_visit" else "IN",
        }, now)

    add(repeat, "2026-09-02T18:35:00Z")
    add(repeat, "2026-08-14T12:00:00Z")
    add("0e1334ee-e1b1-4e55-b262-9420bb550251", "2026-08-04T18:30:00Z")
    add("9d708c18-8202-437a-9a2a-106454a80bb9", "2026-08-04T18:29:59Z")
    add("ef06d730-4053-4c69-9297-2f91d95c46e5", "2026-09-02T18:40:00Z",
        event="analyse_loaded", route="/chart")
    add("27557797-d00d-4690-a5cc-d1c1bbfac012", "2026-09-02T19:00:00Z")

    assert aggregate_visitors(conn, now)["unique_30d"] == 2
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
rtk python -m pytest api/test_analytics_events.py api/test_admin_metrics.py -q
```

Expected: failures report missing `unique_30d` in the visitor aggregate.

- [ ] **Step 3: Implement the rolling distinct-browser set**

In `aggregate_visitors`, initialize the 30-day window and set after the existing seven-day structures:

```python
    window_30d_start = today - timedelta(days=29)
    unique_30d = set()
```

After converting each valid non-future event to an IST day, add:

```python
        if window_30d_start <= day <= today:
            unique_30d.add(device_id)
```

Add the field to the returned dictionary:

```python
        "unique_30d": len(unique_30d),
```

- [ ] **Step 4: Run focused backend tests and verify GREEN**

```powershell
rtk python -m pytest api/test_analytics_events.py api/test_admin_metrics.py -q
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the backend metric**

```powershell
rtk git add -- api/analytics_events.py api/test_analytics_events.py api/test_admin_metrics.py
rtk git commit -m "feat: count 30-day unique visitors"
```

---

### Task 2: Add the 30-day unique visitor KPI

**Files:**
- Modify: `alphanova48-growth-dashboard.html:93,313-335`
- Modify: `api/test_growth_dashboard_file.py:18-28`

**Interfaces:**
- Consumes: optional `state.data.visitors.unique_30d` from Task 1.
- Produces: a ninth KPI labelled `Unique visitors · 30 days` with a legacy-backend fallback.

- [ ] **Step 1: Write the failing dashboard contract**

Extend `test_growth_dashboard_renders_optional_daily_visitor_kpi` with:

```python
    assert '["Unique visitors · 30 days"' in html
    assert "visitors.unique_30d" in html
    assert '"One browser counted once"' in html
```

- [ ] **Step 2: Run the dashboard test and verify RED**

```powershell
rtk python -m pytest api/test_growth_dashboard_file.py -q
```

Expected: failure because the 30-day KPI is absent.

- [ ] **Step 3: Render the optional KPI and balance the nine-card layout**

Update the wide and tablet grid rules:

```css
.kpi-grid { display: grid; grid-template-columns: repeat(9, minmax(115px, 1fr)); gap: 12px; margin-bottom: 18px; }
@media (max-width: 1240px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
```

After the current daily visitor variables, add:

```javascript
        const monthlyVisitorsAvailable = visitors && Number.isFinite(Number(visitors.unique_30d));
        const monthlyVisitorValue = monthlyVisitorsAvailable ? fmt(visitors.unique_30d) : "—";
        const monthlyVisitorMeta = monthlyVisitorsAvailable
          ? "One browser counted once"
          : "Backend update required";
```

Append the ninth card after the existing daily visitor card:

```javascript
          ["Unique visitors · 30 days", monthlyVisitorValue, escapeHtml(monthlyVisitorMeta), ""],
```

- [ ] **Step 4: Run focused feature tests and verify GREEN**

```powershell
rtk python -m pytest api/test_growth_dashboard_file.py api/test_analytics_events.py api/test_admin_metrics.py -q
```

Expected: all focused tests pass.

- [ ] **Step 5: Run broader verification**

From the repository root:

```powershell
rtk python -m pytest api -q --ignore=api/test_live.py
rtk git diff --check
```

From `web`:

```powershell
rtk node --test src/**/*.test.js
rtk npx eslint src/App.jsx src/lib/productAnalytics.js src/lib/productAnalytics.test.js src/lib/siteVisitorWiring.test.js
rtk npm run build
```

Expected: backend and frontend tests pass, focused lint is clean, build exits 0, and whitespace validation reports no errors. Restore generated `web/dist` output after the build while preserving pre-existing untracked ad files.

- [ ] **Step 6: Commit the dashboard KPI**

```powershell
rtk git add -- alphanova48-growth-dashboard.html api/test_growth_dashboard_file.py
rtk git commit -m "feat: show 30-day unique visitors"
```

- [ ] **Step 7: Report local completion**

Report exact test counts, build status, commit IDs, and the dashboard path. State that no deployment occurred and that production requires a separately authorized deployment.
