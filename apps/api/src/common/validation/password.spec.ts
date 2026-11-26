import { PASSWORD_PATTERN } from './password';

describe('PASSWORD_PATTERN', () => {
  it.each([
    'abcdef1!',
    'Passw0rd#',
    'ü1!aaaaa',
    'a1 bcdefg',
    `a1!${'x'.repeat(125)}`,
    `a1!${'😀'.repeat(125)}`,
    'abc\n1234',
  ])('accepts %s', (password) => expect(PASSWORD_PATTERN.test(password)).toBe(true));

  it.each([
    ['too short', 'ab1!xyz'],
    ['no letter', '12345678!'],
    ['no number', 'abcdefgh!'],
    ['no special character', 'abcdefg1'],
    ['longer than 128', `a1!${'x'.repeat(126)}`],
    ['empty', ''],
    ['7 characters made long by emoji', '😀😀😀😀a1!'],
    ['129 characters counting emoji as one', `a1!${'😀'.repeat(126)}`],
  ])('rejects a password that is %s', (_reason, password) =>
    expect(PASSWORD_PATTERN.test(password)).toBe(false),
  );
});
