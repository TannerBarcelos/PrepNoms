# PrepTable v1: product requirements

| | |
|---|---|
| Product | PrepTable (renamed from PrepNoms; trademark and App Store check pending) |
| Version | v1 |
| Status | Draft for review |
| Owner | Tanner Barcelos |
| Date | November 18, 2026 |
| Launch target | About 3 months: February 2027 |
| Inputs | [Product plan](../PLAN.md), the Gather web mockup in [`mockup/`](../../mockup), competitor research |

This PRD defines what v1 does and how we'll know it worked. It does not choose the stack, backend or vendors, except where a requirement can only be met one way. Those decisions come next, in a technical design.

Requirement IDs (`ACC-1`, `REC-4` and so on) are stable so designs, tickets and tests can refer to them.

---

## 1. Summary

PrepTable is a meal planner for couples and families who plan the week, shop once and batch-cook. It holds the household's recipes, plans each person's meals, builds one shared shopping list, keeps a pantry, and walks through prep day.

It is not a calorie tracker. People who count calories keep using the tracker they already have. PrepTable plans the food, and hands each recipe to the tracker in a form the tracker imports cleanly. It also tells the person when a recipe they copied has since changed.

## 2. Problem

Couples and families who meal prep juggle four tools: a recipe app or bookmarks, a notes app for the plan, a shared list app for groceries, and a calorie tracker. Each hand-off is manual.

- Recipes imported from websites and videos come in wrong, and many apps don't let you fix them, or lose the original when you do.
- Meal planners plan for one person or force one plan on the whole family. Two people with different targets eating from the same batch is not handled.
- Prep day is guesswork: how much raw chicken for eight containers, and how much cooked rice goes in each one.
- Getting a recipe into a calorie tracker means retyping it. When the recipe changes, the tracker copy silently goes stale.

## 3. Who it's for

| | |
|---|---|
| **Primary** | A couple or family of 2 to 5 who plan meals together, shop weekly and prep on one day. At least one person counts calories or macros in another app. |
| **Secondary** | One person who meal preps and tracks. |
| **Not targeted** | People looking for a calorie tracker, a diet program or a recipe discovery feed. |

## 4. Goals and non-goals

### Goals
1. Plan a household's week in a few minutes, with each person's meals sized to their own targets when they want that.
2. One shopping list and pantry for the whole household, live on every device.
3. Make prep day concrete: batch totals and per-container portions.
4. Make getting a recipe into any calorie tracker a single copy, and keep that copy current.
5. Import recipes from text, links and photos, with a review step that catches mistakes.

### Non-goals for v1
- Logging what was eaten, calories left, streaks, weigh-ins.
- Writing into any calorie tracker or health app directly.
- Recipe discovery, social feeds, ratings.
- Snacks in the plan.
- YouTube import.
- Kroger and Walmart grocery hand-off.
- Android app.
- Languages other than English.

## 5. Success metrics (90 days after launch)

| Metric | Definition | Target |
|---|---|---|
| Trial to paid conversion | Trials started that become paying subscriptions within 14 days of trial end | To set before launch |
| Weekly active planners | Subscribers who have at least 5 days of next week planned by the end of Sunday | To set before launch |
| Household adoption | Share of paying subscriptions on the household plan | To set before launch |

Measured through privacy-first product events (see NFR-PRIV).

---

## 6. Scope at a glance

| Area | v1 | Later |
|---|---|---|
| Platforms | iOS app, web app | Android |
| Accounts | Sign in with Apple, Google, email magic link, email and password | |
| Households | Create, invite, approve, shared list and pantry, shared recipes, shared meals and prep | |
| Import | Paste text, recipe website link, photo or screenshot | YouTube link |
| Recipes | Edit, versions with back and forward, private or household | |
| Planning | Breakfast, lunch, dinner per person; solo or household meals; targets optional | Snacks |
| Prep | Solo prep and household prep, per-person portions, cooked-weight portioning | Leftover forecasting, freezer labels |
| Shopping | Shared list, pantry, store packages, Instacart hand-off | Kroger, Walmart, budget view |
| Tracker export | Ingredient list, one line, CSV, JSON, private recipe link, staleness flag | |
| Nutrition | USDA FoodData Central, Open Food Facts barcode lookup, user edits | Commercial branded database |
| Billing | 7-day full trial; solo and household plans, monthly and yearly; usage cap with top-ups | |
| Markets | US, Canada, UK; English | |

