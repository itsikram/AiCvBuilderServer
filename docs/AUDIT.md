# Audit: AI CV Builder BD (formerly ChakriCV)

Audit date: 2026-10-19. Baseline commit: `463ed31`.

## How this was tested

- Server (`tsx`) ran against a throwaway local MongoDB (mongodb-memory-server on port 27018,
  seeded with `npm run seed`), with Redis disabled. **Production Atlas data was not touched.**
- Client ran with Vite on port 5180, proxied to the local API.
- Flows were exercised through the API with `curl`, and in the in-app browser for the
  landing page, login, dashboard and editor. Gemini calls used the configured keys
  (one generate call).
- Baseline checks: `server tsc --noEmit` passes. `client npm run build` passes, but ships one
  787 kB JS chunk. `client npm run lint` reports **42 errors**: 25 `react-hooks/static-components`
  in `ResumePreview.tsx`, 9 `set-state-in-effect`, 4 `only-export-components`, plus a few others.
  There are **no automated tests** in either package.

## App map

| Area | What exists |
|---|---|
| Public routes | `/`, `/about`, `/pricing`, `/templates`, `/blog`, `/blog/:slug`, `/contact`, `/r/:slug` (public CV), auth pages |
| App routes | `/dashboard`, `/dashboard/resumes`, `/dashboard/resumes/:id` (editor), `/dashboard/ats`, `/dashboard/cover-letters`, `/dashboard/billing`, `/dashboard/settings` |
| Admin routes | `/admin` overview, users, bkash-payments, plans, content-manager, menu-manager, settings, templates |
| API | `/api/v1/{auth,resumes,cover-letters,payments,templates,blogs,page-content,admin}`, `/api/v1/health` |
| Models | User, Resume, CoverLetter, Template, SubscriptionPlan, Payment, Coupon, BkashConfig, Blog, PageContent, AdminSetting, Analytics |
| Auth | JWT access token in `localStorage` + httpOnly refresh cookie; Google One-Tap optional |
| AI | `@google/generative-ai` with a multi-key manager (`GEMINI_API_KEYS`), model `gemini-2.5-flash` |
| PDF export | Server-side `pdfkit` with built-in Helvetica (`pdf.service.ts`, about 1,700 lines) |
| PDF import | Upload to Cloudinary, then text extraction via pdftxt.dev, then Gemini parses it into fields |
| Payments | SSLCommerz, manual bKash (admin review), Nagad stub. **Out of scope: not changed.** |
| Cache | ioredis with `DISABLE_REDIS` switch; the cache helpers already no-op without Redis |

## Findings (ranked by severity)

### Critical (security or data integrity)

1. **Mass assignment on `PATCH /resumes/:id`.** `validate()` checks the body but the controller
   does `$set: req.body` with the raw body. Verified: a user can set `atsScore: 99`,
   `viewCount: 5000`, and also `userId`, `publicSlug` and so on.
2. **IDOR in `POST /resumes/ai/improve`.** It runs `Resume.findByIdAndUpdate(req.body.resumeId)`
   without an owner check, so any user can overwrite another user's ATS score and feedback.
3. **ATS cache key collision.** The key is the first 50 base64 characters of the resume text.
   Two different CVs that start the same way (for example the same name header) get each
   other's cached ATS report, which leaks one user's analysis to another.
4. **Hardcoded admin credentials in the seed** (`admin@chakricv.com / Admin@123456`), printed to
   the console. The seed also runs `deleteMany` on templates, plans and coupons, so running it
   against production wipes admin edits.
5. **`client/public/404.html` builds `'/' + path`**, which becomes `//foo`, a protocol-relative URL
   that points the browser at another host (an open redirect). It also returns 404 for every
   deep link on static hosts.

### High (broken features)

6. **Bangla is not rendered in PDF export.** pdfkit only embeds Helvetica, so Bangla glyphs are
   dropped (verified: `/BaseFont` is only Helvetica/Helvetica-Bold). The server PDF also differs
   from the HTML preview's layout and colours, so the export doesn't match what users see.
7. **PDF import depends on Cloudinary.** The import throws 500 "Cloudinary is not configured"
   when Cloudinary is unset, even though only the text is needed. The UI says "PDF or DOCX"
   and accepts `.docx/.doc`, but the server rejects anything that isn't a PDF.
8. **The admin blog manager is unreachable.** `AdminDashboardPage.tsx` (blog CRUD) and
   `SystemSettingsPage.tsx` aren't routed in `App.tsx`.
9. **Admin limits are ignored.** The `MAX_AI_REQUESTS_FREE` and `MAX_RESUMES_FREE` admin
   settings don't take effect: `subscription.service.ts` uses hardcoded `FREE_LIMITS`.
10. **Gemini error handling.** It retries 3× with 1–2 s sleeps per key on *any* error
    (including 400 bad request) and has no request timeout. One generate call took **31 s**.
    The raw provider message is returned to users ("AI generation failed …: <provider text>").
    Retryable errors aren't distinguished by status (429/5xx vs 4xx).
