# PrepNoms product plan

Status: working plan, November 2026. The v1 decisions are in the PRD: [prds/preptable-prd-v1.md](prds/preptable-prd-v1.md). Where the two differ, the PRD wins.

This was the input for the PRD. Technical decisions (stack, backend, vendors) come after the PRD and are only noted here where they change what the product can do.

The working name is PrepNoms. The mockup is called Gather. Neither is final (see [Name](#name)).

## 1. What it is

A shared kitchen planner for busy couples and families. It holds your recipes, plans the week, builds the shopping list, tracks the pantry and walks you through prep day. It is warm and homey in tone, not clinical.

It is **not a calorie tracker.** People who count calories already have a tracker they like (Foodnoms, MyFitnessPal, Cronometer, Lose It, MacroFactor). PrepNoms does the part those apps are weak at: deciding what to cook, buying it, and cooking it in batches. It hands each recipe to the tracker in a form the tracker can import cleanly, and it keeps that hand-off correct when a recipe changes.

### The boundary with calorie trackers

| PrepNoms owns | The calorie tracker owns |
|---|---|
| Recipe storage, editing and versions | The food log: what you actually ate |
| Meal plan for the week, per person | Daily totals, streaks, weigh-ins |
| Plan-level macro view against your targets | Calories left today |
| Shopping list, pantry, store packages | Barcode logging of snacks |
| Prep day: batch totals, portioning into containers | Adaptive targets, coaching |
| Exporting each recipe to the tracker | Importing that recipe and logging servings |

PrepNoms shows what the **plan** adds up to against your targets, so you can fix the week before you shop. It never asks whether you ate something. There are no eaten ticks, no calories-left bar and no off-plan logging. The mockup had all three; they were removed.

The two apps stay separate but tightly linked: every planned meal has a one-tap "Copy to your calorie tracker", and the app tells you when a recipe in your tracker is out of date.

## 2. Who it's for

- **Primary:** a couple or small family who plan meals together, shop once a week and prep on one day. At least one person counts calories or macros in another app.
- **Also:** a single person who meal preps and tracks.
- **Not a target:** people who want a calorie tracker, a diet program or a recipe discovery feed.

## 3. Households and privacy

Private by default. Sharing is opt-in.

- **Solo:** everything is private. Recipes, plan, targets, pantry, list.
- **Household:** one person creates it and invites others. Joining is approved by the creator.
  - **Shared:** the shopping list (anyone can add, tick and put away), the pantry, and a read-only view of each other's planned meals.
  - **What the others see of your plan:** meal name and whether it's prepped or cooked fresh. Not your targets, amounts, macros or notes.
  - **Always private:** your recipe library, recipe versions, targets, foods you avoid, export history.
  - A person can share a single recipe with the household as a copy. After that it's the other person's copy to edit.
- Leaving a household takes your private data with you. Shared list and pantry stay with the household.

Open question: whether a household can have one shared "family dinner" plan on top of each person's own plan. Several competitors are built around exactly this, and couples who cook one dinner for two may expect it.

## 4. Recipes

### Adding a recipe

One "Add recipe" button with four ways in. All four end on the same review screen.

1. **From a link.** Recipe sites, blogs, YouTube.
   - Most recipe sites publish schema.org `Recipe` data on the page. Read that first; it is exact and cheap.
   - If a page has none, an LLM reads the page text.
   - YouTube: the description, pinned comment and captions, read by an LLM. Many creators put the full recipe in the description.
   - The recipe keeps a link back to its source, with the creator's name. We don't republish their photos or text beyond what's needed to cook.
2. **From a photo or screenshot.** Cookbook pages, recipe cards, Instagram and TikTok captions. Text is read from the image, then parsed. Handwriting and blurry shots are flagged.
3. **Paste the text.** Anything copied from anywhere.
4. **Write it yourself.**

**The review screen** is required for every import, because a wrong match here becomes wrong nutrition in the tracker later.

- Each ingredient line is matched to a food in the catalog with an amount in grams, millilitres or whole items.
- Lines that needed a guess are flagged in place: "Converted cup to grams at 1 g per ml. Check the weight." Editing the amount clears the flag.
- Lines that matched nothing are listed at the top with Skip, or added by hand.
- Amounts are divided by the servings the source says it makes, so every recipe is stored as one serving.

The mockup does pasted text with simple rules. Links and photos are explained but not wired up; in the app they run on our servers.

### Editing and versions

Every recipe can be edited: name, description, meal, cuisine, ingredients and amounts, roles (protein, starch, vegetable, fat, sauce, seasoning, fixed), steps, storage notes, and whether Gather may scale portions.

Every save keeps the old version. The recipe page shows "Version 3 of 5" with back and forward, and a list of all versions with what changed ("Renamed, 1 amount changed, Nov 18").

- **Back and forward never delete anything.** Going back to version 2 and editing it saves version 6. Versions 3 to 5 are still there.
- Changing versions changes what the plan, shopping list and prep use from then on.
- History is capped (the mockup keeps 15), always including the original.
- Each version has its own export state and its own private link (below).

## 5. Getting recipes into a calorie tracker

This is the most important integration. Trackers have recipe features, but typing a recipe into one is slow, and an edited recipe goes stale in the tracker without anyone noticing.

### Export formats

From any recipe or planned meal, "Copy to your calorie tracker" opens one sheet:

| Format | Use |
|---|---|
| Ingredient list | One ingredient per line in raw weights. Pastes into recipe import in Foodnoms and most others. |
| One line | Comma-separated, for quick-add fields and notes. |
| CSV | Spreadsheets and trackers that take files. |
| JSON | Our own format, for backups, other apps and the future API. |
| Private link | A hosted page for this version of the recipe, for trackers that import from a website. See below. |

- Exports are always **one serving**.
- The recipe name can include the calories ("Taco Beef Bowls, 693 Cal"), so several versions in the tracker are easy to tell apart. On by default.
- The UI never names or shows logos of other apps. It says "your calorie tracker". Help pages can name specific apps.

### Keeping the tracker current

PrepNoms remembers which version you last copied for each recipe.

- If the recipe has changed since, the meal on Today shows "Changed since copied" and the export sheet says what changed in calories ("693 Cal then, 640 now").
- The advice is to save it as a new recipe in the tracker, so meals already logged keep the old numbers.
- No tracker gets written to directly. Trackers with closed APIs (MyFitnessPal) can't be, and copying keeps the user in control of their log.

### Private recipe link

A link like `https://r.<domain>/v/7Kq2…` that opens a plain page for one version of one recipe. Trackers that can import a recipe from a website (Foodnoms, Cronometer and others) read it like any recipe site.

**What the page contains**
- Recipe name, one serving, ingredient list in raw weights, steps.
- Standard schema.org `Recipe` data with `NutritionInformation` per serving, so a tracker can take our nutrition values instead of guessing.
- `noindex`, no ads, no tracking, no account needed to open.

**How it behaves**
- **Unguessable.** Nobody can find it by trying addresses.
- **One link per version.** Editing the recipe never changes what an old link shows. A new version gets a new link.
- **Expires.** Default 30 days, which covers importing it. Options: 1 day, 7 days, 30 days, no expiry.
- **Revocable.** "Turn off this link" works immediately, and "Turn off all my links" is one tap in settings.
- **Visible.** Settings lists live links with their recipe, version and expiry.

**Why this design, at product level.** Cloudflare offers two ways to make a private link.

| | Storage pre-signed URL (R2) | Signed link checked by our own edge code (Workers) |
|---|---|---|
| Longest life | 7 days | Any; we set it |
| Can be turned off before expiry | No | Yes |
| What the URL shows | Bucket and file path | Only an opaque ID |
| Can serve a web page with recipe data | Only a stored file | Yes, built on request |

The pre-signed storage URL is the obvious "private link" feature, but it can't outlive a week, can't be revoked, and exposes storage paths. The second approach checks a signature on each request at the edge and then renders the page. It meets every requirement above. Cloudflare documents this pattern ("sign requests" with HMAC in Workers), and its firewall can check the same kind of signature before the request reaches our code. Final vendor choice belongs to the technical phase; the requirements above are what the PRD should hold.

**Later:** the same link can be shared with a person ("send Jen this recipe"), opening a "Save to my recipes" page if they have the app.

## 6. Planning

- Week view, Monday to Sunday. Breakfast, lunch, dinner per person. One day per row on phones, columns on tablets and desktop.
- Pick a recipe for one day, Mon–Fri or the whole week.
- **Portioning to targets.** Each person sets calories, protein minimum, carb cap and fat goal. PrepNoms scales each recipe's protein, starch, vegetables and fat within limits so each planned day lands close. Amounts round to kitchen-friendly steps. Any amount can be locked.
- **Plan-level macros only.** "Monday's plan: 2,180 Cal, 190 g protein" against targets. Nothing about what was eaten.
- Foods you avoid are excluded from suggestions.

## 7. Prep day

- Prep day defaults to Sunday, changeable in settings.
- A recipe planned once is cooked fresh. Planned twice or more, PrepNoms asks once whether to prep it. Fish is always fresh.
- **Cook list:** raw batch totals for everything being prepped.
- **Portion mode:** weigh each cooked component, type the total, and PrepNoms divides it by the number of containers. Tick each container as it's filled. Sauces are measured straight in.
- Finishing marks the recipe prepped and takes the ingredients out of the pantry. "Mark cooked" does the same for fresh meals.

## 8. Shopping list and pantry

- The list is built from the plan, minus what's in the pantry, plus anything added by hand.
- Buy amounts round up to whole store packages.
- Staples (spices, oils) are have/out, not weights.
- Ticked items go in the cart; "Put away" moves them into the pantry.
- Shared live across the household.
- **Grocery hand-off (later):** send the list to Instacart, Kroger or Walmart. Instacart and Kroger have partner APIs; Walmart supports add-to-cart links. Instacart's program pays a commission, which would offset the cost of imports.

## 9. Nutrition data

- Core catalog from USDA FoodData Central (public domain), with kitchen measures and store package sizes added.
- Barcode lookups from Open Food Facts.
- A commercial database as a fallback for branded foods, decided in the technical phase.
- Users can edit any food or add their own. Edits are private.

## 10. What competitors get wrong, and our answer

From app store reviews and Reddit threads collected in the research report.

| Common complaint | Our answer |
|---|---|
| Imports mangle ingredients; no way to check | Every import ends on a review screen with flagged lines |
| Can't edit imported recipes, or edits lose the original | Full editing with versions, back and forward |
| Meal planner forces one plan on the whole family | Each person plans for their own targets; the list and pantry are shared |
| Calorie numbers in the planner don't match the tracker | The tracker gets exact per-serving nutrition, and stale copies are flagged |
| Prep instructions ignore batch cooking | Batch totals and cooked-weight portioning |
| Shopping list ignores what you have | Real pantry, updated by shopping and cooking |
| Subscription for basic features | A full free trial, then a subscription with a clearly stated usage cap and top-ups |
| Apps shut down and take recipes with them (Mealime closes Oct 21, 2026) | Export everything any time, in open formats |

### What's new here

Ideas that we did not find in any competitor during research:

- **One batch, many plates.** One prep batch portioned differently per person, to each person's targets.
- **Tracker staleness detection.** Knowing which version is in your tracker and telling you when it changed.
- **Version-pinned private recipe links** for tracker import.
- **Cooked-weight portioning** on prep day.
- Candidates for later: leftover forecasting, printable freezer labels, a "coverage" view of how much of the week is planned, a weekly budget view from store prices.

## 11. Pricing direction

- **7-day free trial with everything on:** households, imports, private links, grocery hand-off. No feature limits during the trial.
- **After the trial: subscription.** A one-time purchase was considered and dropped. Imports and private links cost money every time someone uses them, so one-time revenue can't cover a user who keeps importing.
- **Usage cap, stated up front.** The yearly plan includes a set amount of usage for the costly features (link, photo and YouTube import). The cap is shown on the paywall and in settings, with what's left.
- **Top-ups on demand.** Hitting the cap doesn't lock anything else. Users can buy more usage when they need it.
- **When the trial ends without a purchase:** recipes stay readable and every export keeps working, so nobody's recipes are held hostage.
- No ads. No selling data.

Prices, cap size and top-up packs are set in the PRD.

## 12. Name

The product is named **PrepTable** (the name has to include "Prep"). Trademark and App Store checks are pending. Preppd, PrepFlow, PrepYourWeek and Meal Prep Sunday already exist on the App Store.

## 13. Roadmap

1. **Core (MVP):** recipes with editing and versions, paste and link import with review, week plan with portioning, prep day, shopping list and pantry, tracker export (all text formats). iOS and web.
2. **Households:** invites, shared list and pantry, read-only plan view.
3. **Private recipe links**, photo import, YouTube import.
4. **Grocery hand-off**, Android.
5. Later: leftover forecasting, freezer labels, budget view, Apple Health (plan-level only, if useful at all).

## 14. Open questions for the PRD

1. Shared family dinner plan in a household, or only individual plans?
2. Should someone who doesn't count calories be able to turn macros off entirely?
3. Snacks: plan them, or leave them to the tracker?
4. How long should private links last by default: 7 or 30 days?
5. Subscription prices, usage cap and top-up packs.
6. Should recipe versions be visible to household members when a recipe is shared?
7. Web app at launch, or iOS first?
8. Final name.

## Appendix: mockup coverage

The web mockup in [`mockup/`](../mockup) shows sections 3 to 8. What's real and what's a stand-in:

| Feature | In the mockup |
|---|---|
| Household privacy and sharing | Real, using the artifact's storage rules |
| Paste-text import with review | Real, rule-based parser |
| Link, photo and YouTube import | Explained on screen; not wired up |
| Versions, back and forward, history list | Real |
| Export: list, one line, CSV, JSON | Real |
| Tracker staleness flag | Real |
| Private recipe link | Preview of the screen with a placeholder link |
| Grocery hand-off, barcode, nutrition APIs | Not shown |
