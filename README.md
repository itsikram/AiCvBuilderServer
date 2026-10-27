# AI CV Builder BD — AI Resume Builder SaaS for Bangladesh

> This repository is the **API** (Express + MySQL via Prisma). The React frontend lives in its own
> repository (`aicvbuilderbd-client`) and is deployed separately as static files.

API for a bilingual (Bangla/English) CV builder for the Bangladesh job market: CVs, AI writing help, cover letters, payments and admin. AI runs on **Google Gemini** (model set by `GEMINI_MODEL`, default `gemini-3.5-flash-lite`).

![Stack](https://img.shields.io/badge/Stack-Express%20%2B%20MySQL-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **AI writing help** — objective/summary options with tone, action-verb duty lines (numbers only if the user gave them), skill suggestions
- **Tailor to a job** — match score, matched/missing keywords and field-level edits the user approves one by one (English or Bangla job posts)
- **Grammar check and translation** — per-field fixes; translated copy of a CV (English ↔ Bangla)
- **Import** — PDF, Word (.docx) or pasted text/LinkedIn mapped into CV fields (SSC/HSC/Honours, GPA/CGPA, personal details)
- **AI Resume Improver** — Keyword optimization from job descriptions + ATS score
- **ATS Score Checker** — Detailed compatibility analysis
- **Cover Letter Generator** — Personalized letters with PDF export
- **Resume Templates** — ATS, Bangladeshi CV, international formats
- **Drag-and-drop section ordering** — Reorder resume sections
- **Real-time preview** — Live resume preview while editing
- **PDF Export** — Free plan includes watermark; Premium removes it
- **Public resume sharing** — Share via public link
- **Bilingual** — English + Bangla (বাংলা)
- **Dark/Light mode**
- **Authentication** — JWT + Google OAuth + email verification + password reset
- **Payments** — SSLCommerz, bKash, Nagad (integration-ready)
- **Subscription plans** — Free (2 resumes) & Premium (unlimited)
- **Referral & coupon system**
- **Admin panel** — Users, revenue, coupons, templates, blogs
- **Blog & SEO** — Sitemap, OpenGraph, schema markup

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS, shadcn/ui, Zustand, TanStack Query, Framer Motion |
| Backend | Node.js, Express, TypeScript, MVC architecture |
| Database | MySQL / MariaDB (Prisma ORM) |
| Cache | Redis (ioredis) |
| AI | Google Gemini 2.5 Flash |
| Auth | JWT + Google OAuth |
| Payments | SSLCommerz, bKash, Nagad |
| Email | Nodemailer |
| Files | Cloudinary |
| PDF | PDFKit |
| Security | Helmet, rate limiting, Zod validation, parameterized queries (Prisma) |

## Project Structure

```
aicvbuilderbd-server/
├── src/
│   ├── config/         # DB, Redis, env
│   ├── controllers/    # MVC controllers
│   ├── middleware/     # Auth, validation, rate limit
│   ├── models/         # CV types and API response serializers
│   ├── generated/      # Prisma client (generated, not committed)
│   ├── routes/         # API routes
│   ├── services/       # AI, PDF, payment, email
│   └── scripts/        # Seed data
├── prisma/             # schema.prisma and SQL migrations
├── scripts/            # cPanel packaging, MongoDB → MySQL data copy
├── docs/               # API reference and feature notes
├── Dockerfile
├── docker-compose.yml  # MySQL + Redis + API for local development
└── render.yaml         # Render blueprint
```

## Quick Start

### Prerequisites

- Node.js 20+
- MySQL 8+ or MariaDB 10.4+ (local, XAMPP, Docker or hosted)
- Redis (optional, recommended)
- Gemini API key

### 1. Clone & install

```bash
git clone <repo-url>
cd aicvbuilderbd-server
npm install --legacy-peer-deps
```

### 2. Environment setup

```bash
cp .env.example .env
```

Edit `.env` with your credentials (minimum):

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=aicvbuilderbd
DB_USER=root
DB_PASSWORD=your-mysql-password
JWT_SECRET=your-32-char-minimum-secret-key-here
JWT_REFRESH_SECRET=your-32-char-refresh-secret-key
GEMINI_API_KEY=your-gemini-api-key
CLIENT_URL=http://localhost:5173
```

### 3. Create the tables and seed

Create an empty database (`CREATE DATABASE aicvbuilderbd CHARACTER SET utf8mb4;`), then:

```bash
npm run db:deploy   # applies prisma/migrations
npm run seed
```

Changing the schema: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`
creates and applies a new migration (commit it). `npm run db:studio` opens a data browser.

Admin user: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then run `npm run seed`.

### 4. Run development

```bash
npm run dev
```

- API: http://localhost:5000/api/v1/health
- Frontend: run the client repo's `npm run dev` (http://localhost:5173); its Vite dev
  server proxies `/api` to this API.

### Tests

```bash
npm test        # node:test via tsx (src/**/*.test.ts)
npm run typecheck
```

### Docker

```bash
docker-compose up -d
npm run seed
```

## API Documentation

Base URL: `http://localhost:5000/api/v1`

See [docs/API.md](docs/API.md) for full endpoint reference.

### Key endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login |
| POST | `/auth/google` | Google OAuth |
| GET | `/resumes` | List resumes |
| POST | `/resumes` | Create resume |
| GET | `/resumes/ai/quota` | Today's/this month's AI usage |
| POST | `/resumes/ai/write-summary` | Objective or summary options |
| POST | `/resumes/ai/rewrite-bullets` | Polish job duty lines |
| POST | `/resumes/ai/suggest-skills` | Skills for a job title |
| POST | `/resumes/ai/tailor` | Match a CV to a job post |
| POST | `/resumes/ai/grammar` | Grammar and spelling fixes |
| POST | `/resumes/:id/translate` | Translated copy of a CV |
| POST | `/resumes/import-text` | Import pasted CV/LinkedIn text |
| POST | `/resumes/ai/ats-check` | ATS analysis |
| POST | `/cover-letters/generate` | AI cover letter |
| GET | `/payments/plans` | Subscription plans |
| POST | `/payments/sslcommerz` | Initiate payment |
| GET | `/admin/dashboard` | Admin stats |

## Deployment

### API (Render)

1. Use `render.yaml`, or build with `npm ci && npm run build` and start with `npm start`
2. Set `SITE_URL` to the frontend origin (used for CORS, emails and payment redirects)
3. When the frontend is on a different site than the API (e.g. `aicvbuilderbd.online`
   calling `*.onrender.com`), set `COOKIE_SAME_SITE=none` so the refresh-token cookie is
   sent cross-site. Browsers that block third-party cookies (Safari, some privacy modes)
   will still drop it; serving the API from `api.<your-domain>` avoids that.
4. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` to a MySQL database that accepts connections from Render (cPanel MySQL
   needs Remote MySQL access for Render's outbound IPs).
   `npm start` applies pending migrations and seeds missing default data first (`npm run db:prepare`). Redis is optional: without `REDIS_URL` (or with
   `DISABLE_REDIS=true`) the cache falls back to process memory, which suits a single process.

For GoDaddy/cPanel hosting (Node.js App or static frontend + API elsewhere) see the client repository's
`docs/DEPLOY_GODADDY.md`.

### Gemini keys and model

- `GEMINI_API_KEYS`: comma-separated keys; requests rotate between them. Rate-limited keys cool down for a
  minute; invalid or leaked keys are disabled for 6 hours and logged by index (keys are never logged).
- `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), optional `GEMINI_FALLBACK_MODEL` used if the main
  model is retired, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_RETRIES` (429/5xx/timeouts, exponential backoff).
- Every AI answer is requested as JSON with a schema and validated with zod before use.

### Frontend

See the client repository's README. It builds to static files (`dist/`, including a
generated `.htaccess`) that are uploaded to cPanel.

### Moving the data from MongoDB

The API used MongoDB until October 2026. To copy an existing MongoDB database into MySQL once:

```bash
npm run db:deploy
MONGODB_URI="mongodb+srv://..." npm run migrate:mongo   # writes to the DB_* database
```

Rows keep their MongoDB ids, so public CV links and references between records survive.
MongoDB is only read. The script skips rows that already exist, so it can be re-run.

## Subscription Plans

| Feature | Free | Premium |
|---------|------|---------|
| Resumes | 2 | Unlimited |
| AI requests/month | 5 | 100 |
| AI requests/day | 10 | 100 |
| PDF watermark | Yes | No |
| Premium templates | No | Yes |
| ATS checker | No | Yes |
| Cover letters | No | Yes |
| AI optimization | No | Yes |
| Price | ৳0 | ৳499/mo |

These are the seeded defaults. Plan limits are edited in Admin → Plans; Admin → Settings can override
`MAX_RESUMES_*`, `MAX_AI_REQUESTS_*` (per month) and `AI_DAILY_QUOTA_*` (per day, resets at midnight
Bangladesh time; defaults come from the `AI_DAILY_QUOTA_FREE/PREMIUM` env vars). `-1` means unlimited.

Coupon code `AICVBD20` — 20% off Premium (seeded).

## Payment Setup

### SSLCommerz
Set `SSL_STORE_ID`, `SSL_STORE_PASS`, callback URLs in `.env`.

### bKash / Nagad
Structure is ready; configure sandbox credentials and complete token APIs in `payment.service.ts`.

## License

MIT — Built for the Bangladesh job market 🇧🇩
