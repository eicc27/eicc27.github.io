# Site cleanup, studio rearrange, IUCN links, timelapse hotkey, astro vector zoom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim hero, fold birds into Frames, restyle studio cards, make IUCN levels link to Wikipedia, widen Space buffer for the timelapse with armed hint, and fix astro overlay blur on zoom by switching SVG to true viewBox-based scaling.

**Architecture:** Touch each concern in isolation. Markup pruning (hero, photo wall, birds section) and content moves go first because they reduce future surface area. Studio restyle and IUCN links are localised CSS / HTML / JS tweaks. Timelapse buffer is a constant change plus a CSS hint. The astro overlay rewrite is the biggest single change — switch the scaling model from `transform: scale()` on a wrapper DIV to dynamic `viewBox` mutation on the SVG itself, move star dots from HTML+CSS into SVG, and replace `filter: drop-shadow(...)` with SVG `<filter>` defs. Verification uses Playwright visual checks because there is no existing test infrastructure.

**Tech Stack:** Plain HTML + CSS + ES modules (no build, no framework). Local static server (`python3 -m http.server 4173`) for manual verification. Playwright MCP for browser-driven visual verification (existing tooling).

**Pre-flight:**
- Working dir: `/Users/sihanchen/Documents/eicc27.github.io`
- Branch: `main` (changes will be committed directly per project history)
- Spec: `docs/superpowers/specs/2026-05-25-site-cleanup-and-overlay-fix-design.md`

---

## File Structure

Files this plan creates or modifies (and what each owns after the change):

- `index.html` — main markup. Removes `.hero-grid`, `.photo-wall-shell`, `<section #birds>`; renumbers section eyebrows; moves `bird-tab` into Frames `data-photo-decks` neighborhood; restructures studio readout cards; removes obsolete `<link rel="preload">` for hero images.
- `styles.css` — visual rules. Drops hero-card / photo-wall / studio-node rules; restyles bird-tab to look like a deck card; new studio card hierarchy; IUCN anchor reset + hover; timelapse `is-controls-armed` brighten rules; astro overlay SVG-only rules.
- `photo-decks.js` — deck rendering and viewer wiring. Drops hero highlight and wall rendering; keeps deck list + viewer logic; tolerates absence of `wallRoot`, `heroCards`, `heroMarqueeNode`, `totalCountNode`, etc.
- `birds-gallery.js` — bird viewer. Extends `IUCN_SCALE` with `wikiSlug`; `renderIucnScale` emits `<a>` instead of `<span>`.
- `timelapse-stopwatch.js` — timelapse stopwatch. Two new constants for armed visibility ratios; uses them in `updateScrollScene` + `handleWindowScroll`.
- `astro-overlay.js` — overlay rendering. Star markers move from HTML `<button>+<span>` to SVG `<circle>` + invisible HTML hotspot for hit-testing. `setViewTransform` mutates SVG `viewBox` instead of CSS transform on `.astro-overlay__scene`. Drop-shadow filters become SVG `<filter>` defs. Label layout math switches from `scale*offset` to viewBox-derived screen coords.
- `astro-immersive.js` — image viewer. **Not modified** — `setViewTransform({scale, x, y})` signature kept stable; only overlay's interpretation changes.
- `birds-data.js`, `photo-data.js` — **not modified**.

---

## Verification approach

There is no Jest/Vitest test suite in this repo. Verification per task uses:

1. **Static checks:** `node --check <file>` for JS syntax sanity.
2. **Visual verification:** start `python3 -m http.server 4173`, drive with Playwright MCP, screenshot the relevant region, eyeball.
3. **DOM assertions via Playwright `browser_evaluate`:** for non-visual invariants (e.g. "no `.hero-card` exists in DOM", "IUCN dot is an `<a>` with correct href").

For each task that touches behavior, the verification step is explicit (commands + expected output).

---

## Task 1: Remove hero grid markup

**Files:**
- Modify: `index.html:62-155` (`.hero` section, removing `.hero-grid` block)
- Modify: `index.html:17-24` (drop hero-card preload `<link>` tags)

- [ ] **Step 1: Remove the hero preload links**

Open `index.html` and delete lines 17–24 (the 4 portrait/scenery `<link rel="preload">` tags that exist solely to feed the deleted hero cards). Keep the favicon `<link>` at line 12 and the Google Fonts preconnect/preload at lines 25–33.

After this edit, lines 17–24 in the original file should be gone entirely (no blank lines left behind beyond the existing one-line gap).

- [ ] **Step 2: Remove the `.hero-grid` block**

In `index.html`, find the section starting `<section class="hero">` (line 62 in original). Delete the entire `<div class="hero-grid reveal reveal-group" aria-label="首屏主题卡片"> ... </div>` block (originally lines 90–154). The closing `</section>` for `.hero` stays.

After this edit the `.hero` section contains exactly one child: `<div class="hero-copy reveal reveal-group">...</div>`.

- [ ] **Step 3: Start local server**

Run:
```bash
cd /Users/sihanchen/Documents/eicc27.github.io
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4173/index.html
```

Expected: `200`.

- [ ] **Step 4: Verify in browser**

Use Playwright MCP:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html
mcp__playwright__browser_evaluate -> () => ({
  heroCards: document.querySelectorAll('.hero-card').length,
  heroGrid: document.querySelectorAll('.hero-grid').length,
  heroCopy: document.querySelectorAll('.hero-copy').length,
})
```

Expected:
```json
{ "heroCards": 0, "heroGrid": 0, "heroCopy": 1 }
```

- [ ] **Step 5: Screenshot for visual sanity**

```
mcp__playwright__browser_take_screenshot -> filename: "verify-task1-hero.png", type: "png"
```

Read the screenshot to confirm hero region shows only the copy / marquee / tags (no cards on the right).

- [ ] **Step 6: Stop server**

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Remove hero grid block and obsolete portrait preload links"
```

---

## Task 2: Drop hero highlight + wall rendering from photo-decks.js

**Files:**
- Modify: `photo-decks.js:1-143` (imports, references, `applyHeroCards`, `applyPhotoSummary`, wall rendering, init guard)
- Modify: `photo-decks.js:283-306` (`renderWall` function)

- [ ] **Step 1: Drop unused imports**

In `photo-decks.js` line 2, change:
```js
import { photoDecks, photoHighlights, photoSummary } from "./photo-data.js";
```
to:
```js
import { photoDecks } from "./photo-data.js";
```

- [ ] **Step 2: Remove hero / wall / about / marquee node lookups**

In `photo-decks.js` lines 13–25, delete the following lookups (keep `decksRoot`, `gallery`, `deckMap`):
- `wallRoot`
- `heroCards`
- `aboutFrame`, `aboutFigure`, `aboutWatermark`, `aboutTitle`
- `heroMarqueeNode`
- `heroPortraitCountNode`
- `heroSceneryCountNode`
- `totalCountNode`
- `totalSummaryNode`

After edit, the top of `initPhotoDecks` should look like:
```js
export function initPhotoDecks({ reducedMotionQuery } = {}) {
  if (!photoDecks.length) {
    return;
  }

  const decksRoot = document.querySelector("[data-photo-decks]");
  const gallery = document.querySelector("[data-photo-gallery]");
  const deckMap = new Map(photoDecks.map((deck) => [deck.id, deck]));
```

- [ ] **Step 3: Delete `resolveHighlight`, `applyHeroCards`, `applyAboutPortrait`, `applyPhotoSummary`**

In `photo-decks.js`, delete the entire `resolveHighlight` function (lines 28–48), `applyHeroCards` function (lines 50–86), `applyAboutPortrait` function (lines 88–105), and `applyPhotoSummary` function (lines 107–135).

Also remove the three call lines that invoke them (lines 137–139):
```js
applyHeroCards();
applyAboutPortrait();
applyPhotoSummary();
```

- [ ] **Step 4: Fix init guard**

In `photo-decks.js` line 141, change:
```js
if (!decksRoot || !wallRoot || !gallery) {
  return;
}
```
to:
```js
if (!decksRoot || !gallery) {
  return;
}
```

- [ ] **Step 5: Delete `renderWall` and remove its call site**

Delete the entire `function renderWall() { ... }` block (lines 283–306).

Then find the call site for `renderWall()` (search the file) and delete the call line. In current `photo-decks.js` the call is somewhere around the init flow near the bottom — find it with:
```bash
grep -n "renderWall" photo-decks.js
```
Delete every line that matches (both definition and call).

- [ ] **Step 6: Syntax check**

```bash
node --check photo-decks.js
```
Expected: no output (success).

- [ ] **Step 7: Smoke test in browser**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html
mcp__playwright__browser_console_messages -> level: "error"
mcp__playwright__browser_evaluate -> () => ({
  decks: document.querySelectorAll('[data-photo-decks] > *').length,
  galleryExists: !!document.querySelector('[data-photo-gallery]'),
})
```
Expected:
- No JS errors in console
- `decks: 2` (portraits + scenery)
- `galleryExists: true`

- [ ] **Step 8: Stop server + commit**

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
git add photo-decks.js
git commit -m "Drop hero highlight and photo wall rendering from photo-decks"
```