---

## 7. Functional requirements

### 7.1 Accounts and onboarding (`ACC`)

| ID | Requirement |
|---|---|
| ACC-1 | Sign in with Apple, Google, email magic link, or email and password. All four on iOS and web. |
| ACC-2 | Onboarding asks: solo or household. Household creates a household with this person as its creator. Solo can create or join a household later from settings. |
| ACC-3 | Onboarding asks whether the person wants calorie and macro targets. If yes: calories, protein minimum, carb cap, fat goal. If no, see PLAN-8. Changeable any time. |
| ACC-4 | Onboarding asks for units (US customary or metric), defaulted from the device region, and the prep day (default Sunday). |
| ACC-5 | Onboarding offers to import a first recipe and to load a small starter set of recipes. |
| ACC-6 | The 7-day trial starts at the end of onboarding with every feature on (see BILL). |

### 7.2 Households (`HH`)

| ID | Requirement |
|---|---|
| HH-1 | The household creator invites people by link or email. Each person who joins is approved by the creator before they see anything. |
| HH-2 | A household has a shared shopping list, a shared pantry, a household recipe library, and household meals and prep (below). |
| HH-3 | Each member sees the others' plans read-only: meal names, and whether each is prepped, cooked fresh or a household meal. Never their targets, amounts, macros or private recipes. |
| HH-4 | Always private to each person: targets, foods to avoid, private recipes and their versions, export history, private links. |
| HH-5 | The creator can remove a member. A member can leave. Leaving keeps the person's private recipes and plan. Household recipes, list and pantry stay with the household. |
| HH-6 | One household per person in v1. |

### 7.3 Recipe library (`REC`)

| ID | Requirement |
|---|---|
| REC-1 | Each recipe is either **private** (one person) or **household** (all members). |
| REC-2 | In a household, new and imported recipes default to household. At save time the person can choose private instead. |
| REC-3 | A household recipe can be edited only by the member who created it. Other members can duplicate it into a private copy and edit that. |
| REC-4 | The creator can move a recipe from private to household, and from household back to private. See open question Q4 about other members' plans. |
| REC-5 | A household recipe's version history is shared: every member sees the same versions. |
| REC-6 | Everything about a recipe can be edited: name, description, meal (breakfast, lunch, dinner), cuisine, ingredients and amounts, ingredient roles (protein, starch, vegetable, fat, sauce, seasoning, fixed), steps, storage notes, source link, and whether PrepTable may scale portions. |
| REC-7 | Recipes are stored as one serving. |
| REC-8 | Library: search by name, cuisine or protein; filter by meal; "Can make now" from the pantry; hide recipes without deleting them. |
| REC-9 | Duplicate any recipe the person can see. |
| REC-10 | Delete a recipe the person created. Meals using it are cleared from plans after a confirmation that lists them. |

### 7.4 Recipe versions (`VER`)

| ID | Requirement |
|---|---|
| VER-1 | Every save creates a new version. Nothing is overwritten. |
| VER-2 | The recipe page shows "Version N of M", with back and forward controls, the change summary and date ("Renamed, 1 amount changed, Nov 18"). For household recipes it also shows who saved it. |
| VER-3 | A versions list shows every version with "Use this". |
| VER-4 | Back and forward only change which version is in use. They never delete versions. |
| VER-5 | Editing an older version saves the result as a new latest version. The versions after it remain. |
| VER-6 | Plans, shopping list and prep use the version in use from that point on. Already-finished prep is not changed. |
| VER-7 | Up to 15 versions per recipe are kept. The original is always kept. When over the limit, the oldest version that isn't the original is removed. |

### 7.5 Import (`IMP`)

