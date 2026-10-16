export const CATEGORY_THEME_PALETTE = [
  "var(--category-tech)",
  "var(--category-fashion)",
  "var(--category-beauty)",
  "var(--category-home)",
  "var(--category-wellness)",
  "var(--category-business)",
  "var(--category-deals)",
] as const;

export type CategoryTheme = {
  accent: string;
  strong: string;
  soft: string;
  foreground: string;
};

const CATEGORY_GROUPS: Array<{ terms: string[]; paletteIndex: number; foreground?: string }> = [
  { terms: ["technology", "tech", "phone", "phones", "electronics", "computing"], paletteIndex: 0 },
  { terms: ["women", "womens", "fashion", "clothing", "apparel"], paletteIndex: 1 },
  { terms: ["beauty", "cosmetics", "skincare"], paletteIndex: 2 },
  { terms: ["home", "lifestyle", "living", "furniture"], paletteIndex: 3 },
  { terms: ["health", "wellness", "fitness"], paletteIndex: 4 },
  { terms: ["business", "service", "services", "office"], paletteIndex: 5 },
  { terms: ["deal", "deals", "promotion", "promotions", "sale"], paletteIndex: 6 },
];

function normalizedParts(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function fallbackIndex(value: string) {
  let hash = 2166136261;
  for (const character of value.toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % CATEGORY_THEME_PALETTE.length;
}

/** Returns stable catalogue accents without changing global brand styling. */
export function resolveCategoryTheme(slug?: string, name?: string): CategoryTheme {
  const identity = [slug, name].filter(Boolean).join(" ") || "all-products";
  const parts = normalizedParts(identity);
  const known = CATEGORY_GROUPS.find(group => group.terms.some(term => parts.includes(term)));
  const accent = CATEGORY_THEME_PALETTE[known?.paletteIndex ?? fallbackIndex(identity)];
  return {
    accent,
    strong: `color-mix(in srgb, ${accent} 78%, #000000)`,
    soft: `color-mix(in srgb, ${accent} 12%, var(--surface-card))`,
    foreground: known?.foreground ?? "#FFFFFF",
  };
}
