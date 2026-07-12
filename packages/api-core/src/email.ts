import { randomBytes } from "node:crypto";

export interface EmailConfig {
  secure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  appBaseUrl: string;
  /** When true, new accounts are marked emailVerified without sending mail. */
  skipEmailVerification?: boolean;
}

let emailConfig: EmailConfig = {
  appBaseUrl: "http://localhost:3000",
  secure: false,
  skipEmailVerification: false,
};

export function setEmailConfig(config: Partial<EmailConfig>): void {
  emailConfig = { ...emailConfig, ...config };
}

export function getEmailConfig(): EmailConfig {
  return emailConfig;
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const verifyUrl = `${emailConfig.appBaseUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "Verify your VaultChat email";
  const text = [
    "Welcome to VaultChat!",
    "",
    "Please verify your email address by opening this link:",
    verifyUrl,
    "",
    "This link expires in 24 hours.",
    "",
    "If you did not create an account, you can ignore this email.",
  ].join("\n");

  const html = `
    <p>Welcome to VaultChat!</p>
    <p>Please verify your email address:</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>This link expires in 24 hours.</p>
    <p>If you did not create an account, you can ignore this email.</p>
  `;

  if (emailConfig.smtpHost) {
    await sendViaSmtp(to, subject, text, html);
    return;
  }

  console.info(
    `[vaultchat] Email verification (SMTP not configured)\n  To: ${to}\n  Link: ${verifyUrl}`
  );
}

async function sendViaSmtp(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<void> {
  const host = emailConfig.smtpHost!;
  const port = emailConfig.smtpPort ?? 587;
  const from = emailConfig.smtpFrom ?? "VaultChat <noreply@vaultchat.local>";

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: emailConfig.secure ?? port === 465,
    auth:
      emailConfig.smtpUser && emailConfig.smtpPass
        ? { user: emailConfig.smtpUser, pass: emailConfig.smtpPass }
        : undefined,
  });

  await transport.sendMail({ from, to, subject, text, html });
}

export function createVerificationToken(): string {
  return randomBytes(32).toString("hex");
}
