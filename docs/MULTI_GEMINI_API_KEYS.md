# Multi-Gemini API Keys Setup Guide

## Overview
The AI CV Builder BD AI Resume Builder now supports multiple Gemini API keys with automatic rotation and fallback handling. When one API key hits rate limits, the system automatically switches to the next available key.

## Features
✅ **Automatic Key Rotation** - Distributes requests across multiple keys
✅ **Rate Limit Detection** - Detects 429 errors and quota exhaustion
✅ **Fallback Mechanism** - Tries next available key when one is limited
✅ **Key Health Monitoring** - Track key status via admin dashboard
✅ **Smart Load Balancing** - Uses least recently used key

## Configuration

### Using Single API Key (Legacy)
```env
GEMINI_API_KEY=your-gemini-api-key
```

### Using Multiple API Keys (Recommended)
```env
# Comma-separated list of API keys
GEMINI_API_KEYS=key1,key2,key3,key4,key5

# Or keep both - GEMINI_API_KEYS takes precedence
GEMINI_API_KEY=fallback-key
GEMINI_MODEL=gemini-2.5-flash
```

## How It Works

### Key Rotation Logic
1. When AI request comes in, system gets next available key
2. Key is selected based on:
   - Not currently rate limited
   - Least recently used (for load balancing)
3. Request is made with the selected key
4. If 429 or quota error occurs, key is marked as limited for 60 seconds
5. System automatically switches to next key and retries

### Rate Limit Handling
- **429 Too Many Requests**: Detected automatically
- **Resource Exhausted**: Quota limit errors are caught
- **Automatic Recovery**: Limited keys recover after 60 seconds (configurable)
- **Fallback**: System tries all available keys before failing

### Error Types Handled
```
✓ resource_exhausted (quota limit)
✓ rate_limit (API rate limit)
✓ 429 (HTTP status)
✓ quota (quota errors)
✓ Other errors: Retried up to 3 times with exponential backoff
```

## Monitoring API Keys

### Check Key Status
**Endpoint**: `GET /api/v1/admin/gemini-keys`
**Auth**: Admin only

**Response**:
```json
{
  "success": true,
  "data": {
    "totalKeys": 5,
    "availableKeys": 4,
    "keys": [
      {
        "index": 0,
        "isLimited": false,
        "failureCount": 0,
        "lastUsedAt": 1716000000000,
        "masked": "key_0_active"
      },
      {
        "index": 1,
        "isLimited": true,
        "failureCount": 0,
        "lastUsedAt": 1716000010000,
        "masked": "key_1_limited"
      }
    ]
  }
}
```

## Key Status Fields
- **index**: Position in the key list (0-based)
- **isLimited**: Whether key is currently rate limited
- **failureCount**: Number of failures (non-quota errors)
- **lastUsedAt**: Unix timestamp of last use

## Optimization Tips

### 1. Optimal Number of Keys
- **Minimum**: 1 key (single key mode)
- **Recommended**: 2-5 keys
- **Best**: 5+ keys for high-traffic production

### 2. Key Quotas
Ensure each API key has:
- Daily quota: Min 100 requests/day per key
- RPM (Requests Per Minute): 60 RPM per key
- With 5 keys: ~300 requests/day effective

### 3. Load Balancing
System uses **least recently used (LRU)** algorithm:
- Distributes evenly across keys
- Prevents overloading a single key
- Maximizes total throughput

## Troubleshooting

### All Keys Limited
If all keys are rate limited:
1. Check API console quotas
2. Wait 60 seconds for automatic recovery
3. Or restart server to reset key states
4. Add more API keys to increase capacity

### Key Not Switching
Check logs for:
```
Key X marked as limited for 60000ms. Switching to next key.
No available API keys, using first key anyway.
```

### Quota Errors
Ensure you have:
- Sufficient daily quota on each key
- Billing enabled in Google Cloud
- Gemini API enabled for each key

## Environment Examples

### Development Setup (1 key)
```env
GEMINI_API_KEYS=dev-key-1
```

### Staging Setup (3 keys)
```env
GEMINI_API_KEYS=staging-key-1,staging-key-2,staging-key-3
```

### Production Setup (5+ keys)
```env
GEMINI_API_KEYS=prod-key-1,prod-key-2,prod-key-3,prod-key-4,prod-key-5
```

## Monitoring in Logs

Watch for:
```
Initialized 5 Gemini API key(s)
Key 1 marked as limited for 60000ms. Switching to next key.
Key 0 rate limit expired, resuming
AI generation failed after trying all available API keys
```

## API Reference

### GeminiKeyManager Class
```typescript
// Get next client for request
const { client, keyIndex } = await geminiKeyManager.getNextClient();

// Handle error and mark key limited if needed
await geminiKeyManager.handleError(keyIndex, error);

// Get current key statistics
const stats = geminiKeyManager.getKeyStats();

// Get count of available (non-limited) keys
const count = geminiKeyManager.getAvailableKeyCount();
```

## Roadmap
- [ ] Per-key quota tracking
- [ ] Key performance metrics dashboard
- [ ] Email alerts for all keys limited
- [ ] Weighted round-robin routing
- [ ] Redis-based rate limit sharing (multi-server)

---

**Last Updated**: May 17, 2026
**Version**: 1.0.0
