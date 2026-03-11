// api/analyze.js — Claude AI deep dropship analysis

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { amazon, ebayListings, profit, anthropicKey } = req.body || {};
  if (!anthropicKey) return res.status(400).json({ error: 'anthropicKey required' });

  try {
    const analysis = await analyzeProduct(amazon, ebayListings, profit, anthropicKey);
    res.status(200).json({ success: true, analysis });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function analyzeProduct(amazon, ebayListings, profit, apiKey) {
  const fetchFn = (await import('node-fetch')).default;

  const topListings = (ebayListings || []).slice(0, 6).map(e =>
    `• "${ e.title.substring(0,55)}" → $${e.price} + $${e.shipping} ship | ${e.topRated ? 'Top Rated' : 'Standard'} seller`
  ).join('\n');

  const avgPrice    = profit.avgEbayPrice || 0;
  const amazonPrice = profit.amazonPrice  || 0;

  const prompt = `You are an expert Amazon-to-eBay dropshipper with 10 years experience analyzing 1000s of products.

=== AMAZON SOURCE PRODUCT ===
ASIN: ${amazon?.asin}
Title: ${amazon?.title}
Brand: ${amazon?.brand}
Price: $${amazonPrice}
Rating: ${amazon?.rating}/5 stars
Reviews: ${amazon?.reviewCount?.toLocaleString()}
BSR Rank: #${amazon?.bsr?.toLocaleString()} in ${amazon?.bsrCategory}
Category: ${amazon?.category}
Est. Monthly Sales: ${amazon?.monthlyUnits} units
Keywords: ${(amazon?.searchKeywords || []).join(', ')}
AI Data Confidence: ${amazon?.confidence}

=== PROFIT ANALYSIS ===
Cost (Amazon): $${amazonPrice.toFixed(2)}
Avg eBay sell price: $${avgPrice.toFixed(2)}
eBay fees (13.25%): $${profit.ebayFee?.toFixed(2)}
Payment fees (2.9%): $${profit.paymentFee?.toFixed(2)}
Net profit/unit: $${profit.profit?.toFixed(2)}
Profit margin: ${profit.margin?.toFixed(1)}%
ROI: ${profit.roi?.toFixed(1)}%

=== eBay COMPETITION (${ebayListings?.length} active listings) ===
${topListings || 'No listings found'}
Price range: $${profit.minEbayPrice?.toFixed(2)} - $${profit.maxEbayPrice?.toFixed(2)}

=== YOUR ANALYSIS ===
Respond in this exact format with emoji headers:

🎯 VERDICT
[WIN PRODUCT / RISKY / SKIP] — [One clear sentence why]

📊 MARKET DEMAND
[2 sentences: is there demand? competition level?]

💰 PROFIT SUSTAINABILITY  
[2 sentences: is margin sustainable? volume needed to make it worth it?]

⚠️ TOP RISKS
• [Risk 1]
• [Risk 2]
• [Risk 3]

✅ ACTION PLAN
[3 specific steps: what to list, at what price, what to watch]

📈 SCALE POTENTIAL
[1 sentence: monthly profit estimate if doing 20-50 units/month]

Keep total response under 280 words. Be direct, data-driven, no fluff.`;

  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(20000)
  });

  if (!r.ok) {
    const err = await r.json();
    throw new Error(err.error?.message || 'Claude API error ' + r.status);
  }

  const data = await r.json();
  return data.content?.[0]?.text?.trim() || 'Analysis unavailable.';
}
