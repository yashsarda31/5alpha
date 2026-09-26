import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
 { ignores: ['dist/**','node_modules/**','src/legacy/**','scripts/**','public/**','tests/**','**/*.test.*'] },
 js.configs.recommended, ...tseslint.configs.recommended,
 { files: ['src/**/*.{ts,tsx,js}'], languageOptions:{globals:globals.browser}, plugins:{'react-hooks':hooks}, rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]} },
 { files: ['*.js','*.ts'], languageOptions:{globals:globals.node} },
);
