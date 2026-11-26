import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Writable } from 'node:stream';
import { AppModule } from '../src/app.module';
import { LOG_DESTINATION } from '../src/config/app-config.module';
import { configureApp } from '../src/app.setup';

export interface TestApp {
  app: NestExpressApplication;
  close: () => Promise<void>;
}

/** Boots the real AppModule (same middleware as main.ts) against a throwaway MongoDB. */
/** `logDestination` captures the app's real JSON log lines (otherwise logging is silent). */
export async function createTestApp(
  env: Record<string, string> = {},
  options: { logDestination?: Writable } = {},
): Promise<TestApp> {
  const mongo = await MongoMemoryServer.create();
  // Config is read once while the module compiles; restore env afterwards so suites don't leak.
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGO_URI: mongo.getUri('auth-e2e'),
    JWT_ACCESS_SECRET: 'e2e-secret-that-is-at-least-32-characters-long',
    AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    AUTH_ACCOUNT_RATE_LIMIT_PER_MINUTE: '1000',
    ...env,
  });

  let moduleRef;
  try {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LOG_DESTINATION)
      .useValue(options.logDestination ?? null)
      .compile();
  } catch (error) {
    await mongo.stop();
    throw error;
  } finally {
    process.env = previousEnv;
  }
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app);
  await app.init();

  return {
    app,
    close: async () => {
      await app.close();
      await mongo.stop();
    },
  };
}