---

## Task 3: Remove photo-wall-shell from index.html and its CSS

**Files:**
- Modify: `index.html:395-404` (delete `<article class="photo-wall-shell">` block)
- Modify: `styles.css` (delete `.photo-wall*` rules)

- [ ] **Step 1: Delete the wall markup**

In `index.html`, delete lines 395–404 entirely (the `<article class="photo-wall-shell">` and everything inside until the matching `</article>`).

After this edit, the Frames section body has only:
```html
<div class="photo-deck-list reveal reveal-group" data-photo-decks></div>
```
(no `<article class="photo-wall-shell">` follows).

- [ ] **Step 2: Find all photo-wall CSS rules**

```bash
grep -n "^\.photo-wall" styles.css
grep -n " \.photo-wall" styles.css
```

This produces line numbers for every selector starting with `.photo-wall` (including responsive sections).

- [ ] **Step 3: Delete every rule block matching `.photo-wall*`**

For each matching selector found in Step 2, delete the entire rule block (selector line(s) through the closing `}`). This includes:
- `.photo-wall-shell` and any modifier variants
- `.photo-wall-heading`
- `.photo-wall` (the grid container)
- `.photo-wall-card`, `.photo-wall-card__*`
- All occurrences inside `@media` blocks (responsive breakpoints further down in `styles.css`)

After deletion, `grep -n "photo-wall" styles.css` should return zero matches.

- [ ] **Step 4: Verify**

```bash
grep -c "photo-wall" styles.css index.html photo-decks.js
```
Expected: every count is 0.

- [ ] **Step 5: Browser smoke test**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#frames
mcp__playwright__browser_evaluate -> () => ({
  wallShell: document.querySelectorAll('.photo-wall-shell').length,
  framesChildren: document.querySelectorAll('#frames > *').length,
})
```
Expected: `wallShell: 0`, `framesChildren: 2` (section-heading + photo-deck-list).

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css
git commit -m "Remove photo wall shell and its styles"
```

---

## Task 4: Move bird-tab into Frames, delete birds section, renumber

**Files:**
- Modify: `index.html:407-435` (delete birds section)
- Modify: `index.html:393` (insert bird-tab after `data-photo-decks` div)
- Modify: `index.html:386` (Frames eyebrow / heading text)
- Modify: `index.html:445` (`05 / Sunset Atlas` → `04 / Sunset Atlas`)
- Modify: `index.html:561` (`06 / Immersive` → `05 / Immersive`)

- [ ] **Step 1: Cut the bird-tab button**

Save the bird-tab markup (currently `index.html` lines 416–434) to a scratch file `/tmp/bird-tab-snippet.html`:

```html
<button
  class="bird-tab bird-tab--as-deck reveal"
  type="button"
  data-bird-tab
  aria-controls="bird-gallery"
  aria-haspopup="dialog"
>
  <span class="bird-tab-deck" data-bird-tab-deck aria-hidden="true"></span>
  <div class="bird-tab-copy">
    <span class="bird-tab-kicker">Bird Atlas / field guide</span>
    <strong class="bird-tab-title">鸟类图鉴</strong>
    <span class="bird-tab-text">
      物种信息、保护等级和器材记录，作为风景之外的另一条观察线。
    </span>
    <div class="bird-tab-footer">
      <span class="bird-tab-count" data-bird-count>鸟类牌组载入中...</span>
    </div>
  </div>
</button>
```

Note: text trimmed slightly to fit a deck slot. The `bird-tab--as-deck` modifier is added so CSS in Task 5 can target it.

- [ ] **Step 2: Delete the entire birds section**

In `index.html`, delete lines 407–435 (the entire `<section class="section birds reveal" id="birds">...</section>` block, including its eyebrow, heading, note, and the bird-tab button).

- [ ] **Step 3: Insert bird-tab snippet after the deck list**

In `index.html`, replace the line:
```html
<div class="photo-deck-list reveal reveal-group" data-photo-decks></div>
```
with:
```html
<div class="photo-deck-list reveal reveal-group" data-photo-decks></div>
<!-- bird-tab snippet from Step 1, indented to match Frames inner content -->
```

The bird-tab snippet should be a sibling of the `data-photo-decks` div, inside Frames `<section>`, indented the same as the deck list.

- [ ] **Step 4: Update Frames section-heading text**

In `index.html` lines 386–390, replace:
```html
<p class="eyebrow">03 / Frames</p>
<h2>人物和风景都已经按现有照片重建成两套可浏览的 deck。</h2>
<p class="section-note">
  这一页只使用当前目录里的真实照片数据；标题、caption 和卡片内容都已经按现有素材重新整理。
</p>
```
with:
```html
<p class="eyebrow">03 / Frames</p>
<h2>人物、风景和鸟类都已经按现有照片重建成三套可浏览的 deck。</h2>
<p class="section-note">
  这一页只使用当前目录里的真实照片、鸟类数据；标题、caption 和卡片内容都已经按现有素材重新整理。
</p>
```

- [ ] **Step 5: Renumber Sunset Atlas eyebrow**

In `index.html` line 445, change:
```html
<p class="eyebrow">05 / Sunset Atlas</p>
```
to:
```html
<p class="eyebrow">04 / Sunset Atlas</p>
```

- [ ] **Step 6: Renumber Immersive eyebrow**

In `index.html` line 561, change:
```html
<p class="eyebrow">06 / Immersive</p>
```
to:
```html
<p class="eyebrow">05 / Immersive</p>
```

