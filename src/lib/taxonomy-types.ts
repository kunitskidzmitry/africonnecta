/** Код языка (iso639_1) — то, чем язык обозначается в URL поиска: он не зависит от засева. */
export type LanguageOption = { id: number; code: string; name: string };
export type ExpertiseOption = { id: number; slug: string; label: string; parentId: number | null };
