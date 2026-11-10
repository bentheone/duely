/** Typed env access (read lazily so tests can set process.env first). */
export interface AppConfig {
  mongoUri: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  encryptionKey: string;
  googleClientId: string;
  googleClientSecret: string;
  ownerEmail: string;
  ownerCloudinary: { cloudName: string; apiKey: string; apiSecret: string } | null;
  /** Lower-cased admin emails: ADMIN_EMAILS (comma-separated) plus OWNER_EMAIL. */
  adminEmails: string[];
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string; from: string } | null;
  /** Where testers get the APK (shown in the "you're in" email). */
  appDownloadUrl: string | null;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export function config(): AppConfig {
  const cn = process.env.OWNER_CLOUDINARY_CLOUD_NAME;
  const key = process.env.OWNER_CLOUDINARY_API_KEY;
  const secret = process.env.OWNER_CLOUDINARY_API_SECRET;
  return {
    mongoUri: req('MONGODB_URI'),
    jwtSecret: req('JWT_SECRET'),
    jwtRefreshSecret: req('JWT_REFRESH_SECRET'),
    encryptionKey: req('ENCRYPTION_KEY'),
    googleClientId: req('GOOGLE_WEB_CLIENT_ID'),
    googleClientSecret: process.env.GOOGLE_WEB_CLIENT_SECRET ?? '',
    ownerEmail: (process.env.OWNER_EMAIL ?? '').toLowerCase(),
    ownerCloudinary: cn && key && secret ? { cloudName: cn, apiKey: key, apiSecret: secret } : null,
    adminEmails: [...new Set([process.env.OWNER_EMAIL ?? '', ...(process.env.ADMIN_EMAILS ?? '').split(',')].map((e) => e.trim().toLowerCase()).filter(Boolean))],
    smtp: smtpConfig(),
    appDownloadUrl: process.env.APP_DOWNLOAD_URL || null,
  };
}

function smtpConfig(): AppConfig['smtp'] {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  return { host, port, secure: port === 465, user, pass, from: process.env.MAIL_FROM || `Duely <${user}>` };
}
