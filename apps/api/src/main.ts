import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const allowedOriginsEnv = process.env['ALLOWED_ORIGINS'];
  const allowedOrigins = allowedOriginsEnv
    ? allowedOriginsEnv === '*'
      ? '*'
      : allowedOriginsEnv
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
    : [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
      ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
