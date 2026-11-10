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
  };
}