- [ ] **Step 7: Browser smoke test**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#frames
mcp__playwright__browser_evaluate -> () => ({
  birdsSection: !!document.querySelector('#birds'),
  birdTab: !!document.querySelector('[data-bird-tab]'),
  birdTabParent: document.querySelector('[data-bird-tab]')?.parentElement?.id,
  framesEyebrow: document.querySelector('#frames .eyebrow')?.textContent?.trim(),
  sunsetEyebrow: document.querySelectorAll('.eyebrow')[3]?.textContent?.trim(),
})
```

Expected:
```json
{
  "birdsSection": false,
  "birdTab": true,
  "birdTabParent": "frames",
  "framesEyebrow": "03 / Frames",
  "sunsetEyebrow": "04 / Sunset Atlas"
}
```

- [ ] **Step 8: Click the bird-tab and verify the bird gallery opens**

Playwright:
```
mcp__playwright__browser_click -> element: "bird-tab in Frames", target: "[data-bird-tab]"
mcp__playwright__browser_evaluate -> () => ({
  galleryHidden: document.querySelector('#bird-gallery')?.hidden,
  galleryAria: document.querySelector('#bird-gallery')?.getAttribute('aria-hidden'),
})
```
Expected: gallery hidden becomes false OR aria-hidden becomes "false" (whichever attribute the gallery uses to signal open state).

Close the gallery and stop server:
```
mcp__playwright__browser_press_key -> key: "Escape"
```
```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "Move bird-tab into Frames deck row, remove birds section, renumber section eyebrows"
```

---

## Task 5: Restyle bird-tab to align visually with deck cards

**Files:**
- Modify: `styles.css` (find `.bird-tab` rules; add `.bird-tab--as-deck` overrides; ensure the deck list grid accommodates it)

- [ ] **Step 1: Inspect the deck list layout first**

```bash
grep -n "photo-deck-list\|photo-deck\b" styles.css | head -20
```

Read the actual style of `.photo-deck-list` to understand its grid layout (columns / gap / max-width).

- [ ] **Step 2: Ensure bird-tab sits inside the same visual grid as the deck cards**

The bird-tab is currently a sibling of `.photo-deck-list`, not a child. We need a layout that places `bird-tab--as-deck` in the same visual row as the deck cards.

Two options — pick one based on what the deck list grid looks like (from Step 1):

**Option A:** if `.photo-deck-list` is a CSS grid with `repeat(auto-fit, ...)`, change the markup so bird-tab is INSIDE the same grid container. Go back to `index.html`, move the bird-tab snippet to be a child of `<div class="photo-deck-list" data-photo-decks>` by appending it via JS in `photo-decks.js` AFTER `renderDecks()`.

Concretely, in `photo-decks.js` find the call site:
```js
renderDecks();
```
and add right after:
```js
// Bird tab is rendered statically in index.html; if present, append it into the deck list grid.
const birdTab = document.querySelector("[data-bird-tab]");
if (birdTab && decksRoot && birdTab.parentElement !== decksRoot) {
  decksRoot.appendChild(birdTab);
}
```

**Option B:** if `.photo-deck-list` is NOT a grid, keep bird-tab as a sibling and add a wrapper rule:
```css
#frames .photo-deck-list,
#frames .bird-tab--as-deck {
  /* establish a grid context for both */
}
```

For this plan: assume Option A (most likely given existing `bird-tab` was already in use). The append-after-render approach is robust.

- [ ] **Step 3: Add CSS modifier so bird-tab visually matches deck cards**

In `styles.css`, append a new rule block at the end of the `.bird-tab` section (search for the existing `.bird-tab {` selector to find the section):

```css
.bird-tab--as-deck {
  /* Inherit deck card dimensions; existing .photo-deck card sizing wins on shared properties. */
  margin: 0;
  width: 100%;
}

/* Within the deck list grid, make the bird-tab kicker / title match the photo deck cards. */
.photo-deck-list .bird-tab--as-deck .bird-tab-kicker,
.photo-deck-list .bird-tab--as-deck .bird-tab-title,
.photo-deck-list .bird-tab--as-deck .bird-tab-text {
  /* Inherit from existing typography; only override what diverges from deck cards. */
}
```

Where existing `.bird-tab` styles supply card chrome (border, padding, background) different from `.photo-deck`, override inside `.bird-tab--as-deck` so it matches `.photo-deck` chrome. Read existing rules first, then write minimal override blocks. If `.bird-tab` and `.photo-deck` already share most chrome (both use `.bird-tab` class in `renderDecks`), this may need only width / margin / spacing fixes.

- [ ] **Step 4: Visual verification**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#frames
mcp__playwright__browser_take_screenshot -> filename: "verify-task5-deck-row.png", type: "png"
```

Read the screenshot. Three cards (portraits, scenery, birds) should be visually aligned in a row (or wrap to a column on narrow viewports) with consistent height and chrome.

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css photo-decks.js
git commit -m "Style bird-tab as a deck card and align it with portraits/scenery in Frames"
```

---

## Task 6: Studio cards — trim top card, drop setup-strip

**Files:**
- Modify: `index.html:249-293` (the top studio story card)
- Modify: `styles.css:1884-2001` (delete `.studio-setup-strip`, `.studio-node*`, `.studio-story-pills` rules)

- [ ] **Step 1: Drop setup-strip and pills from top card markup**

In `index.html`, find the `<article class="panel panel--studio studio-story-card">` block (line 249). Delete:
- The entire `<div class="studio-setup-strip">...</div>` block (lines 264–285) including all 5 `<article class="studio-node studio-node--*">` children.
- The entire `<ul class="studio-story-pills">...</ul>` block (lines 287–292) including its 4 `<li>` items.

After edit, the studio-story-card body has: `studio-story-head`, the `studio-body` paragraph, and nothing else (the closing `</article>` follows directly).

- [ ] **Step 2: Delete corresponding CSS**

In `styles.css`, delete every rule block whose selector matches:
- `.studio-setup-strip`
- `.studio-node`
- `.studio-node::before`
- `.studio-node strong`
- `.studio-node span`
- `.studio-node--left`, `.studio-node--left::before`
- `.studio-node--center`, `.studio-node--center::before`
- `.studio-node--right`, `.studio-node--right::before`
- `.studio-node--sub`, `.studio-node--sub::before`
- `.studio-node--focus`, `.studio-node--focus::before`
- `.studio-story-pills`
- `.studio-story-pills li`
- Plus any matches inside `@media` blocks (search `grep -n "studio-setup-strip\|studio-node\|studio-story-pills" styles.css`)

- [ ] **Step 3: Verify nothing else references the removed selectors**

```bash
grep -n "studio-setup-strip\|studio-node\|studio-story-pills" index.html styles.css photo-decks.js script.js
```
Expected: zero matches.

- [ ] **Step 4: Browser smoke test**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#studio
mcp__playwright__browser_evaluate -> () => ({
  setupStrip: document.querySelectorAll('.studio-setup-strip').length,
  pills: document.querySelectorAll('.studio-story-pills').length,
  topCardChildCount: document.querySelector('.studio-story-card')?.children.length,
})
```
Expected: `setupStrip: 0`, `pills: 0`, `topCardChildCount: 2` (studio-story-head + studio-body paragraph).

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css
git commit -m "Trim studio top card: drop setup-strip and pills"
```

---

## Task 7: Studio cards — add Listening spot tile to Monitor balance

**Files:**
- Modify: `index.html` (`.studio-channel-grid` inside `.studio-channel-card`, lines ~333–354)
- Modify: `styles.css:2084-2116` (channel grid columns + new `.studio-channel--focus` rule)

- [ ] **Step 1: Add the 4th tile to the channel grid in markup**

In `index.html`, find the `<div class="studio-channel-grid">` block inside `<article class="panel studio-channel-card">`. After the existing 3 channels (Left / Right / Sub), append:

```html
<article class="studio-channel studio-channel--focus">
  <span class="studio-channel__name">Listening spot</span>
  <strong class="studio-channel__primary">ORR 89 / 97%</strong>
  <span class="studio-channel__secondary">center axis · stable image</span>
  <span class="studio-channel__meta">key reference position</span>
</article>
```

- [ ] **Step 2: Update channel grid columns**

In `styles.css`, find `.studio-channel-grid`:
```css
.studio-channel-grid {
  ...
  grid-template-columns: repeat(3, minmax(0, 1fr));
  ...
}
```

Change `repeat(3, ...)` to `repeat(auto-fit, minmax(160px, 1fr))` so the 4 tiles wrap responsively (4 in a row when wide, 2x2 on medium, 1 col on narrow). Adjust the minmax floor to match the existing card sizing if needed (160px is a reasonable default).

- [ ] **Step 3: Add `.studio-channel--focus` accent**

In `styles.css`, after the `.studio-channel--sub` rule, add:
```css
.studio-channel--focus {
  border-top-color: rgba(220, 200, 130, 0.72);
}
```

This gives Listening spot its own subtle accent color (a warm desaturated gold), distinct from L/R (warm orange) and Sub (green).

- [ ] **Step 4: Adjust primary number font-size for the focus tile**

The primary text "ORR 89 / 97%" is wider than "-10.4 dB", so let it shrink slightly. After the `.studio-channel__primary` rule, add:
```css
.studio-channel--focus .studio-channel__primary {
  font-size: clamp(1.1rem, 1.6vw, 1.4rem);
  letter-spacing: -0.02em;
  animation: none; /* no data-refresh pulse on the focus tile */
}
```

- [ ] **Step 5: Verify**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#studio
mcp__playwright__browser_evaluate -> () => ({
  channelCount: document.querySelectorAll('.studio-channel-grid .studio-channel').length,
  focusTileText: document.querySelector('.studio-channel--focus .studio-channel__primary')?.textContent?.trim(),
})
mcp__playwright__browser_take_screenshot -> filename: "verify-task7-monitor.png", type: "png"
```
Expected:
- `channelCount: 4`
- `focusTileText: "ORR 89 / 97%"`
- Screenshot shows 4 tiles in Monitor balance card, aligned.

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css
git commit -m "Add Listening spot tile to Monitor balance card"
```

---

## Task 8: Studio cards — add footnote chips to Working notes

**Files:**
- Modify: `index.html` (`.studio-mode-card`, lines ~357–378, add a chip row)
- Modify: `styles.css` (add `.studio-notes-footnotes` styles)

- [ ] **Step 1: Add the chip row markup**

In `index.html`, find the `<article class="panel studio-mode-card">` block. After the existing `<div class="studio-mode-band">...</div>` block (the watch-* chips), append:

```html
<ul class="studio-notes-footnotes" aria-label="Calibration footnotes">
  <li>Singlepoint AutoCal2</li>
  <li>Room 4.50 × 6.00 × 2.50 m</li>
  <li>RT60 mean 0.25 s</li>
  <li>Low-end extension to 18.9 Hz</li>
</ul>
```

- [ ] **Step 2: Style the chip row**

In `styles.css`, after the rules for `.studio-mode-band`, add:
```css
.studio-notes-footnotes {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.studio-notes-footnotes li {
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(204, 214, 226, 0.78);
  font-family: "Space Grotesk", sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 3: Verify**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#studio
mcp__playwright__browser_evaluate -> () => ({
  chips: Array.from(document.querySelectorAll('.studio-notes-footnotes li')).map(li => li.textContent.trim()),
})
```
Expected:
```json
{
  "chips": ["Singlepoint AutoCal2", "Room 4.50 × 6.00 × 2.50 m", "RT60 mean 0.25 s", "Low-end extension to 18.9 Hz"]
}
```

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Add calibration footnote chips to Working notes card"
```

---

## Task 9: Studio cards — unify data card visual hierarchy

**Files:**
- Modify: `styles.css` (rules under `.studio-story-card`, `.studio-room-card`, `.studio-channel-card`, `.studio-mode-card`, `.studio-metric*`, `.studio-card-head`, gradient `::before` / `::after` overlays)

- [ ] **Step 1: Identify hierarchy targets**

Read the existing rules:
```bash
grep -n "studio-story-card\|studio-room-card\|studio-channel-card\|studio-mode-card\|studio-card-head\|studio-metric" styles.css | head -40
```

Note current font sizes for `h3`, `panel-tag`, `studio-metric span` (label), `studio-metric strong` (value).

- [ ] **Step 2: Raise top card visual weight**

For `.studio-story-card h3` (already at line ~1848), bump font-size to make it the largest card title:
```css
.studio-story-card h3 {
  /* keep existing properties */
  font-size: clamp(1.36rem, 1.1rem + 0.95vw, 1.78rem);
  letter-spacing: -0.015em;
}
```

(Wrap inside the existing block; if there is already a font-size declaration, replace it with the clamp above.)

- [ ] **Step 3: Unify data card titles**

For the three data card titles (Room / Channel / Mode), unify font-size:
```css
.studio-room-card h3,
.studio-channel-card h3,
.studio-mode-card h3 {
  font-size: clamp(1.0rem, 0.84rem + 0.62vw, 1.18rem);
  font-weight: 600;
  line-height: 1.32;
  letter-spacing: -0.005em;
}
```

The existing rule for these three (originally line 2034–2042) is being replaced; locate it and substitute.

- [ ] **Step 4: Unify metric tile typography**

For `.studio-metric span` (label) and `.studio-metric strong` (value), set consistent sizes:
```css
.studio-metric span {
  color: rgba(184, 198, 214, 0.62);
  font-family: "Space Grotesk", sans-serif;
  font-size: 0.66rem;
  letter-spacing: 0.10em;
  text-transform: uppercase;
}

.studio-metric strong {
  color: rgba(247, 248, 250, 0.96);
  font-family: "Oxanium", "Space Grotesk", sans-serif;
  font-size: clamp(1.05rem, 0.86rem + 0.7vw, 1.32rem);
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.1;
}
```

Locate the existing rules at line ~2065 and ~2075 and substitute.

- [ ] **Step 5: Reduce gradient overlay saturation on data cards**

Locate the rules for `.studio-story-card::before`, `.studio-room-card::before`, `.studio-channel-card::before`, `.studio-mode-card::before` and the matching `::after`s (around lines 1774–1822). For the THREE data cards (not the story card), reduce the gradient color stops' alpha values by approximately half. Read the existing rgba values first:
```bash
sed -n '1770,1825p' styles.css
```

Then, for each `::before` / `::after` on `.studio-room-card`, `.studio-channel-card`, `.studio-mode-card`, halve the alpha of every color stop in the gradients. For example, `rgba(244, 90, 35, 0.18)` → `rgba(244, 90, 35, 0.09)`.

Leave `.studio-story-card::before` and its `::after` untouched (top card keeps its visual prominence).

- [ ] **Step 6: Verify**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#studio
mcp__playwright__browser_take_screenshot -> filename: "verify-task9-studio-hierarchy.png", type: "png", fullPage: true
```

Read the screenshot. Confirm:
- Top card (Setup overview) has the largest h3
- Three data cards have visibly smaller, uniform h3
- Data card gradients are noticeably less saturated than the top card

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 7: Commit**

```bash
git add styles.css
git commit -m "Unify studio data card typography hierarchy and reduce gradient saturation"
```

---

## Task 10: IUCN dots become Wikipedia links

**Files:**
- Modify: `birds-gallery.js:6-14` (extend `IUCN_SCALE` with `wikiSlug`)
- Modify: `birds-gallery.js:109-137` (`renderIucnScale` to emit `<a>`)
- Modify: `styles.css` (`.bird-iucn-scale__item` anchor reset + hover affordance)

- [ ] **Step 1: Add `wikiSlug` to `IUCN_SCALE`**

In `birds-gallery.js`, replace the existing `IUCN_SCALE` array (lines 6–14) with:
```js
const IUCN_SCALE = [
  { code: "EX", labelZh: "绝灭",     labelEn: "Extinct",                group: "extinct",    wikiSlug: "Extinction" },
  { code: "EW", labelZh: "野外绝灭",  labelEn: "Extinct in the Wild",    group: "extinct",    wikiSlug: "Extinct_in_the_wild" },
  { code: "CR", labelZh: "极危",     labelEn: "Critically Endangered",  group: "threatened", wikiSlug: "Critically_endangered" },
  { code: "EN", labelZh: "濒危",     labelEn: "Endangered",             group: "threatened", wikiSlug: "Endangered_species" },
  { code: "VU", labelZh: "易危",     labelEn: "Vulnerable",             group: "threatened", wikiSlug: "Vulnerable_species" },
  { code: "NT", labelZh: "近危",     labelEn: "Near Threatened",        group: "least",      wikiSlug: "Near-threatened_species" },
  { code: "LC", labelZh: "无危",     labelEn: "Least Concern",          group: "least",      wikiSlug: "Least-concern_species" },
];
```

- [ ] **Step 2: Update `renderIucnScale` to emit anchors**

In `birds-gallery.js`, replace the existing `renderIucnScale` body (lines 109–137) with:
```js
function renderIucnScale(node, activeCodes) {
  if (!node) {
    return;
  }

  const activeSet = new Set(activeCodes);
  const activePrimary = IUCN_SCALE.find((status) => activeSet.has(status.code));
  node.dataset.activeCode = activePrimary?.code || "";
  node.dataset.activeGroup = activePrimary?.group || "";
  node.innerHTML =
    `<div class="bird-iucn-scale__labels">` +
    `<span class="bird-iucn-scale__group bird-iucn-scale__group--extinct">绝灭</span>` +
    `<span class="bird-iucn-scale__group bird-iucn-scale__group--threatened">受威胁</span>` +
    `<span class="bird-iucn-scale__group bird-iucn-scale__group--least">无危</span>` +
    `</div>` +
    `<div class="bird-iucn-scale__track">` +
    IUCN_SCALE.map((status) => {
      const activeClass = activeSet.has(status.code) ? " is-active" : "";
      const href = `https://en.wikipedia.org/wiki/${status.wikiSlug}`;
      return (
        `<a class="bird-iucn-scale__item${activeClass}" ` +
        `href="${href}" target="_blank" rel="noopener noreferrer" ` +
        `data-code="${status.code}" data-group="${status.group}" ` +
        `title="${status.labelZh} · ${status.labelEn} (Wikipedia)" ` +
        `aria-label="${status.code} ${status.labelZh}, open Wikipedia">` +
        `<span class="bird-iucn-scale__tooltip">${status.labelZh}</span>` +
        `<span class="bird-iucn-scale__dot">${status.code}</span>` +
        `</a>`
      );
    }).join("") +
    `</div>`;
}
```

Differences from the original: `<span>` → `<a>`, removed `tabindex="0"` (anchors are focusable by default), added `href` / `target="_blank"` / `rel="noopener noreferrer"`, updated `title` and `aria-label` to indicate Wikipedia destination.

- [ ] **Step 3: Anchor reset + hover affordance CSS**

In `styles.css`, find the existing `.bird-iucn-scale__item` rule (search):
```bash
grep -n "bird-iucn-scale__item" styles.css
```

Inside the existing rule, add:
```css
.bird-iucn-scale__item {
  /* keep existing properties */
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.bird-iucn-scale__item:hover .bird-iucn-scale__dot,
.bird-iucn-scale__item:focus-visible .bird-iucn-scale__dot {
  filter: brightness(1.18);
  outline: 1px solid rgba(255, 255, 255, 0.24);
  outline-offset: 1px;
}
```

If the existing `.bird-iucn-scale__item` rule already has `color` / `text-decoration`, update those declarations in place. The hover/focus block is appended as a new rule.

- [ ] **Step 4: Syntax check**

```bash
node --check birds-gallery.js
```
Expected: no output.

- [ ] **Step 5: Verify in browser**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#frames
mcp__playwright__browser_evaluate -> () => {
  // Click the bird-tab to open the gallery and get the viewer's IUCN scale
  document.querySelector('[data-bird-tab]')?.click();
  return new Promise((resolve) => setTimeout(() => {
    const trailAnchors = document.querySelectorAll('[data-bird-status-trail] .bird-iucn-scale__item');
    const viewerAnchors = document.querySelectorAll('#bird-gallery .bird-iucn-scale__item');
    const first = trailAnchors[0] || viewerAnchors[0];
    resolve({
      trailCount: trailAnchors.length,
      viewerCount: viewerAnchors.length,
      firstTag: first?.tagName,
      firstHref: first?.getAttribute('href'),
      firstTarget: first?.getAttribute('target'),
      firstRel: first?.getAttribute('rel'),
    });
  }, 400));
}
```
Expected:
- `trailCount >= 1`
- `viewerCount === 7` (all 7 IUCN levels)
- `firstTag === 'A'`
- `firstHref === 'https://en.wikipedia.org/wiki/Extinction'` (EX is the first entry)
- `firstTarget === '_blank'`
- `firstRel === 'noopener noreferrer'`

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 6: Commit**

```bash
git add birds-gallery.js styles.css
git commit -m "Link IUCN level dots to Wikipedia in bird trail and viewer scales"
```

---

## Task 11: Timelapse — widen Space-armed visibility buffer

**Files:**
- Modify: `timelapse-stopwatch.js` (add constants, use in `updateScrollScene` line 1624, `handleWindowScroll` line 1654)

- [ ] **Step 1: Add constants near other configuration constants**

In `timelapse-stopwatch.js`, find the block of constants at the top of the file (around line 1–17). Append two new constants:
```js
const ARMED_TOP_RATIO = 1.10;
const ARMED_BOTTOM_RATIO = -0.10;
```

- [ ] **Step 2: Use the constants in `updateScrollScene`**

In `timelapse-stopwatch.js` line 1624 (approximately), the line:
```js
const nextVisible = rect.top < window.innerHeight * 0.92 && rect.bottom > window.innerHeight * 0.08;
```
Change to:
```js
const nextVisible = rect.top < window.innerHeight * ARMED_TOP_RATIO && rect.bottom > window.innerHeight * ARMED_BOTTOM_RATIO;
```

- [ ] **Step 3: Use the constants in `handleWindowScroll`**

In `timelapse-stopwatch.js` line 1654 (approximately), the line:
```js
const nextVisible = rect.top < window.innerHeight * 0.92 && rect.bottom > window.innerHeight * 0.08;
```
Change to:
```js
const nextVisible = rect.top < window.innerHeight * ARMED_TOP_RATIO && rect.bottom > window.innerHeight * ARMED_BOTTOM_RATIO;
```

- [ ] **Step 4: Verify no other occurrences of the literal ratios**

```bash
grep -n "0.92\|0.08" timelapse-stopwatch.js
```
Expected: only references that are unrelated to the visibility check (this prevents missing a third call site). Verify by reading each hit.

- [ ] **Step 5: Browser smoke test**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#timelapse
# Wait for sectionVisible logic to settle, then check by scrolling so the timelapse edge enters viewport
mcp__playwright__browser_evaluate -> () => {
  const root = document.querySelector('[data-timelapse-root]');
  const stage = root.querySelector('[data-timelapse-stage]');
  // Scroll so the stage top is at ~105% of viewport height (just-entered upper buffer)
  const stageRect = stage.getBoundingClientRect();
  window.scrollTo(0, window.scrollY + stageRect.top - window.innerHeight * 1.05);
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const after = stage.getBoundingClientRect();
    resolve({
      stageRectTop: after.top,
      viewportH: window.innerHeight,
      bodyHasTimelapseFocus: document.body.classList.contains('timelapse-focus'),
    });
  })));
}
```
Expected: `bodyHasTimelapseFocus: true` (because the buffer is now 1.10 — the stage at 105% of vh is INSIDE the armed range).

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 6: Commit**

```bash
git add timelapse-stopwatch.js
git commit -m "Widen timelapse Space-armed visibility buffer (110% / -10% of viewport)"
```

---

## Task 12: Timelapse — armed-state visual hint via CSS

**Files:**
- Modify: `timelapse-stopwatch.css` (add `.is-controls-armed` brightening rules)

- [ ] **Step 1: Find existing ring / watchcase rules**

```bash
grep -n "timelapse-ring\|timelapse-watchcase\|is-controls-armed" timelapse-stopwatch.css | head -20
```

Identify the current opacity/stroke-opacity defaults for `.timelapse-ring__arc` and `.timelapse-watchcase__crown`.

- [ ] **Step 2: Append armed-state rules**

In `timelapse-stopwatch.css`, append at the end of the file:
```css
/* Armed-state hint: when Space will trigger play (ready/paused/ended + armed),
   brighten the dial arc and crown so the user can see the control is live. */
