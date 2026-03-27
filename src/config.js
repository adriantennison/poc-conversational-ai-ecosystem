import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiKey: process.env.API_KEY || '',
  integrationMode: process.env.INTEGRATION_MODE || 'demo',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  logLevel: process.env.LOG_LEVEL || 'info',

  hubspot: {
    baseUrl: process.env.HUBSPOT_BASE_URL || 'https://api.hubapi.com',
    apiKey: process.env.HUBSPOT_API_KEY || '',
  },
  wastedge: {
    baseUrl: process.env.WASTEDGE_BASE_URL || '',
    apiKey: process.env.WASTEDGE_API_KEY || '',
  },
  servicem8: {
    baseUrl: process.env.SERVICEM8_BASE_URL || '',
    apiKey: process.env.SERVICEM8_API_KEY || '',
  },
  m365: {
    tenantId: process.env.M365_TENANT_ID || '',
    clientId: process.env.M365_CLIENT_ID || '',
    clientSecret: process.env.M365_CLIENT_SECRET || '',
  },
};
