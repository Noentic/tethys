/**
 * File-extension to Shiki language id (M1.9 U3). No match resolves to plain
 * text, which is the correct graceful path, not an error.
 */

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  vue: "vue",
  svelte: "svelte",
  md: "markdown",
  mdx: "mdx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  xml: "xml",
  dockerfile: "docker",
};

const FILENAME_LANGUAGES: Record<string, string> = {
  dockerfile: "docker",
  makefile: "make",
  ".gitignore": "gitignore",
};

export function languageForPath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const filename = normalized.slice(normalized.lastIndexOf("/") + 1);
  const lowerFilename = filename.toLowerCase();
  if (FILENAME_LANGUAGES[lowerFilename]) {
    return FILENAME_LANGUAGES[lowerFilename];
  }
  const dot = lowerFilename.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const extension = lowerFilename.slice(dot + 1);
  return EXTENSION_LANGUAGES[extension] ?? null;
}
