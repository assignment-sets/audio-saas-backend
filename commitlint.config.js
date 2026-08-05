export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 0 = disable, 2 = error. 'always' means enforce it. 200 is the new max length.
    'header-max-length': [2, 'always', 200],
    'body-max-line-length': [0, 'always'], // allow unrestricted body line length for descriptive commits
  },
};
