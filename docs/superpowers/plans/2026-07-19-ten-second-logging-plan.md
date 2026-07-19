# NourishFit Ten-Second Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users log recent, favourite, suggested, or yesterday's foods in one tap with a safe Undo action.

**Architecture:** Keep ranking, portion selection, repetition, and state normalization in a pure `app/lib/logging.mjs` module. Keep persistent favourites in the existing version-one browser state, derive recents and suggestions from diary entries, and render reusable shortcut controls from `app/components/LoggingShortcuts.tsx`. `app/page.tsx` remains the state coordinator.

**Tech Stack:** Next.js 16, React 19, JavaScript pure helpers, TypeScript UI, Node test runner, localStorage, CSS, Vercel.

## Global Constraints

- Keep the app private-by-design, account-free, and usable without paid APIs.
- Saved meals and templates are out of scope.
- Older version-one local data and backup files must remain compatible.
- Repeat meals must receive new unique IDs and never overwrite existing entries.
- A repeat food should be loggable in under 10 seconds.
- Existing search, portions, meal selection, and custom calorie entry remain available.

---

### Task 1: Pure logging intelligence

**Files:**
- Create: `nourishfit/app/lib/logging.mjs`
- Create: `nourishfit/tests/logging.test.mjs`

**Interfaces:**
- Consumes: diary entries shaped as `{ id, name, meal, portions, date, ...nutrition }` and catalogue foods shaped as `{ id, name, ...nutrition }`.
- Produces: `normaliseFavourites(value)`, `typicalPortion(entries, foodId)`, `rankRecentFoods(entries, catalogue, context)`, and `suggestFoods(entries, catalogue, context)`.

- [ ] **Step 1: Write failing normalization and portion tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { normaliseFavourites, typicalPortion } from "../app/lib/logging.mjs";

test("normaliseFavourites keeps unique string IDs", () => {
  assert.deepEqual(normaliseFavourites(["poha", "poha", 42, "dal"]), ["poha", "dal"]);
  assert.deepEqual(normaliseFavourites(undefined), []);
});

test("typicalPortion returns the latest valid portion", () => {
  const entries = [
    { id: "poha", portions: 1, date: "2026-07-17" },
    { id: "poha", portions: 1.5, date: "2026-07-18" },
  ];
  assert.equal(typicalPortion(entries, "poha"), 1.5);
  assert.equal(typicalPortion(entries, "dal"), 1);
});
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run: `cd nourishfit && node --test tests/logging.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `app/lib/logging.mjs`.

- [ ] **Step 3: Implement normalization and typical portions**

```js
export function normaliseFavourites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "string" && id.trim()))];
}

