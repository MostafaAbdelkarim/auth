import { Prop, Schema } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  AbstractSchema,
  BASE_SCHEMA_OPTIONS,
  createSchema,
} from '../../common/database/abstract.schema';

@Schema({ collection: 'users', ...BASE_SCHEMA_OPTIONS })
export class User extends AbstractSchema {
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** Never returned by default queries; load it explicitly with .select('+passwordHash'). */
  @Prop({ required: true, select: false })
  passwordHash: string;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = createSchema(User);

/**
 * One live account per email. Soft-deleted accounts are left out of the index, so the
 * address can be registered again; the index (not a pre-check) is what prevents races.
 */
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);
