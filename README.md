# VaniVeda

Marketing site and lead-capture forms for **VaniVeda**, an online French-language
coaching institute preparing candidates for DELF, TCF and TEF — primarily
Canada PR (Express Entry) applicants and other French-proficiency needs.

Static HTML/CSS/vanilla JS. No build step, no framework, no bundler — every
page is a self-contained `` file that loads shared CSS/JS from
`assets/`. Open any page directly in a browser, or serve the folder with any
static file server, and it works.

## Preview locally

From this folder:

```
python -m http.server 8000
```

then visit `http://localhost:8000/`. Any static server works the same way
(e.g. `npx serve`), since nothing here depends on server-side processing —
form submissions go straight to a Google Apps Script backend over `fetch`
(see below).

## Structure

```
/                          Home
courses                        Courses (DELF/TCF/TEF), course-matching quiz
about                          About
faqs                           FAQs
contact                        Contact / enrolment form
terms                          Terms & Conditions
privacy                        Privacy Policy
404                            Custom "not found" page
405                            Custom "method not allowed" page
robots.txt, sitemap.xml, llms.txt   Crawler / SEO / AI-agent files

assets/
  styles.css                        Shared design system (CSS custom properties, components)
  main.js                           Shared behaviour: nav, forms, phone-code picker, etc.
  vv3d.js                           Three.js custom elements (<vv-globe>, <vv-ladder>, <vv-podium>)
  config.js                         window.VV_APPS_SCRIPT_URL — the one line that wires forms to the backend
  vaniveda_logo_*                   Logo assets (PNG + SVG, light/dark/transparent variants)

admin/
  /                        Admin dashboard — see "Admin dashboard" below
  old-admin                    Retired earlier design of the same dashboard, kept as a reference

syllabus/
  VaniVeda-DELF-TCF-*-Syllabus.pdf  DELF/TCF A1–B2 syllabus PDFs, public (not blocked by robots.txt) —
                                     shared to candidates from the admin dashboard's Syllabus tab

evaluation/
  french/                           Hidden, unlinked French level-test pages — see "Hidden pages" below
  spanish/                          Hidden, unlinked Spanish level-test pages — see "Hidden pages" below

google-apps-script/
  Code.gs                           Form-intake + admin-portal backend (Apps Script)
  README.md                         Full deployment walkthrough for the backend
```

## Forms and the backend

Every form on the site (`contact`'s enrolment form, the course-matching
quiz on `courses`, and both hidden level tests) posts to a Google Apps
Script Web App, configured via `window.VV_APPS_SCRIPT_URL` in
`assets/config.js`. Until that URL is set, submissions still work from the
visitor's point of view (validation, local success state) but nothing is
persisted anywhere — `vvSubmitToSheet()` in `assets/main.js` no-ops silently
if the URL is blank.

**Full backend setup, deployment, and how the admin dashboard's password
works: see [`google-apps-script/README.md`](google-apps-script/README.md).**
That backend also emails the Test de Niveau result straight to the student.

## Admin dashboard

`admin//` is a small dashboard served by the same Apps Script
project, branded to match the main site (red/graphite/gold, a diagonal red
accent on cards, Oswald for stat numbers): an Overview built around
students and leads (not raw submission rows) with a submissions trend
chart, a status breakdown and test-completion charts (including a
completions-by-language bar, now that French and Spanish tests both feed
the same sheet); a **Students** tab that groups every submission across all
three forms by email — the primary key for a student — so the same person
filling in more than one form (or the same form twice) shows up as one
profile instead of scattered rows, with **Status editable only from there**
(each form's own table shows status as a read-only badge that's kept in
sync automatically — changing a student's status also updates every one of
their rows across Contact Enrolments, Course Quiz Leads and Test Results; a
fresh Contact or Quiz submission also resets an existing student back to
New); a **Share Tests** tab for sending any of the hidden evaluation pages'
link to a student with a short message (WhatsApp/email); a **Syllabus** tab
that does the same thing for the four DELF/TCF level syllabus PDFs in
`syllabus/` — each with a short description and a default share message
tailored to that level; and per-form tables with search, filter and sort.
It has a preview mode: open the file directly in a browser and it detects
it isn't running inside Apps Script, and shows sample data instead so the
design can be reviewed without
deploying anything. See the backend README for the real deployment and how
the password screen works.

`admin/old-admin` is an earlier design of the same dashboard, kept
around as a reference — it isn't wired into the Apps Script setup steps
below and doesn't need to be kept in sync with new features.

## Hidden pages

Four level-test pages — two French, two Spanish — live under
`evaluation/french/` and `evaluation/spanish/` at random 8-character
filenames instead of predictable ones — they're intentionally **not linked
from anywhere on the site**, and `robots.txt` blocks the whole
`/evaluation/` path from being crawled. The random filename is the only
thing keeping them from being casually found, so don't link to them
publicly, and don't rename them to anything guessable. Current URLs aren't
repeated in this file since it could end up public — ask whoever's holding
this project.

## SEO / AI-agent notes

- Every public page has a canonical URL, Open Graph/Twitter tags, and
  JSON-LD structured data (`Organization`, `BreadcrumbList`, plus
  `FAQPage` on faqs and `Course` entries on courses).
- `llms.txt` is a structured, Markdown summary of the site aimed at AI
  assistants/agents (an emerging convention, see llmstxt.org) — update it
  if the site's core facts (pricing, batch cadence, score thresholds)
  change, since it's written to state facts plainly rather than sell.
- `robots.txt` explicitly allows the major AI crawlers (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, etc.) in addition to the general `*` rule
  — same access as any search engine, everything except `/evaluation/`.
- **The domain used throughout (`https://www.vaniveda.com`) is a
  placeholder.** Replace it across canonical tags, OG/Twitter tags,
  JSON-LD, `robots.txt`, `sitemap.xml` and `llms.txt` once the real domain
  is confirmed — see "What's left to do" below.

## Credits

Crafted and managed by [WebGraha](https://webgraha.com).
