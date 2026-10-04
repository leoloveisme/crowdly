# Enhancement of the desktop app v9: rework the /software page

> Approved 2026-10-04.

## Context

`/software` (`src/pages/CrowdlySoftware.tsx`) grew piece by piece:
- a centred block of loose links
- an empty paragraph
- two `EditableText` ids each used twice (`crowdly-software`, `crowdly-on-github`)
- the desktop section, added in v2–v8

The user designed a cleaner page in `/Users/leoforce/Public/crowdly-apps.html`:
- a hero ("Write · Read · Listen · Watch" / "Crowdly apps"), with a web app button
- "One desktop app. Two ways to use it." with icon cards and taglines
- an availability line
- a two-column "Mobile apps" / "Access during the alpha" row
- a "Help build Crowdly" box

The task is to merge that design into `/software` in **Crowdly's colours**, keeping everything that works today: the live downloads, the anchors, translations and the admin message.

## Design: the HTML layout in Crowdly colours

The HTML's own palette (`#493da4` purple, `#a32367` pink) is close to what the platform already uses. It maps onto the Tailwind classes the header and footer use, so the page matches the rest of Crowdly:

| HTML | Crowdly (Tailwind) |
|---|---|
| purple text, eyebrow, Discovery accent | `text-indigo-800` (header links, footer headings) |
| pink brand, Creation accent, focus ring | `text-pink-600` (header and footer hover colour) |
| main heading | the existing Crowdly gradient: `bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent` |
| primary button | `bg-indigo-800 hover:bg-indigo-900 text-white` |
| icon chips | Discovery `bg-indigo-50 text-indigo-800`, Creation `bg-pink-50 text-pink-600` |
| ink / muted / lines | `text-gray-900` / `text-gray-600` / `border-indigo-100` |
| page background `#faf9fc`, cards white | `bg-gray-50` (as now), cards `bg-white rounded-2xl border` |
| "Help build" box `#f0edf7` | `bg-gradient-to-r from-pink-50 via-white to-indigo-50`, the same soft band as the main page hero card |

Dark mode gets light `dark:` variants (`dark:bg-background`, `dark:text-indigo-100`, …), as the footer does.

## Page structure (top to bottom)

1. **`CrowdlyHeader`**, then the admin message for `platform_admin` (kept). The HTML's own header and footer are dropped; Crowdly's are used instead.
2. **Hero**, left-aligned in a `max-w-5xl` container:
   - eyebrow "Write · Read · Listen · Watch"
   - gradient `h1` "Crowdly apps"
   - intro paragraph
   - an "Open Crowdly web app ↗" button
3. **Web app button.** The separate web editor (`apps/web`) isn't deployed: `https://crowdly.cloud/web_app` only returns the platform's own page. So the button follows the HTML:
   - shown greyed-out as "coming soon", controlled by a `WEB_APP_URL: string | null = null` constant next to `DESKTOP_DOWNLOADS`
   - set the URL once the web editor is live
4. **Desktop section** "One desktop app. Two ways to use it." with its intro, then two cards. The cards keep `id="discovery"` / `id="creation"` so the footer's `/software#…` links still scroll there. Each card has:
   - the inline SVG icon from the HTML (book / pen), in a colour chip
   - title and coloured tagline ("Your space to read and listen." / "Your space to write.")
   - the description
   - a full-width **Download** button linking to the live zip (`DESKTOP_DOWNLOADS`, unchanged), or "Download - coming soon" when `null`
5. **Availability row:** a pink dot plus "macOS on Apple Silicon (M1 or newer). Windows and Linux will follow.", which is the truthful version of the HTML's "For macOS, Windows and Linux". Below it, the existing macOS "right-click → Open" note in smaller grey text.
6. **Two columns:** "Mobile apps are on the way" and "Access during the alpha" (HTML text).
7. **"Help build Crowdly"** box with "View Crowdly on GitHub ↗", linking to `https://github.com/leoloveisme/crowdly` (live, unlike the placeholder in the HTML).
8. **`CrowdlyFooter`.**

The layout is responsive like the HTML: cards and the two-column row stack below `md`, and the boxes stack on phones.

## Translations (CLAUDE.md checklist)
- Every static string goes in `<EditableText id="software-…">`.
- Ids already in use keep their id when the meaning is the same: `software-discovery-title`, `software-creation-title`, `software-download-discovery|creation|soon`, `software-desktop-platforms-mac`, `software-desktop-mac-open-note`.
- Changed or new text gets its entry in `backend/scripts/data/interface-translations.seed.json` with en/ru/de:
  - entries for ids whose English text changes are updated in place (e.g. `software-discovery-desc`, `software-desktop-alpha-note`, `software-mobile-soon`)
  - new ids are added (`software-eyebrow`, `software-title`, `software-intro`, `software-web-app-btn`, `software-web-app-soon`, `software-desktop-heading`, `software-desktop-intro`, `software-discovery-tagline`, `software-creation-tagline`, `software-mobile-title`, `software-alpha-title`, `software-contribute-title`, `software-contribute-text`, `software-github-link`)
  - entries for removed ids (`software-empty-paragraph`, `crowdly-software`, `crowdly-on-github`, …) are dropped from the seed; their rows in the database are just unused
- The deploy re-seeds on push to `alpha`.

## Critical files
- `src/pages/CrowdlySoftware.tsx`: rewritten (keeps `DESKTOP_DOWNLOADS`, hash scrolling, `useAuth` admin message; drops the debug `console.log`s)
- `backend/scripts/data/interface-translations.seed.json`
- No route, `pageKey.ts` or backend changes.

## Verification
- `npx tsc --noEmit` and `npm run lint` pass for the file.
- `npm run dev`, then open `/software` in Chrome, light and dark, at desktop and phone width (screenshots):
  - the layout matches the HTML
  - Download buttons fetch the live zips (check the link targets, `HEAD` returns 200)
  - `/software#creation` scrolls to the Creation card
  - the web app button shows as "coming soon"
  - the GitHub link opens the repo
  - switching the UI language to Russian or German shows the translated text once the seed has run locally (`npm run seed-interface-translations --prefix backend`)
