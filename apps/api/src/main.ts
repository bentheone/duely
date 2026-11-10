
import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './serverless';

async function bootstrap() {
  const server = express();
  server.disable('x-powered-by');

  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(server),
    {
      logger: ['log', 'warn', 'error'],
      bodyParser: true,
    },
  );

  configureApp(app);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
