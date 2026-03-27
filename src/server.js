import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { authMiddleware } from './auth.js';
import { createSession, getSession, appendMessage, logAudit, closeDb } from './db.js';
import { integrationCatalog, hubspotUpsertContact, wastedgeCreateJob, servicem8CreateWorkOrder, m365SendNotification } from './integrations.js';
import { resolveIntent, scenarios } from './intent.js';

export const app = express();
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  logger.info('request', { method: req.method, path: req.path, ip: req.ip });
  next();
});

// Auth on all operational endpoints
app.use(authMiddleware);

// ── Health ──────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({
    status: 'healthy',
    service: 'conversational-ai-ecosystem',
    version: '2.0.0',
    channels: ['chat', 'voice'],
    integrationMode: config.integrationMode,
  })
);

// ── Reference data ─────────────────────────────────────────────
app.get('/scenarios', (_req, res) => res.json({ scenarios }));

app.get('/integrations', (_req, res) => {
  const catalog = {};
  for (const [key, val] of Object.entries(integrationCatalog)) {
    catalog[key] = { endpoint: val.endpoint, purpose: val.purpose };
  }
  res.json({ integrations: catalog, mode: config.integrationMode });
});

// ── Chat sessions (persistent) ─────────────────────────────────
app.post('/chat/session', (req, res) => {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const channel = req.body.channel || 'hubspot-chat';
  const contact = req.body.contact || {};
  const session = createSession(sessionId, channel, contact);
  logAudit(sessionId, 'session_created', { channel, contact });
  logger.info('Session created', { sessionId, channel });
  res.status(201).json(session);
});

app.get('/chat/session/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'session_not_found' });
  res.json(session);
});

// ── Chat message handling ──────────────────────────────────────
app.post('/chat/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'bad_request', message: 'sessionId and message are required' });
    }

    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'session_not_found' });

    const { intent, method: classificationMethod } = await resolveIntent(message);
    const handoff = ['accounts', 'equipment_service'].includes(intent);

    const reply = handoff
      ? 'I can capture this in HubSpot and route it to operations with a human handoff ticket.'
      : 'I can capture the request, update HubSpot, and prepare the operational workflow.';

    appendMessage(sessionId, 'user', message);
    appendMessage(sessionId, 'assistant', reply);
    logAudit(sessionId, 'chat_message', { intent, classificationMethod, handoff });

    const workflowPlan = buildWorkflowPlan(intent, session.contact);

    res.json({
      intent,
      classificationMethod,
      handoff,
      reply,
      workflowPlan,
      outboundRequests: [
        { system: 'HubSpot', endpoint: integrationCatalog.hubspot.endpoint, method: 'POST' },
        { system: 'Wastedge', endpoint: integrationCatalog.wastedge.endpoint, method: 'POST' },
      ],
    });
  } catch (err) {
    logger.error('Chat message error', { error: err.message });
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── Voice inbound (writes to session for shared context) ───────
app.post('/voice/inbound', (req, res) => {
  const scenario = scenarios.includes(req.body.scenario) ? req.body.scenario : 'public_enquiries';
  const callerInfo = req.body.caller || {};

  // Create or attach to a session for cross-channel context
  let sessionId = req.body.sessionId;
  let session;
  if (sessionId) {
    session = getSession(sessionId);
  }
  if (!session) {
    sessionId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    session = createSession(sessionId, 'vapi-voice', callerInfo);
  }

  const greeting = `Welcome to the waste operations desk. I can assist with ${scenario.replaceAll('_', ' ')}.`;

  // Write voice interaction back to shared session
  appendMessage(sessionId, 'system', `Voice call: scenario=${scenario}`);
  appendMessage(sessionId, 'assistant', greeting);
  logAudit(sessionId, 'voice_inbound', { scenario, caller: callerInfo });

  res.json({
    provider: 'VAPI',
    sessionId,
    scenario,
    greeting,
    escalationRoute: scenario === 'accounts' ? 'finance-team' : 'operations-team',
    sharedContext: {
      sessionId,
      channel: 'voice',
      transcriptAvailableAt: `/chat/session/${sessionId}`,
    },
    outboundRequests: [
      { system: 'HubSpot', endpoint: integrationCatalog.hubspot.endpoint, method: 'POST' },
      { system: 'Microsoft 365', endpoint: integrationCatalog.m365.endpoint, method: 'POST' },
    ],
  });
});

// ── Workflow plan builder ──────────────────────────────────────
function buildWorkflowPlan(intent, contact = {}) {
  return {
    orchestrator: 'n8n',
    intent,
    steps: [
      { order: 1, node: 'hubspot-contact-upsert', request: { endpoint: integrationCatalog.hubspot.endpoint, method: 'POST' } },
      { order: 2, node: 'intent-router', request: { endpoint: '/workflow/plan', method: 'POST' } },
      { order: 3, node: 'wastedge-sync', request: { endpoint: integrationCatalog.wastedge.endpoint, method: 'POST' } },
      { order: 4, node: 'servicem8-or-m365', request: { endpoint: integrationCatalog.servicem8.endpoint, method: 'POST' } },
    ],
    sharedContext: {
      customer: contact.name || 'Unknown customer',
      company: contact.company || 'Unknown company',
      callbackPreference: contact.callbackPreference || 'phone',
    },
  };
}

app.post('/workflow/plan', (req, res) => {
  const intent = req.body.intent || 'public_enquiries';
  res.json(buildWorkflowPlan(intent, req.body.contact || {}));
});

// ── Integration endpoints (real HTTP in live mode) ─────────────
app.post('/integrations/hubspot/contact', async (req, res) => {
  try {
    const result = await hubspotUpsertContact(req.body, req.body._sessionId);
    res.json(result);
  } catch (err) {
    logger.error('HubSpot integration error', { error: err.message });
    res.status(502).json({ ok: false, system: 'HubSpot', error: err.message });
  }
});

app.post('/integrations/wastedge/job', async (req, res) => {
  try {
    const result = await wastedgeCreateJob(req.body, req.body._sessionId);
    res.json(result);
  } catch (err) {
    logger.error('Wastedge integration error', { error: err.message });
    res.status(502).json({ ok: false, system: 'Wastedge', error: err.message });
  }
});

app.post('/integrations/servicem8/work-order', async (req, res) => {
  try {
    const result = await servicem8CreateWorkOrder(req.body, req.body._sessionId);
    res.json(result);
  } catch (err) {
    logger.error('ServiceM8 integration error', { error: err.message });
    res.status(502).json({ ok: false, system: 'ServiceM8', error: err.message });
  }
});

app.post('/integrations/m365/notify', async (req, res) => {
  try {
    const result = await m365SendNotification(req.body, req.body._sessionId);
    res.json(result);
  } catch (err) {
    logger.error('M365 integration error', { error: err.message });
    res.status(502).json({ ok: false, system: 'Microsoft 365', error: err.message });
  }
});

// ── Error handler ──────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'internal_error' });
});

// ── Start server ───────────────────────────────────────────────
if (!process.env.OPENCLAW_TEST) {
  const server = app.listen(config.port, () =>
    logger.info(`Conversational AI ecosystem listening on ${config.port}`, { mode: config.integrationMode })
  );

  const shutdown = () => {
    logger.info('Shutting down...');
    closeDb();
    server.close();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
