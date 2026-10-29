// Transactional email through Brevo (https://developers.brevo.com/reference/sendtransacemail)
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
// Where people reach us; replies to any email we send land here too
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'vibeloop.support@gmail.com';

class EmailError extends Error {}

/**
 * Sends one email. Without BREVO_API_KEY outside production, the message is printed to the
 * server console instead, so registration can be tried locally.
 */
async function sendEmail({ to, subject, text, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;

  if (!apiKey || !fromAddress) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[VibeLoop Email] (not sent: BREVO_API_KEY / EMAIL_FROM_ADDRESS unset) To ${to}: ${subject}\n${text}`);
      return;
    }
    throw new EmailError('Email sending is not configured');
  }

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.EMAIL_FROM_NAME || 'VibeLoop', email: fromAddress },
      to: [{ email: to }],
      replyTo: { email: SUPPORT_EMAIL },
      subject,
      textContent: text,
      htmlContent: html
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    // Brevo's error body names the problem (bad key, unverified sender...) but never contains the key
    const detail = await res.text().catch(() => '');
    throw new EmailError(`Brevo responded ${res.status}: ${detail.slice(0, 200)}`);
  }
}

module.exports = { sendEmail, EmailError, SUPPORT_EMAIL };
