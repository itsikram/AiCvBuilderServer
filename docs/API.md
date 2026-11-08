# AI CV Builder BD API Documentation

**Base URL:** `http://localhost:5000/api/v1`  
**Version:** 1.0.0

## Authentication

Include JWT in header:
```
Authorization: Bearer <access_token>
```

Refresh token is sent via HTTP-only cookie to `POST /auth/refresh`.

---

## Auth

### POST /auth/register
```json
{ "name": "John", "email": "john@example.com", "password": "securepass", "referralCode": "CVXXXX", "language": "en" }
```

### POST /auth/login
```json
{ "email": "john@example.com", "password": "securepass" }
```

### POST /auth/google
Signs in with the ID token from Google's "Continue with Google" button, creating the account when
the Google email is new. `referralCode` and `language` are optional and only used for a new account.
Returns the same body as login plus `isNewUser`. Needs `GOOGLE_CLIENT_ID` (Admin -> Settings ->
Google Sign-In); without it the endpoint answers 503 and `GET /config` returns an empty `googleClientId`.
```json
{ "credential": "<google-id-token>", "referralCode": "CVA1B2C3D4", "language": "bn" }
```

### POST /auth/verify-email
```json
{ "token": "<verification-token>" }
```

### POST /auth/forgot-password
```json
{ "email": "john@example.com" }
```

### POST /auth/reset-password
```json
{ "token": "<reset-token>", "password": "newpassword" }
```

### GET /auth/me
Requires auth. Returns current user profile.

### PATCH /auth/profile
```json
{ "name": "John", "language": "bn", "theme": "dark" }
```

---

## Resumes

### GET /resumes
List user's resumes.

### POST /resumes
```json
{ "title": "Software Engineer CV", "templateId": "modern-ats", "format": "ats", "language": "en" }
```

### GET /resumes/:id
Get single resume.

### PATCH /resumes/:id
Update resume content, title, sections.

### DELETE /resumes/:id

### POST /resumes/:id/duplicate

### POST /resumes/:id/toggle-public
Returns public URL when enabled.

### GET /resumes/:id/export-pdf
Retired (410). The client makes the PDF in the browser from the preview, so it matches it exactly.

### POST /resumes/:id/exported
Records a PDF download made in the browser (updates `lastExportedAt` and the `pdfExports` stat).