| ID | Requirement |
|---|---|
| IMP-1 | One "Add recipe" action with four options: from a link, from a photo or screenshot, paste the text, write it yourself. |
| IMP-2 | **Link:** for recipe websites, structured recipe data on the page is used when present; otherwise the page text is parsed. The source link and site name are saved on the recipe. |
| IMP-3 | **Photo or screenshot:** the text in the image is read, then parsed. Up to 4 images per recipe (a recipe across two cookbook pages). Low-confidence text is flagged. |
| IMP-4 | **Paste the text:** any text; headers, ingredients, steps and servings are found. |
| IMP-5 | Every import ends on a **review screen** before saving. Nothing imported is saved without it. |
| IMP-6 | On the review screen each ingredient line is matched to a catalog food with an amount in g, ml or whole items. Lines where a unit or amount was guessed are flagged in place with the reason. Editing the amount clears the flag. |
| IMP-7 | Lines that matched no food are listed at the top. Each can be matched by search, added as a new food, or skipped. |
| IMP-8 | Amounts are divided by the servings the source states, so the recipe is saved as one serving. The review screen says what it divided by. |
| IMP-9 | Link and photo imports count toward the usage cap (BILL-5). Whether paste-text imports count is open question Q1. |
| IMP-10 | A failed import (page unreachable, nothing found, unreadable photo) says what failed and offers paste-text instead. A failed import does not count toward the cap. |
| IMP-11 | We don't copy the source's photos. Recipe text is kept only as needed to cook it, with the link to the original. |

### 7.6 Planning (`PLAN`)

| ID | Requirement |
|---|---|
| PLAN-1 | Week view, Monday to Sunday, with breakfast, lunch and dinner for the current person. One day per row on phones; columns on tablets and desktop. |
| PLAN-2 | Pick a recipe for one day, Monday to Friday, or all seven days. Move a meal to another day. Clear a slot. |
| PLAN-3 | When adding a meal in a household, the person chooses **just me** or **household**. |
| PLAN-4 | A **just me** meal is portioned to the person's targets (PLAN-7) and counts in their plan totals. |
| PLAN-5 | A **household** meal appears on every member's plan. Any member can add, move or remove a household meal. It is not portioned and does not count in anyone's plan totals. The recipe's serving information is shown for reference. Each person logs it in their tracker and estimates their own portion. |
| PLAN-6 | Plan totals per day: calories, protein, carbs and fat for the planned just-me meals, against the person's targets. Labeled as the plan, not as food eaten. Household meals on that day are noted as not counted. |
| PLAN-7 | **Portioning to targets:** for recipes that allow scaling, PrepTable adjusts protein, starch, vegetables and fat within set limits so each day lands close to the targets. Amounts round to kitchen-friendly steps. The person can lock any ingredient amount. |
| PLAN-8 | **Targets off:** if a person has no targets, there's no portioning and no totals; recipes are used at their saved serving. Everything else works the same. |
| PLAN-9 | No snack slot in v1. |
| PLAN-10 | Foods a person marks to avoid are left out of the suggestions shown when picking a recipe. |
| PLAN-11 | Today screen: today's meals, steps for meals cooked fresh, "Mark cooked", and the copy-to-tracker button for each meal. No eaten ticks, no calories left, no food logging. |

### 7.7 Prep day (`PREP`)

| ID | Requirement |
|---|---|
| PREP-1 | A just-me recipe planned on 2 or more days triggers a one-time question: prep it, or cook it fresh each time. Fish defaults to fresh. |
| PREP-2 | When setting up prep in a household, the person chooses **solo prep** or **household prep**. |
| PREP-3 | **Solo prep** covers that person's planned servings, each portioned to their targets. |
| PREP-4 | **Household prep** is one batch for the members who opt in, with containers portioned per person: each member's containers sized to their own targets, or to the saved serving if they have no targets. |
| PREP-5 | Cook list: raw batch totals for everything being prepped, with store package sizes. |
| PREP-6 | Portion mode: for components that change weight when cooked, the person weighs the cooked total; PrepTable divides it across the containers in proportion to each container's share. Sauces and as-packaged items are measured straight into containers. Containers are ticked as filled, grouped by person. |
| PREP-7 | Finishing a prep, or "Mark cooked" on a fresh meal, removes the ingredients from the household pantry. |
| PREP-8 | Prep day is per person, default Sunday, set in settings. |

### 7.8 Shopping list and pantry (`SHOP`)

