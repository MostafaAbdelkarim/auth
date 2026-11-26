import { ApiProperty } from '@nestjs/swagger';
import type { UserDocument } from './schemas/user.schema';

/** The only user shape that leaves the API. */
export class PublicUser {
  @ApiProperty({ example: '3b241101-e2bb-4255-8caf-4136c566a962', format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ example: 'Jane Doe' })
  name: string;

  @ApiProperty()
  createdAt: Date;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return { id: user._id, email: user.email, name: user.name, createdAt: user.createdAt };
}
