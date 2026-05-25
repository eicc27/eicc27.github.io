# Site cleanup, studio rearrange, IUCN links, timelapse hotkey, astro overlay vector zoom

Date: 2026-05-25
Scope: `index.html`, `styles.css`, `photo-decks.js`, `birds-gallery.js`, `timelapse-stopwatch.js`, `astro-overlay.js`, `astro-immersive.js`

## Goals

1. Trim hero, remove standalone wall + birds section, fold three deck entries into one row in Frames.
2. Re-style studio readout cards: clear visual hierarchy, deduplicated information, sensible information ownership.
3. Make IUCN level dots in the bird viewer clickable, linking to the corresponding English Wikipedia entry.
4. Widen the keyboard-armed range for the Chongqing timelapse so Space toggles play within a generous buffer around the section, with a subtle UI hint when armed.
5. Fix astro overlay blur on zoom: convert HTML/CSS-transform-driven scaling to true SVG viewBox scaling so star dots, leader lines, drop shadows stay crisp at any zoom level.

## A. Hero cleanup

### What changes

- Delete the entire `<div class="hero-grid">` block in `index.html` (the four `hero-card` articles: portraitPrimary, portraitSecondary, sceneryPrimary, scenerySecondary).
- Convert `.hero` to a single-column layout. `.hero-copy` becomes the only direct child and gets full-width treatment.

### CSS

- Remove all `.hero-grid`, `.hero-card`, `.hero-card--*`, `.hero-card-art*`, `.hero-card-copy`, `.hero-card-link`, `.hero-card-tag` rules and their responsive variants.
- Update `.hero` grid/flex rules so `.hero-copy` flows naturally without the second column.

### JS (`photo-decks.js`)

- Drop the code path that updates `data-photo-hero-card`, `data-photo-hero-art`, `data-photo-hero-tag`, `data-photo-hero-title`, `data-photo-hero-body`, `data-photo-hero-badge`, `data-photo-hero-link`.
- Remove imports/usages of `photoHighlights` if nothing else consumes them.
- Leave `photoDecks` and the deck list rendering intact.

## B. Studio cards rearrange + restyle

Existing structure under `.studio-readout`:
1. `studio-story-card` (top): title, body, `studio-setup-strip` (5 nodes), `studio-story-pills` (4 pills).
2. `studio-room-card`: 4 metric tiles (Room size / RT60 / Main modes / Sub mode).
3. `studio-channel-card`: 3 channels (Left / Right / Sub).
4. `studio-mode-card`: prose + `studio-mode-band` chips.

### New layout

1. **Top: Setup overview (slim)**
   - Keep `panel-tag`, `h3` "Genelec 8330A + 7350A + SL GRAND 88", `studio-readout-badge` "GLM snapshot · 2026-03-16".
   - Keep the existing paragraph (`studio-body`).
   - **Remove** `studio-setup-strip` and all 5 `studio-node--*` blocks.
   - **Remove** `studio-story-pills` from this card.

2. **Middle: Room calibration**
   - Keep the existing 4 metric tiles unchanged in data.
   - Restyle: number larger and bolder, unit smaller and dimmer; tighten grid gap; uniform tile padding.

3. **Middle: Monitor balance (absorbs Listening spot)**
   - Keep existing 3 channels (Left / Right / Sub).
   - **Add a 4th tile: Listening spot.** Data carried over from old `studio-node--focus`: name "Listening spot", primary "ORR 89 / 97%", secondary "center axis · stable image", meta omitted or short.
   - Use the same `.studio-channel` template so the four tiles align visually.

4. **Bottom: Working notes (collects pill chips)**
   - Keep prose paragraph.
   - Keep `studio-mode-band` chips.
   - **Add** a `studio-notes-footnotes` chip row that carries the 4 pills previously in the top card: "Singlepoint AutoCal2", "Room 4.50 × 6.00 × 2.50 m", "RT60 mean 0.25 s", "Low-end extension to 18.9 Hz".

### Visual hierarchy (restyle)

- Top card: highest visual weight (largest `h3`, strongest border/elevation).
- Three data cards (Room / Monitor / Notes are visually a tier below the top): unify head structure (panel-tag + h3 + optional stamp), unify cell typography (consistent label / value / unit sizes across `studio-metric` and `studio-channel`).
- Bottom card (`studio-mode-card`): lowest visual weight (smaller border opacity, dimmer background) to signal it's a closing note.
- Reduce saturation of all `::before` / `::after` gradient overlays on data cards so they don't compete with the content.
- Spacing: increase vertical rhythm between cards; tighten interior padding so cards feel less puffy.

## C. Frames + Bird Atlas merge, wall removal, section renumber

### Remove the wall

