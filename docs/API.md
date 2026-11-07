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
```json
{ "credential": "<google-id-token>" }
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

## Admin (requires admin role)

### GET /admin/dashboard
### GET /admin/users?page=1&search=
### PATCH /admin/users/:id
### GET /admin/payments
### GET /admin/coupons
### POST /admin/coupons
### GET /admin/templates
### POST /admin/templates

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
