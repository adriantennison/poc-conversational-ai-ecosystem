# Conversational AI Ecosystem

Multi-channel customer service platform combining website chat, AI phone receptionist (VAPI), and orchestration across HubSpot, Wastedge, ServiceM8, and Microsoft 365.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  HubSpot    │     │  VAPI Voice  │     │  Squarespace     │
│  Chat       │     │  Calls       │     │  Chat Widget     │
└──────┬──────┘     └──────┬───────┘     └──────┬───────────┘
       │                   │                     │
       └───────────────────┼─────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Express   │
                    │   Server    │
                    │  (this app) │
                    └──────┬──────┘
                           │
       ┌───────────┬───────┼───────┬──────────────┐
       │           │       │       │              │
  ┌────▼────┐ ┌───▼────┐ ┌▼─────┐ ┌▼──────────┐ ┌▼───────┐
  │ HubSpot │ │Wastedge│ │ SM8  │ │ M365      │ │ SQLite │
  │ CRM     │ │ Jobs   │ │ Work │ │ Notify    │ │Sessions│
  └─────────┘ └────────┘ └──────┘ └───────────┘ └────────┘
```

## Features

- **Shared cross-channel context**: Chat and voice sessions share the same SQLite-backed transcript store
- **AI intent classification**: OpenAI-powered intent resolution with keyword fallback
- **4 concrete integration surfaces**: HubSpot CRM, Wastedge job management, ServiceM8 field service, Microsoft 365 notifications
- **Dual integration modes**: `demo` (simulated responses) and `live` (real HTTP calls to external APIs)
- **10 waste-management call scenarios** with intent routing
- **n8n-compatible workflow plans** with endpoint-level orchestration steps
- **API key authentication** on all operational endpoints
- **Structured JSON logging** for all requests, integrations, and audit events
- **Persistent audit trail** in SQLite

## Integration Modes

| Mode | Behaviour |
|------|-----------|
| `demo` | All integration endpoints return simulated success responses. No external HTTP calls. Safe for development and demos. |
| `live` | Real HTTP requests to configured external APIs (HubSpot, Wastedge, ServiceM8, M365). Falls back gracefully on errors with structured error responses. |

Set via `INTEGRATION_MODE` environment variable.

## Stack

- Node.js 20+
- Express 4
- better-sqlite3 (session persistence + audit log)
- OpenAI API (optional — AI intent classification)
- dotenv (configuration)

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Run in development
npm run dev

# Run tests
npm test

# Production
npm start
```

## Docker

```bash
docker build -t conversational-ai-ecosystem .
docker run -p 3000:3000 --env-file .env conversational-ai-ecosystem
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `API_KEY` | Recommended | — | API key for `x-api-key` auth header. If unset, auth is bypassed. |
| `INTEGRATION_MODE` | No | `demo` | `demo` or `live` |
| `OPENAI_API_KEY` | No | — | Enables AI intent classification |
| `HUBSPOT_BASE_URL` | No | `https://api.hubapi.com` | HubSpot API base |
| `HUBSPOT_API_KEY` | No | — | HubSpot bearer token |
| `WASTEDGE_BASE_URL` | No | — | Wastedge API base |
| `WASTEDGE_API_KEY` | No | — | Wastedge API key |
| `SERVICEM8_BASE_URL` | No | — | ServiceM8 API base |
| `SERVICEM8_API_KEY` | No | — | ServiceM8 bearer token |
| `M365_TENANT_ID` | No | — | Azure AD tenant ID |
| `M365_CLIENT_ID` | No | — | Azure AD app client ID |
| `M365_CLIENT_SECRET` | No | — | Azure AD app client secret |
| `LOG_LEVEL` | No | `info` | `error`, `warn`, `info`, `debug` |
| `DB_PATH` | No | `sessions.db` | SQLite database path |

## API Endpoints

### Health & Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Service health check |
| `GET` | `/scenarios` | Yes | List 10 waste-management intents |
| `GET` | `/integrations` | Yes | List integration catalog with current mode |

### Chat

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/chat/session` | Yes | Create a new cross-channel session |
| `GET` | `/chat/session/:id` | Yes | Retrieve session with full transcript |
| `POST` | `/chat/message` | Yes | Send a message — resolves intent, returns workflow plan |

**POST /chat/message** request:
```json
{
  "sessionId": "sess_1234_abc",
  "message": "I need pricing for extra pickups at Depot 14"
}
```

Response includes `intent`, `classificationMethod` (`ai` or `keyword`), `handoff` flag, `workflowPlan`, and `outboundRequests`.

### Voice

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/voice/inbound` | Yes | Handle VAPI inbound call — creates/attaches to shared session |

Accepts optional `sessionId` to attach voice call to an existing chat session for true cross-channel context.

### Workflow

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/workflow/plan` | Yes | Generate an n8n-compatible workflow plan |

### Integration Surfaces

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/integrations/hubspot/contact` | Yes | Upsert CRM contact |
| `POST` | `/integrations/wastedge/job` | Yes | Create waste collection job |
| `POST` | `/integrations/servicem8/work-order` | Yes | Create field service work order |
| `POST` | `/integrations/m365/notify` | Yes | Send M365 notification |

All integration endpoints make real HTTP requests in `live` mode and return simulated responses in `demo` mode. Every call is logged to the audit trail.

## Authentication

Set `API_KEY` in your environment. All operational endpoints require the `x-api-key` header:

```bash
curl -H "x-api-key: your-key" http://localhost:3000/scenarios
```

The `/health` endpoint is always unauthenticated for load balancer health checks.

## Testing

```bash
npm test
```

Tests run against an in-memory SQLite database. 12+ test cases cover:
- Session persistence and retrieval
- Chat message intent resolution
- Transcript storage
- Voice-to-session context sharing
- Integration endpoints (demo mode)
- Workflow plan generation
- Input validation and error handling

## Limitations (Acknowledged Scope)

- **Demo mode integrations**: External API calls are simulated in demo mode. Switch to `live` with valid API keys for production use.
- **AI classification**: Requires `OPENAI_API_KEY`. Falls back to keyword matching if unavailable.
- **Session merge**: Voice can attach to an existing chat session by ID. Automatic phone-number-based merge is not yet implemented.
- **Rate limiting**: Not included — use a reverse proxy (nginx, AWS ALB) in production.

## License

Proprietary — Neo Claw Ltd.
