import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './serverless';

// Minimal .env loader for local dev (Vercel injects env in production).
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const { server } = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Duely API on http://localhost:${port}`));
}

void main();
