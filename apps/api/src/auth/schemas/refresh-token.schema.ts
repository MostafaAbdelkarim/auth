import { Prop, Schema } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  AbstractSchema,
  BASE_SCHEMA_OPTIONS,
  createSchema,
} from '../../common/database/abstract.schema';

/**
 * One row per issued refresh token. Only a SHA-256 hash of the token is stored, so a
 * database leak does not hand out live sessions. Tokens rotate on every refresh; all
 * tokens from one sign-in share a familyId so reuse of a rotated token revokes the family.
 */
@Schema({ collection: 'refresh_tokens', ...BASE_SCHEMA_OPTIONS })
export class RefreshToken extends AbstractSchema {
  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true, index: true })
  familyId: string;

  /** Mongo's TTL monitor deletes the row once this date passes. */
  @Prop({ required: true, expires: 0 })
  expiresAt: Date;

  /** Set when the token stops being usable: on rotation, logout or detected reuse. */
  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  /** Set when this token was exchanged for a successor (normal rotation). */
  @Prop({ type: Date, default: null })
  rotatedAt: Date | null;

  /** Set on every token of the family when the whole session ends (logout or reuse). */
  @Prop({ type: Date, default: null })
  familyRevokedAt: Date | null;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
export const RefreshTokenSchema = createSchema(RefreshToken);