| ID | Requirement |
|---|---|
| SHOP-1 | One shopping list per household (or per person if solo), live on every member's devices. |
| SHOP-2 | The list combines what every member's plan and household meals and prep need, minus the pantry, plus anything added by hand. Hand-added items can be catalog foods or free text. |
| SHOP-3 | Amounts round up to whole store packages. Staples (spices, oils) are have or out, not weights. |
| SHOP-4 | Any member can add, tick and remove items. Ticked items move to the cart. "Put away" moves cart items into the pantry. |
| SHOP-5 | The pantry holds quantities on hand and have or out for staples. Any member can edit it. |
| SHOP-6 | **Instacart hand-off:** send the list, or the unticked part of it, to Instacart and finish the order there. Available in the US and Canada where Instacart operates; hidden elsewhere. |
| SHOP-7 | Items appear in store aisle order. |

### 7.9 Calorie tracker export (`EXP`)

| ID | Requirement |
|---|---|
| EXP-1 | Every recipe and every planned meal has "Copy to your calorie tracker". |
| EXP-2 | Formats: ingredient list (one per line), one line (comma-separated), CSV, JSON, private link. All describe one serving in raw weights, in the person's units. For a just-me meal, the export uses that person's portioned amounts. |
| EXP-3 | The exported name can include calories ("Taco Beef Bowls, 693 Cal"). On by default. |
| EXP-4 | The app's UI never names or shows logos of other apps. It says "your calorie tracker". Help pages may name specific apps. |
| EXP-5 | PrepTable records which version, at which amounts, the person last exported for each recipe. |
| EXP-6 | If the recipe or the person's portion has changed since then, the meal shows "Changed since copied", and the export sheet shows old and new calories with advice to save it as a new recipe in the tracker. |
| EXP-7 | Text exports (ingredient list, one line, CSV, JSON) are available during the trial, after the trial and after a subscription lapses. Private links follow LINK-10. |

### 7.10 Private recipe link (`LINK`)

| ID | Requirement |
|---|---|
| LINK-1 | "Private link" creates a web address for one version of one recipe at one person's portion. |
| LINK-2 | The page shows name, one serving, ingredients in raw weights, steps, and nutrition per serving. It carries standard schema.org Recipe data with nutrition, so trackers that import from a website read it directly. |
| LINK-3 | The address is unguessable and reveals nothing about the person or recipe. |
| LINK-4 | Default expiry 7 days. Options: 1 day, 7 days, 30 days, no expiry. |
| LINK-5 | A link always shows the version it was made for, even after the recipe is edited. |
| LINK-6 | The person can turn off one link, or all their links, from settings. Turned-off links stop working immediately. |
| LINK-7 | Settings lists the person's live links with recipe, version and expiry. |
| LINK-8 | The page asks search engines not to index it. No ads, no tracking scripts, no sign-in to view. |
| LINK-9 | An expired or turned-off link shows a plain "This link has expired" page with no recipe data. |
| LINK-10 | Links stop working when a subscription lapses, unless open question Q6 decides otherwise. |

### 7.11 Nutrition catalog (`FOOD`)

| ID | Requirement |
|---|---|
| FOOD-1 | Core foods from USDA FoodData Central, with kitchen measures (cup, tbsp, clove) and store package sizes added. |
| FOOD-2 | Barcode scanning on iOS looks up packaged foods in Open Food Facts. A food that isn't found can be added by hand. |
| FOOD-3 | A person can edit any food's nutrition, measures and package size, or add their own. Edits are private unless the food is used in a household recipe, where the creator's values are used. |
| FOOD-4 | Nutrition per 100 g, per 100 ml, or per item. |

### 7.12 Subscription and billing (`BILL`)

| ID | Requirement |
|---|---|
| BILL-1 | 7-day free trial with every feature on. One trial per account. |
| BILL-2 | Plans: |

| Plan | Monthly | Yearly |
|---|---|---|
| Solo | $5.99 | $49.99 |
| Household (everyone in the household) | $8.99 | $69.99 |

Prices in USD. CAD and GBP set through App Store price tiers.