- Delete the `<article class="photo-wall-shell">` block from `index.html` (heading + `<div class="photo-wall" data-photo-wall>`).
- In `photo-decks.js`, remove the `wallRoot` rendering block and any code that references `[data-photo-wall]` or `photoSummary` / `data-photo-total-count` / `data-photo-total-summary`.
- In `styles.css`, delete `.photo-wall-shell`, `.photo-wall-heading`, `.photo-wall`, `.photo-wall-card*`, and all responsive variants.

### Remove the standalone birds section

- Delete the entire `<section class="section birds reveal" id="birds">` block, including its section-heading and the `bird-tab` button.
- Remove the `<a href="#birds">` entry in the top nav.
- Section eyebrow renumbering: previously 04 Bird Atlas / 05 Sunset Atlas / 06 Stars. After removal: Sunset Atlas becomes 04, Stars becomes 05. Update the eyebrow text strings in `index.html` for those sections.

### Promote bird-tab to a Frames deck entry

- Inside Frames section, after the existing `<div class="photo-deck-list" data-photo-decks></div>` (which renders portraits and scenery deck cards), append the bird-tab button (or equivalent markup matching the deck card visual). Specifically:
  - Move the `<button class="bird-tab" data-bird-tab ...>` from the deleted birds section into Frames section.
  - Adjust its CSS class so it visually matches the portraits / scenery deck cards (same shell, same kicker / title / footer structure). Either:
    - Option A (preferred for minimal changes): keep `bird-tab` semantically but add a `bird-tab--as-deck` modifier; restyle so it inherits the deck card chrome.
    - Option B: place it inside a new `<div class="photo-deck-list-extra">` that mirrors the deck card markup; bird-tab content stays text-only.
  - The bird gallery dialog (`#bird-gallery`) and its viewer code stay intact and continue to open on click.
- Update Frames section-heading text to reflect three categories (portraits / scenery / birds), e.g. `<h2>人物、风景和鸟类都已经按现有照片重建成三套可浏览的 deck。</h2>` and adjust the section note prose accordingly.

### Birds data + viewer

- `birds-data.js`, `birds-gallery.js`, and `#bird-gallery` markup all stay. Only the entry point moves.

## D. IUCN levels link to Wikipedia

### Data

In `birds-gallery.js`, extend `IUCN_SCALE` entries with a `wikiSlug`:

| code | wikiSlug |
|------|----------|
| EX   | `Extinction` |
| EW   | `Extinct_in_the_wild` |
| CR   | `Critically_endangered` |
| EN   | `Endangered_species` |
| VU   | `Vulnerable_species` |
| NT   | `Near-threatened_species` |
| LC   | `Least-concern_species` |

URL: `https://en.wikipedia.org/wiki/<wikiSlug>` (English Wikipedia, open in new tab with `rel="noopener noreferrer"`).

### Rendering

In `renderIucnScale`, change each `<span class="bird-iucn-scale__item">` to an `<a>`:

```html
<a class="bird-iucn-scale__item ..." href="https://en.wikipedia.org/wiki/Vulnerable_species"
   target="_blank" rel="noopener noreferrer"
   data-code="VU" data-group="threatened"
   title="易危 · Vulnerable" aria-label="VU 易危 (open Wikipedia)">
  <span class="bird-iucn-scale__tooltip">易危</span>
  <span class="bird-iucn-scale__dot">VU</span>
</a>
```

- `tabindex="0"` no longer needed (anchors are focusable).
- Applies to both the top status trail (`buildStatusTrail`) and the per-bird viewer scale (`renderIucnScale(iucnBadge, ...)`).
- `renderIucnMini` (deck badge) is NOT changed.

### CSS

- Anchor reset: `.bird-iucn-scale__item { color: inherit; text-decoration: none; }`.
- Cursor: `pointer`.
- Hover: bump `.bird-iucn-scale__dot` brightness / outline so it's clear the dot is clickable.
- Keep existing active / inactive visual states.

## E. Timelapse Space activation buffer + visual hint

### Buffer expansion

In `timelapse-stopwatch.js`:

- `updateScrollScene` currently sets `sectionVisible = rect.top < window.innerHeight * 0.92 && rect.bottom > window.innerHeight * 0.08`. Change the constants to `1.10` (top) and `-0.10` (bottom):
  - `const ARMED_TOP_RATIO = 1.10;`
  - `const ARMED_BOTTOM_RATIO = -0.10;`
  - `rect.top < window.innerHeight * ARMED_TOP_RATIO && rect.bottom > window.innerHeight * ARMED_BOTTOM_RATIO`.