export function typicalPortion(entries, foodId) {
  const latest = [...entries]
    .filter((entry) => entry.id === foodId && Number(entry.portions) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest ? Number(latest.portions) : 1;
}
```

- [ ] **Step 4: Add failing ranking tests**

```js
import { rankRecentFoods, suggestFoods } from "../app/lib/logging.mjs";

const catalogue = [
  { id: "poha", name: "Poha" },
  { id: "dal", name: "Dal" },
  { id: "coffee", name: "Coffee" },
];

test("recent ranking favours matching meal, frequency and recency", () => {
  const entries = [
    { id: "dal", name: "Dal", meal: "Lunch", date: "2026-07-17", portions: 1 },
    { id: "poha", name: "Poha", meal: "Breakfast", date: "2026-07-18", portions: 1 },
    { id: "poha", name: "Poha", meal: "Breakfast", date: "2026-07-19", portions: 1 },
  ];
  assert.deepEqual(rankRecentFoods(entries, catalogue, { meal: "Breakfast", date: "2026-07-19", limit: 3 }).map((food) => food.id), ["poha", "dal"]);
});

test("suggestions return at most three deterministic foods", () => {
  const entries = [
    { id: "coffee", name: "Coffee", meal: "Breakfast", date: "2026-07-19", portions: 1 },
    { id: "poha", name: "Poha", meal: "Breakfast", date: "2026-07-18", portions: 1 },
  ];
  assert.deepEqual(suggestFoods(entries, catalogue, { meal: "Breakfast", date: "2026-07-19", limit: 3 }).map((food) => food.id), ["coffee", "poha"]);
});
```

- [ ] **Step 5: Implement deterministic ranking**

```js
const MS_PER_DAY = 86_400_000;

export function rankRecentFoods(entries, catalogue, { meal, date, limit = 8 }) {
  const reference = new Date(`${date}T12:00:00`).getTime();
  const byId = new Map(catalogue.map((food) => [food.id, food]));
  const stats = new Map();
  for (const entry of entries) {
    const food = byId.get(entry.id) || entry;
    const current = stats.get(entry.id) || { food, count: 0, newest: "", mealHits: 0 };
    current.count += 1;
    current.mealHits += entry.meal === meal ? 1 : 0;
    current.newest = current.newest > entry.date ? current.newest : entry.date;
    stats.set(entry.id, current);
  }
  return [...stats.values()]
    .map((item) => {
      const age = Math.max(0, Math.floor((reference - new Date(`${item.newest}T12:00:00`).getTime()) / MS_PER_DAY));
      return { ...item, score: item.count * 3 + item.mealHits * 5 + Math.max(0, 14 - age) };
    })
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map((item) => ({ ...item.food, usualPortions: typicalPortion(entries, item.food.id) }));
}

export function suggestFoods(entries, catalogue, context) {
  return rankRecentFoods(entries, catalogue, { ...context, limit: Math.min(context.limit || 3, 3) });
}
```

- [ ] **Step 6: Run the helper tests**

Run: `cd nourishfit && node --test tests/logging.test.mjs`

Expected: all logging helper tests PASS.

- [ ] **Step 7: Commit the pure helper**

```bash
cd nourishfit
git add app/lib/logging.mjs tests/logging.test.mjs
git commit -m "feat: add logging recommendation helpers"
```

---

### Task 2: Repeat and undo primitives

**Files:**
- Modify: `nourishfit/app/lib/logging.mjs`
- Modify: `nourishfit/tests/logging.test.mjs`

**Interfaces:**
- Consumes: diary entries, source date, target date, meal, and an `idFactory(): string` callback.
- Produces: `repeatMeal(entries, options): Entry[]` and `removeEntriesByUid(entries, uids): Entry[]`.

- [ ] **Step 1: Add failing repeat and undo tests**

```js
import { removeEntriesByUid, repeatMeal } from "../app/lib/logging.mjs";

test("repeatMeal clones only the selected meal with fresh IDs", () => {
  let next = 0;
  const entries = [
    { uid: "old-1", id: "poha", meal: "Breakfast", date: "2026-07-18", portions: 1.5 },
    { uid: "old-2", id: "dal", meal: "Lunch", date: "2026-07-18", portions: 1 },
  ];
  assert.deepEqual(repeatMeal(entries, { sourceDate: "2026-07-18", targetDate: "2026-07-19", meal: "Breakfast", idFactory: () => `new-${++next}` }), [
    { uid: "new-1", id: "poha", meal: "Breakfast", date: "2026-07-19", portions: 1.5 },
  ]);
});

test("repeatMeal returns an empty array when there is nothing to copy", () => {
  assert.deepEqual(repeatMeal([], { sourceDate: "2026-07-18", targetDate: "2026-07-19", meal: "Dinner", idFactory: () => "unused" }), []);
});

test("undo removes exactly the generated entry IDs", () => {
  const entries = [{ uid: "keep" }, { uid: "undo-1" }, { uid: "undo-2" }];
  assert.deepEqual(removeEntriesByUid(entries, ["undo-1", "undo-2"]), [{ uid: "keep" }]);
});
```

- [ ] **Step 2: Run the tests and verify missing-export failures**

Run: `cd nourishfit && node --test tests/logging.test.mjs`

Expected: FAIL because repeat and undo exports do not exist.

- [ ] **Step 3: Implement repeat and undo helpers**

```js
export function repeatMeal(entries, { sourceDate, targetDate, meal, idFactory }) {
  return entries
    .filter((entry) => entry.date === sourceDate && entry.meal === meal)
    .map((entry) => ({ ...entry, uid: idFactory(), date: targetDate }));
}

export function removeEntriesByUid(entries, uids) {
  const targets = new Set(uids);
  return entries.filter((entry) => !targets.has(entry.uid));
}
```

- [ ] **Step 4: Run all Node tests**

Run: `cd nourishfit && npm test`

Expected: all existing nutrition tests and new logging tests PASS.

- [ ] **Step 5: Commit the primitives**

```bash
cd nourishfit
git add app/lib/logging.mjs tests/logging.test.mjs
git commit -m "feat: add repeat and undo logging primitives"
```

---

### Task 3: Backward-compatible favourites

**Files:**
- Modify: `nourishfit/app/page.tsx:23-93,168-184`
- Modify: `nourishfit/app/lib/nutrition.mjs:114-127`
- Modify: `nourishfit/tests/nutrition.test.mjs:53-56`

**Interfaces:**
- Consumes: `normaliseFavourites(value)` from Task 1.
- Produces: `AppState.favourites: string[]` and normalized state for load/import.

- [ ] **Step 1: Extend backup tests for missing and malformed favourites**

```js
test("version-one backups remain valid without favourites", () => {
  const backup = { version: 1, profile: { goals: {} }, entries: [], daily: {}, weights: [], workouts: [] };
  assert.equal(validateBackup(backup), true);
});
```

- [ ] **Step 2: Add favourites to the app state type and defaults**

```ts
type AppState = {
  version: 1;
  profile: Profile;
  entries: Entry[];
  daily: Record<string, DayLog>;
  weights: Weight[];
  workouts: Workout[];
  favourites: string[];
};

const defaultState = (): AppState => ({
  version: 1,
  profile: { name: "Friend", goal: "Feel stronger", goals: { calories: 2000, protein: 100, carbs: 245, fat: 65, water: 8, steps: 8000 } },
  entries: [], daily: {}, weights: [], workouts: [], favourites: [],
});
```

- [ ] **Step 3: Normalize persisted and imported state**

```ts
const normaliseState = (value: any): AppState => ({
  ...defaultState(),
  ...value,
  favourites: normaliseFavourites(value?.favourites),
});
```

Use `setState(normaliseState(parsed))` in both the initial localStorage load and `importData`. Leave `validateBackup` permissive so old version-one backups remain valid.

- [ ] **Step 4: Add favourite toggling**

```ts
const toggleFavourite = (foodId: string) => setState((current) => ({
  ...current,
  favourites: current.favourites.includes(foodId)
    ? current.favourites.filter((id) => id !== foodId)
    : [...current.favourites, foodId],
}));
```

- [ ] **Step 5: Run tests and lint**

Run: `cd nourishfit && npm test && npm run lint`

Expected: PASS with no lint errors.

- [ ] **Step 6: Commit compatibility changes**

```bash
cd nourishfit
git add app/page.tsx app/lib/nutrition.mjs tests/nutrition.test.mjs
git commit -m "feat: persist backward-compatible favourites"
```

---

### Task 4: Diary shortcuts and repeat yesterday

**Files:**
- Create: `nourishfit/app/components/LoggingShortcuts.tsx`
- Modify: `nourishfit/app/page.tsx:239-260,364-385`
- Modify: `nourishfit/app/globals.css:124-151,176-184`

**Interfaces:**
- Consumes: ranked recent foods, favourite foods, selected meal, and callbacks `onQuickAdd(food, portions)`, `onToggleFavourite(id)`, and `onRepeat()`.
- Produces: accessible Recent, Favourites, and Repeat controls in Diary.

- [ ] **Step 1: Create the reusable shortcut component**

```tsx
"use client";

type ShortcutFood = { id: string; name: string; emoji: string; calories: number; usualPortions?: number };

export function LoggingShortcuts({ recent, favourites, favouriteIds, repeatCount, meal, onQuickAdd, onToggleFavourite, onRepeat }: {
  recent: ShortcutFood[];
  favourites: ShortcutFood[];
  favouriteIds: string[];
  repeatCount: number;
  meal: string;
  onQuickAdd: (food: ShortcutFood, portions: number) => void;
  onToggleFavourite: (foodId: string) => void;
  onRepeat: () => void;
}) {
  const row = (title: string, foods: ShortcutFood[]) => foods.length > 0 && <section className="shortcut-section"><h3>{title}</h3><div className="shortcut-row">{foods.map((food) => <button className="shortcut-food" key={food.id} onClick={() => onQuickAdd(food, food.usualPortions || 1)}><span>{food.emoji}</span><strong>{food.name}</strong><small>{Math.round(food.calories * (food.usualPortions || 1))} kcal</small></button>)}</div></section>;
  return <div className="logging-shortcuts">{row("Recent", recent)}{row("Favourites", favourites)}<button className="repeat-button" disabled={!repeatCount} onClick={onRepeat}>↻ Repeat yesterday's {meal.toLowerCase()} <small>{repeatCount ? `${repeatCount} items` : "Nothing to copy"}</small></button></div>;
}
```

- [ ] **Step 2: Compute Diary shortcut data in `Home`**

```ts
const recentFoods = rankRecentFoods(state.entries, FOOD_CATALOG, { meal, date: selectedDate, limit: 8 });
const favouriteFoods = state.favourites.map((id) => FOOD_CATALOG.find((food) => food.id === id)).filter(Boolean);
const previousDate = shiftDate(selectedDate, -1);
const repeatCount = state.entries.filter((entry) => entry.date === previousDate && entry.meal === meal).length;
```

Add a pure `shiftDate(date, days)` helper beside `todayKey` to avoid UTC boundary errors.

- [ ] **Step 3: Add batch-aware quick logging and repeat callbacks**

```ts
const addFoodQuickly = (food: Food, quickPortions = 1) => {
  const uid = crypto.randomUUID();
  setState((current) => ({ ...current, entries: [...current.entries, { ...food, uid, date: selectedDate, meal, portions: quickPortions }] }));
  setUndoBatch({ uids: [uid], label: food.name });
};

const repeatYesterday = () => {
  const copies = repeatMeal(state.entries, { sourceDate: shiftDate(selectedDate, -1), targetDate: selectedDate, meal, idFactory: () => crypto.randomUUID() });
  if (!copies.length) return setNotice(`No ${meal.toLowerCase()} to repeat.`);
  setState((current) => ({ ...current, entries: [...current.entries, ...copies] }));
  setUndoBatch({ uids: copies.map((entry) => entry.uid), label: `Yesterday's ${meal.toLowerCase()}` });
};
```

- [ ] **Step 4: Add favourite buttons to search results and logged entries**

Use a dedicated star button with `aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}` and `aria-pressed={isFavourite}`. Stop propagation so starring never logs or removes an item.

- [ ] **Step 5: Add responsive shortcut styling**

```css
.logging-shortcuts { display:grid; gap:14px; margin:16px 0; }
.shortcut-section h3 { margin:0 0 8px; font-size:11px; }
.shortcut-row { display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; scrollbar-width:thin; }
.shortcut-food { min-width:132px; padding:11px; border:1px solid var(--line); border-radius:14px; background:var(--paper); display:grid; gap:3px; text-align:left; cursor:pointer; }
.shortcut-food:hover { border-color:#a8b7a8; background:var(--lime-soft); }
.shortcut-food small { color:var(--muted); font-size:9px; }
.repeat-button { width:100%; border:1px dashed #aab8a9; border-radius:13px; background:var(--cream); padding:12px; font-weight:800; cursor:pointer; }
.repeat-button small { display:block; color:var(--muted); font-size:9px; }
.repeat-button:disabled { opacity:.55; cursor:not-allowed; }
```

- [ ] **Step 6: Run tests, lint, and the Vercel build**

Run: `cd nourishfit && npm test && npm run lint && npm run build:vercel`

Expected: all commands PASS.

- [ ] **Step 7: Commit Diary shortcuts**

```bash
cd nourishfit
git add app/components/LoggingShortcuts.tsx app/page.tsx app/globals.css
git commit -m "feat: add one-tap diary shortcuts"
```

---

### Task 5: Today suggestions and Undo

**Files:**
- Modify: `nourishfit/app/page.tsx:57-114,203-236,284-286,309-362`
- Modify: `nourishfit/app/globals.css:63-126,169-184`

**Interfaces:**
- Consumes: `suggestFoods`, `addFoodQuickly`, `removeEntriesByUid`, and temporary `undoBatch` state.
- Produces: three time-relevant Today shortcuts and an actionable Undo toast.

- [ ] **Step 1: Add meal-from-time and undo state**

```ts
const mealForHour = (hour: number) => hour < 11 ? "Breakfast" : hour < 16 ? "Lunch" : hour < 19 ? "Snacks" : "Dinner";
const [undoBatch, setUndoBatch] = useState<{ uids: string[]; label: string } | null>(null);
const currentMeal = mealForHour(new Date().getHours());
const suggestions = suggestFoods(state.entries, FOOD_CATALOG, { meal: currentMeal, date: todayKey(), limit: 3 });
```

- [ ] **Step 2: Render suggestions beneath the Today greeting**

```tsx
{suggestions.length > 0 && <section className="today-quick-add" aria-label="Quick add suggestions"><div><span className="eyebrow">QUICK ADD</span><h2>Usual around now</h2></div><div>{suggestions.map((food) => <button key={food.id} onClick={() => onQuickAdd(food, food.usualPortions || 1)}><span>{food.emoji}</span><strong>{food.name}</strong><small>＋ {Math.round(food.calories * (food.usualPortions || 1))} kcal</small></button>)}</div></section>}
```

- [ ] **Step 3: Make the toast actionable**

```tsx
{(notice || undoBatch) && <div className="toast" role="status"><span>{undoBatch ? `${undoBatch.label} added` : notice}</span>{undoBatch && <button onClick={() => { setState((current) => ({ ...current, entries: removeEntriesByUid(current.entries, undoBatch.uids) })); setUndoBatch(null); }}>Undo</button>}</div>}
```

Clear `undoBatch` after 6 seconds with an effect that cancels its timer on change or unmount. New additions replace the previous undo batch intentionally.

- [ ] **Step 4: Add Today and toast-action styles**

```css
.today-quick-add { margin:-8px 0 24px; display:flex; justify-content:space-between; gap:16px; align-items:center; }
.today-quick-add > div:last-child { display:flex; gap:8px; overflow-x:auto; }
.today-quick-add button { border:1px solid var(--line); background:var(--paper); border-radius:12px; padding:9px 12px; display:flex; align-items:center; gap:7px; cursor:pointer; white-space:nowrap; }
.today-quick-add small { color:var(--muted); }
.toast { display:flex; align-items:center; gap:14px; }
.toast button { border:0; background:var(--lime); color:var(--forest); border-radius:99px; padding:6px 10px; font-size:10px; font-weight:900; cursor:pointer; }
```

- [ ] **Step 5: Verify all automated checks**

Run: `cd nourishfit && npm test && npm run lint && npm run build:vercel && npm run build`

Expected: tests, lint, Vercel build, and Sites build all PASS.

- [ ] **Step 6: Commit Today quick logging**

```bash
cd nourishfit
git add app/page.tsx app/globals.css
git commit -m "feat: add Today quick logging and undo"
```

---

### Task 6: Production deployment and smoke checks

**Files:**
- Modify only if deployment configuration requires a verified correction: `nourishfit/vercel.json`, `nourishfit/package.json`

**Interfaces:**
- Consumes: the validated project at the current Git `HEAD`.
- Produces: a healthy production deployment at `https://nourishfit.vercel.app`.

- [ ] **Step 1: Run the final clean-tree verification**

Run:

```bash
cd nourishfit
git diff --check
npm test
npm run lint
npm run build:vercel
```

Expected: no whitespace errors; 7 existing tests plus the new logging tests PASS; lint and build succeed.

- [ ] **Step 2: Deploy to Vercel production**

Run: `cd nourishfit && vercel --prod --yes`

Expected: deployment reaches `READY` and aliases to `https://nourishfit.vercel.app`.

- [ ] **Step 3: Smoke-test public assets and HTML**

```powershell
$response = Invoke-WebRequest -Uri 'https://nourishfit.vercel.app' -UseBasicParsing -TimeoutSec 30
$manifest = Invoke-WebRequest -Uri 'https://nourishfit.vercel.app/manifest.webmanifest' -UseBasicParsing -TimeoutSec 30
$worker = Invoke-WebRequest -Uri 'https://nourishfit.vercel.app/sw.js' -UseBasicParsing -TimeoutSec 30
if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'NourishFit' -or $manifest.StatusCode -ne 200 -or $worker.StatusCode -ne 200) { throw 'Smoke check failed' }
```

Expected: command exits successfully.

- [ ] **Step 4: Confirm repository state**

Run: `cd nourishfit && git status --short`

Expected: empty output. If Vercel only creates ignored `.vercel` metadata, no commit is required.

