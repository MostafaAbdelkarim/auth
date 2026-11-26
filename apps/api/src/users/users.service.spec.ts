import { Logger } from '@nestjs/common';
import { ErrorCode } from '../common/http/error-codes';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const model = {
    create: jest.fn(),
    findById: jest.fn(),
    softDeleteById: jest.fn(),
  };
  const service = new UsersService(model as never);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('turns a duplicate key error into EMAIL_ALREADY_REGISTERED', async () => {
    model.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    await expect(
      service.create({ email: 'a@example.com', name: 'Abc', passwordHash: 'h' }),
    ).rejects.toMatchObject({ code: ErrorCode.EMAIL_ALREADY_REGISTERED });
  });

  it('rethrows any other database error unchanged', async () => {
    const failure = new Error('connection lost');
    model.create.mockRejectedValue(failure);
    await expect(
      service.create({ email: 'a@example.com', name: 'Abc', passwordHash: 'h' }),
    ).rejects.toBe(failure);
  });

  it.each(['not-a-uuid', '6650c0ffee0ddba11c0ffee0', ''])(
    'does not query the database for a malformed id (%s)',
    async (id) => {
      await expect(service.findById(id)).resolves.toBeNull();
      expect(model.findById).not.toHaveBeenCalled();
    },
  );

  it('soft-deletes through the model', async () => {
    model.softDeleteById.mockResolvedValue(true);
    await expect(service.softDelete('3b241101-e2bb-4255-8caf-4136c566a962')).resolves.toBe(true);
  });
});
