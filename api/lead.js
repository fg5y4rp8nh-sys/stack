// Vercel serverless function: sends the contact form to a Telegram chat.
// Uses TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID from Vercel env vars if set, otherwise the values below.
const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const cut = (s, n) => String(s || '').trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, status: 'lead function is running' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
  const token = process.env.TELEGRAM_BOT_TOKEN || '8909736930:AAFvJG67DMzqZE9YMqB_RsPpwsh_e_x3K4g';
  const chat = process.env.TELEGRAM_CHAT_ID || '1749885024';
  if (!token || !chat) return res.status(500).json({ ok: false, error: 'not configured' });

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  if (b.website) return res.status(200).json({ ok: true }); // honeypot: silently drop bots

  const name = cut(b.name, 80), contact = cut(b.contact, 120), message = cut(b.message, 2000);
  if (!name || !contact || !message) return res.status(400).json({ ok: false, error: 'missing fields' });

  const text =
    '<b>New request from the website</b>\n\n' +
    `<b>Name:</b> ${esc(name)}\n` +
    `<b>Contact:</b> ${esc(contact)}\n` +
    `<b>Project:</b> ${esc(cut(b.type, 60))}\n` +
    `<b>Budget:</b> ${esc(cut(b.budget, 40))}\n` +
    `<b>Site language:</b> ${esc(cut(b.lang, 5))}\n\n` +
    esc(message);

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true };
  let last = 'unknown error';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) return res.status(200).json({ ok: true });
      last = `${r.status} ${data.description || r.statusText || ''}`.trim();
      console.error('Telegram error, attempt', attempt, last, data);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break; // wrong token / chat: retrying won't help
    } catch (e) {
      clearTimeout(timer);
      last = e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'request failed';
      console.error('Telegram request failed, attempt', attempt, last);
    }
    await new Promise((ok) => setTimeout(ok, 600 * attempt));
  }
  return res.status(502).json({ ok: false, error: 'Telegram: ' + last });
};

module.exports.config = { maxDuration: 30 };
