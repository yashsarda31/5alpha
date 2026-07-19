# NourishFit Ten-Second Logging Design

## Goal

Reduce friction so repeat foods can be logged in under 10 seconds and unfamiliar meals in under 20 seconds, while preserving NourishFit's offline, private, account-free model.

## Experience

The Diary food-search area opens with three shortcuts before the full catalogue:

- Recent foods ranked by frequency, matching meal, and time of day.
- Favourites that users can star from search results or logged diary entries.
- Repeat yesterday, which copies the matching meal after confirmation.

The Today page shows three personalized quick-add foods for the current time. A normal tap logs the usual portion immediately. Existing search, portion controls, meal selection, and custom calorie entry remain available. Saved meals and templates are explicitly out of scope.

Every quick addition presents a temporary Undo action. Repeat yesterday is disabled with a clear empty state when the prior day has no entries for the selected meal.

## Data Model

Add an optional `favourites` array of food IDs to the version-one local state. Missing favourites in older saved data and imported backups normalize to an empty array. Recents and suggestions are derived from existing entries rather than stored as a second history.

Ranking scores frequency, recency, matching meal, and time-of-day relevance. Ties resolve deterministically by food name. A user's typical portion for a food is the most recent logged portion; catalogue defaults use one portion.

Repeating a meal clones food data and portions, assigns the selected date, and generates new unique entry IDs. Undo stores only the latest addition batch in temporary interface state and removes exactly those generated IDs.

## Components

- Pure ranking helpers compute recent and suggested foods.
- Pure repeat helpers create safe cloned entries with caller-provided IDs.
- Local-state normalization keeps old data compatible.
- Reusable shortcut cards serve Diary and Today.
- Favourite controls appear on catalogue results and logged foods.
- A toast action handles the latest undoable addition.

## Error Handling

Unavailable catalogue items in historical entries remain usable as recent items. Missing or malformed favourites are ignored safely. Repeat actions never overwrite existing entries. Empty recent or favourite sections provide concise guidance instead of blank containers.

## Verification

Automated tests cover favourite normalization, ranking order, meal and time relevance, typical portions, repeated-meal cloning with unique IDs, empty repeat behavior, and undo ID targeting. Existing nutrition and catalogue tests must continue to pass. Run lint, the Vercel production build, the Sites build, and smoke checks on the deployed Vercel URL.

## Success Criteria

- A recent or favourite food can be logged from Today or Diary with one tap.
- Three useful suggestions appear when sufficient history exists.
- Yesterday's matching meal can be copied safely.
- Accidental quick additions can be undone.
- Existing local data and backups remain compatible.
- No accounts, network APIs, or paid services are introduced.