11. **AI invents numbers.** The prompts ask for metrics, so the model makes some up (verified:
    "processing of over 100 invoices weekly" from "6 months intern"). The output is never
    schema-validated; it's `JSON.parse` + cast.
12. **Unknown URLs return a soft 404.** The client does `<Route path="*">` → `Navigate to "/"`, and
    in production the server returns `index.html` with HTTP 200 for any path.

### Medium (fragile, UX or i18n)

13. **About 90% of UI strings are hardcoded English.** `en.json`/`bn.json` have 86 lines; for example
    `ResumePreview`, `Footer`, `BlogPostPage` and `PublicResumePage` use no `t()` at all. Editor
    field labels show raw keys ("FullName", "Linkedin").
14. **No autosave in the editor.** The user must click Save, and work is lost on navigation or crash.
    There is no completeness score, and sections reorder with arrows only.
15. **No BD-standard CV sections**: Career Objective, SSC/HSC/Honours/Masters with GPA/CGPA,
    Training, Personal Details (father's/mother's name, DOB, NID, religion, nationality, permanent
    address), signature/declaration.
16. **Destructive actions use `window.confirm`** in 2 places and nothing elsewhere.
17. **Accessibility.** Icon-only buttons (theme, language) have no accessible name, and
    login/register inputs aren't associated with labels.
18. **Unverifiable marketing claims** on the landing page ("10K+ resumes", "95% ATS pass rate").
    These are a trust and consumer-protection risk; they should be removed or made configurable.
19. **Duplicate mongoose index** warning on `User.referralCode`.
20. **`togglePublic` builds URLs from `process.env.CLIENT_URL`** instead of the canonical site URL.
21. **Lint debt**: 42 errors (listed above).

### SEO gaps

22. **Pure CSR SPA.** Every URL returns the same empty `<div id="root">`, so Google only sees content
    after JS rendering, and social crawlers never do.
23. **Head and canonical tags.** Titles and descriptions are generic, there's no `hreflang`, and
    `<html lang>` is always `en`. The canonical uses `VITE_APP_URL`, which defaults to `chakricv.com`.
24. **No crawlable Bangla URLs.** Language is a client-side toggle stored in `localStorage`.
25. **Static `sitemap.xml` lists `chakricv.com`**, includes `/register`, and has no `lastmod`, blog
    posts or Bangla URLs. There is no `robots.txt`.
26. **Every page emits the same `SoftwareApplication` JSON-LD.** There is no Organization, WebSite,
    BreadcrumbList, FAQPage or HowTo markup.
27. **No keyword-targeted landing content** (CV format BD, fresher CV, government job CV, etc.).
    The blog has one seeded post.
28. **Performance.** There's a single 787 kB JS bundle (no route splitting), Inter is loaded from
    Google Fonts with no Bangla font, the OG image is an SVG (not supported by Facebook or
    LinkedIn), and `hero.png` is uncompressed.
29. **No www→apex / http→https redirects** and no compression. Hashed assets get no long-cache headers.

### Hosting and config

30. **Redis.** It is already optional (`DISABLE_REDIS=true`), but the rate limiter and key manager
    keep state per process, which is fine on single-process shared hosting. Gemini key cooldowns
    use the cache only for a `true` flag.
31. **CORS allows a single `CLIENT_URL` origin**, so www and apex can't both work. The refresh
    cookie has no explicit domain.
32. **Old brand everywhere**: `chakricv` in package names, configs, emails, Cloudinary folders,
    watermark, seed and coupon code, docker and render configs.
33. **`server/package.json` `start` runs `tsx src/index.ts`**, which compiles TypeScript on every boot and
    needs dev tooling in production. `build` also builds the client, which is fine for Render
    but slow on shared hosting.
34. **No `.env.example` documentation** for many variables actually read (`DISABLE_REDIS`,
    `USE_MEMORY_DB`, `PDFTXT_API_KEY`, `DNS_SERVERS`, …).

## Status checklist

Each item is ticked when fixed; the phase that addresses it is in brackets.

- [ ] 1, 2, 3 API ownership, mass assignment, cache key (Phase 4)
- [ ] 4 seed: admin credentials from env, non-destructive upsert (Phase 4)
- [ ] 5, 12, 29 real 404s, redirects, compression, caching (Phase 3)
- [ ] 6 PDF matches preview, Bangla-safe (Phase 5)
- [ ] 7 import without Cloudinary; honest file types (Phase 4)
- [ ] 8 route admin blog manager (Phase 3)
- [ ] 9 admin-configurable quotas (Phase 6)
- [ ] 10, 11 Gemini timeouts, backoff, schema validation, no invented metrics (Phase 4/6)
- [ ] 13–17 i18n, autosave, BD sections, dialogs, a11y (Phase 5)
- [ ] 18 marketing claims (Phase 3, content)
- [ ] 19, 20, 31–34 config and branding (Phase 1/4)
- [ ] 22–28 SEO (Phase 3)
- [ ] 21 lint (ongoing)
