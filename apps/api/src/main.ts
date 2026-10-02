import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
  });
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
