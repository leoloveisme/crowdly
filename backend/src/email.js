import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || 'noreply@crowdly.cloud';

export function isMailerConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendFeedbackEmail({ name, email, feedback }) {
  const displayName = (name || '').trim() || 'Anonymous';

  await transporter.sendMail({
    from: FROM,
    to: process.env.FEEDBACK_TO_EMAIL || 'feedback@crowdly.cloud',
    replyTo: email,
    subject: `New Crowdly feedback from ${displayName}`,
    text: `From: ${displayName} <${email}>\n\n${feedback}`,
    html: `<p><strong>From:</strong> ${escapeHtml(displayName)} &lt;${escapeHtml(email)}&gt;</p><p>${escapeHtml(feedback).replace(/\n/g, '<br>')}</p>`,
  });
}

export function sendInvitationEmail(to, firstName, invitationCode) {
  const html = `
    <h2>Welcome to Crowdly Alpha, ${firstName}!</h2>
    <p>You have been invited to join the Crowdly platform as an alpha user.</p>
    <p>Your invitation code is:</p>
    <p style="font-size: 1.4em; font-weight: bold; background: #f0f0f0; padding: 12px 20px; display: inline-block; border-radius: 6px; font-family: monospace;">${invitationCode}</p>
    <p>Visit <a href="https://crowdly.cloud">crowdly.cloud</a> and enter this code along with your email address to access the platform.</p>
    <p>We're excited to have you on board!</p>
    <p>— The Crowdly Team</p>
  `;

  transporter.sendMail({
    from: FROM,
    to,
    subject: 'Your Crowdly Alpha Invitation',
    html,
  }).catch((err) => {
    console.error('[email] failed to send invitation email:', err);
  });
}

export function sendApplicationConfirmationEmail(to, firstName) {
  const html = `
    <h2>Thank you for your interest, ${firstName}!</h2>
    <p>We have received your application to join the Crowdly alpha program.</p>
    <p>Our team will review your application and get back to you soon. If accepted, you will receive an invitation code via email.</p>
    <p>— The Crowdly Team</p>
  `;

  transporter.sendMail({
    from: FROM,
    to,
    subject: 'Crowdly Alpha Application Received',
    html,
  }).catch((err) => {
    console.error('[email] failed to send application confirmation email:', err);
  });
}

export function sendApplicationToInvitationEmail(to, firstName, invitationCode) {
  const html = `
    <h2>Great news, ${firstName}!</h2>
    <p>Your application to join the Crowdly alpha program has been approved!</p>
    <p>Your invitation code is:</p>
    <p style="font-size: 1.4em; font-weight: bold; background: #f0f0f0; padding: 12px 20px; display: inline-block; border-radius: 6px; font-family: monospace;">${invitationCode}</p>
    <p>Visit <a href="https://crowdly.cloud">crowdly.cloud</a> and enter this code along with your email address to access the platform.</p>
    <p>Welcome to Crowdly!</p>
    <p>— The Crowdly Team</p>
  `;

  transporter.sendMail({
    from: FROM,
    to,
    subject: 'Your Crowdly Alpha Application Has Been Approved!',
    html,
  }).catch((err) => {
    console.error('[email] failed to send application-to-invitation email:', err);
  });
}
