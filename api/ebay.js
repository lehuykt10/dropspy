// api/ebay.js — eBay Finding API (supports both Sandbox + Production)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keywords, appId } = req.query;
  if (!keywords) return res.status(400).json({ error: 'keywords required' });
  if (!appId)    return res.status(400).json({ error: 'appId required' });

  // Auto-detect Sandbox vs Production from App ID
  const isSandbox = appId.includes('-SBX-');
  const endpoint  = isSandbox
    ? 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1'
    : 'https://svcs.ebay.com/services/search/FindingService/v1';

  try {
    const results = await searchEbay(keywords, appId, endpoint);
    res.status(200).json({ success: true, listings: results, sandbox: isSandbox });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function searchEbay(keywords, appId, endpoint) {
  const clean = keywords
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');

  const url = new URL(endpoint);
  url.searchParams.set('OPERATION-NAME',               'findItemsByKeywords');
  url.searchParams.set('SERVICE-VERSION',              '1.0.0');
  url.searchParams.set('SECURITY-APPNAME',             appId);
  url.searchParams.set('RESPONSE-DATA-FORMAT',         'JSON');
  url.searchParams.set('keywords',                     clean);
  url.searchParams.set('paginationInput.entriesPerPage','12');
  url.searchParams.set('itemFilter(0).name',           'ListingType');
  url.searchParams.set('itemFilter(0).value',          'FixedPrice');
  url.searchParams.set('sortOrder',                    'BestMatch');
  url.searchParams.set('outputSelector(0)',            'SellerInfo');

  const fetchFn = (await import('node-fetch')).default;
  const r = await fetchFn(url.toString(), {
    headers: { 'User-Agent': 'DropSpy/1.0' },
    signal: AbortSignal.timeout(10000)
  });

  if (!r.ok) throw new Error('eBay API HTTP error: ' + r.status);

  const data = await r.json();
  const root = data?.findItemsByKeywordsResponse?.[0];

  if (root?.ack?.[0] === 'Failure') {
    const msg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay API failure';
    throw new Error(msg);
  }

  const items = root?.searchResult?.[0]?.item || [];

  if (items.length === 0) {
    // Sandbox trả về ít data — thông báo rõ
    throw new Error('NO_RESULTS');
  }

  return items.map(item => {
    const price    = parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 0);
    const shipping = parseFloat(item?.shippingInfo?.[0]?.shippingServiceCost?.[0]?.['__value__'] || 0);
    const imgUrl   = item?.galleryURL?.[0] || '';
    const viewUrl  = item?.viewItemURL?.[0] || '';
    const title    = item?.title?.[0] || '';
    const itemId   = item?.itemId?.[0] || '';
    const topRated = item?.topRatedListing?.[0] === 'true';
    const fbPct    = item?.sellerInfo?.[0]?.positiveFeedbackPercent?.[0] || '';
    const fbScore  = item?.sellerInfo?.[0]?.feedbackScore?.[0] || '';

    return {
      itemId,
      title,
      price:       parseFloat(price.toFixed(2)),
      shipping:    parseFloat(shipping.toFixed(2)),
      totalPrice:  parseFloat((price + shipping).toFixed(2)),
      imageUrl:    imgUrl.replace('s-l140', 's-l300'),
      url:         viewUrl,
      topRated,
      feedbackPct: fbPct,
      feedbackScore: fbScore,
      estimated:   false
    };
  }).filter(i => i.price > 0);
}