- Apply the same constants to `handleWindowScroll` (the paused-state visibility check).
- `keyboardArmed` derivation in the keydown handler already uses `sectionVisible`, so it picks up the wider range automatically.
- `shouldSuppressSpaceScroll` uses `sectionVisible` too; same buffer applies.

### Visual hint (no new DOM)

Use the existing `is-controls-armed` class on `root`. In CSS, when `.timelapse-stopwatch.is-controls-armed` and the playback state is one of `ready` / `paused` / `ended` (NOT `playing` / `rewinding`):

- Raise `--timelapse-ring-arc-opacity` (or stroke-opacity on `.timelapse-ring__arc`) so the dial arc is one step brighter than its dormant state.
- Slightly increase the brightness of `.timelapse-watchcase__crown` (e.g. opacity 0.6 → 0.9, or filter brightness bump).
- Optionally pulse a faint glow on the watchcase loop using `@keyframes` (subtle, 1.6s period, no scale change).

State guards: add a `data-timelapse-state` attribute selector chain in CSS, e.g.:

```css
.timelapse-stopwatch.is-controls-armed[data-timelapse-state="ready"] .timelapse-ring__arc,
.timelapse-stopwatch.is-controls-armed[data-timelapse-state="paused"] .timelapse-ring__arc,
.timelapse-stopwatch.is-controls-armed[data-timelapse-state="ended"] .timelapse-ring__arc {
  stroke-opacity: 0.9;
}
```

No status text changes. No new DOM nodes.

## F. Astro overlay: true vector zoom

### Root cause (diagnosed via Playwright)

The current implementation in `astro-overlay.js` puts everything inside `.astro-overlay__scene` and scales that node with CSS `transform: scale()` (set in `applySceneTransform`). At zoom 4×:
- SVG geometry coordinates are crisp (vector), but `.astro-overlay__constellation-line` and `.astro-overlay__nebula-ellipse` have `filter: drop-shadow(...)` — the browser rasterises the filter result at 1× then scales the bitmap, producing blur.
- `.astro-overlay__star-dot` is an HTML `<span>` with `border` + `box-shadow`. Same rasterise-then-scale problem.
- Labels (HTML `<button>` elements) live OUTSIDE `.astro-overlay__scene`, anchored by absolute `left` / `top` computed in `layoutOverlayLabels`. They stay crisp at any zoom.

### Strategy

Replace CSS transform with SVG `viewBox` mutation, and move pixel-rendered visual elements (star dots, glows) into the SVG layer.

### Changes

1. **Drop `.astro-overlay__scene` CSS transform.**
   - `applySceneTransform` no longer writes `sceneNode.style.transform`.
   - `sceneNode` becomes a plain container; HTML elements that lived inside it (star marker hotspots) move out.

2. **SVG viewBox-based zoom.**
   - The main SVG (`.astro-overlay__svg`) starts with `viewBox="0 0 100 100"`.
   - `setViewTransform({ scale, x, y })` recomputes the viewBox:
     - `vbWidth  = 100 / scale`
     - `vbHeight = 100 / scale`
     - Translation `x, y` (currently in pixels relative to layer center) needs converting to viewBox-space:
       - `xPct = (x / layerWidth) * 100`, `yPct = (y / layerHeight) * 100`
       - `vbX = 50 - vbWidth * 0.5 - xPct / scale`
       - `vbY = 50 - vbHeight * 0.5 - yPct / scale`
     - Set `viewBox="${vbX} ${vbY} ${vbWidth} ${vbHeight}"`.
   - The leader SVG (`.astro-overlay__leader-svg`) gets the same viewBox treatment (since leader x1/y1/x2/y2 are in 0–100 space).

3. **Star markers into SVG.**
   - Replace the `<span class="astro-overlay__star-dot">` HTML element with an SVG `<circle>` placed inside the main SVG.
   - The marker still needs to be an interactive hotspot for the dwell-hover logic in `buildInteractiveNode`. Two options:
     - Option F1: keep the HTML `<button>` hotspot for interaction but make it invisible (transparent fill, no border/shadow); the visible star dot is a sibling `<circle>` in SVG. Pointer events on the invisible HTML button continue to work.
     - Option F2 (preferred): render the star dot entirely in SVG using `<circle>` + `<filter>` for the glow, and attach the dwell handler directly to that circle (pointer-events: auto on the circle, pointer cursor via CSS).
   - Visible representation: small circle (r ≈ 0.6 in viewBox units), stroked, with optional radial gradient or SVG `<filter>` glow. The glow filter is part of the SVG, so it rescales with viewBox changes — no rasterisation blur.

