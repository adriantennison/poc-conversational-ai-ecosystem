import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
process.env.OPENCLAW_TEST = '1';
import request from 'supertest';
const { app } = await import('./server.js');

test('chat workflow returns concrete integration requests', async () => {
  const session = await request(app)
    .post('/chat/session')
    .send({ channel: 'squarespace-chat', contact: { name: 'Wendy', company: 'NSW Waste', callbackPreference: 'phone' } })
    .expect(201);

  const reply = await request(app)
    .post('/chat/message')
    .send({ sessionId: session.body.id, message: 'Need pricing for a waste quote' })
    .expect(200);

  assert.equal(reply.body.intent, 'pricing');
  assert.equal(reply.body.workflowPlan.steps[0].request.endpoint, '/integrations/hubspot/contact');
  assert.equal(reply.body.outboundRequests[1].endpoint, '/integrations/wastedge/job');
});

test('integration endpoints accept payloads', async () => {
  const response = await request(app)
    .post('/integrations/servicem8/work-order')
    .send({ jobType: 'equipment_service', site: 'Depot 14' })
    .expect(200);

  assert.equal(response.body.system, 'ServiceM8');
  assert.equal(response.body.action, 'work_order_create');
});