.timelapse-stopwatch.is-controls-armed[data-timelapse-state="ready"] .timelapse-ring__arc,
.timelapse-stopwatch.is-controls-armed[data-timelapse-state="paused"] .timelapse-ring__arc,
.timelapse-stopwatch.is-controls-armed[data-timelapse-state="ended"] .timelapse-ring__arc {
  stroke-opacity: 0.92;
  transition: stroke-opacity 220ms ease;
}

.timelapse-stopwatch.is-controls-armed[data-timelapse-state="ready"] .timelapse-watchcase__crown,
.timelapse-stopwatch.is-controls-armed[data-timelapse-state="paused"] .timelapse-watchcase__crown,
.timelapse-stopwatch.is-controls-armed[data-timelapse-state="ended"] .timelapse-watchcase__crown {
  opacity: 0.95;
  transition: opacity 220ms ease;
}
```

If the default `.timelapse-ring__arc` rule already includes a `stroke-opacity` declaration, leave it as-is — these armed rules override only when both `is-controls-armed` AND the play-pendable state are present.

- [ ] **Step 3: Verify**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#timelapse
mcp__playwright__browser_evaluate -> () => {
  const stage = document.querySelector('[data-timelapse-stage]');
  // Scroll to fully expose the stage + reach the controls-armed scroll threshold
  stage.scrollIntoView({behavior: 'instant', block: 'start'});
  window.scrollBy(0, stage.offsetHeight * 0.95);
  return new Promise((r) => setTimeout(() => {
    const root = document.querySelector('[data-timelapse-root]');
    const arc = document.querySelector('.timelapse-ring__arc');
    r({
      armed: root.classList.contains('is-controls-armed'),
      state: root.dataset.timelapseState,
      arcStrokeOpacity: arc ? getComputedStyle(arc).strokeOpacity : null,
    });
  }, 500));
}
mcp__playwright__browser_take_screenshot -> filename: "verify-task12-armed.png", type: "png"
```
Expected:
- `armed: true`
- `state: "ready"` (or `paused` if rewound)
- `arcStrokeOpacity` is `0.92` (matches the override)
- Screenshot: the dial arc visibly brightens compared to a baseline screenshot before scrolling into the section

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 4: Commit**

