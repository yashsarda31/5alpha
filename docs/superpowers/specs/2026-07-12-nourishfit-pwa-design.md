# NourishFit PWA Design

## Goal

Build an original, free, single-user nutrition and fitness tracker inspired by common wellness-app workflows. It must be installable, work without an account, keep personal data on the device, and avoid HealthifyMe branding, assets, and proprietary content.

## Product Experience

NourishFit is a mobile-first PWA with five primary destinations: Today, Diary, Coach, Progress, and Profile. The Today view summarizes calorie balance, macro progress, water, steps, weight trend, meals, workouts, and streak status. Users can manually log Indian foods and portions under breakfast, lunch, dinner, or snacks; record water, weight, steps, and workouts; and manage calorie and macro goals.

The Coach is deterministic and offline. It evaluates recent logs against goals, highlights useful next actions, and offers balanced Indian meal and simple workout suggestions. It must not imply medical diagnosis or replace professional care.

## Visual Direction

Use an original identity: warm cream surfaces, deep forest green, bright lime accents, rounded cards, friendly typography, restrained shadows, and subtle motion. The UI should feel polished on a phone and remain usable on desktop. It must meet basic accessible contrast, focus, keyboard, and reduced-motion expectations.

## Architecture

Create a standalone React/Vite project under `nourishfit/` so the existing finance application remains untouched. Keep modules separated by responsibility: navigation and layout, food catalog and search, diary, health logs, goal calculations, coach rules, charts, persistence, and profile/backup tools.

Use a versioned local-storage repository as the only persistence layer. Users can export all data to JSON, import a valid NourishFit backup, or reset the app. Seed the food catalog with a useful set of common Indian foods and transparent nutrition values per serving. No server, sign-in, paid API, photo recognition, or cloud synchronization is included.

When a searched food is unavailable, the diary offers a custom-food fallback requiring only a name and calories. The estimate assigns all calories to carbohydrates at four calories per gram, marks half of those carbohydrate grams as sugar included within the carbohydrate total, and assigns zero protein, fat, and fibre. Custom entries are labelled as estimates and can be removed normally.

Expand the offline catalogue to approximately 200 curated entries for an affluent, urban Indian user. Coverage includes Indian regional staples and restaurant meals; vegetarian and non-vegetarian proteins; café drinks, juices, smoothies, soft drinks, energy drinks and hydration products; whey, bars, supplements and gym-friendly meals; popular global cuisines; desserts; and common alcoholic beverages. Each entry includes a realistic serving, calories, protein, carbohydrates, fat, fibre, category and search aliases. Search matches names, aliases and categories. Restaurant, packaged and alcoholic entries are explicitly presented as estimates because recipes, labels and pours vary.

Nutrition values are original rounded estimates cross-checked against public authoritative references such as USDA FoodData Central, with Indian composition references used for reasonableness rather than reproduced as a database. Alcohol servings follow clearly stated common serving sizes and are not presented as health recommendations.

## Data and Calculations

Store profile goals, dated food entries, water, weight, steps, workouts, and lightweight preferences. Derive daily calorie and macro totals from diary entries. Derive streaks and weekly summaries from dates with meaningful logging activity. Validate numeric ranges and backup schema before saving or importing.

## Error and Empty States

Block invalid portions and measurements with concise inline feedback. Handle missing or corrupted local data by preserving a safe default state. Provide helpful first-use prompts when no food, water, workout, or weight data exists. Destructive reset requires confirmation.

## Verification

Add focused automated tests for nutrition totals, coach rules, and versioned persistence where practical. Verify keyboard interaction and responsive layouts manually, then run lint and a production build. Include a clear general-wellness disclaimer.

Catalogue tests verify at least 180 entries, unique identifiers, valid nutrient ranges, searchable aliases, and representative coverage across every planned food and drink group.

## Success Criteria

- Installable mobile-first PWA with no account or ongoing service cost.
- All planned logs and goals persist locally across reloads.
- Indian food diary supports search, portions, meal grouping, and daily totals.
- Offline coach provides relevant, explainable suggestions from logged data.
- Progress views summarize weekly calories, weight, water, steps, and streaks.
- Backup, restore, and reset flows work safely.
- Existing workspace applications are not modified.
