import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const NUSCALE_CIK = '0001821806';

async function askClaude(prompt, maxTokens = 600) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function askClaudeJSON(prompt) {
  const text = await askClaude(prompt + '\n\nRespond ONLY with valid JSON, no markdown.', 800);
  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
  }
}

async function fetchAndStoreSECFilings() {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${NUSCALE_CIK}.json`,
    { headers: { 'User-Agent': 'NuScale-Analyzer contact@example.com' } });
  if (!res.ok) throw new Error('SEC API error');
  const data = await res.json();
  const recent = data.filings.recent;
  let count = 0;
  for (let i = 0; i < Math.min(recent.form.length, 20); i++) {
    const formType = recent.form[i];
    if (!['10-K','10-Q','8-K'].includes(formType)) continue;
    const accession = recent.accessionNumber[i];
    const { data: existing } = await supabase.from('sec_filings').select('id').eq('accession_number', accession).single();
    if (existing) continue;
    const summary = await askClaude(`Analyze this NuScale SEC filing: Type: ${formType} | Date: ${recent.filingDate[i]}. 2-3 sentence investor summary. End with: sentiment: bullish/neutral/bearish`);
    const sentiment = summary.toLowerCase().includes('bullish') ? 'bullish' : summary.toLowerCase().includes('bearish') ? 'bearish' : 'neutral';
    await supabase.from('sec_filings').insert({ form_type: formType, filed_date: recent.filingDate[i], accession_number: accession, description: recent.primaryDocument[i], url: `https://www.sec.gov/Archives/edgar/data/1821806/${accession.replace(/-/g,'')}/${recent.primaryDocument[i]}`, ai_summary: summary, sentiment });
    count++;
  }
  return count;
}

async function fetchAndStoreMacroData() {
  const data = await askClaudeJSON(`Current approximate market values: US 10-Year Treasury yield, Fed Funds Rate, USD/KRW rate, WTI Oil USD/barrel, US CPI%. Return JSON: {"ten_year_yield":4.5,"fed_funds_rate":5.25,"usd_krw":1460,"wti_oil":78,"cpi":3.1}`);
  if (!data) return 0;
  const metrics = [
    { metric: 'US 10-Year Treasury Yield', value: data.ten_year_yield, unit: '%', source: 'Claude AI' },
    { metric: 'Federal Funds Rate', value: data.fed_funds_rate, unit: '%', source: 'Claude AI' },
    { metric: 'USD/KRW Exchange Rate', value: data.usd_krw, unit: 'KRW', source: 'Claude AI' },
    { metric: 'WTI Oil Price', value: data.wti_oil, unit: 'USD/barrel', source: 'Claude AI' },
    { metric: 'US CPI Inflation', value: data.cpi, unit: '%', source: 'Claude AI' }
  ];
  let count = 0;
  for (const m of metrics) { const { error } = await supabase.from('macro_data').insert(m); if (!error) count++; }
  return count;
}

async function fetchAndStoreCatalysts() {
  const data = await askClaudeJSON(`Top 3 recent catalysts for NuScale Power SMR stock. Include TVA/ENTRA1, DOE funding, Big Tech nuclear deals, NRC news. Return JSON array: [{"category":"regulatory","title":"...","description":"...","sentiment":"bullish/bearish/neutral","impact_score":8}]`);
  if (!Array.isArray(data)) return 0;
  let count = 0;
  for (const item of data) { const { error } = await supabase.from('catalysts').insert({ category: item.category || 'general', title: item.title, description: item.description, sentiment: item.sentiment || 'neutral', impact_score: item.impact_score || 5 }); if (!error) count++; }
  return count;
}

async function fetchAndStoreCompetitorUpdates() {
  const data = await askClaudeJSON(`Recent developments for NuScale competitors: Oklo, GE Vernova, BWX Technologies, TerraPower, X-Energy, China Linglong One. Return JSON array of 4: [{"company":"Oklo","ticker":"OKLO","event_type":"contract","title":"...","description":"...","sentiment":"neutral","impact_on_smr":"..."}]`);
  if (!Array.isArray(data)) return 0;
  let count = 0;
  for (const item of data) { const { error } = await supabase.from('competitor_updates').insert({ company: item.company, ticker: item.ticker, event_type: item.event_type, title: item.title, description: item.description, sentiment: item.sentiment || 'neutral', impact_on_smr: item.impact_on_smr }); if (!error) count++; }
  return count;
}