```bash
git add timelapse-stopwatch.css
git commit -m "Brighten timelapse ring and crown when controls are armed and play-pendable"
```

---

## Task 13: Astro overlay — wire viewBox state into the controller

**Files:**
- Modify: `astro-overlay.js` (`createAstroOverlayController` internal state, `applySceneTransform` → `applyViewBox`, `setViewTransform` rewrite, new helpers)

This is the first of three astro overlay tasks. Task 13 changes the scaling mechanism only (still uses HTML star dots — those move to SVG in Task 14). Task 15 replaces drop-shadow filters with SVG `<filter>` defs.

- [ ] **Step 1: Track viewBox state instead of scene transform**

In `astro-overlay.js`, find the controller's state block (around line 438–449):
```js
let activeAnnotation = null;
let activeFilters = normalizeFilterState();
let activeOpacity = 1;
let resizeObserver = null;
let resizeFrame = 0;
let labelEntries = [];
let sceneNode = null;
let currentViewTransform = {
  scale: 1,
  x: 0,
  y: 0,
};
```

Append two new state variables:
```js
let mainSvgNode = null;
let leaderSvgNode = null;
```

These will be populated in Task 14 when the SVG is created. For Task 13, leave them as `null` and reach for them via `layerNode.querySelector(".astro-overlay__svg")` lazily.

- [ ] **Step 2: Compute current viewBox from currentViewTransform**

Add a new helper above `applySceneTransform`:
```js
function computeViewBox() {
  const scale = Math.max(1, currentViewTransform.scale);
  const vbWidth = 100 / scale;
  const vbHeight = 100 / scale;
  // Translate currentViewTransform.x / .y (in screen px relative to layer center)
  // into viewBox-space offsets. Layer is sized in pixels; we want the equivalent
  // shift in 0–100 space, then divide by scale because viewBox shrinks as we zoom.
  const bounds = layerNode.getBoundingClientRect();
  const layerW = bounds.width || 1;
  const layerH = bounds.height || 1;
  const xPct = (currentViewTransform.x / layerW) * 100;
  const yPct = (currentViewTransform.y / layerH) * 100;
  const vbX = 50 - vbWidth * 0.5 - xPct / scale;
  const vbY = 50 - vbHeight * 0.5 - yPct / scale;
  return { vbX, vbY, vbWidth, vbHeight };
}
```

- [ ] **Step 3: Replace `applySceneTransform` with `applyViewBox`**

Replace the existing function (lines 460–465):
```js
function applySceneTransform() {
  if (!sceneNode) {
    return;
  }
  sceneNode.style.transform = `translate3d(${currentViewTransform.x.toFixed(2)}px, ${currentViewTransform.y.toFixed(2)}px, 0) scale(${currentViewTransform.scale.toFixed(4)})`;
}
```