4. **Replace `filter: drop-shadow(...)` on `.astro-overlay__constellation-line` and `.astro-overlay__nebula-ellipse` with SVG `<filter>`.**
   - Define `<defs><filter id="astroGlowBlue">...</filter><filter id="astroGlowAmber">...</filter></defs>` inside the SVG.
   - Apply via `filter="url(#astroGlowBlue)"` attribute on the line / ellipse elements.
   - SVG filters scale with the SVG coordinate system, so zooming via viewBox keeps them crisp.

5. **Label positioning (`layoutOverlayLabels`).**
   - Labels are still HTML, still positioned via `getBoundingClientRect()` math.
   - The anchor transform must now reflect the viewBox state instead of CSS scale:
     - Given a star at `(xPct, yPct)` in the original 0–100 space, its on-screen position depends on the current viewBox.
     - Compute: `screenX = (xPct - vbX) / vbWidth * layerWidth`, `screenY = (yPct - vbY) / vbHeight * layerHeight`.
   - Replace the existing `transformAnchor(xPx, yPx, width, height)` logic to use viewBox coordinates rather than scale/translate.
   - Leader line endpoints (`x1, y1, x2, y2`) are in viewBox-space percentages already; they don't need recomputing for zoom (the SVG itself rescales them). The label-anchor leg of the leader still needs the label center in viewBox-space, which is `(labelCenterScreenX / layerWidth) * 100 * (viewBox_to_screen_ratio)`... Actually simpler: keep the leader SVG at viewBox 0..100 (i.e. NOT zoomed via viewBox), so leader coordinates remain percentages of the unzoomed layer. The leader line then connects label center (in screen pct of layer) to anchor (in screen pct of layer after zoom). This keeps the math from `astro-overlay.js` lines 410–413 working with small adjustments.

6. **Image element coupling.**
   - The image (`viewerImage` in `astro-immersive.js`) still uses CSS transform `translate3d(...) scale(...)`. That's fine — the image is a raster bitmap, browser scaling is acceptable, and decoupling overlay from image transform is the whole point.
   - `overlayController.setViewTransform(transform)` is called from `applyTransform` in `astro-immersive.js`; signature stays the same; overlay just interprets it differently internally now.

### Acceptance check

Open the Orion viewer, enable Stars + Nebulae + Constellations, zoom to 4×:
- Constellation line: sharp, no haloed blur on the glow.
- Nebula ellipse: stroke is clean at every zoom step.
- Star dot: circle outline and inner gradient stay crisp.
- Labels: continue to position correctly relative to anchors as zoom changes (existing layout behavior preserved).

## File-level change summary

| File | Changes |
|------|---------|
| `index.html` | Remove `.hero-grid`. Remove `.photo-wall-shell`. Remove `<section #birds>`. Move bird-tab into Frames. Update Frames section-heading text. Update section eyebrow numbers (Sunset → 04, Stars → 05). Restructure studio cards: trim top card, add Listening spot to channel grid, move pills to mode card. |
| `styles.css` | Remove hero-card / hero-grid styles. Remove photo-wall styles. Restyle bird-tab as deck card. Studio: typography hierarchy across data cards, gradient saturation reduction, new `.studio-channel--focus` for Listening spot, `.studio-notes-footnotes` chip row, removal of `.studio-setup-strip` / `.studio-node*` rules. Bird IUCN anchor reset + hover. Timelapse `is-controls-armed` brighten rules. Astro: remove rules tied to `.astro-overlay__scene` CSS transform; new SVG filter / circle styles. |
| `photo-decks.js` | Drop hero highlight code path. Drop wall rendering. Continue deck-list rendering. |
| `birds-gallery.js` | Extend `IUCN_SCALE` with `wikiSlug`. Change `renderIucnScale` to emit `<a>` instead of `<span>`. Top trail and viewer scale both updated. |
| `timelapse-stopwatch.js` | Adjust visibility ratio constants for armed buffer (1.10 / -0.10). |
| `astro-overlay.js` | Rewrite scaling to viewBox-based. Move star markers into SVG. Replace `filter: drop-shadow` with SVG `<filter>`. Update label anchor math. |
| `astro-immersive.js` | No external API changes; existing `setViewTransform` calls keep working. |

## Non-goals

- No changes to bird viewer internals beyond IUCN clickable wrapping.
- No changes to image zoom behavior (still CSS transform).
- No new dependencies.
- No content rewrites beyond what's needed for section renumber and Frames heading.

## Risks

- Astro overlay rewrite is the largest blast radius. Label positioning math is the trickiest part; needs Playwright verification at zoom 1× / 2× / 4× to confirm no regression.
- `photoDecks` rendering with three deck cards: bird-tab markup must align visually with portraits / scenery cards across breakpoints.
- Removing `#birds` anchor: any external link expecting `#birds` will dead-end. Acceptable per discussion (no preservation needed).
