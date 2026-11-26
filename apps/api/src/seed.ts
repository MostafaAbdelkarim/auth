import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { PasswordHasher } from './auth/password-hasher';
import { assertSeedAllowed, DEMO_USERS, seedUsers } from './users/seed-users';
import { UsersService } from './users/users.service';

/** `make seed` / `npm run seed`: creates the demo account(s) if missing. */
async function main(): Promise<void> {
  assertSeedAllowed(process.env);
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  try {
    const { created, skipped } = await seedUsers(
      app.get(UsersService),
      app.get(PasswordHasher, { strict: false }),
      DEMO_USERS,
    );
    process.stdout.write(
      `Seed complete. Created: ${created.join(', ') || 'none'}. Already present: ${skipped.join(', ') || 'none'}.\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
