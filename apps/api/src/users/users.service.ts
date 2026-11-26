import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logging/app-logger';
import { InjectModel } from '@nestjs/mongoose';
import { isUUID } from 'class-validator';
import type { SoftDeleteModel } from '../common/database/abstract.schema';
import { AppException } from '../common/http/app.exception';
import { ErrorCode } from '../common/http/error-codes';
import { fingerprint } from '../common/logging/fingerprint';
import { User, UserDocument } from './schemas/user.schema';

const MONGO_DUPLICATE_KEY = 11000;

@Injectable()
export class UsersService {
  private readonly logger = new AppLogger(UsersService.name);

  constructor(@InjectModel(User.name) private readonly userModel: SoftDeleteModel<User>) {}

  async create(data: { email: string; name: string; passwordHash: string }): Promise<UserDocument> {
    try {
      const user = await this.userModel.create(data);
      this.logger.debug('User document created', { event: 'users.created', userId: user._id });
      return user;
    } catch (error) {
      // The unique index is the source of truth; checking first would race with concurrent sign-ups.
      if ((error as { code?: number }).code === MONGO_DUPLICATE_KEY) {
        this.logger.warn('Sign-up attempted with an email that is already registered', {
          event: 'users.create.duplicate_email',
          email: fingerprint(data.email),
        });
        throw AppException.conflict(
          ErrorCode.EMAIL_ALREADY_REGISTERED,
          'Email is already registered',
        );
      }
      throw error;
    }
  }

  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  /** Live (not soft-deleted) user by id; malformed ids never reach the database. */
  async findById(id: string): Promise<UserDocument | null> {
    if (!isUUID(id, 4)) return null;
    return this.userModel.findById(id).exec();
  }

  async softDelete(id: string): Promise<boolean> {
    const deleted = await this.userModel.softDeleteById(id);
    this.logger.info('User soft delete', { event: 'users.soft_deleted', userId: id, deleted });
    return deleted;
  }
}
