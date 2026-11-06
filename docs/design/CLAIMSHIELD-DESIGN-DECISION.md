# ClaimShield public page: design decision

Scope: the root `index.html` (marketing/demo entry). The workbench in `app/` is unchanged. Everything shown is the bundled synthetic `golden` fixture and the fictional rule pack `CS-DEMO-1`.

## Three candidate directions

| | A. Clinical validation station | B. Claim audit worksheet | C. Preflight checklist |
|---|---|---|---|
| Type | One highly legible system sans, bold tight headings, mono for ids and rule versions | Serif headings, ruled-paper body, stamp accents | Large numbered sans, checkbox rows |
| Palette | White and mist, deep teal `#123F44`, restrained blue `#245FAB`, slate `#52646C`, one rust warning reserved for failures | Cream paper, navy ink, red stamp | White, black, single green |
| Composition | Split hero: statement left, crisp batch table right. Table is the main visual; source fields on the left, a separately ruled, versioned rule column on the right | Full-width form page with margin notes | Vertical list of checks that tick off |
| Imagery | None beyond the real table; no stock, anatomy or cross/heartbeat motifs | Rubber stamp art | Icons |
| Motion | Rows settle in once; link-to-cell highlight via `:target` | Stamp thump | Tick animation |
| Mobile | Table becomes stacked claim records with labelled fields | Single column form | Native fit |

Chosen: **A**. Reasons: the product's real value is the link between a failed rule and the field behind it, and a table with a versioned rule column shows that directly. B is already the look of the workbench itself (`app/index.html` is a cream paper form), so reusing it would make the marketing page and the tool indistinguishable and would also drift toward PayGuard's document-desk feel. C reads as a generic task list and hides the batch. A also keeps clear of a card grid: there are no cards on the page, only a table, a readout bar, a ruled list and a numbered rail.

Structural and typographic difference from the sibling sites: a split hero with a data table (not a document fragment or a map), a flat system sans with no serif display face, hard-edged offset panel, and a sectioned rhythm of table, findings ledger, workflow rail, limits list.

## Tokens

- Colour: teal `#123F44` (text, headers), white `#FFFFFF` (panels), mist `#EDF5F4` / `#DCEBE9` (page, rule column), blue `#245FAB` (links, focus, selected cell), slate `#52646C` (secondary), rust `#8F2F0F` on `#FBECE6` (failure only; always paired with a rule-id text tag, never colour alone).
- Type: `system-ui` stack for text, `ui-monospace` for claim ids, field names, rule ids and versions. No remote fonts. Atkinson Hyperlegible from the visual-directions note is not bundled (license and loading unverified), so the system stack stands in.
- Motion: four table rows fade in once on load; smooth anchor scrolling. Both removed under `prefers-reduced-motion: reduce`. Cell highlight uses `:target` and is static.

## Content grounding

Numbers on the page: 4 claims, 5 findings, CS01 1 / CS02 2 / CS03 1 / CS04 1, input total 70000 cents, 4 claims flagged, 0 clean. These are the golden oracle recorded in `README.md` and `docs/IMPLEMENTATION-RESULT.md`. The per-claim rows and finding messages were transcribed by reading `fixtures/index.js` and `src/rules.js` and following the rules by hand. I did not execute the engine in this session (the command was not approved), so the equality with live engine output is unconfirmed until someone opens the workbench's golden fixture and compares.

Not on the page by design: payer names, coverage, savings, acceptance or denial claims, customer logos, testimonials, and any suggestion to import real data.

## Website-playbook eight criteria

Status key: Strong needs inspected evidence. No browser or screenshot inspection was possible in this session, so nothing is marked Strong.

| Criterion | Intended outcome | Implementation | Evidence inspected | Status | Remaining correction |
|---|---|---|---|---|---|
| Point of view | A validation station where a failure always names its field | Split hero around a real batch table; versioned `CS-DEMO-1` column; findings link to flagged cells | Read of source only | Unverified | Confirm in browser that the hero reads as a single idea |
| Typography | Legible, technical, not templated | System sans with tight bold headings, mono for ids | Read of CSS only | Unverified | Check line breaks and the `h1` balance at 390, 768, 1440 |
| Colour | Calm clinical palette, rust only for failures | Teal/white/mist/blue tokens; rust tags with text | Contrast not measured; rust `#8F2F0F` on `#FBECE6` and white expected to pass AA by estimate | Unverified | Measure contrast pairs, including slate on mist |
| Hierarchy | Headline, then table, then findings, then limits | Hero, readout bar, table, ledger, workflow, limits, CTA; one primary action repeated (`app/`) | Read of markup only | Unverified | Check first-viewport CTA visibility |
| Imagery | Real data is the image | Table and tags only; no stock or clichés | Read of markup only | Mixed | Source has no images, so confirm the hero is not too plain once rendered |
| Motion | Restrained, accessible | Row fade-in, `:target` cell highlight, reduced-motion override | Read of CSS only | Unverified | Watch it run; confirm `:target` scroll lands below the sticky header |
| Mobile | Designed, not squeezed | Below 640px tables become stacked labelled records, 2-column readout, full-width CTAs, nav reduced to the CTA | Read of CSS only | Unverified | Inspect at 390px for overflow and the stacked table |
| Invisible quality | Semantic, keyboard-usable, constraint-safe | Skip link, landmarks, `th scope`, captions, visible `:focus-visible`, relative URLs, no scripts, no external requests, inline CSS allowed by the existing CSP (`style-src 'unsafe-inline'`) | Read of source; `build.mjs` and the CSP source read | Mixed | Tab through the page; run `npm run build` and open `dist/index.html`; screen-reader pass not done |

## Known risks to check in a browser

- Stacked tables on phones use CSS `display` changes on table elements, which can drop table semantics in some screen readers. Headings remain available as labels via `data-label` text, but this was not tested.
- `:target` highlighting depends on a hash navigation, so it does not persist after reload without the hash.
- The sticky header may overlap anchor targets; `scroll-padding-top` is set to 4.5rem as a mitigation.
