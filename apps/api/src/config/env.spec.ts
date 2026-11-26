import { parseEnv } from './env';

const valid = {
  MONGO_URI: 'mongodb://localhost:27017/app',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies safe defaults for optional values', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 7,
      REFRESH_REUSE_GRACE_SECONDS: 10,
      CORS_ORIGINS: [],
      SWAGGER_ENABLED: true,
      COOKIE_SECURE: false,
      TRUST_PROXY: false,
      AUTH_RATE_LIMIT_PER_MINUTE: 10,
      AUTH_ACCOUNT_RATE_LIMIT_PER_MINUTE: 5,
      ALLOW_INSECURE_COOKIES: false,
    });
  });

  it('defaults Swagger off and secure cookies on in production', () => {
    const env = parseEnv({ ...valid, NODE_ENV: 'production' });
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('refuses insecure cookies in production unless explicitly allowed', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE must be true in production/,
    );
    expect(
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        COOKIE_SECURE: '0',
        ALLOW_INSECURE_COOKIES: '1',
      }).COOKIE_SECURE,
    ).toBe(false);
  });

  it('requires Swagger credentials when Swagger is on in production', () => {
    const prod = {
      ...valid,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      SWAGGER_ENABLED: 'true',
    };
    expect(() => parseEnv(prod)).toThrow(/SWAGGER_USERNAME and SWAGGER_PASSWORD are required/);
    expect(() =>
      parseEnv({ ...prod, SWAGGER_USERNAME: 'docs', SWAGGER_PASSWORD: 'short' }),
    ).toThrow(/SWAGGER_PASSWORD/);
    expect(
      parseEnv({ ...prod, SWAGGER_USERNAME: 'docs', SWAGGER_PASSWORD: 'x'.repeat(16) })
        .SWAGGER_ENABLED,
    ).toBe(true);
  });

  it('treats empty Swagger credentials (KEY= in a .env file) as not set', () => {
    const env = parseEnv({ ...valid, SWAGGER_USERNAME: '', SWAGGER_PASSWORD: '' });
    expect(env.SWAGGER_USERNAME).toBeUndefined();
    expect(env.SWAGGER_PASSWORD).toBeUndefined();
  });

  it('allows open Swagger in development', () => {
    expect(parseEnv({ ...valid, SWAGGER_ENABLED: 'true' }).SWAGGER_USERNAME).toBeUndefined();
  });

  it('parses "false" as false, not as a truthy string', () => {
    expect(parseEnv({ ...valid, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
  });

  it('splits CORS origins', () => {
    expect(parseEnv({ ...valid, CORS_ORIGINS: 'http://a.com, http://b.com' }).CORS_ORIGINS).toEqual(
      ['http://a.com', 'http://b.com'],
    );
  });

  it('fails fast when required values are missing', () => {
    expect(() => parseEnv({})).toThrow(/MONGO_URI[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  describe('in production', () => {
    const prod = { ...valid, NODE_ENV: 'production' };

    it('refuses the .env.example placeholders for secrets', () => {
      const placeholderSecret = 'change-me-to-a-long-random-string-of-at-least-32-chars';
      expect(() => parseEnv({ ...prod, JWT_ACCESS_SECRET: placeholderSecret })).toThrow(
        /JWT_ACCESS_SECRET: still the \.env\.example placeholder/,
      );
      expect(() =>
        parseEnv({ ...prod, MONGO_URI: 'mongodb://app:CHANGE_ME_MONGO_APP_PASSWORD@db/app' }),
      ).toThrow(/MONGO_URI: still the \.env\.example placeholder/);
    });

    it('accepts the placeholders in development', () => {
      expect(() =>
        parseEnv({
          ...valid,
          JWT_ACCESS_SECRET: 'change-me-to-a-long-random-string-of-at-least-32-chars',
        }),
      ).not.toThrow();
    });
  });

  it('reads LOG_DIR, treating an empty value as not set', () => {
    expect(parseEnv({ ...valid, LOG_DIR: '/var/log/auth-api' }).LOG_DIR).toBe('/var/log/auth-api');
    expect(parseEnv({ ...valid, LOG_DIR: '' }).LOG_DIR).toBeUndefined();
  });
});
