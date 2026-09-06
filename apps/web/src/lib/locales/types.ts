import type { en } from "./en";
import type { enSearch } from "./en-search";
import type { enShell } from "./en-shell";

export type TranslationKey =
  | keyof typeof en
  | keyof typeof enSearch
  | keyof typeof enShell;
