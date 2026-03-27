# Conversational AI Ecosystem — HubSpot + VAPI + n8n POC

POC for a multi-channel customer service system combining website chat, AI phone receptionist flows, and orchestration across HubSpot, Wastedge, ServiceM8, Signal, and Microsoft 365.

## What it demonstrates
- Shared conversation context across chat and voice channels
- Concrete integration request surfaces for HubSpot, Wastedge, ServiceM8, and Microsoft 365
- VAPI call scenario routing for 10 waste-management intents
- n8n-style workflow plan generation with endpoint-level steps for downstream systems
- Human handoff triggers and CRM logging

## Stack
- Node.js 20+
- Express

## Run
```bash
npm install
npm start
```

## Test
```bash
npm test
```

## Key endpoints
- `GET /health`
- `GET /integrations` list concrete downstream integration surfaces
- `POST /chat/session` create a cross-channel session
- `GET /chat/session/:id` inspect live shared context
- `POST /chat/message` handle Squarespace/HubSpot chat input
- `POST /voice/inbound` route a VAPI phone scenario
- `POST /workflow/plan` produce an n8n-friendly action plan
- `POST /integrations/hubspot/contact`
- `POST /integrations/wastedge/job`
- `POST /integrations/servicem8/work-order`
- `POST /integrations/m365/notify`
- `GET /scenarios` list supported waste-management intents
