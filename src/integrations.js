import { config } from './config.js';
import { logger } from './logger.js';
import { logAudit } from './db.js';

const isLive = () => config.integrationMode === 'live';

/**
 * Make a real HTTP request or return a demo response.
 */
async function callExternal(system, url, method, body, headers = {}) {
  if (!isLive()) {
    logger.info(`[demo] ${system} ${method} ${url}`, { body });
    return { ok: true, mode: 'demo', system, received: body };
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    logger.info(`[live] ${system} ${res.status}`, { url, status: res.status });
    return { ok: res.ok, mode: 'live', system, status: res.status, data };
  } catch (err) {
    logger.error(`[live] ${system} request failed`, { url, error: err.message });
    return { ok: false, mode: 'live', system, error: err.message };
  }
}

export async function hubspotUpsertContact(contact, sessionId) {
  const url = `${config.hubspot.baseUrl}/crm/v3/objects/contacts`;
  const result = await callExternal('HubSpot', url, 'POST', {
    properties: {
      firstname: contact.name || '',
      company: contact.company || '',
      phone: contact.phone || '',
      hs_lead_status: 'NEW',
    },
  }, config.hubspot.apiKey ? { Authorization: `Bearer ${config.hubspot.apiKey}` } : {});

  logAudit(sessionId, 'integration_hubspot_contact', result);
  return result;
}

export async function wastedgeCreateJob(jobData, sessionId) {
  const url = `${config.wastedge.baseUrl}/api/jobs`;
  const result = await callExternal('Wastedge', url, 'POST', jobData,
    config.wastedge.apiKey ? { 'X-Api-Key': config.wastedge.apiKey } : {}
  );
  logAudit(sessionId, 'integration_wastedge_job', result);
  return result;
}

export async function servicem8CreateWorkOrder(workOrderData, sessionId) {
  const url = `${config.servicem8.baseUrl}/api_1.0/job.json`;
  const result = await callExternal('ServiceM8', url, 'POST', workOrderData,
    config.servicem8.apiKey ? { Authorization: `Bearer ${config.servicem8.apiKey}` } : {}
  );
  logAudit(sessionId, 'integration_servicem8_workorder', result);
  return result;
}

export async function m365SendNotification(notification, sessionId) {
  // In live mode this would hit the Microsoft Graph API
  const url = config.m365.tenantId
    ? `https://graph.microsoft.com/v1.0/users/me/sendMail`
    : '';
  const result = await callExternal('Microsoft 365', url || 'https://graph.microsoft.com/v1.0/users/me/sendMail', 'POST', {
    message: {
      subject: notification.subject || 'Operational Notification',
      body: { contentType: 'Text', content: notification.body || '' },
      toRecipients: [{ emailAddress: { address: notification.to || 'ops@example.com' } }],
    },
  }, config.m365.clientSecret ? { Authorization: `Bearer ${config.m365.clientSecret}` } : {});
  logAudit(sessionId, 'integration_m365_notify', result);
  return result;
}

export const integrationCatalog = {
  hubspot: { endpoint: '/integrations/hubspot/contact', purpose: 'Upsert contact + CRM timeline event', handler: hubspotUpsertContact },
  wastedge: { endpoint: '/integrations/wastedge/job', purpose: 'Create/track waste collection job', handler: wastedgeCreateJob },
  servicem8: { endpoint: '/integrations/servicem8/work-order', purpose: 'Create field service follow-up', handler: servicem8CreateWorkOrder },
  m365: { endpoint: '/integrations/m365/notify', purpose: 'Send internal mailbox/calendar notification', handler: m365SendNotification },
};
