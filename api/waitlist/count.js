// api/waitlist/count.js
// Returns the total number of entries in the waitlist table.

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(503).json({ error: 'Supabase not configured.', count: 0 });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        // Note: Counting the new 'waitlist' table
        const { count, error } = await supabase
            .from('waitlist')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;

        return res.status(200).json({ count: count ?? 0 });
    } catch (err) {
        console.error('[waitlist/count]', err.message);
        return res.status(500).json({ error: 'Failed to fetch count.', count: 0 });
    }
}
