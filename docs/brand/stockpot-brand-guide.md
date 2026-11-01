# Stockpot brand and interface guide

Status: implementation baseline adopted by the project lead on 1 November 2026 under
the user's authorization to handle routine product decisions. Semantic tokens, component
rules and native system-font fallbacks below govern the initial app. Fraunces/Inter and
Lucide remain the selected direction for a future bundled-font/icon pass; native system
fonts are the documented fallback for this release. This records implementation adoption,
not an assertion that the user separately approved each exact value.

## Sources and intent

- [KEB-20: branding guide](https://linear.app/mason-banks/issue/KEB-20/create-stockpot-agent-branding-guide)
- [KEB-19: visual direction](https://linear.app/mason-banks/issue/KEB-19/stockpot-visual-design-direction)
- [Product Principles](https://linear.app/mason-banks/document/product-principles-and-ux-decisions-ed14e63548fd)

**Stockpot — Make more of what you've got.** Warm, calm, modern, useful, food-led and
premium without fuss. Gousto informs food presentation, Apple apps inform native
interaction quality, and Particle informs uncluttered information. Use a restrained
pot/steam mark, never a cartoon mascot. The concept board is directional, not a pixel
specification; comparison with its embedded image remains outstanding.

The proposition is meal-kit convenience using food and supermarkets people already
use. Pantry tracking supports that promise. **Automate the admin, surface the decisions.**

## colour system

Components use central semantic tokens, never screen-specific hex values. These are
opaque sRGB values; opacity and image overlays require fresh contrast measurements.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| background | #F7F3EA | #191C17 | Canvas / cream and charcoal |
| surface | #FFFFFF | #242820 | Cards and fields |
| surfaceRaised | #FFFFFF | #30352C | Sheets and floating menus |
| surfaceMuted | #E8E3D9 | #30352C | Stone grouping, primary text only |
| textPrimary | #292D25 | #F6F2E8 | Body and headings |
| textSecondary | #666A5D | #B8BEAE | Supporting text on background/surface |
| action | #A4432D | #E8A087 | Terracotta action, links, selected navigation |
| onAction | #FFF9F2 | #251D19 | Content on action fill |
| borderControl | #858B7A | #7D8573 | Essential input/control boundaries |
| divider | #E8E3D9 | #42483B | Decorative separation only |
| sage | #DCE5D3 | #29351F | Quiet availability accent |
| olive | #40522D | #CBDDAF | Content on sage |
| successBackground | #E4EBD9 | #29351F | Confirmed success |
| successText | #40522D | #CBDDAF | Success label/icon |
| warningBackground | #FFF0CC | #3D301D | Use-soon attention |
| warningText | #785016 | #F4CC83 | Warning label/icon |
| dangerBackground | #FBE5DE | #432522 | Error, destructive confirmation, passed use-by |
| dangerText | #9C302F | #FFB4A9 | Danger label/icon |

Do not use textSecondary on light surfaceMuted; use textPrimary. Decorative dividers
cannot substitute for essential control boundaries. Do not place borderControl directly
against light surfaceMuted (2.75:1); keep essential controls on surface/background.
Pressed controls keep their fill
and gain a visible foreground inset outline. Disabled controls expose disabled state
and retain readable labels. Prose links are underlined. Keyboard focus uses a 2-point
action ring separated by a 2-point surface gap.

### Expiry and freshness

Colour reinforces words and icons; it never declares food safe. Keep date type and
source in visible copy and accessibility labels:

- Confirmed use-by: “Use by 3 Nov” or “Use by tomorrow”.
- Confirmed best-before: “Best before 3 Nov”.
- Estimated: “Estimated freshness · about 2 days”.
- Unknown: “Expiry not recorded”, neutral styling.
- Passed confirmed use-by: danger treatment and the explicit date.
- Use soon: warning treatment; details retain the original date type and source.

Never extend a confirmed use-by date with estimates. Never conflate best-before and
use-by. Keep expiry contextual within meal/inventory information. Today centres on dinner.

## typography

Retain concept direction: Fraunces 600 for display/headings; Inter for body/UI. Bundle
fonts if adopted; verify native loading and use explicit static weights before variable
fonts. Do not rely on synthetic bold or remote font fetching on each launch.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Display | 34 / 40 | Fraunces 600 |
| Screen heading | 28 / 34 | Fraunces 600 |
| Section heading | 22 / 28 | Fraunces 600 |
| Card title | 20 / 26 | Inter 600 |
| Body | 17 / 24 | Inter 400 |
| Button / important label | 17 / 22 | Inter 600 |
| Supporting / field label | 15 / 21 | Inter 400 / 600 |
| Metadata / badge | 13 / 18 | Inter 500 |

Values are logical points at default text size. Allow system scaling, wrapping and
row growth; never shrink safety text to fit a fixed height. Use sentence case,
left-aligned body copy and tabular quantity/price numerals where supported.

Fallback for every role is React Native's platform default (San Francisco on iOS,
system sans on Android). Preserve hierarchy, without inventing a replacement serif.
Web: system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif. Font-loading
failure leaves a usable UI.

## iconography and imagery

Use Lucide outline consistently: 24-point icons, 2-point stroke; 20 for metadata and
28 for prominent empty states. Adding its package is a separate implementation task.

| Meaning | Icon |
| --- | --- |
| Today / Plan / Kitchen | Utensils / CalendarDays / CookingPot |
| Shop / Recipes | ShoppingBasket / BookOpen |
| Use soon / urgent error | Clock / TriangleAlert |
| Favourite / receipt scan | Heart / ScanLine |
| Household / liked / vetoed | Users / ThumbsUp / ThumbsDown |
| Checked item | Check |

Selected navigation keeps the same icon, plus indicator and selected state. Filled
Heart is allowed for saved favourites. Name every icon action for screen readers.
Do not use emoji or mix unrelated icon families as permanent product controls.

Use appetising, plausible meal photography, natural light, warm neutral surroundings
and recognisable ingredients. Today/recipe cards use 4:3; compact thumbnails use 1:1.
Use cover crops and verify the dish remains visible at narrow widths. Titles and
essential metadata normally sit below photos. Text overlays need a measured opaque
surface/scrim; gradients alone do not establish contrast. Missing photo: surfaceMuted,
CookingPot and the recipe title, never an unrelated meal. Hide decorative images from
screen readers when adjacent text already conveys the meaning. Avoid generic decoration.

## component rules

Spacing: 4, 8, 12, 16, 24, 32, 48 points. Screen gutter 20; card padding 16; section gap 24.
Radii: button/input 12, card 16, sheet top 24, pill/avatar 999. Borders: 1 point.
Targets: at least 48 × 48, including icon actions and interactive chips.

| Component | Rule |
| --- | --- |
| Card | surface, radius 16, padding 16, one clear purpose, no default shadow |
| Primary button | action/onAction, height at least 48, horizontal padding 16; one dominant action per section |
| Secondary button | surface/textPrimary with borderControl |
| Destructive action | dangerText, explicit verb; confirmation explains consequence |
| Input/search | Persistent visible label, surface, borderControl, radius 12, height at least 48; text/icon error below |
| Badge | 13/18 text, padding 4 × 8, semantic background/text pair; no colour-only meaning |
| Avatar | 28-point visual, initials fallback; 48-point target if interactive |
| Checklist | Whole row toggles, height at least 56; checked text and quantity stay readable |
| Recipe card | 4:3 photo, title, duration/servings, limited useful metadata, separate named favourite action |
| Plan row | Day/date, thumbnail, meal name, made/skipped state; vertical list by default |
| Inventory row | Ingredient, quantity, storage, source-labelled expiry; ingredient stays dominant |
| Bottom navigation | Today, Plan, Kitchen, Shop, Recipes; labels always visible |
| Sheet/modal | surfaceRaised, top radius 24, title, close action, safe-area and keyboard padding |

Floating sheets/menus may use black shadow opacity 0.12, offset (0, 4), radius 12;
Android elevation 4. Prefer surface separation/borders in dark mode. Avoid nested
cards and multiple heavy shadows. Respect safe areas and reduced motion. Gestures
are never the sole route to actions; warn before discarding meaningful work and
restore focus to the sheet's triggering control.

## Navigation and product behaviour

Keep important actions within two or three interactions. Household/profile settings,
full calendar and provenance details are secondary destinations.

- Today: tonight's dinner hero with relevant stock/shopping consequences.
- Plan: vertical meal list; calendar secondary; swap in a prominent sheet.
- Kitchen: Use soon, Fridge, Freezer and Cupboard views.
- Shop: clean checklist; price estimates and reasons available on demand.
- Recipes: saved/favourite cookbook and discovery/search.

Receipt scanning belongs within Kitchen/Shop. Alternatives explain concrete impacts,
e.g. “2 extra ingredients” or “Uses your spinach”. Label estimated cost as estimated.
Plans remain visibly draft until confirmed. Only made meals consume stock. Keep
favourites, ratings, not-tonight, veto and permanent exclusion distinct; feedback
avatars identify the person and signal.

KEB-19 specifies photo-first stocktake with reviewed AI detections and manual fallback;
KEB-18 describes guided manual stocktake. Resolve that scope difference before KEB-18.

Loading preserves layout with a named progress indicator; pending submissions prevent
duplicates without erasing labels. Empty states explain the gap with one useful action.
Errors preserve input and offer retry. Offline UI distinguishes cached data from
unsaved writes. Corrections remain available without demanding daily stock administration.

## Accessibility and verification

Minimum contrast: 4.5:1 normal text; 3:1 large text and essential control boundaries/icons.
Computed opaque sRGB token contrast (WCAG relative luminance), before rendering:

| Pair | Light | Dark |
| --- | --- | --- |
| Primary text / surface | 14.03:1 | 13.42:1 |
| Secondary text / background or surface | 5.01:1 minimum | 7.87:1 on surface |
| onAction / action | 5.87:1 | 7.73:1 |
| Success text / background | 6.98:1 | 8.93:1 |
| Warning text / background | 6.28:1 | 8.43:1 |
| Danger text / background | 6.03:1 | 8.09:1 |
| Essential border / supported surfaces | 3.18:1 minimum | 3.28:1 minimum |

These calculations do not replace native checks. Verify both appearances, large text,
VoiceOver/TalkBack reading order, named controls, focus, selected/checked state, keyboard
avoidance, reduced motion, long recipe names and narrow screens. Never truncate safety
or provenance. Colour, haptics and animation are reinforcing cues, never the only cues.

## Agent context and adoption

> Use Stockpot's adopted semantic tokens and existing components. These proposed exact
> values are adopted for the initial implementation. Keep colour,
> font and radius changes central. Preserve the five destinations, food-led presentation
> and contextual expiry. Distinguish estimates from confirmed information. Reuse
> components before variants. Check light/dark, large text, screen readers and 48-point
> targets. Flag missing material decisions; do not silently invent a new visual system.
> Automate the admin, surface the decisions.

Next: record token/font/icon adoption or revisions; compare a representative light/dark
screen with the concept board; implement central tokens/components and verify native
font fallback. KEB-20 has a repository deliverable here, while exact design choices and
rendered/native validation remain explicitly proposed or outstanding.
