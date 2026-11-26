import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MESSAGE,
  PASSWORD_PATTERN,
} from '../../common/validation/password';
import { normalizeEmail, trim } from '../../common/validation/transforms';

export class SignUpDto {
  @ApiProperty({ example: 'jane@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Jane Doe', minLength: NAME_MIN_LENGTH, maxLength: NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(NAME_MIN_LENGTH, { message: `Name must be at least ${NAME_MIN_LENGTH} characters` })
  @MaxLength(NAME_MAX_LENGTH, { message: `Name must be at most ${NAME_MAX_LENGTH} characters` })
  name: string;

  @ApiProperty({ example: 'Sup3r$ecret', description: PASSWORD_MESSAGE })
  @IsString()
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password: string;
}
