module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    const { type } = req.query;

    if (type === 'signal') {
      const { data, error } = await supabase
        .from('signal_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return res.status(200).json({ signal: data || null });
    }

    if (type === 'latest_filing') {
      const { data, error } = await supabase
        .from('sec_filings')
        .select('*')
        .order('filed_date', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return res.status(200).json({ filing: data || null });
    }

    if (type === 'filings') {
      const { data, error } = await supabase
        .from('sec_filings')
        .select('*')
        .order('filed_date', { ascending: false })
        .limit(10);
      if (error) throw error;
      return res.status(200).json({ filings: data || [] });
    }

    return res.status(400).json({ error: 'Invalid type' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
