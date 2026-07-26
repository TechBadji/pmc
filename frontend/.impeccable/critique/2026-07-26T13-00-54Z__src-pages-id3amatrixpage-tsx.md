---
target: Matrice ID-3A
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-07-26T13-00-54Z
slug: src-pages-id3amatrixpage-tsx
---
**Method: dual-agent (A: a1ee95e5641b9be97 · B: a37361fd6bfafde58)**

## Critique — Matrice ID-3A (src/pages/ID3AMatrixPage.tsx)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading state |
| 2 | Match System / Real World | 4 | Solid |
| 3 | User Control and Freedom | 3 | No reset-all, no state persistence |
| 4 | Consistency and Standards | 3 | Period field relabeled between tabs |
| 5 | Error Prevention | 1 | No .catch on data fetch |
| 6 | Recognition Rather Than Recall | 4 | Strong legend + tooltip |
| 7 | Flexibility and Efficiency | 1 | No presets, no shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | 5-control filter row undercuts minimalism |
| 9 | Error Recovery | 1 | No error UI anywhere |
| 10 | Help and Documentation | 2 | Hint only visible on hover |
| Total | | 24/40 | Acceptable |

### Design Specificity Verdict
LLM: PhotoDot's clipped ringed photos, quadrant labels, untranslated axis labels, and objective-projection mini-chart are directly traceable to the ID-PMC PDF references. Clearly authored for ID-3A, not category-interchangeable.
Deterministic scan: 3 findings (exit 2), rule design-system-color: #b3b2aa (line 405), #52514e (lines 861, 870). No false positives.
Visual overlays: not available, no browser automation tool in this session.

### Priority Issues
[P0] No error handling on data fetch — silent failure indistinguishable from empty state.
[P1] No loading state — page chrome renders before response lands.
[P1] Primary interaction (PhotoDot click) is mouse-only — no tabIndex/role/onKeyDown, WCAG 2.1.1 failure.
[P1] Missing empty state in Matrix view (Objectives tab has one, Matrix doesn't).
[P2] Ungrouped flat filter row — up to 5 controls, exceeds working-memory guideline for Company Admin.

### Persona Red Flags
Jordan (first-timer): undiscoverable that "Compare with" + single-person filter must be combined for a clean trajectory view.
Sam (accessibility/keyboard): cannot Tab to or activate any PhotoDot — primary task unreachable by keyboard.

### Minor Observations
- Undocumented colors #b3b2aa, #52514e outside DESIGN.md tokens.
- Neutral grey used for both dimmed history dot and connector arrow risks reading as an undocumented 6th performance tier.
- Same Period field relabeled between tabs while controlling identical state.
- DeltaChip duplicates DeltaBadge in EvaluationsPage.tsx almost line-for-line.
- helperText literal-space layout-shift hack.

### Questions to Consider
1. Should "Compare with" be gated behind a single-person filter?
2. Is the Matrix currently usable by a screen-reader-dependent Manager at all?
3. Should the neutral history grey be visually distinct from a performance-tier color?
