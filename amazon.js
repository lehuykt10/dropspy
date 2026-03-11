// api/amazon.js — Amazon product data via Claude AI
// Claude AI estimates product data from ASIN

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { asin, anthropicKey } = req.body || {};
  if (!asin)         return res.status(400).json({ error: 'asin required' });
  if (!anthropicKey) return res.status(400).json({ error: 'anthropicKey required' });

  try {
    const product = await getAmazonViaAI(asin, anthropicKey);
    res.status(200).json({ success: true, product });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function getAmazonViaAI(asin, apiKey) {
  const fetchFn = (await import('node-fetch')).default;

  const prompt = `You are a product database API for Amazon.com.

For Amazon ASIN: ${asin}

Return a JSON object with estimated product data. Use your training knowledge. If you don't know the exact product, estimate based on the ASIN pattern and typical products.

Return ONLY valid JSON with no other text, no markdown, no explanation:
{
  "asin": "${asin}",
  "title": "full product title as it appears on Amazon",
  "brand": "brand name",
  "price": 29.99,
  "rating": 4.5,
  "reviewCount": 1250,
  "bsr": 1250,
  "bsrCategory": "Health & Household",
  "category": "Health & Household > Vitamins & Dietary Supplements",
  "monthlyUnits": "500-1000",
  "isPrime": true,
  "dimensions": "6 x 4 x 2 inches",
  "weight": "0.5 pounds",
  "keyFeatures": ["key feature 1", "key feature 2", "key feature 3"],
  "searchKeywords": ["main keyword", "keyword 2", "keyword 3", "keyword 4"],
  "imageUrl": "",
  "url": "https://www.amazon.com/dp/${asin}",
  "confidence": "high/medium/low"
}`;

  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.error?.message || 'Claude API error ' + r.status);
  }

  const data = await r.json();
  const text = data.content?.[0]?.text?.trim() || '';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('Could not parse AI response. Check Anthropic API key.');
  }
}
