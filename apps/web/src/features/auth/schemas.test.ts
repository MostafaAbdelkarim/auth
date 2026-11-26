import { passwordRules, signInSchema, signUpSchema } from './schemas';

const valid = { email: 'jane@example.com', name: 'Jane', password: 'Sup3r$ecret' };

function errorsFor(input: Record<string, string>) {
  const result = signUpSchema.safeParse({ ...valid, ...input });
  return result.success ? {} : result.error.flatten().fieldErrors;
}

describe('signUpSchema', () => {
  it('accepts valid input and normalises the email', () => {
    expect(signUpSchema.parse({ ...valid, email: '  Jane@Example.COM ' }).email).toBe(
      'jane@example.com',
    );
  });

  it.each([
    [{ email: '' }, 'email', 'Email is required'],
    [{ email: 'jane@' }, 'email', 'Enter a valid email address'],
    [{ name: 'Jo' }, 'name', 'Name must be at least 3 characters'],
    [{ name: '   ab   ' }, 'name', 'Name must be at least 3 characters'],
    [{ password: 'Ab1!' }, 'password', 'Password does not meet all the requirements'],
    [{ password: '12345678!' }, 'password', 'Password does not meet all the requirements'],
    [{ password: 'abcdefgh!' }, 'password', 'Password does not meet all the requirements'],
    [{ password: 'abcdefg1' }, 'password', 'Password does not meet all the requirements'],
  ])('rejects %j', (input, field, message) => {
    expect(errorsFor(input)).toEqual({ [field]: [message] });
  });
});

describe('passwordRules', () => {
  const failing = (password: string) =>
    passwordRules.filter((rule) => !rule.test(password)).map((rule) => rule.id);

  it('reports exactly which rules fail', () => {
    expect(failing('')).toEqual(['length', 'letter', 'number', 'special']);
    expect(failing('abcdefgh')).toEqual(['number', 'special']);
    expect(failing('Sup3r$ecret')).toEqual([]);
  });

  it('counts characters, not UTF-16 units, exactly like the API', () => {
    expect(failing('😀😀😀😀a1!')).toEqual(['length']);
    expect(signUpSchema.safeParse({ ...valid, password: `a1!${'😀'.repeat(125)}` }).success).toBe(
      true,
    );
    expect(signUpSchema.safeParse({ ...valid, password: `a1!${'😀'.repeat(126)}` }).success).toBe(
      false,
    );
  });

  it('accepts a newline like any other special character, as the API does', () => {
    expect(failing('abc\n1234')).toEqual([]);
  });

  it('counts non-ASCII letters as letters', () => {
    expect(failing('ünïcødé1!')).toEqual([]);
  });
});

describe('signInSchema', () => {
  it('requires both fields', () => {
    const result = signInSchema.safeParse({ email: '', password: '' });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors).toEqual({
      email: ['Email is required'],
      password: ['Password is required'],
    });
  });
});
