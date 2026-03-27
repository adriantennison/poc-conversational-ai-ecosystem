import { config } from './config.js';
import { logger } from './logger.js';

export const scenarios = [
  'missed_collection',
  'equipment_service',
  'accounts',
  'on_call_pickups',
  'extra_pickups',
  'new_customers',
  'pricing',
  'supply_orders',
  'abandoned_bins',
  'public_enquiries',
];

/**
 * Keyword-based intent resolution (fallback).
 */
function resolveKeyword(text) {
  const lower = text.toLowerCase();
  return (
    scenarios.find((s) => lower.includes(s.replaceAll('_', ' '))) ||
    (lower.includes('pickup') ? 'extra_pickups'
      : lower.includes('price') || lower.includes('quote') ? 'pricing'
      : 'public_enquiries')
  );
}

/**
 * AI-powered intent classification using OpenAI.
 * Falls back to keyword if API is unavailable.
 */
async function resolveWithAI(text) {
  if (!config.openaiApiKey) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 50,
        messages: [
          {
            role: 'system',
            content: `You are an intent classifier for a waste management company. Classify the customer message into exactly one of these intents: ${scenarios.join(', ')}. Respond with ONLY the intent name, nothing else.`,
          },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn('OpenAI intent classification failed', { status: res.status });
      return null;
    }

    const data = await res.json();
    const classified = data.choices?.[0]?.message?.content?.trim();
    if (scenarios.includes(classified)) {
      logger.info('AI intent classified', { text: text.slice(0, 80), intent: classified });
      return classified;
    }
    logger.warn('AI returned unknown intent', { classified });
    return null;
  } catch (err) {
    logger.warn('OpenAI intent call failed, falling back to keyword', { error: err.message });
    return null;
  }
}

/**
 * Resolve intent — tries AI first, falls back to keyword matching.
 */
export async function resolveIntent(text = '') {
  const aiResult = await resolveWithAI(text);
  if (aiResult) return { intent: aiResult, method: 'ai' };
  return { intent: resolveKeyword(text), method: 'keyword' };
}
