// Conventional Commits, with the types and scopes listed in docs/contributing.md.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'test', 'docs', 'refactor', 'perf', 'chore', 'build', 'ci', 'revert'],
    ],
    'scope-enum': [2, 'always', ['api', 'web', 'auth', 'users', 'infra', 'deps']],
  },
};