| ID | Requirement |
|---|---|
| BILL-3 | The household plan is paid by one member and covers every member. |
| BILL-4 | iOS purchases go through the App Store. Web purchases go through a web checkout. A subscription bought on either works on both. |
| BILL-5 | **Usage cap** on link and photo imports: 50 per month on monthly plans, 600 per year on yearly plans. On the household plan the cap is shared by the household (open question Q2). |
| BILL-6 | The cap is stated on the paywall, and settings show how much is left and when it resets. |
| BILL-7 | **Top-ups:** $2.99 for 50 more imports, bought any time. Top-ups don't expire while the subscription is active. |
| BILL-8 | Reaching the cap only stops link and photo imports. Everything else keeps working. The import screen offers a top-up or paste-text. |
| BILL-9 | **Trial ends without a purchase:** recipes stay readable, and every export format except the private link keeps working. Planning, prep, list, pantry and imports lock until they subscribe. |
| BILL-10 | **Household subscription lapses:** every member drops to the state in BILL-9. Any member can start a solo plan; their private recipes come back fully, and household recipes stay read-only to them. |
| BILL-11 | Switching between solo and household, and between monthly and yearly, is supported in both directions. |

### 7.13 Settings, data and deletion (`DATA`)

| ID | Requirement |
|---|---|
| DATA-1 | Settings: targets on or off and their values, units, prep day, foods to avoid, household members, live private links, subscription and usage, analytics opt-out. |
| DATA-2 | **Full export:** all of the person's recipes with every version, plans, pantry and list, as JSON plus a CSV of recipes. Available any time, including after a lapse. |
| DATA-3 | **Delete account** in the app, on iOS and web. It deletes the person's private data and links. Household recipes they created are handed to the household creator, or deleted if they were the creator and the last member. Shows what will happen before confirming. |
| DATA-4 | Restore from a full export into a new or empty account. |

---

## 8. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-PLAT-1 | Platforms | Native iOS app (iPhone and iPad) and a web app for current Safari, Chrome, Firefox and Edge, on desktop and mobile. |
| NFR-PLAT-2 | Layout | Phones always get one column, including the largest and foldable phones. Tablets and desktop get columns and a list and detail split. |
| NFR-OFF-1 | Offline | On iOS, every screen is readable offline, and plans, list, pantry, prep progress and recipe edits work offline and sync when back online. Imports, links, barcode lookups and Instacart need a connection and say so. |
| NFR-OFF-2 | Sync | Changes from household members appear on other devices within a few seconds while online. When two people edit the same list item or pantry quantity offline, neither change is lost silently: both are kept, or the later one wins and the earlier one is shown. The exact rule is for the technical design. |
| NFR-PERF-1 | Speed | Screens open in under 1 second on a recent iPhone with data cached. Plan portioning for a week updates in under 1 second after a change. |
| NFR-PERF-2 | Import | Link imports show the review screen within 15 seconds; photo imports within 30 seconds, with progress shown. |
| NFR-A11Y-1 | Accessibility | WCAG 2.2 AA on web and iOS. Full VoiceOver support, Dynamic Type up to the largest accessibility sizes, 44 pt minimum touch targets, no information by color alone. |
| NFR-PRIV-1 | Privacy | Private data is visible only to its owner, and household data only to members. Enforced on the server, not only in the app. |
| NFR-PRIV-2 | Analytics | Anonymous product events only, for the metrics in section 5. No third-party ad or tracking SDKs. Opt-out in settings. |
| NFR-PRIV-3 | Data use | No selling or sharing of personal data. Recipe content sent for import processing is not used to train models. |
| NFR-SEC-1 | Links | Private links are signed, expire and can be revoked immediately (LINK-3 to LINK-6). |
| NFR-SEC-2 | Accounts | Standard protections for email and password sign-in: rate limiting, breached-password checks, verified email. |
| NFR-REL-1 | Durability | No data loss from app updates or sync. Daily backups on the server side. |
| NFR-LOC-1 | Markets | US, Canada and UK, English. US customary and metric units, chosen per person. Nutrition shown in Calories (kcal); kilojoules not needed in v1. |
| NFR-COMP-1 | App Store | Sign in with Apple offered wherever other social sign-in is (ACC-1). In-app account deletion (DATA-3). |

