# Competitor analysis

Where other meal planning and meal prep apps fall short, and how PrepTable v1 answers each gap. The complaints come from App Store reviews and Reddit threads collected during product research in November 2026. Requirement IDs refer to the [v1 PRD](../prds/preptable-prd-v1.md).

## Common complaints and our answer

| Common complaint | Our answer | PRD |
|---|---|---|
| Imports mangle ingredients, with no way to check | Every import ends on a review screen with flagged lines | IMP-5 to IMP-8 |
| Can't edit imported recipes, or edits lose the original | Full editing with versions, back and forward | REC-6, VER-1 to VER-7 |
| The meal planner forces one plan on the whole family | Each person plans for their own targets; household meals, list and pantry are shared | PLAN-3 to PLAN-5, SHOP-1 |
| Calorie numbers in the planner don't match the tracker | The tracker gets exact per-serving nutrition, and stale copies are flagged | EXP-2, EXP-5, EXP-6, LINK-2 |
| Prep instructions ignore batch cooking | Batch totals and cooked-weight portioning | PREP-5, PREP-6 |
| The shopping list ignores what you have | A real pantry, updated by shopping and cooking | SHOP-2, SHOP-5, PREP-7 |
| Subscription for basic features | A full 7-day trial, then a subscription with a clearly stated usage cap and top-ups | BILL-1 to BILL-8 |
| Apps shut down and take recipes with them (Mealime closes October 21, 2026) | Export everything at any time, in open formats, including after a subscription lapses | DATA-2, EXP-7 |

## What we did not find elsewhere

Ideas we did not find in any competitor during research. "Not found" means not seen in the apps and reviews we looked at, not a guarantee that no app does it.

- **One batch, many plates.** One household prep batch, portioned per person to each person's targets (PREP-4).
- **Tracker staleness detection.** Knowing which version of a recipe is in your calorie tracker, and flagging when it changed (EXP-5, EXP-6).
- **Version-pinned private recipe links** for importing into trackers that read recipe websites (LINK-1 to LINK-10).
- **Cooked-weight portioning** on prep day (PREP-6).

Candidates for after v1: leftover forecasting, printable freezer labels, a view of how much of the week is planned, and a weekly budget view from store prices.

## To add

- The per-app comparison from the November 2026 research report (features, pricing, platforms), with sources.
- A recheck of the "not found elsewhere" list closer to launch.
