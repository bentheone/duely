import 'reflect-metadata';
import express, { type Express } from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';

export function configureApp(app: INestApplication): INestApplication {
  app.enableCors({ origin: false });
  app.enableShutdownHooks();
  return app;
}

export async function createApp(): Promise<{ app: INestApplication; server: Express }> {
  const server = express();
  server.disable('x-powered-by');
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['log', 'warn', 'error'],
    bodyParser: true,
  });
  configureApp(app);
  await app.init();
  return { app, server };
}

/** Nest is bootstrapped once per warm serverless instance (§12). */
const g = globalThis as unknown as { __duelyApp?: Promise<Express> };
export function getHandler(): Promise<Express> {
  if (!g.__duelyApp) {
    g.__duelyApp = createApp()
      .then((r) => r.server)
      .catch((e) => {
        g.__duelyApp = undefined;
        throw e;
      });
  }
  return g.__duelyApp;
}
