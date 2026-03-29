const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function askClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function askClaudeJSON(prompt) {
  const text = await askClaude(prompt + '\n\nRespond ONLY with valid JSON, no markdown.');
  try { return JSON.parse(text.trim()); }
  catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
  }
}

module.exports = async function handler(req, res) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && req.method !== 'GET') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { signal: null, macro: 0, catalysts: 0, errors: [] };

  // 1. Macro data
  try {
    const data = await askClaudeJSON(
      'Current market values: US 10yr yield, Fed rate, USD/KRW, WTI oil, CPI. Return JSON: {"ten_year_yield":4.5,"fed_funds_rate":5.25,"usd_krw":1460,"wti_oil":78,"cpi":3.1}'
    );
    if (data) {
      const metrics = [
        { metric: 'US 10-Year Treasury Yield', value: data.ten_year_yield, unit: '%' },
        { metric: 'Federal Funds Rate', value: data.fed_funds_rate, unit: '%' },
        { metric: 'USD/KRW Exchange Rate', value: data.usd_krw, unit: 'KRW' },
        { metric: 'WTI Oil Price', value: data.wti_oil, unit: 'USD/barrel' },
        { metric: 'US CPI Inflation', value: data.cpi, unit: '%' }
      ];
      for (const m of metrics) {
        await supabase.from('macro_data').insert(m);
        results.macro++;
      }
    }
  } catch(e) { results.errors.push('macro: ' + e.message); }

  // 2. Catalysts
  try {
    const data = await askClaudeJSON(
      'Top 3 market catalysts affecting US stocks today. Return JSON array: [{"category":"macro","title":"...","description":"...","sentiment":"bullish/bearish/neutral","impact_score":7}]'
    );
    if (Array.isArray(data)) {
      for (const item of data) {
        await supabase.from('catalysts').insert({
          category: item.category || 'general',
          title: item.title,
          description: item.description,
          sentiment: item.sentiment || 'neutral',
          impact_score: item.impact_score || 5
        });
        results.catalysts++;
      }
    }
  } catch(e) { results.errors.push('catalysts: ' + e.message); }

  // 3. Generate signal
  try {
    const signal = await askClaudeJSON(
      `Generate investment market signal for today.
Return JSON: {"signal":"HOLD","analysis":"2-3 sentence market analysis","market_sentiment":"bullish/bearish/neutral"}`
    );
    if (signal) {
      await supabase.from('signal_history').insert({
        signal: signal.signal || 'HOLD',
        analysis: signal.analysis || '',
        market_sentiment: signal.market_sentiment || 'neutral',
        stock_price: 0
      });
      results.signal = signal.signal;
    }
  } catch(e) { results.errors.push('signal: ' + e.message); }

  return res.status(200).json({ success: true, timestamp: new Date().toISOString(), ...results });
}
