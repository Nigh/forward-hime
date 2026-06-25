import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier/recommended";
import unusedImports from "eslint-plugin-unused-imports";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		plugins: {
			"unused-imports": unusedImports,
		},
		rules: {
			"no-console": "warn",
			"prettier/prettier": "warn",
			"no-unused-vars": "off",
			"unused-imports/no-unused-vars": "off",
			"unused-imports/no-unused-imports": "warn",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					args: "after-used",
					ignoreRestSiblings: false,
					argsIgnorePattern: "^_.*?$",
				},
			],
			"padding-line-between-statements": [
				"warn",
				{
					blankLine: "always",
					prev: "*",
					next: "return",
				},
				{
					blankLine: "always",
					prev: ["const", "let", "var"],
					next: "*",
				},
				{
					blankLine: "any",
					prev: ["const", "let", "var"],
					next: ["const", "let", "var"],
				},
			],
		},
	},
	{
		ignores: ["lib/", "node_modules/"],
	},
);