async function fetchAndStoreGeopoliticalEvents() {
  const data = await askClaudeJSON(`Top 3 geopolitical events impacting nuclear energy and NuScale: Russia-Ukraine, US-China trade, Middle East, European energy policy, NATO energy security, Indo-Pacific nuclear policy. Return JSON array: [{"region":"Europe","event_type":"energy_policy","title":"...","description":"...","impact_on_energy":"...","impact_on_smr":"bullish/bearish/neutral","sentiment":"neutral","severity":7}]`);
  if (!Array.isArray(data)) return 0;
  let count = 0;
  for (const item of data) { const { error } = await supabase.from('geopolitical_events').insert({ region: item.region, event_type: item.event_type, title: item.title, description: item.description, impact_on_energy: item.impact_on_energy, impact_on_smr: item.impact_on_smr, sentiment: item.sentiment || 'neutral', severity: item.severity || 5 }); if (!error) count++; }
  return count;
}

async function fetchAndStoreLegalRisks() {
  const data = await askClaudeJSON(`Current legal risks for NuScale Power SMR: securities class actions (multiple firms, April 2026 deadline), ENTRA1 controversy, SEC investigations. Return JSON array: [{"case_type":"securities_class_action","title":"...","description":"...","law_firm":"...","severity":"high","status":"active","impact_on_smr":"..."}]`);
  if (!Array.isArray(data)) return 0;
  let count = 0;
  for (const item of data) {
    const { data: existing } = await supabase.from('legal_risks').select('id').eq('title', item.title).single();
    if (existing) continue;
    const { error } = await supabase.from('legal_risks').insert({ case_type: item.case_type || 'lawsuit', title: item.title, description: item.description, law_firm: item.law_firm, severity: item.severity || 'medium', status: item.status || 'active', impact_on_smr: item.impact_on_smr });
    if (!error) count++;
  }
  return count;
}

async function fetchAndStoreInstitutionalActivity() {
  const data = await askClaudeJSON(`Recent institutional activity in NuScale SMR: Fluor sold 71M shares Feb 2026 for $1.35B, short interest ~13.8% of float, 78.37% institutional ownership. Return JSON array: [{"institution":"Fluor Corp","action":"sell","shares_changed":-71000000,"value_usd":1350000000,"short_interest_pct":13.8,"description":"...","sentiment":"bearish"}]`);
  if (!Array.isArray(data)) return 0;
  let count = 0;
  for (const item of data) { const { error } = await supabase.from('institutional_activity').insert({ institution: item.institution, action: item.action, shares_changed: item.shares_changed, value_usd: item.value_usd, short_interest_pct: item.short_interest_pct, description: item.description, sentiment: item.sentiment || 'neutral' }); if (!error) count++; }
  return count;
}

async function fetchAndStoreAnalystRatings() {
  const data = await askClaudeJSON(`Recent analyst rating changes for NuScale SMR: Goldman $14 down, UBS $13 down, Canaccord $25 down from $60, BofA upgraded Neutral $28, TD Cowen downgraded Hold, Northland upgraded Outperform, Barclays lowered, RBC lowered $14. Return JSON array of 4 most impactful: [{"firm":"Goldman Sachs","analyst":"name","action":"downgrade","old_rating":"Buy","new_rating":"Hold","old_target":20,"new_target":14,"note":"..."}]`);
  if (!Array.isArray(data)) return 0;
  let count = 0;
  for (const item of data) {
    const { data: existing } = await supabase.from('analyst_ratings').select('id').eq('firm', item.firm).eq('new_target', item.new_target).single();
    if (existing) continue;
    const { error } = await supabase.from('analyst_ratings').insert({ firm: item.firm, analyst: item.analyst, action: item.action, old_rating: item.old_rating, new_rating: item.new_rating, old_target: item.old_target, new_target: item.new_target, note: item.note });
    if (!error) count++;
  }
  return count;
}

