# PDF Upload & Extraction - pdftxt.dev Integration

## Overview
Resume upload uses the pdftxt.dev API for PDF text extraction. The server sends the uploaded PDF to pdftxt.dev, stores the extracted text on the resume record, then asks Gemini to convert that text into structured resume content.

## Upload Flow
1. User uploads a PDF file as multipart form data.
2. The server sends the file to `POST https://pdftxt.dev/extract`.
3. pdftxt.dev returns extracted text in the `text` field.
4. The raw text is saved as `resume.uploadedResumeText`.
5. Gemini parses the text into structured resume data.
6. The parsed content is saved to the resume.

## App Endpoint
### POST `/api/v1/resumes/upload-parse`

Auth: required.

Request:
```http
Content-Type: multipart/form-data

file: resume PDF, required
resumeId: existing resume ID, optional
```

Success response:
```json
{
  "success": true,
  "data": {
    "resumeId": "507f1f77bcf86cd799439011",
    "title": "John Doe Resume",
    "content": {},
    "uploadedAt": "2026-05-17T10:30:00Z",
    "hasUploadedResume": true
  }
}
```

## Configuration
pdftxt.dev requires an API key sent with the `X-API-Key` header. Keys use the `pdfbot_` prefix.

```env
PDFTXT_API_KEY=pdfbot_your_key_here
```

Service details:
- API endpoint: `https://pdftxt.dev/extract`
- Method: `POST`
- Request body: multipart form data with `file`
- Auth header: `X-API-Key`
- App timeout: 30 seconds
- App upload limit to pdftxt.dev: 10MB

## Error Handling
| Error | Cause | Solution |
| --- | --- | --- |
| `PDF extraction API key is not configured` | `PDFTXT_API_KEY` is missing | Add the key to `.env` |
| `PDF extraction failed: invalid pdftxt.dev API key` | Key is missing, invalid, or unauthorized | Generate or check the pdftxt.dev API key |
| `PDF file is too large` | File exceeds the configured upload size | Upload a PDF under 10MB |
| `PDF extraction limit reached` | pdftxt.dev returned rate limit | Wait or upgrade/check usage |
| `PDF extraction timed out` | Service took longer than 30 seconds | Retry or upload a smaller PDF |
| `No text content returned` | PDF has no extractable text | Use a text-based PDF |

## Usage Examples
### JavaScript
```javascript
const formData = new FormData();
formData.append("file", pdfFile);
formData.append("resumeId", resumeId);

const response = await fetch("/api/v1/resumes/upload-parse", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});

const result = await response.json();
```

### cURL
```bash
curl -X POST http://localhost:5000/api/v1/resumes/upload-parse \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@resume.pdf"
```

## Related pdftxt.dev Endpoints
- `POST https://pdftxt.dev/extract`: extract text from a PDF.
- `GET https://pdftxt.dev/usage`: check usage for an API key.

Last updated: May 17, 2026
