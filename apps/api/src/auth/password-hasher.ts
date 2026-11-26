import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** argon2id with the library's defaults (OWASP-aligned memory and time cost). */
@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
