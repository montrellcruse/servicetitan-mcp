import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["build/**", "coverage/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/schema-compat.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["zod", "zod/*"], message: "Use the project schema facade so bounded arrays reject before child parsing." }] }],
      "no-restricted-syntax": ["error",
        { selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='array'][arguments.length=0]", message: "Use z.array(element); legacy instance array() creates an unguarded collection." },
        { selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='deepPartial']", message: "Legacy deepPartial() recreates unguarded arrays. Build the optional shape explicitly." },
      ],
    },
  },
];
