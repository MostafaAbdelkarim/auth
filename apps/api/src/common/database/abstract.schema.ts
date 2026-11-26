import type { Type } from '@nestjs/common';
import { Prop, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import type { Model, MongooseQueryMiddleware, Query, Schema, SchemaOptions } from 'mongoose';

/** Options every collection shares; spread into each @Schema({...}). */
export const BASE_SCHEMA_OPTIONS = {
  timestamps: true,
  versionKey: false,
} as const satisfies SchemaOptions;

/**
 * Base for every persisted model:
 * - `_id` is a random UUIDv4 string (no ObjectId, so ids reveal no creation time or ordering),
 * - `createdAt` / `updatedAt` are maintained by Mongoose timestamps,
 * - `deletedAt` marks a soft delete; build schemas with createSchema() so that soft-deleted
 *   documents are hidden from queries by default.
 *
 * Soft delete is deliberate groundwork: no endpoint deletes anything yet. A future
 * delete-account endpoint (or any new entity that extends AbstractSchema) gets it for free:
 * call `Model.softDeleteById(id)` (see UsersService.softDelete) and every existing query keeps
 * ignoring the record. Sign-in, /users/me and session refresh already reject soft-deleted users,
 * which the e2e suite proves.
 */
export abstract class AbstractSchema {
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

/** A model built with createSchema(). */
export interface SoftDeleteModel<T> extends Model<T> {
  /** Marks a live document deleted. Returns false if there was none. */
  softDeleteById(id: string): Promise<boolean>;
}

const FILTERED_QUERIES: MongooseQueryMiddleware[] = [
  'countDocuments',
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
];

/**
 * Adds `deletedAt: null` to every read/update filter unless the query already filters on
 * deletedAt or opts out with `{ withDeleted: true }`. Fail-safe: forgetting the filter in a
 * service can't leak deleted records.
 */
export function softDeletePlugin(schema: Schema): void {
  schema.pre(FILTERED_QUERIES, function excludeDeleted(this: Query<unknown, unknown>) {
    if (this.getOptions().withDeleted) return;
    if ('deletedAt' in this.getFilter()) return;
    this.where({ deletedAt: null });
  });

  schema.pre('aggregate', function excludeDeletedFromPipeline() {
    if ((this.options as { withDeleted?: boolean }).withDeleted) return;
    this.pipeline().unshift({ $match: { deletedAt: null } });
  });

  schema.static('softDeleteById', async function softDeleteById(this: Model<unknown>, id: string) {
    const result = await this.updateOne(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
    return result.modifiedCount === 1;
  });
}

/** SchemaFactory.createForClass plus the shared soft-delete behaviour. */
export function createSchema<T extends AbstractSchema>(model: Type<T>): Schema<T> {
  const schema = SchemaFactory.createForClass(model);
  schema.plugin(softDeletePlugin);
  return schema;
}