with:
```js
function applyViewBox() {
  if (!sceneNode) {
    return;
  }
  // Belt-and-suspenders: explicitly clear any leftover transform from older builds.
  sceneNode.style.transform = "";
  const svg = mainSvgNode || layerNode.querySelector(".astro-overlay__svg");
  if (svg) {
    const { vbX, vbY, vbWidth, vbHeight } = computeViewBox();
    svg.setAttribute("viewBox", `${vbX.toFixed(4)} ${vbY.toFixed(4)} ${vbWidth.toFixed(4)} ${vbHeight.toFixed(4)}`);
  }
  // Leader SVG stays at fixed viewBox 0..100 (label-anchor leg is in screen pct of layer,
  // not zoomed). Anchor end of each leader is updated in layoutOverlayLabels.
}
```

- [ ] **Step 4: Rewrite `transformAnchor` to use viewBox**

Replace existing (lines 451–458):
```js
function transformAnchor(xPx, yPx, width, height) {
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  return {
    x: centerX + (xPx - centerX) * currentViewTransform.scale + currentViewTransform.x,
    y: centerY + (yPx - centerY) * currentViewTransform.scale + currentViewTransform.y,
  };
}
```

with:
```js
function transformAnchor(xPx, yPx, width, height) {
  // xPx / yPx are pixel coords in the unzoomed (0–100% → 0–width/height) coordinate space.
  // Convert to (xPct, yPct) in 0..100, then to screen pixels under the current viewBox.
  const xPct = (xPx / width) * 100;
  const yPct = (yPx / height) * 100;
  const { vbX, vbY, vbWidth, vbHeight } = computeViewBox();
  return {
    x: ((xPct - vbX) / vbWidth) * width,
    y: ((yPct - vbY) / vbHeight) * height,
  };
}
```

- [ ] **Step 5: Update `setViewTransform` to call `applyViewBox`**

Replace existing (lines 523–531):
```js
function setViewTransform(nextTransform) {
  currentViewTransform = {
    scale: Math.max(1, Number(nextTransform?.scale) || 1),
    x: Number(nextTransform?.x) || 0,
    y: Number(nextTransform?.y) || 0,
  };
  applySceneTransform();
  requestLayout();
}
```

with:
```js
function setViewTransform(nextTransform) {
  currentViewTransform = {
    scale: Math.max(1, Number(nextTransform?.scale) || 1),
    x: Number(nextTransform?.x) || 0,
    y: Number(nextTransform?.y) || 0,
  };
  applyViewBox();
  requestLayout();
}
```

- [ ] **Step 6: Update other call sites of `applySceneTransform`**

```bash
grep -n "applySceneTransform" astro-overlay.js
```

For each remaining call site, change `applySceneTransform()` → `applyViewBox()`. Most likely in `syncLayout` (~line 485).

- [ ] **Step 7: Capture `mainSvgNode` and `leaderSvgNode` when overlay is built**

Find `setImage` (around line 533) and `renderOverlay` (line 184).

In the controller's `setImage` function, after `renderOverlay(...)` returns and `sceneNode` is set, capture the SVG nodes:
```js
mainSvgNode = layerNode.querySelector(".astro-overlay__svg");
leaderSvgNode = layerNode.querySelector(".astro-overlay__leader-svg");
```

In `hide()` (around line 496), reset them:
```js
mainSvgNode = null;
leaderSvgNode = null;
```

(Add these lines near the existing `sceneNode = null;` line.)

- [ ] **Step 8: Remove CSS that depends on `.astro-overlay__scene` being transformed**

In `styles.css`, find `.astro-overlay__scene` (around line 3575):
```css
.astro-overlay__scene {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
  will-change: transform;
  pointer-events: none;
}
```

Remove `transform-origin` and `will-change` (no longer transformed):
```css
.astro-overlay__scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
```

- [ ] **Step 9: Syntax check**

```bash
node --check astro-overlay.js
```
Expected: no output.

- [ ] **Step 10: Visual verification at zoom 1× and 4×**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#immersive
mcp__playwright__browser_evaluate -> () => {
  document.querySelector('.immersive-photo--orion').scrollIntoView({block: 'center'});
  document.querySelector('.immersive-photo--orion').click();
  return new Promise(r => setTimeout(r, 500));
}
mcp__playwright__browser_take_screenshot -> filename: "verify-task13-zoom-1x.png", type: "png"
mcp__playwright__browser_evaluate -> () => {
  const inBtn = document.querySelector('[data-astro-zoom="in"]');
  for (let i=0; i<6; i++) inBtn?.click();
  return {
    sceneTransform: document.querySelector('.astro-overlay__scene')?.style.transform,
    svgViewBox: document.querySelector('.astro-overlay__svg')?.getAttribute('viewBox'),
  };
}
mcp__playwright__browser_take_screenshot -> filename: "verify-task13-zoom-4x.png", type: "png"
```

Expected:
- `sceneTransform` is empty string `""` (no CSS transform applied)
- `svgViewBox` shrinks (e.g. `"31.25 31.25 25 25"` for scale 4)
- Screenshot at 4× shows: constellation lines have shifted positions (zoomed in via viewBox), labels still positioned correctly relative to star anchors
- **Note:** at this task's checkpoint, drop-shadow blur on lines and HTML star dots will STILL be blurry — those are fixed in Tasks 14 and 15. Acceptance for THIS task is just that the geometry (line positions, label anchors) is correct and the controller doesn't error out.

Verify in console:
```
mcp__playwright__browser_console_messages -> level: "error"
```
Expected: no JS errors from the overlay rewrite.

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 11: Commit**

```bash
git add astro-overlay.js styles.css
git commit -m "Switch astro overlay scaling to SVG viewBox mutation"
```

---

## Task 14: Astro overlay — move star markers into SVG circles

**Files:**
- Modify: `astro-overlay.js:303-333` (star rendering loop)
- Modify: `styles.css:3658-3671` (`.astro-overlay__star-dot` rules → SVG circle styles)

- [ ] **Step 1: Replace HTML star marker with SVG `<g>` + hidden hotspot**

In `astro-overlay.js`, find the star rendering loop (lines 303–333). Replace:
```js
annotation.stars.forEach((star) => {
  const payload = buildTooltipPayload("star", star);
  const marker = buildInteractiveNode("astro-overlay__hotspot astro-overlay__hotspot--star", payload, callbacks);
  marker.style.left = pointToPercentString(star.xPct);
  marker.style.top = pointToPercentString(star.yPct);
  marker.innerHTML = '<span class="astro-overlay__star-dot" aria-hidden="true"></span>';
  sceneNode.appendChild(marker);

  const label = buildInteractiveNode("astro-overlay__label astro-overlay__label--star", payload, callbacks);
  label.textContent = star.name;
  layerNode.appendChild(label);

  const leader = createSvgNode("line", {
    class: "astro-overlay__leader astro-overlay__leader--star",
    x1: star.xPct,
    y1: star.yPct,
    x2: star.xPct,
    y2: star.yPct,
  });
  leaderGroup.appendChild(leader);

  labelEntries.push({
    kind: "star",
    anchorXPct: star.xPct,
    anchorYPct: star.yPct,
    labelNode: label,
    leaderNode: leader,
    visibilityKey: "stars",
    priority: 1,
  });
});
```

with:
```js
annotation.stars.forEach((star) => {
  const payload = buildTooltipPayload("star", star);

  // Visible star dot: SVG circle inside the main SVG (scales with viewBox, stays crisp).
  const dotGroup = createSvgNode("g", { class: "astro-overlay__star-dot-group" });
  const dotGlow = createSvgNode("circle", {
    class: "astro-overlay__star-dot-glow",
    cx: star.xPct,
    cy: star.yPct,
    r: 1.05,
  });
  const dotCore = createSvgNode("circle", {
    class: "astro-overlay__star-dot-core",
    cx: star.xPct,
    cy: star.yPct,
    r: 0.42,
  });
  dotGroup.append(dotGlow, dotCore);
  guideGroup.appendChild(dotGroup);

  // Invisible HTML hotspot covering a small area around the star — keeps existing
  // dwell/hover/keyboard logic working without piping it through the SVG circle.
  const marker = buildInteractiveNode("astro-overlay__hotspot astro-overlay__hotspot--star", payload, callbacks);
  marker.style.left = pointToPercentString(star.xPct);
  marker.style.top = pointToPercentString(star.yPct);
  marker.innerHTML = "";
  layerNode.appendChild(marker);

  const label = buildInteractiveNode("astro-overlay__label astro-overlay__label--star", payload, callbacks);
  label.textContent = star.name;
  layerNode.appendChild(label);

  const leader = createSvgNode("line", {
    class: "astro-overlay__leader astro-overlay__leader--star",
    x1: star.xPct,
    y1: star.yPct,
    x2: star.xPct,
    y2: star.yPct,
  });
  leaderGroup.appendChild(leader);

  labelEntries.push({
    kind: "star",
    anchorXPct: star.xPct,
    anchorYPct: star.yPct,
    labelNode: label,
    leaderNode: leader,
    hotspotNode: marker,
    visibilityKey: "stars",
    priority: 1,
  });
});
```

Key changes:
- Visible representation: `<g>` containing a glow `<circle>` (r ≈ 1.05) and a core `<circle>` (r ≈ 0.42), added to `guideGroup` (which is inside `mainSvg`, scaled with viewBox).
- Interactive hotspot: still an HTML `<button>` for pointer + dwell + a11y, but moved to `layerNode` (NOT inside sceneNode) and its inner star-dot span is removed. The hotspot becomes a small invisible hit target.
- Each `labelEntry` now records `hotspotNode` so the layout pass can reposition the hotspot when the star anchor moves on zoom.

- [ ] **Step 2: Position the hotspot under the star dot in the layout pass**

Find `layoutOverlayLabels` (line 349). After the line that sets the leader endpoints (line 412–413 area), find where each label is positioned:
```js
entry.labelNode.style.left = `${result.rect.left.toFixed(2)}px`;
entry.labelNode.style.top = `${result.rect.top.toFixed(2)}px`;
```

Before this, add hotspot repositioning (only for star entries with a `hotspotNode`):
```js
if (entry.hotspotNode) {
  const hotspotSize = 18; // visible hit area diameter in px
  entry.hotspotNode.style.left = `${(anchorX - hotspotSize / 2).toFixed(2)}px`;
  entry.hotspotNode.style.top = `${(anchorY - hotspotSize / 2).toFixed(2)}px`;
  entry.hotspotNode.style.width = `${hotspotSize}px`;
  entry.hotspotNode.style.height = `${hotspotSize}px`;
}
```

Wait — re-reading: `anchorX` / `anchorY` are already computed earlier in the function. Use them directly. The hotspot center coincides with the star anchor on screen.

- [ ] **Step 3: Replace `.astro-overlay__star-dot` CSS**

In `styles.css`, find `.astro-overlay__star-dot` (line 3658):
```css
.astro-overlay__star-dot {
  position: absolute;
  left: 0;
  top: 0;
  width: 9px;
  height: 9px;
  border: 1.5px solid rgba(255, 220, 133, 0.98);
  border-radius: 50%;
  background: rgba(255, 244, 201, 0.3);
  box-shadow:
    0 0 0 1px rgba(9, 12, 18, 0.46),
    0 0 16px rgba(255, 226, 147, 0.28);
  transform: translate(-50%, -50%);
}
```

Replace with SVG circle styles:
```css
.astro-overlay__star-dot-group {
  pointer-events: none;
}

