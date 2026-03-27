import express from "express";

export const app = express();
app.use(express.json());

const sessions = new Map();
const scenarios = [
  "missed_collection",
  "equipment_service",
  "accounts",
  "on_call_pickups",
  "extra_pickups",
  "new_customers",
  "pricing",
  "supply_orders",
  "abandoned_bins",
  "public_enquiries"
];

const integrationCatalog = {
  hubspot: { endpoint: "/integrations/hubspot/contact", purpose: "Upsert contact + CRM timeline event" },
  wastedge: { endpoint: "/integrations/wastedge/job", purpose: "Create/track waste collection job" },
  servicem8: { endpoint: "/integrations/servicem8/work-order", purpose: "Create field service follow-up" },
  m365: { endpoint: "/integrations/m365/notify", purpose: "Send internal mailbox/calendar notification" },
};

function resolveIntent(text = "") {
  const lower = text.toLowerCase();
  return scenarios.find((scenario) => lower.includes(scenario.replaceAll("_", " ")))
    || (lower.includes("pickup") ? "extra_pickups" : lower.includes("price") || lower.includes("quote") ? "pricing" : "public_enquiries");
}

function buildWorkflowPlan(intent, contact = {}) {
  return {
    orchestrator: "n8n",
    intent,
    steps: [
      { order: 1, node: "hubspot-contact-upsert", request: { endpoint: integrationCatalog.hubspot.endpoint, method: "POST" } },
      { order: 2, node: "intent-router", request: { endpoint: "/workflow/plan", method: "POST" } },
      { order: 3, node: "wastedge-sync", request: { endpoint: integrationCatalog.wastedge.endpoint, method: "POST" } },
      { order: 4, node: "servicem8-or-m365", request: { endpoint: integrationCatalog.servicem8.endpoint, method: "POST" } },
    ],
    sharedContext: {
      customer: contact.name || "Unknown customer",
      company: contact.company || "Unknown company",
      callbackPreference: contact.callbackPreference || "phone",
    },
  };
}

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'conversational-ai-ecosystem', channels: ['chat', 'voice'] }));
app.get('/scenarios', (_req, res) => res.json({ scenarios }));
app.get('/integrations', (_req, res) => res.json({ integrations: integrationCatalog }));

app.post('/chat/session', (req, res) => {
  const sessionId = `sess_${Date.now()}`;
  const session = {
    id: sessionId,
    channel: req.body.channel || 'hubspot-chat',
    contact: req.body.contact || {},
    transcript: [],
    createdAt: new Date().toISOString(),
  };
  sessions.set(sessionId, session);
  res.status(201).json(session);
});

app.get('/chat/session/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });
  res.json(session);
});

app.post('/chat/message', (req, res) => {
  const session = sessions.get(req.body.sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });

  const intent = resolveIntent(req.body.message || '');
  const handoff = ['accounts', 'equipment_service'].includes(intent);
  const reply = handoff
    ? 'I can capture this in HubSpot and route it to operations with a human handoff ticket.'
    : 'I can capture the request, update HubSpot, and prepare the operational workflow.';

  session.transcript.push({ role: 'user', text: req.body.message, at: new Date().toISOString() });
  session.transcript.push({ role: 'assistant', text: reply, at: new Date().toISOString() });

  res.json({
    intent,
    handoff,
    reply,
    workflowPlan: buildWorkflowPlan(intent, session.contact),
    outboundRequests: [
      { system: 'HubSpot', endpoint: integrationCatalog.hubspot.endpoint, method: 'POST' },
      { system: 'Wastedge', endpoint: integrationCatalog.wastedge.endpoint, method: 'POST' },
    ],
  });
});

app.post('/voice/inbound', (req, res) => {
  const scenario = scenarios.includes(req.body.scenario) ? req.body.scenario : 'public_enquiries';
  res.json({
    provider: 'VAPI',
    scenario,
    greeting: `Welcome to the waste operations desk. I can assist with ${scenario.replaceAll('_', ' ')}.`,
    escalationRoute: scenario === 'accounts' ? 'finance-team' : 'operations-team',
    outboundRequests: [
      { system: 'HubSpot', endpoint: integrationCatalog.hubspot.endpoint, method: 'POST' },
      { system: 'Microsoft 365', endpoint: integrationCatalog.m365.endpoint, method: 'POST' },
    ],
  });
});

app.post('/workflow/plan', (req, res) => {
  const intent = req.body.intent || 'public_enquiries';
  res.json(buildWorkflowPlan(intent, req.body.contact || {}));
});

app.post('/integrations/hubspot/contact', (req, res) => {
  res.json({ ok: true, system: 'HubSpot', action: 'contact_upsert', received: req.body });
});

app.post('/integrations/wastedge/job', (req, res) => {
  res.json({ ok: true, system: 'Wastedge', action: 'job_create', received: req.body });
});

app.post('/integrations/servicem8/work-order', (req, res) => {
  res.json({ ok: true, system: 'ServiceM8', action: 'work_order_create', received: req.body });
});

app.post('/integrations/m365/notify', (req, res) => {
  res.json({ ok: true, system: 'Microsoft 365', action: 'notification_queue', received: req.body });
});

if (!process.env.OPENCLAW_TEST) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Conversational AI ecosystem listening on ${port}`));
}
