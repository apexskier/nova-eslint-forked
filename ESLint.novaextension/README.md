# ESLint Extension for Nova

Provides integration with ESLint to lint your code.

**NOTE:** This is a fork of an earlier version of this plugin. See https://github.com/jsmecham/nova-eslint/pull/6 for more context on why I forked.

## Features

- Inline ESLint issue reporting
- "Fix All Issues" command
- "Apply a Suggestion" command ([more information](https://eslint.org/docs/developer-guide/working-with-rules#providing-suggestions))
- Auto-fix on save preference
- Custom ESLint install locations
- Supports multiple file formats
  - Javascript/Typescript
  - HTML (requires [`eslint-plugin-html`](https://www.npmjs.com/package/eslint-plugin-html))
  - Markdown (requires [`eslint-plugin-markdown`](https://www.npmjs.com/package/eslint-plugin-markdown))
  - Vue (requires [`eslint-plugin-vue`](https://www.npmjs.com/package/eslint-plugin-vue) and the [Vue extension](nova://extension/?id=com.tommasonegri.Vue&name=Vue))

## Setup

To use this, follow the [Getting Started with ESLint](https://eslint.org/docs/user-guide/getting-started) instructions. You'll need to have ESLint installed locally in your project (probably in the root `node_modules` directory)—if you rely on a global or custom ESLint installation you can configure that by setting the "Path to ESLint executable" preference.

To verify you've set up correctly, run `$(npm bin)/eslint ./path/to/file.js` on a file and make sure the output is correct (no output if you don't expect issues, expected issues if you do).

### Screenshots

<img src="https://raw.githubusercontent.com/apexskier/nova-eslint/72c645668abed4e0d719a6f62cf1bc5e02691bae/ESLint.novaextension/Images/inline-errors.png" alt="Inline errors" width="400" />

<img src="https://raw.githubusercontent.com/apexskier/nova-eslint/72c645668abed4e0d719a6f62cf1bc5e02691bae/ESLint.novaextension/Images/sidebar-errors.png" alt="Sidebar errors" width="400" />

<img src="https://raw.githubusercontent.com/apexskier/nova-eslint/72c645668abed4e0d719a6f62cf1bc5e02691bae/ESLint.novaextension/Images/suggestions.png" alt="Suggestions" width="400" />
