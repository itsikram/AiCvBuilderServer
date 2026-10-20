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
Returns PDF file.

### GET /resumes/public/:slug
Public resume (no auth).

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
  "language": "en"
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

- General: 200 req / 15 min
- Auth: 20 req / 15 min
- AI: 30 req / hour
