/**
 * Email utility for sending invite notifications.
 * Uses Nodemailer when SMTP is configured, otherwise logs to console.
 */
let transporter = null;

try {
  const nodemailer = require('nodemailer');

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(port) || 587,
      secure: Number(port) === 465,
      auth: { user, pass },
    });
    console.log('📧 Email transport configured via SMTP');
  }
} catch (err) {
  // nodemailer not installed or config error — that's fine, we'll log instead
}

/**
 * Send a group invite email.
 * @param {string} toEmail - Recipient email address
 * @param {string} groupName - Name of the group
 * @param {string} inviterName - Name of the person inviting
 * @param {string} inviteToken - Unique invite token
 * @param {string} frontendUrl - Base URL of the frontend app
 */
async function sendInviteEmail(toEmail, groupName, inviterName, inviteToken, frontendUrl) {
  const inviteUrl = `${frontendUrl}/invites/${inviteToken}`;

  if (!transporter) {
    console.log('─────────────────────────────────────────');
    console.log('📧 INVITE EMAIL (SMTP not configured — logging instead)');
    console.log(`   To:    ${toEmail}`);
    console.log(`   Group: ${groupName}`);
    console.log(`   From:  ${inviterName}`);
    console.log(`   Link:  ${inviteUrl}`);
    console.log('─────────────────────────────────────────');
    return;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 8px;">You're invited to join "${groupName}"</h2>
      <p style="color: #666; font-size: 15px; line-height: 1.5;">
        <strong>${inviterName}</strong> invited you to join their expense group on <strong>Kharcha</strong>.
      </p>
      <a href="${inviteUrl}"
         style="display: inline-block; margin-top: 20px; padding: 12px 28px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
        Accept Invite
      </a>
      <p style="margin-top: 24px; color: #999; font-size: 13px;">
        Or copy this link: <a href="${inviteUrl}" style="color: #4f46e5;">${inviteUrl}</a>
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `${inviterName} invited you to "${groupName}" on Kharcha`,
      html,
    });
    console.log(`📧 Invite email sent to ${toEmail}`);
  } catch (err) {
    console.error(`📧 Failed to send invite email to ${toEmail}:`, err.message);
    // Don't throw — invite was still created in the database
  }
}

module.exports = { sendInviteEmail };
