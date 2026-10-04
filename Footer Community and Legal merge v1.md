# Footer: merge Company into Community, give Legal its own block

## Context
Right now the footer has separate **Company** (8 links) and **Community** (3 links) columns. The plan is to fold Company into Community and drop the "Company" heading. Community gets two labelled sub-columns, and **Legal** becomes its own top-level block. You picked the "sub-columns + legal inside" option, with one change: Legal moves up to be a separate block.

## Target layout (lg)
```
COMMUNITY (spans 2 cols)              LEGAL               FINDING YOUR WAYS  C(O-C)REATE  FIND US ON  PARTNERS
Get to know us     Get in touch       Terms & Conditions  Sitemap            Apps & sw    Facebook…   No shame media…
  About Us           Contact us       Privacy             Lounge
  Careers            Support
  Press              Send feedback
  News               Suggest a feature
  Blog
```
That makes 7 column units, so the grid goes from `lg:grid-cols-6` to `lg:grid-cols-7`. The gap drops from `gap-10` to `lg:gap-8` so that "Terms & Conditions" doesn't get squeezed. Breakpoints below lg: Community is `sm:col-span-2` (full row on sm, 2 of 3 cols on md), and on mobile the sub-columns stack in a `grid-cols-1 sm:grid-cols-2` inner grid.

## Changes

### 1. `src/components/CrowdlyFooter.tsx`
- Remove the Company `<div>` and its `footer-company-title` heading.
- Community `<div>` gets `sm:col-span-2 lg:col-span-2`. It keeps the `footer-community-title` h3 and adds an inner `grid grid-cols-1 sm:grid-cols-2 gap-6` with two sub-blocks. Each sub-block has a small sub-heading (`text-sm font-medium text-indigo-700 dark:text-indigo-200 mb-2`) and a `ul.space-y-2`:
  - `footer-community-about-title` "Get to know us": About Us, Careers, Press, News, Blog
  - `footer-community-contact-title` "Get in touch": Contact us, Support, Send feedback, Suggest a feature
- New Legal `<div>` right after Community, with h3 `footer-legal-title` "Legal" and links to Terms & Conditions and Privacy.
- Existing link element IDs stay the same (`footer-about`, `footer-terms`, etc.), so their translations carry over. All new text uses `<EditableText … layoutScoped>`, following the CLAUDE.md layout rule.
- One small cleanup while I'm here: "Finding your ways" currently has two separate `<ul>`s. They become one.

### 2. `backend/scripts/data/interface-translations.seed.json`
Add `/__layout__` entries (en/ru/de) next to the existing footer block (~line 7109):
- `footer-community-about-title`: Get to know us / Узнайте нас / Lerne uns kennen
- `footer-community-contact-title`: Get in touch / Свяжитесь с нами / Kontakt
- `footer-legal-title`: Legal / Правовая информация / Rechtliches

The old `footer-company-title` entry stays: it does no harm, and leaving it out wouldn't delete the DB row anyway.

### 3. Plan versioning
Following your plan-versioning rule, I'll save a copy of this plan in the repo root as a new `…v1.md` file.

## Verification
- `npm run dev` (with the backend on :4000), then check the footer at lg (≥1024px), md, sm and mobile widths. Look for: Community spanning 2 cols with two labelled sub-lists, Legal as its own block, the row fitting with no awkward wraps, and correct dark mode.
- Switch the UI to RU and DE after running `npm run seed-interface-translations --prefix backend` locally, and confirm the three new headings are translated.
- `npm run lint`.
