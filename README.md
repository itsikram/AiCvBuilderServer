# AI CV Builder BD — AI Resume Builder SaaS for Bangladesh

> This repository is the **API** (Express + MongoDB). The React frontend lives in its own
> repository (`aicvbuilderbd-client`) and is deployed separately as static files.

Production-ready MERN stack SaaS platform for building ATS-optimized resumes, cover letters, and career documents. Powered by **Google Gemini 2.5 Flash**.

![Stack](https://img.shields.io/badge/Stack-MERN-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **AI Resume Generator** — Professional summaries, bullet points, skills (Gemini 2.5 Flash)
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
| Database | MongoDB (Mongoose) |
| Cache | Redis (ioredis) |
| AI | Google Gemini 2.5 Flash |
| Auth | JWT + Google OAuth |
| Payments | SSLCommerz, bKash, Nagad |
| Email | Nodemailer |
| Files | Cloudinary |
| PDF | PDFKit |
| Security | Helmet, rate limiting, mongo-sanitize, Zod validation |

## Project Structure

```
aicvbuilderbd-server/
├── src/
│   ├── config/         # DB, Redis, env
│   ├── controllers/    # MVC controllers
│   ├── middleware/     # Auth, validation, rate limit
│   ├── models/         # Mongoose schemas
│   ├── routes/         # API routes
│   ├── services/       # AI, PDF, payment, email
│   └── scripts/        # Seed data
├── docs/               # API reference and feature notes
├── Dockerfile
├── docker-compose.yml  # MongoDB + Redis + API for local development
└── render.yaml         # Render blueprint
```

## Quick Start

### Prerequisites

- Node.js 20+
- MongoDB (local or Atlas)
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
MONGODB_URI=mongodb://localhost:27017/aicvbuilderbd
JWT_SECRET=your-32-char-minimum-secret-key-here
JWT_REFRESH_SECRET=your-32-char-refresh-secret-key
GEMINI_API_KEY=your-gemini-api-key
CLIENT_URL=http://localhost:5173
```

### 3. Seed database

```bash
npm run seed
```

Admin user: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then run `npm run seed`.

### 4. Run development

```bash
npm run dev
```

- API: http://localhost:5000/api/v1/health
- Frontend: run the client repo's `npm run dev` (http://localhost:5173); its Vite dev
  server proxies `/api` to this API.

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
| POST | `/resumes/ai/generate` | AI generate content |
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
4. Add MongoDB Atlas + Redis URLs to env

### Frontend

See the client repository's README. It builds to static files (`dist/`, including a
generated `.htaccess`) that are uploaded to cPanel.

### MongoDB Atlas

Use connection string in `MONGODB_URI`:
```
mongodb+srv://user:pass@cluster.mongodb.net/aicvbuilderbd
```

## Subscription Plans

| Feature | Free | Premium |
|---------|------|---------|
| Resumes | 2 | Unlimited |
| AI requests/month | 5 | 100 |
| PDF watermark | Yes | No |
| Premium templates | No | Yes |
| ATS checker | No | Yes |
| Cover letters | No | Yes |
| AI optimization | No | Yes |
| Price | ৳0 | ৳499/mo |

Coupon code `AICVBD20` — 20% off Premium (seeded).

## Payment Setup

### SSLCommerz
Set `SSL_STORE_ID`, `SSL_STORE_PASS`, callback URLs in `.env`.

### bKash / Nagad
Structure is ready; configure sandbox credentials and complete token APIs in `payment.service.ts`.

## License

MIT — Built for the Bangladesh job market 🇧🇩
