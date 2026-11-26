import { createTestApp } from './test-app';

describe('Startup configuration (e2e)', () => {
  it('refuses to start in production with the .env.example JWT secret', async () => {
    await expect(
      createTestApp({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-to-a-long-random-string-of-at-least-32-chars',
      }),
    ).rejects.toThrow(/Invalid environment configuration[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('starts with a valid configuration', async () => {
    const testApp = await createTestApp();
    await testApp.close();
  });
});
