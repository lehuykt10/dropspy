// api/ebay.js — eBay Finding API proxy
// Runs on Vercel server → no CORS issues

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keywords, appId } = req.query;
  if (!keywords) return res.status(400).json({ error: 'keywords required' });
  if (!appId)    return res.status(400).json({ error: 'appId required' });

  try {
    const results = await searchEbay(keywords, appId);
    res.status(200).json({ success: true, listings: results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function searchEbay(keywords, appId) {
  // Clean keywords: max 6 words, no special chars
  const clean = keywords
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');

  // eBay Finding API — findItemsByKeywords
  const url = new URL('https://svcs.ebay.com/services/search/FindingService/v1');
  url.searchParams.set('OPERATION-NAME',        'findItemsByKeywords');
  url.searchParams.set('SERVICE-VERSION',       '1.0.0');
  url.searchParams.set('SECURITY-APPNAME',      appId);
  url.searchParams.set('RESPONSE-DATA-FORMAT',  'JSON');
  url.searchParams.set('keywords',              clean);
  url.searchParams.set('paginationInput.entriesPerPage', '12');
  url.searchParams.set('itemFilter(0).name',    'ListingType');
  url.searchParams.set('itemFilter(0).value',   'FixedPrice');
  url.searchParams.set('itemFilter(1).name',    'Condition');
  url.searchParams.set('itemFilter(1).value',   'New');
  url.searchParams.set('sortOrder',             'BestMatch');
  url.searchParams.set('outputSelector(0)',     'SellerInfo');
  url.searchParams.set('outputSelector(1)',     'StoreInfo');

  const fetchFn = (await import('node-fetch')).default;
  const r = await fetchFn(url.toString(), {
    headers: { 'User-Agent': 'DropSpy/1.0' },
    signal: AbortSignal.timeout(8000)
  });

  if (!r.ok) throw new Error('eBay API error: ' + r.status);

  const data = await r.json();
  const root = data?.findItemsByKeywordsResponse?.[0];

  if (root?.ack?.[0] === 'Failure') {
    const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'eBay API failure';
    throw new Error(errMsg);
  }

  const items = root?.searchResult?.[0]?.item || [];

  return items.map(item => {
    const price   = parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 0);
    const shipping = parseFloat(item?.shippingInfo?.[0]?.shippingServiceCost?.[0]?.['__value__'] || 0);
    const sold    = item?.listingInfo?.[0]?.watchCount?.[0] || '';
    const imgUrl  = item?.galleryURL?.[0] || '';
    const viewUrl = item?.viewItemURL?.[0] || '';
    const title   = item?.title?.[0] || '';
    const itemId  = item?.itemId?.[0] || '';
    const condition = item?.condition?.[0]?.conditionDisplayName?.[0] || 'New';
    const topRated  = item?.topRatedListing?.[0] === 'true';
    const sellerId  = item?.sellerInfo?.[0]?.sellerUserName?.[0] || '';
    const feedback  = item?.sellerInfo?.[0]?.feedbackScore?.[0] || '';
    const fbPct     = item?.sellerInfo?.[0]?.positiveFeedbackPercent?.[0] || '';

    return {
      itemId,
      title,
      price: parseFloat(price.toFixed(2)),
      shipping: parseFloat(shipping.toFixed(2)),
      totalPrice: parseFloat((price + shipping).toFixed(2)),
      imageUrl: imgUrl.replace('s-l140', 's-l300'),
      url: viewUrl,
      condition,
      topRated,
      sellerId,
      feedbackScore: feedback,
      feedbackPct: fbPct,
      watchCount: sold,
      estimated: false
    };
  }).filter(i => i.price > 0);
}
