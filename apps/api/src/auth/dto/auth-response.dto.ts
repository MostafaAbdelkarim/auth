import { ApiProperty } from '@nestjs/swagger';
import { PublicUser } from '../../users/user.types';

/** Tokens travel only in httpOnly cookies; the body carries the user. */
export class AuthResponseDto {
  @ApiProperty({ type: PublicUser })
  user: PublicUser;
}
