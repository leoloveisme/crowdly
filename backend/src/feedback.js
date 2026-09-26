import express from 'express';
import { isMailerConfigured, sendFeedbackEmail } from './email.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function captchaServiceConfig() {
  const serviceUrl = process.env.CAPTCHA_SERVICE_URL;
  const apiKey = process.env.CAPTCHA_API_KEY;
  if (!serviceUrl || !apiKey) {
    throw new Error('CAPTCHA service is not configured (CAPTCHA_SERVICE_URL/CAPTCHA_API_KEY)');
  }
  return { serviceUrl, apiKey };
}

async function generateCaptcha() {
  const { serviceUrl, apiKey } = captchaServiceConfig();
  const res = await fetch(`${serviceUrl}/api/v1/captcha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ type: 'alphanumeric', size: 6 }),
  });
  if (!res.ok) throw new Error(`CAPTCHA service responded ${res.status}`);
  const data = await res.json();
  return { id: data.id, svg: data.svg };
}

async function verifyCaptcha(captchaId, captchaAnswer) {
  const { serviceUrl, apiKey } = captchaServiceConfig();
  const res = await fetch(`${serviceUrl}/api/v1/captcha/${captchaId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ answer: captchaAnswer }),
  });
  if (!res.ok) throw new Error(`CAPTCHA service responded ${res.status}`);
  const data = await res.json();
  return data?.valid === true;
}

const router = express.Router();

router.post('/captcha', async (req, res) => {
  try {
    const captcha = await generateCaptcha();
    res.json(captcha);
  } catch (err) {
    console.error('[POST /captcha] failed:', err);
    res.status(502).json({ error: 'CAPTCHA is temporarily unavailable' });
  }
});

router.post('/feedback', async (req, res) => {
  const { name, email, feedback, captchaId, captchaAnswer } = req.body || {};

  if (typeof feedback !== 'string' || feedback.trim().length === 0) {
    return res.status(400).json({ error: 'Feedback text is required' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (typeof captchaId !== 'string' || captchaId.length === 0 || typeof captchaAnswer !== 'string' || captchaAnswer.length === 0) {
    return res.status(400).json({ error: 'CAPTCHA answer is required' });
  }

  let captchaValid;
  try {
    captchaValid = await verifyCaptcha(captchaId, captchaAnswer);
  } catch (err) {
    console.error('[POST /feedback] captcha verification failed:', err);
    return res.status(502).json({ error: 'CAPTCHA is temporarily unavailable' });
  }
  if (!captchaValid) {
    return res.status(400).json({ error: 'Incorrect CAPTCHA answer' });
  }

  if (!isMailerConfigured()) {
    console.error('[POST /feedback] SMTP is not configured');
    return res.status(500).json({ error: 'Feedback service is temporarily unavailable' });
  }

  try {
    await sendFeedbackEmail({ name, email, feedback });
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /feedback] failed to send feedback email:', err);
    res.status(502).json({ error: 'Could not send feedback right now. Please try again.' });
  }
});

export default router;
