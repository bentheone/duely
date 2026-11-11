import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import mongoose from 'mongoose';
import { Public, LoggingInterceptor } from './common/http';
import { AuthController } from './auth/auth.controller';
import { TokensService } from './auth/tokens.service';
import { JwtGuard } from './auth/jwt.guard';
import { GOOGLE_IDENTITY, RealGoogleIdentity } from './auth/google-identity';
import { MeController } from './me/me.controller';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';
import { GOOGLE_API_FACTORY, RealGoogleApiFactory } from './google/google.client';
import { GoogleSyncService } from './google/google-sync.service';
import { IntegrationsController } from './google/integrations.controller';
import { PlannerController } from './planner/planner.controller';
import { StorageController } from './storage/storage.controller';
import { ExportController } from './export/export.controller';
import { connectMongo } from './db/connection';
import { AccessRequestController, AdminController, FeedbackController } from './access/access.controller';
import { MAILER, SmtpMailer } from './mail/mailer';
import { ShareController } from './share/share.controller';
import { config } from './config';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, db: mongoose.connection.readyState === 1 ? 'up' : 'down', time: Date.now() };
  }
}

export const DB_READY = Symbol('DB_READY');

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }])],
  controllers: [
    HealthController,
    AuthController,
    MeController,
    SyncController,
    IntegrationsController,
    PlannerController,
    StorageController,
    ExportController,
    AccessRequestController,
    FeedbackController,
    AdminController,
    ShareController,
  ],
  providers: [
    { provide: DB_READY, useFactory: () => connectMongo(config().mongoUri) },
    TokensService,
    SyncService,
    GoogleSyncService,
    { provide: GOOGLE_IDENTITY, useClass: RealGoogleIdentity },
    { provide: GOOGLE_API_FACTORY, useClass: RealGoogleApiFactory },
    { provide: MAILER, useClass: SmtpMailer },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
