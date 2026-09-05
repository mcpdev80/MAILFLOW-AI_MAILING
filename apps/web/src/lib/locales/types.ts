import type { en } from "./en";
import type { enSearch } from "./en-search";

export type TranslationKey = keyof typeof en | keyof typeof enSearch;
