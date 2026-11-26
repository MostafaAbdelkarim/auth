import { Global, Inject, Module } from '@nestjs/common';
import { logDestinationFor } from '../common/logging/daily-file-destination';
import { parseEnv } from './env';

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Where log lines are written. null = stdout (the default); with LOG_DIR set, stdout plus daily
 * files. Tests override this provider with an in-memory stream to assert on real log output.
 */
export const LOG_DESTINATION = Symbol('LOG_DESTINATION');

/** Injects the validated, typed environment (see env.ts). */
export const InjectAppConfig = () => Inject(APP_CONFIG);

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => parseEnv(process.env) },
    { provide: LOG_DESTINATION, inject: [APP_CONFIG], useFactory: logDestinationFor },
  ],
  exports: [APP_CONFIG, LOG_DESTINATION],
})
export class AppConfigModule {}
