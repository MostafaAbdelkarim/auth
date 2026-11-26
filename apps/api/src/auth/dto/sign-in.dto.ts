import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/validation/password';
import { normalizeEmail } from '../../common/validation/transforms';

/** Sign-in only checks shape; the password policy is enforced at sign-up. */
export class SignInDto {
  @ApiProperty({ example: 'jane@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Sup3r$ecret' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