---

## 9. Key user journeys

**1. First week as a couple**
Alex signs up, chooses household, sets targets, and invites Sam. Sam joins, is approved, and skips targets. Alex imports three recipes from links, fixes one flagged amount on the review screen, and saves them to the household library. Alex plans their lunches as just-me meals, preps them solo, and adds two household dinners. The shopping list fills in for both of them. Sam ticks items at the store, then puts them away.

**2. Prep day**
On Sunday, Alex opens Prep. The cook list shows raw totals for their chicken-rice bowls (5 containers) and the household chili (Alex 3, Sam 3, portioned per person). They weigh the cooked rice, type the total, and fill containers as shown. Finishing takes the ingredients out of the pantry.

**3. Recipe into the tracker, then a change**
Alex copies the chicken-rice bowl to their tracker as an ingredient list. A week later they swap the rice for potatoes, saving version 3. Today now shows "Changed since copied" on that meal. They open the export, see the old and new calories, make a private link, and import it into their tracker as a new recipe.

**4. Going back**
Sam doesn't like the potato version. Alex, as the recipe's creator, goes back to version 2. Version 3 is still in the list if they want it later.

**5. Lapse**
The household subscription lapses. Sam starts a solo plan. Their private recipes work fully; the household recipes Alex created are read-only for them, and they duplicate the two they use into private copies.

---

## 10. Release plan

Launch target: about 3 months, February 2027, iOS and web together.

Before launch:
- Name: trademark and App Store search for PrepTable, domain.
- App Store review, including subscriptions and Sign in with Apple.
- Instacart Developer Platform approval.
- Success metric targets set (section 5).
- Help pages, including how to import into common calorie trackers by name.

Milestones and sequencing come from the technical design.

## 11. Later (not v1)

YouTube import · Android · Kroger and Walmart hand-off · snacks · leftover forecasting · freezer labels · weekly budget view from store prices · commercial branded-food database · Apple Health (plan-level only, if useful) · languages beyond English · sharing a recipe link with someone outside the household.

## 12. Open questions

| # | Question | Notes |
|---|---|---|
| Q1 | Do paste-text imports count toward the usage cap? | They also need an LLM, but cost less than photos and links. |
| Q2 | Is the household plan's cap shared by the household or per member? | Shared is simpler to explain; per member scales with household size. |
| Q3 | When a household member has no targets, how is a household prep portioned for them? | PREP-4 uses the saved serving. Confirm, or allow a manual share (for example "half of Alex's"). |
| Q4 | When a creator moves a household recipe back to private, what happens to other members' planned meals and versions? | Options: they keep a private copy automatically, or the meals are cleared. |
| Q5 | If a household recipe's creator leaves the household, who can edit it? | DATA-3 hands it to the household creator on account deletion; leaving should probably match. |
| Q6 | Do private links keep working after a subscription lapses? | LINK-10 says no. Keeping them up costs little and matches "nobody's recipes held hostage". |
| Q7 | Trial to paid, weekly active planner and household adoption targets. | Set before launch. |
| Q8 | Final name clearance for PrepTable. | |

### Defaults to confirm

These details weren't decided in review. The PRD uses the default shown; each needs a yes or a change.

| # | Default in this draft | Where |
|---|---|---|
| D1 | Onboarding offers a small starter set of recipes. | ACC-5 |
| D2 | One household per person. | HH-6 |
| D3 | Up to 4 photos per recipe import. | IMP-3 |
| D4 | In household recipes, the recipe creator's food nutrition edits are used. | FOOD-3 |
| D5 | Shopping list sorted in store aisle order. | SHOP-7 |
| D6 | A subscription bought on iOS or web works on both. | BILL-4 |
| D7 | Top-ups don't expire while subscribed. | BILL-7 |
| D8 | Plan switching (solo and household, monthly and yearly) in both directions. | BILL-11 |
| D9 | Speed targets: screens under 1 s, link import under 15 s, photo import under 30 s. | NFR-PERF |
| D10 | Restore from a full export. | DATA-4 |
| D11 | Barcode scanning on iOS only (web has no camera scanning in v1). | FOOD-2 |