.astro-overlay__star-dot-core {
  fill: rgba(255, 244, 201, 0.96);
  stroke: rgba(9, 12, 18, 0.6);
  stroke-width: 0.05;
}

.astro-overlay__star-dot-glow {
  fill: rgba(255, 226, 147, 0.18);
  stroke: rgba(255, 220, 133, 0.55);
  stroke-width: 0.06;
}
```

- [ ] **Step 4: Make the hotspot button invisible but interactive**

The existing `.astro-overlay__hotspot` rule (line 3642) needs to no longer pin to `transform: translate(-50%, -50%)` since we set `width`/`height`/`left`/`top` explicitly in the layout pass. Replace:
```css
.astro-overlay__hotspot {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
```

with:
```css
.astro-overlay__hotspot {
  position: absolute;
  pointer-events: auto;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.astro-overlay__hotspot--star {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
```

(Width/height in CSS act as fallback if the layout pass hasn't run yet; the layout pass overrides them.)

Existing `.astro-overlay__hotspot--dso` continues to use the centered positioning from before (it still uses `left`/`top` in percentages with `translate(-50%, -50%)` semantics). Wait — `.astro-overlay__hotspot--dso` is built by `buildInteractiveNode` and positioned via `marker.style.left = pointToPercentString(object.xPct)` directly (line 271-272). Without the `translate(-50%, -50%)`, the DSO hotspot anchor will be off by half its size.

To avoid breaking DSO hotspots, add back the translate ONLY for non-star variants:
```css
.astro-overlay__hotspot--dso {
  transform: translate(-50%, -50%);
}
```

- [ ] **Step 5: Syntax check**

```bash
node --check astro-overlay.js
```
Expected: no output.

- [ ] **Step 6: Visual verification at zoom 1×, 2×, 4×**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#immersive
mcp__playwright__browser_evaluate -> () => {
  document.querySelector('.immersive-photo--orion').click();
  return new Promise(r => setTimeout(r, 500));
}
```

Take screenshots at three zoom levels:
```
mcp__playwright__browser_take_screenshot -> filename: "verify-task14-zoom-1x.png", type: "png"
mcp__playwright__browser_evaluate -> () => { const b = document.querySelector('[data-astro-zoom="in"]'); for(let i=0;i<3;i++) b?.click(); }
mcp__playwright__browser_take_screenshot -> filename: "verify-task14-zoom-2x.png", type: "png"
mcp__playwright__browser_evaluate -> () => { const b = document.querySelector('[data-astro-zoom="in"]'); for(let i=0;i<3;i++) b?.click(); }
mcp__playwright__browser_take_screenshot -> filename: "verify-task14-zoom-4x.png", type: "png"
```

Read each screenshot. Expected:
- Star dots are now small clean circles at every zoom level (no blurry halo)
- Star dots GROW as you zoom in (they are inside viewBox-scaled SVG)
- Hover behavior still works (hotspot is at the star position)

Also verify hotspot interactivity:
```
mcp__playwright__browser_evaluate -> () => {
  const star = document.querySelector('.astro-overlay__hotspot--star');
  return { hasStar: !!star, w: star?.offsetWidth, h: star?.offsetHeight };
}
```
Expected: `hasStar: true, w: 18, h: 18`.

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 7: Commit**

```bash
git add astro-overlay.js styles.css
git commit -m "Render astro star dots as SVG circles so they stay crisp at any zoom"
```

---

## Task 15: Astro overlay — replace drop-shadow filters with SVG defs

**Files:**
- Modify: `astro-overlay.js:191-197` (SVG creation — add `<defs>`)
- Modify: `astro-overlay.js` (constellation line, nebula ellipse — add `filter` attr)
- Modify: `styles.css:3592-3617` (remove `filter: drop-shadow(...)` from CSS)

- [ ] **Step 1: Add SVG filter defs**

In `astro-overlay.js`, find the main SVG creation (line 191):
```js
const svg = createSvgNode("svg", {
  class: "astro-overlay__svg",
  viewBox: "0 0 100 100",
  preserveAspectRatio: "none",
  "aria-hidden": "true",
});
```

Immediately after this, add a `<defs>` with two glow filters:
```js
const defs = createSvgNode("defs", {});
defs.innerHTML = `
  <filter id="astroGlowBlue" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="0.5" result="blur" />
    <feFlood flood-color="rgba(102, 214, 255, 0.32)" />
    <feComposite in2="blur" operator="in" result="glow" />
    <feMerge>
      <feMergeNode in="glow" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
  <filter id="astroGlowAmber" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="0.6" result="blur" />
    <feFlood flood-color="rgba(255, 166, 133, 0.22)" />
    <feComposite in2="blur" operator="in" result="glow" />
    <feMerge>
      <feMergeNode in="glow" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
`;
svg.appendChild(defs);
```

- [ ] **Step 2: Apply filter to constellation lines**

In the constellation rendering (line 210–218), modify the line creation:
```js
constellationGroup.appendChild(
  createSvgNode("line", {
    class: "astro-overlay__constellation-line",
    x1: start.xPct,
    y1: start.yPct,
    x2: end.xPct,
    y2: end.yPct,
    filter: "url(#astroGlowBlue)",
  }),
);
```

- [ ] **Step 3: Apply filter to nebula ellipses**

In the nebula rendering (line 257–267), modify the ellipse creation:
```js
nebulaGroup.appendChild(
  createSvgNode("ellipse", {
    class: `astro-overlay__nebula-ellipse astro-overlay__nebula-ellipse--${object.category || "other"}`,
    cx: object.xPct,
    cy: object.yPct,
    rx: object.radiusXPct,
    ry: object.radiusYPct,
    transform: `rotate(${object.rotationDeg} ${object.xPct} ${object.yPct})`,
    filter: "url(#astroGlowAmber)",
  }),
);
```

- [ ] **Step 4: Remove `filter: drop-shadow(...)` from CSS**

In `styles.css`, find the rules:
```css
.astro-overlay__constellation-line {
  stroke: rgba(102, 214, 255, 0.92);
  stroke-width: 0.16;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 10px rgba(102, 214, 255, 0.28));
}
```
and
```css
.astro-overlay__nebula-ellipse {
  fill: rgba(244, 90, 35, 0.05);
  stroke: rgba(255, 166, 133, 0.92);
  stroke-width: 0.18;
  stroke-dasharray: 0.9 0.5;
  filter: drop-shadow(0 0 16px rgba(255, 166, 133, 0.16));
}
```

Delete the `filter: drop-shadow(...);` line from BOTH rules. Leave everything else intact.

- [ ] **Step 5: Syntax check**

```bash
node --check astro-overlay.js
```
Expected: no output.

- [ ] **Step 6: Visual verification at 1× and 4×**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#immersive
mcp__playwright__browser_evaluate -> () => {
  document.querySelector('.immersive-photo--orion').click();
  return new Promise(r => setTimeout(r, 500));
}
mcp__playwright__browser_take_screenshot -> filename: "verify-task15-zoom-1x.png", type: "png"
mcp__playwright__browser_evaluate -> () => { const b = document.querySelector('[data-astro-zoom="in"]'); for(let i=0;i<6;i++) b?.click(); }
mcp__playwright__browser_take_screenshot -> filename: "verify-task15-zoom-4x.png", type: "png"
```

Read both screenshots. Expected at 4×:
- Constellation lines: clean stroke with subtle blue glow, NO pixelated halo
- Nebula ellipses: clean dashed stroke, subtle amber glow, NO pixelated halo
- Compare against the original `astro-zoomed.png` (from spec discovery) — the difference should be obvious

Verify console:
```
mcp__playwright__browser_console_messages -> level: "error"
```
Expected: no SVG filter errors.

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 7: Commit**

```bash
git add astro-overlay.js styles.css
git commit -m "Replace astro overlay CSS drop-shadow filters with SVG filter defs"
```

---

## Task 16: End-to-end verification + cleanup

**Files:** (no production file modifications; this task only verifies and cleans up)

- [ ] **Step 1: Verify full page renders without errors**

```bash
python3 -m http.server 4173 --bind 127.0.0.1 > /tmp/site-server.log 2>&1 &
echo $! > /tmp/site-server.pid
sleep 1
```

Playwright sweep:
```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html
mcp__playwright__browser_console_messages -> level: "error"
mcp__playwright__browser_evaluate -> () => ({
  // Each section present?
  about:   !!document.querySelector('#about'),
  studio:  !!document.querySelector('#studio'),
  frames:  !!document.querySelector('#frames'),
  birds:   !!document.querySelector('#birds'),
  timelapse: !!document.querySelector('#timelapse'),
  immersive: !!document.querySelector('#immersive'),
  // Deleted things
  heroGrid: document.querySelectorAll('.hero-grid').length,
  wallShell: document.querySelectorAll('.photo-wall-shell').length,
  setupStrip: document.querySelectorAll('.studio-setup-strip').length,
  storyPills: document.querySelectorAll('.studio-story-pills').length,
  // Added/Moved things
  birdTabInFrames: document.querySelector('#frames [data-bird-tab]')?.parentElement?.id || document.querySelector('#frames [data-bird-tab]')?.closest('section')?.id,
  channelTiles: document.querySelectorAll('.studio-channel-grid .studio-channel').length,
  footnoteChips: document.querySelectorAll('.studio-notes-footnotes li').length,
  iucnAnchors: document.querySelectorAll('a.bird-iucn-scale__item').length,
  // Eyebrow numbering
  eyebrows: Array.from(document.querySelectorAll('section .eyebrow')).map(e => e.textContent.trim()),
})
```

Expected:
```json
{
  "about": true, "studio": true, "frames": true,
  "birds": false, "timelapse": true, "immersive": true,
  "heroGrid": 0, "wallShell": 0, "setupStrip": 0, "storyPills": 0,
  "birdTabInFrames": "frames",
  "channelTiles": 4,
  "footnoteChips": 4,
  "iucnAnchors": 7,
  "eyebrows": [
    "01 / About", "02 / Interests / Studio", "03 / Frames",
    "04 / Sunset Atlas", "05 / Immersive"
  ]
}
```

(If `iucnAnchors` is 0: the bird gallery hasn't been opened yet — only the trail is rendered on initial load. The trail count is `>= 1`. Adjust the assertion to: `iucnAnchorsInTrail: document.querySelectorAll('[data-bird-status-trail] a.bird-iucn-scale__item').length` which should be the number of distinct IUCN levels actually present in `birdCatalog`.)

- [ ] **Step 2: Spot-check timelapse Space activation buffer**

Scroll the timelapse stage to where its top is at 105% of viewport (just inside the new upper buffer):
```
mcp__playwright__browser_evaluate -> () => {
  const stage = document.querySelector('[data-timelapse-stage]');
  const r = stage.getBoundingClientRect();
  window.scrollTo(0, window.scrollY + r.top - window.innerHeight * 1.05);
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => resolve({
    armed: document.body.classList.contains('timelapse-focus'),
  }))));
}
```
Expected: `armed: true`.

- [ ] **Step 3: Spot-check astro overlay at extreme zoom**

```
mcp__playwright__browser_navigate -> http://127.0.0.1:4173/index.html#immersive
mcp__playwright__browser_evaluate -> () => {
  document.querySelector('.immersive-photo--orion').click();
  return new Promise(r => setTimeout(r, 500));
}
mcp__playwright__browser_evaluate -> () => {
  const b = document.querySelector('[data-astro-zoom="in"]');
  for (let i = 0; i < 8; i++) b?.click();
  return {
    sceneCssTransform: document.querySelector('.astro-overlay__scene')?.style.transform || '(empty)',
    svgViewBox: document.querySelector('.astro-overlay__svg')?.getAttribute('viewBox'),
  };
}
mcp__playwright__browser_take_screenshot -> filename: "verify-task16-final-zoom.png", type: "png"
```
Expected:
- `sceneCssTransform: "(empty)"` (no CSS transform applied)
- `svgViewBox` reflects the zoomed sub-region
- Screenshot shows crisp constellation lines, nebula ellipses, and star dots at max zoom

- [ ] **Step 4: Move verification PNGs out of project root**

The Playwright screenshot tool writes screenshots to the project root by default. Per the global CLAUDE.md (AI tool artifacts must not be committed), move them out:
```bash
mkdir -p /tmp/eicc27-verification && mv verify-task*.png /tmp/eicc27-verification/ 2>/dev/null
ls /tmp/eicc27-verification/
```

(These were never `git add`'d, but cleaning the project root prevents accidental future inclusion.)

- [ ] **Step 5: Final git status check**

```bash
git status --short
```

Expected: only the pre-existing untracked AI tool artifacts (`.playwright-mcp/`, `node_modules/`, the older `astro-*.png` from the design exploration, etc.). Nothing from this task series should be uncommitted.

- [ ] **Step 6: Stop server**

```bash
kill "$(cat /tmp/site-server.pid)" 2>/dev/null; rm -f /tmp/site-server.pid
```

- [ ] **Step 7: Final commit (only if anything is uncommitted)**

If `git status --short` shows any tracked file changes (other than artifacts), commit them with a descriptive message. Otherwise skip this step.

---

## Self-Review Notes

- **Spec coverage:**
  - Section A (Hero cleanup) → Task 1, Task 2
  - Section B (Studio cards rearrange + restyle) → Tasks 6, 7, 8, 9
  - Section C (Frames + Bird Atlas + wall removal) → Tasks 3, 4, 5
  - Section D (IUCN wiki links) → Task 10
  - Section E (Timelapse buffer + hint) → Tasks 11, 12
  - Section F (Astro overlay vector zoom) → Tasks 13, 14, 15
  - End-to-end verification → Task 16

- **Placeholder scan:** No "TBD" / "TODO" / "add appropriate" / "similar to" wording. Where existing CSS / JS needs to be located by grep first (because exact line numbers shift after earlier tasks edit the same file), the plan includes the exact grep command and what to do with the matches.

- **Type/identifier consistency:**
  - `ARMED_TOP_RATIO` / `ARMED_BOTTOM_RATIO`: defined and used consistently in Task 11.
  - `applyViewBox` (Task 13) replaces `applySceneTransform`; subsequent tasks (14, 15) do not reintroduce the old name.
  - `computeViewBox()` defined in Task 13 step 2, called from `applyViewBox` (step 3) and `transformAnchor` (step 4).
  - `mainSvgNode` / `leaderSvgNode` declared in Task 13 step 1, captured in Task 13 step 7, referenced in `applyViewBox` (step 3). `leaderSvgNode` is captured but currently unused — kept for future use if leader SVG handling shifts. (Could be dropped, but doesn't hurt.)
  - `hotspotNode` field on label entries: added in Task 14 step 1, used in Task 14 step 2.
  - `wikiSlug`: added to `IUCN_SCALE` in Task 10 step 1, used in step 2.
  - `bird-tab--as-deck` modifier: introduced in Task 4 step 1, styled in Task 5 step 3.
  - `.studio-channel--focus` modifier: introduced in Task 7 step 1, styled in Task 7 steps 3–4.
  - `.studio-notes-footnotes`: introduced in Task 8 step 1, styled in Task 8 step 2.

- **Cross-task dependencies:**
  - Task 13 must run before Tasks 14 and 15 (those depend on the viewBox-based controller wiring).
  - Tasks 1–12 can run in any order relative to each other (independent files / sections).
  - Task 16 is the final verification sweep; depends on all earlier tasks.