### GET /resumes/public/:slug
Public resume (no auth): `title`, `content`, `templateId`, `language`, `theme`, `sectionOrder` and `watermark` (the owner's plan), everything the preview is drawn with.

### POST /resumes/ai/generate
```json
{
  "name": "Rahim Ahmed",
  "jobTitle": "Software Engineer",
  "skills": "React, Node.js, MongoDB",
  "experience": "2 years at tech company...",
  "education": "BSc CSE, DU",
  "projects": "E-commerce app...",
  "language": "en",
  "resumeId": "optional-id-to-update"
}
```

### POST /resumes/ai/improve
```json
{ "resumeText": "...", "jobDescription": "...", "language": "en" }
```

### POST /resumes/ai/ats-check
```json
{ "resumeText": "...", "jobDescription": "optional" }
```

### AI tasks on a CV

These take either `content` (the editor's current, possibly unsaved CV content, without
the profile photo) or `resumeId` (a saved CV owned by the caller), plus `language`
(`en`/`bn`, the language to write in). Nothing is saved: the client applies what the user
accepts. Each successful call counts as one AI request against the quota.

#### GET /resumes/ai/quota
`{ dailyLimit, usedToday, monthlyLimit, usedThisMonth, resetsAt }`; `-1` means unlimited.
Daily limits reset at midnight Bangladesh time.

#### POST /resumes/ai/write-summary
```json
{ "kind": "summary | objective", "content": {...}, "jobTitle": "optional", "tone": "formal | confident | friendly", "language": "en" }
```
Returns `{ options: string[3], tip }`.

#### POST /resumes/ai/rewrite-bullets
```json
{ "position": "Accounts Intern", "company": "ABC Traders", "bullets": ["..."], "jobTitle": "optional", "tone": "formal", "language": "en" }
```
Returns `{ bullets, tips }`. Numbers are kept, never invented; `tips` asks for missing ones.

#### POST /resumes/ai/suggest-skills
`{ "jobTitle": "Junior Accountant", "currentSkills": ["Excel"], "language": "en" }` returns `{ skills, reasoning }` (skills the CV doesn't list yet).

#### POST /resumes/ai/tailor
`{ "content": {...}, "jobDescription": "job post in English or Bangla", "language": "en" }` returns
```json
{
  "matchScore": 62,
  "verdict": "...",
  "matchedKeywords": ["Tally"],
  "missingKeywords": ["VAT"],
  "edits": [{ "key": "e0", "type": "rewrite | add_skill", "path": "experience.0.bullets.1", "before": "...", "after": "...", "reason": "..." }]
}
```
`path` is a dot path into the CV content; the user approves each edit separately.

#### POST /resumes/ai/grammar
`{ "content": {...}, "language": "en" }` returns `{ issues: [{ path, original, corrected, explanation }] }`.

#### POST /resumes/ai/interview/questions
```json
{ "resumeId": "optional", "jobTitle": "Junior Officer", "jobDescription": "optional job post", "focus": "mixed | behavioral | technical | hr | viva", "count": 8, "language": "en" }
```
Needs `jobTitle`, `jobDescription` or a CV with a job title. `count` is 3-12. `viva` is a Bangladeshi
government/bank/BCS viva board. Returns
`{ jobTitle, prepTips: string[], questions: [{ id, category, question, whyAsked, tips, sampleAnswer }] }`;
`category` is `behavioral | technical | situational | hr | role`. Model answers use only facts from the
CV and mark missing details in `[brackets]`.

#### POST /resumes/ai/interview/feedback
```json
{ "question": "Tell me about yourself.", "answer": "the user's practice answer (15-5000 chars)", "resumeId": "optional", "jobTitle": "optional", "jobDescription": "optional", "language": "en" }
```
Returns `{ score (0-10), verdict, strengths, improvements, improvedAnswer, followUp }`.

#### POST /resumes/ai/coach
One reply from the career coach chat. The server stores nothing: the client sends the conversation
(up to 40 messages, each up to 6000 chars, the last from the user). Only the newest turns that fit
about 12,000 characters reach the model.
```json
{ "messages": [{ "role": "user | assistant", "content": "..." }], "resumeId": "optional", "jobDescription": "optional", "language": "en" }
```
Returns `{ reply, edits, suggestions }`. `edits` has the same shape as the tailor edits and is only
filled when a `resumeId` is sent and the user asked for CV changes. `suggestions` are 2-3
follow-up messages the user can send with one tap.

#### POST /resumes/:id/apply-edits
Applies edits the user approved (from `/ai/coach` or `/ai/tailor`) to a saved CV. Not an AI call.
```json
{ "edits": [{ "type": "rewrite | add_skill", "path": "personalInfo.summary", "before": "current text", "after": "new text" }] }
```
A rewrite is applied only if the field still holds `before`, is a prose field or job title (never
names, contact details or personal details) and `after` fits that field's length limit; otherwise
it is skipped. Returns `{ resume, results: ["applied" | "skipped", ...], applied, skipped }`.

#### POST /resumes/:id/translate
`{ "targetLanguage": "bn" }` creates a translated copy (201, the new CV). The original is unchanged.
Counts against the CV limit.

#### POST /resumes/import-text
`{ "text": "pasted CV or LinkedIn profile text", "resumeId": "optional" }` parses the text into CV
fields (SSC/HSC/Honours, GPA, personal details...). With `resumeId` it replaces that CV's content;
otherwise it creates a new CV.

#### POST /resumes/upload-parse
Multipart `file` (PDF or .docx, up to 10 MB) and optional `resumeId`; same result as import-text.

---

## Cover Letters

### GET /cover-letters

### POST /cover-letters/generate
```json
{
  "companyName": "Grameenphone",
  "jobTitle": "Software Engineer",
  "jobDescription": "...",
  "resumeId": "optional",
  "language": "en",
  "tone": "formal | confident | friendly"
}
```

### GET /cover-letters/:id/export-pdf

---

## Templates

### GET /templates
### GET /templates/:slug

---

## Payments

### GET /payments/plans

### GET /payments/calculate?planSlug=premium&billingCycle=monthly&couponCode=AICVBD20

### POST /payments/sslcommerz
```json
{ "planSlug": "premium", "billingCycle": "monthly", "couponCode": "AICVBD20" }
```

### POST /payments/bkash
### POST /payments/nagad

### POST /payments/sslcommerz/ipn
SSLCommerz IPN callback (server-to-server).

---

## Blog

### GET /blogs
### GET /blogs/:slug

---

## Free Premium trial

One per account, no payment details. Its length is the Premium plan's `trialDays` (Admin -> Plans,
0 to 90; 0 turns it off; seeded as 7). During the trial the user's subscription is
`{ plan: "premium", status: "trial", expiresAt }`. When `expiresAt` passes, Premium access stops at
once (the API reports the Free plan), and an hourly job moves the stored row back to Free and logs
`trial.ended`. Admin -> Settings -> Features -> "Free trial needs a verified email" (off by default)
makes unverified users verify first.

### GET /payments/trial (auth)
```json
{ "days": 7, "available": true, "active": false }
```
`reason` is `used`, `premium`, `unverified` or `none` when `available` is false; `endsAt` is set
while `active`.

### POST /payments/trial (auth)
Starts the trial. Returns `{ trial, subscription }`. 409 if already used or already Premium, 403
if the email must be verified first, 404 if no trial is offered.

---

## Passes, extras and growth

- `GET /payments/plans` includes `priceWeekly` (7-day pass; 0 hides it).
- Checkout (`POST /payments/bkash`, `/payments/sslcommerz`, `/payments/nagad`) takes either a pass
  (`planSlug`, `billingCycle`: `weekly` | `monthly` | `yearly`, optional `couponCode`) or a product
  (`productSlug`, plus `orderNotes` and/or `resumeId` for services). Passes add 7/30/365 days after the current
  end date. Paid Premium ends on its date; an hourly job moves it to Free and emails the user, and sends one
  reminder 3 days before.
- `GET /payments/products` (public): active products. `GET /payments/orders` (auth): the user's orders.
- `POST /payments/redeem` `{ code }`: redeem an organisation's access code for Premium days.
- `POST /payments/watermark-free` `{ resumeId }`: Premium passes; otherwise uses one PDF credit (402 when none).
- AI packs add `bonusRequests`, used after the plan's limits; `GET /resumes/ai/quota` reports them and `pdfCredits`.
- `GET /auth/me` includes `credits` and `referral` (`signups`, `qualified`, `rewardEvery`, `rewardDays`, `toNextReward`).
- `GET /jobs?category=&open=1&page=&limit=`, `GET /jobs/:slug`: published job circulars.
- Employer screening (auth): `GET/POST /screenings`, `GET/DELETE /screenings/:id`,
  `POST /screenings/:id/candidates` (multipart `file`, PDF or DOCX; one credit each, refunded on failure; 402 when none).

Admin: `GET/POST /admin/products`, `PATCH /admin/products/:id`; `GET /admin/orders?status=&kind=service`,
`PATCH /admin/orders/:id` `{ status, deliveryMessage }`, `GET /admin/orders/:id/resume`;
`GET/POST /admin/access-codes`, `PATCH /admin/access-codes/:id`; `GET/POST /admin/jobs`, `PATCH/DELETE /admin/jobs/:id`.

---

## Admin (requires admin role)

Public: `GET /page-content` returns active Page Content entries only; the admin list
(`GET /admin/page-content`) includes inactive ones.

### GET /admin/dashboard
Totals, the last 30 days of daily counters, the 10 newest users and the 10 latest completed or
pending payments.

### GET /admin/analytics?range=30d
Business analytics for Admin -> Analytics. `range` is `7d`, `30d`, `90d` (daily buckets) or `365d`
(monthly buckets), in Bangladesh time. Returns `totals` and `previousTotals` (the period of the same
length before it): new users, active users, CVs created, PDF downloads, AI requests, trials started,
paid orders, paying customers and revenue; `series` (one point per bucket with the same fields);
`funnel` (of the users who signed up in the period: made a CV, downloaded, started a trial, paid;
how many came back a day or more later; sign-up method, language and invites); `revenueByItem`,
`revenueByMethod`, `aiFeatures`, `templates`, `cvLanguages`; and `planMix` (everyone's plan today).
Active users and AI tools come from the activity log, so they only reach back as far as
`ACTIVITY_RETENTION_DAYS`.

### GET /admin/seo?range=28d&country=bgd&device=all&refresh=0
Admin -> SEO & keywords. `range` is `7d`, `28d`, `90d` or `365d`; `country` is `bgd` (Bangladesh) or
`all`; `device` is `all`, `mobile`, `desktop` or `tablet`. Always returns the tracked `keywords` and
`cvKeywords` (the most common target job titles and skills in CVs edited in the period, counted once
per user). When Google Search Console is connected (Admin -> Settings -> Google Search Console: a
service account's JSON key, with that account added as a user of the property), `search` holds
totals and the previous period, a daily trend, the top 250 searches, top pages, devices, countries,
Bangla-script vs Latin searches, `opportunities` (`almostPageOne`: positions 8-20, `lowCtr`: page one
but under half the usual click rate, `newQueries`, `dropping`) and each tracked keyword's clicks,
impressions, CTR, position, previous position and the page Google shows (`wrongPage` when it isn't
the target). Google's data is cached for 30 minutes; `refresh=1` fetches it again. If Google
refuses, `searchError` says why and what to change.

### POST /admin/seo/test
Checks the saved key: `{ serviceAccount, property, hasAccess, sites }`.

### POST /admin/seo/keywords
```json
{ "keywords": ["cv format for nurse job", "নার্স সিভি ফরমেট"], "targetPath": "/cv-format-bangladesh", "notes": "optional" }
```
Keywords are stored lower-case with single spaces; the language is detected from the script.
Returns `{ added, skipped }` (skipped = already tracked).

### PATCH /admin/seo/keywords/:id
`{ keyword?, language?, targetPath?, notes? }`. 409 if the new wording is already tracked.

### DELETE /admin/seo/keywords/:id

### GET /admin/users?page=1&search=
### GET /admin/activity?page=1&limit=50&type=&userId=&search=
User activity, newest first: sign-ups, logins, email verification, password resets, CVs
(created, deleted, shared, downloaded), cover letters, AI tool use, purchase requests, payment
outcomes and admin plan changes. `type` is one of the `types` the response lists (e.g.
`cv.created`); `search` matches the user's name or email. The response also has `last24h`
(count per type) and, with `userId`, a `user` summary. Entries are kept for
`ACTIVITY_RETENTION_DAYS` (default 180) and deleted with the user.
```json
{ "activities": [{ "_id": "…", "type": "cv.created", "label": "Created a CV",
    "message": "Created CV \"Software Engineer\"", "metadata": { "resumeId": "…", "source": "new" },
    "ip": "…", "userAgent": "…", "createdAt": "…", "user": { "_id": "…", "name": "…", "email": "…" } }],
  "total": 1, "page": 1, "pages": 1, "types": [{ "type": "cv.created", "label": "Created a CV" }],
  "last24h": { "cv.created": 1 } }
```
### PATCH /admin/users/:id
### GET /admin/payments
### GET /admin/coupons
### POST /admin/coupons
### GET /admin/templates
### POST /admin/templates
### GET /admin/settings
### PUT /admin/settings
### POST /admin/settings/test-email
```json
{ "to": "optional@example.com" }
```
Sends a test email with the saved SMTP settings to `to`, or to the signed-in admin. 400 when SMTP
isn't set up, 502 with the SMTP server's error when sending fails.

### Admin notification emails
Admins are emailed (in the background, never delaying the request) when a user signs up, submits a
purchase request (a bKash payment to review, or a Premium checkout started) or creates a CV (new,
duplicated, imported, uploaded or translated). Recipients: `ADMIN_NOTIFICATION_EMAILS`, else every
admin account. Each event can be switched off in Admin -> Settings -> Admin notifications
(`NOTIFY_NEW_USER`, `NOTIFY_PURCHASE_REQUEST`, `NOTIFY_CV_CREATED`).

---

## Health

### GET /health
```json
{ "success": true, "message": "AI CV Builder BD API is running", "version": "1.0.0" }
```

---

## Error Format

```json
{
  "success": false,
  "message": "Error description",
  "errors": { "field": ["validation message"] }
}
```

## Rate Limits

- General: 300 req / 15 min per IP
- Auth (login, register, reset): 20 req / 15 min per IP
- AI: 40 req / hour per user, plus the plan quotas (monthly per plan, daily via
  `AI_DAILY_QUOTA_FREE` / `AI_DAILY_QUOTA_PREMIUM`, both overridable in Admin -> Settings)
- Over-limit responses: 429 (rate limit or daily quota), 403 (monthly plan limit)