async function fetchAndStorePartnerUpdates() {
  const data = await askClaudeJSON(`Latest updates on NuScale key partners: TVA (6GW deal), ENTRA1 Energy (controversy, $495M payment, background scrutiny), Fluor Corp (reduced stake), RoPower Romania, DOE, Samsung C&T. Return JSON array: [{"partner":"ENTRA1 Energy","partner_type":"customer","event_type":"controversy","title":"...","description":"...","sentiment":"bearish","impact_score":9}]`);
  if (!Array.isArray(data)) return 0;
  let count = 0;
  for (const item of data) { const { error } = await supabase.from('partner_updates').insert({ partner: item.partner, partner_type: item.partner_type || 'partner', event_type: item.event_type, title: item.title, description: item.description, sentiment: item.sentiment || 'neutral', impact_score: item.impact_score || 5 }); if (!error) count++; }
  return count;
}

async function generateComprehensiveSignal() {
  const signal = await askClaudeJSON(
    `Generate comprehensive investment signal for NuScale Power (NYSE: SMR):
FINANCIAL: Revenue $31.5M 2025 (-14.9% YoY), Cash $1.3B, Cash Burn $108M/yr
STOCK: ~$10.18, 52wk high $57.42, down 80% from peak
LEGAL: Multiple securities class actions, ENTRA1 controversy, April 2026 deadline
INSTITUTIONAL: Fluor sold 71M shares, short interest 13.8%
ANALYSTS: 17 analysts, median target $21, consensus Hold. Goldman $14, UBS $13, BofA $28
POSITIVES: NRC approval, TVA 6GW deal, $1.3B liquidity, AI data center demand
PORTFOLIO CONTEXT: Investor holds 24 shares at avg $24.40 (KRW 33,778), ~58% loss, has KRW 1M additional seed

Return JSON: {"signal":"HOLD","sec":"neutral","news":"bearish","financial":"neutral","market":"bullish","analysis":"comprehensive 3-4 sentence analysis","portfolio_recommendation":"specific advice for this investor's exact position"}`
  );

  if (!signal) return null;

  await supabase.from('signal_history').insert({
    signal: signal.signal || 'HOLD',
    sec_sentiment: signal.sec || 'neutral',
    news_sentiment: signal.news || 'neutral',
    financial_sentiment: signal.financial || 'neutral',
    market_sentiment: signal.market || 'neutral',
    analysis: (signal.analysis || '') + '\n\n📊 Portfolio Note: ' + (signal.portfolio_recommendation || ''),
    stock_price: 10.18
  });

  return signal.signal;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.method !== 'GET') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { sec_filings:0, macro_data:0, catalysts:0, competitor_updates:0, geopolitical_events:0, legal_risks:0, institutional_activity:0, analyst_ratings:0, partner_updates:0, signal:null, errors:[] };

  const tasks = [
    ['sec_filings', fetchAndStoreSECFilings],
    ['macro_data', fetchAndStoreMacroData],
    ['catalysts', fetchAndStoreCatalysts],
    ['competitor_updates', fetchAndStoreCompetitorUpdates],
    ['geopolitical_events', fetchAndStoreGeopoliticalEvents],
    ['legal_risks', fetchAndStoreLegalRisks],
    ['institutional_activity', fetchAndStoreInstitutionalActivity],
    ['analyst_ratings', fetchAndStoreAnalystRatings],
    ['partner_updates', fetchAndStorePartnerUpdates],
  ];

  for (const [key, fn] of tasks) {
    try { results[key] = await fn(); console.log(`✅ ${key}: ${results[key]}`); }
    catch(e) { results.errors.push(`${key}: ${e.message}`); console.error(`❌ ${key}:`, e.message); }
  }

  try { results.signal = await generateComprehensiveSignal(); }
  catch(e) { results.errors.push(`signal: ${e.message}`); }

  return res.status(200).json({ success: true, timestamp: new Date().toISOString(), ...results });
}
