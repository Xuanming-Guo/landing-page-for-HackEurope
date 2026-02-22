// api/public-config.js
// Returns the Supabase public credentials so the frontend can initialise the JS client.
// Only exposes the anon key (safe to expose), never the service key.

export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      error: 'Supabase not configured on server.',
      supabaseConfigured: false,
    });
  }

  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey,
    supabaseConfigured: true,
  });
}
