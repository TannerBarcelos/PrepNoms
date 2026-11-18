import type { CatalogItem, Recipe, ProfileId, StoredRecipe } from './types'

export interface Base {
  catalog: Record<string, CatalogItem>
  recipes: Record<ProfileId, Recipe[]>
  missing: ProfileId[]
}
export interface Library {
  catalog: Record<string, CatalogItem>
  catalogList: CatalogItem[]
  baseCatalog: Record<string, CatalogItem>
  recipes: Record<string, StoredRecipe>
  mine: StoredRecipe[]
  hidden: StoredRecipe[]
}

/* The published starting data. A profile's recipe file may be gone once it has been copied into that person's private space. */
export async function loadBase(): Promise<Base> {
  const get = async (f: string) => { const r = await fetch(f); if (!r.ok) throw new Error(`${f} (${r.status})`); return r.json() }
  const ing = await get('./ingredients.json')
  const recipes: Record<ProfileId, Recipe[]> = { tanner: [], jen: [] }
  const missing: ProfileId[] = []
  await Promise.all((['tanner', 'jen'] as ProfileId[]).map(async (p) => {
    try { recipes[p] = (await get(`./${p}-meals.json`)).recipes } catch { missing.push(p) }
  }))
  return { catalog: Object.fromEntries((ing.items as CatalogItem[]).map((c) => [c.id, c])), recipes, missing }
}

export function buildLibrary(base: Base, catalogEdits: Record<string, CatalogItem>, recipes: Record<string, StoredRecipe>): Library {
  const catalog = { ...base.catalog, ...catalogEdits }
  const catalogList = Object.values(catalog).sort((a, b) => a.name.localeCompare(b.name))
  const all = Object.values(recipes).sort((a, b) => ['breakfast', 'lunch', 'dinner'].indexOf(a.mealType) - ['breakfast', 'lunch', 'dinner'].indexOf(b.mealType) || a.name.localeCompare(b.name))
  return { catalog, catalogList, baseCatalog: base.catalog, recipes, mine: all.filter((r) => !r.hidden), hidden: all.filter((r) => r.hidden) }
}

/* Store packages, ported from Gather v1. size is in the item's basis unit. */
type Pkg = { size: number; one: string; many: string; label?: string; each?: boolean; notGrocery?: boolean }
const F = (size: number, one: string, many: string, label?: string): Pkg => ({ size, one, many, label })
const E = (size: number, one: string, many: string): Pkg => ({ size, one, many, each: true })
export const PKG: Record<string, Pkg> = {
  'chicken-breast': F(680, 'pack', 'packs', '~1.5 lb'), 'chicken-thigh': F(680, 'pack', 'packs', '~1.5 lb'), 'chicken-tenders': F(454, 'pack', 'packs', '~1 lb'),
  'ground-beef-93': F(454, 'pack', 'packs', '1 lb'), 'ground-beef-90': F(454, 'pack', 'packs', '1 lb'), 'ground-turkey-93': F(454, 'pack', 'packs', '1 lb'),
  sirloin: F(454, 'pack', 'packs', '~1 lb'), 'flank-steak': F(680, 'steak', 'steaks', '~1.5 lb'), 'beef-chuck': F(1134, 'roast', 'roasts', '~2.5 lb'),
  salmon: F(454, 'pack', 'packs', '~1 lb'), cod: F(454, 'pack', 'packs', '~1 lb'), bacon: F(340, 'pack', 'packs', '12 oz'),
  egg: F(12, 'dozen', 'dozen'), 'egg-whites': F(946, 'carton', 'cartons', '32 oz'), parmesan: F(142, 'tub', 'tubs', '5 oz grated'),
  mozzarella: F(227, 'bag', 'bags', '8 oz shredded'), 'mexican-cheese': F(227, 'bag', 'bags', '8 oz shredded'), cheddar: F(227, 'bag', 'bags', '8 oz shredded'),
  'cream-cheese': F(227, 'block', 'blocks', '8 oz'), 'sour-cream': F(454, 'tub', 'tubs', '16 oz'), 'heavy-cream': F(473, 'pint', 'pints'), 'half-and-half': F(473, 'pint', 'pints'),
  'milk-2': F(1892, 'half gallon', 'half gallons'), butter: F(454, 'box', 'boxes', '1 lb, 4 sticks'), 'greek-yogurt-plain': F(907, 'tub', 'tubs', '32 oz'),
  'jasmine-rice': F(907, 'bag', 'bags', '2 lb'), 'pasta-short': F(454, 'box', 'boxes', '1 lb'), 'pasta-long': F(454, 'box', 'boxes', '1 lb'), 'elbow-macaroni': F(454, 'box', 'boxes', '1 lb'),
  'lo-mein-noodles': F(227, 'pack', 'packs', '8 oz'), 'flour-tortilla': F(10, 'pack', 'packs', '10 tortillas'), 'large-tortilla': F(8, 'pack', 'packs', '8 tortillas'),
  'lc-tortilla-10': F(6, 'pack', 'packs', '6 tortillas'), 'english-muffin': F(6, 'pack', 'packs', '6 muffins'), panko: F(227, 'box', 'boxes', '8 oz'),
  flour: F(2268, 'bag', 'bags', '5 lb'), cornstarch: F(454, 'box', 'boxes', '16 oz'), 'dave-thin-21': F(22, 'loaf', 'loaves', '~22 slices'),
  'potato-russet': E(250, 'potato', 'potatoes'), 'potato-baby': F(680, 'bag', 'bags', '1.5 lb'), 'potato-yukon': F(1361, 'bag', 'bags', '3 lb'), 'sweet-potato': E(300, 'sweet potato', 'sweet potatoes'),
  broccoli: F(340, 'bag', 'bags', '12 oz florets'), brussels: F(454, 'bag', 'bags', '1 lb'), carrot: F(454, 'bag', 'bags', '1 lb'), asparagus: F(454, 'bunch', 'bunches', '~1 lb'),
  'bell-pepper': E(160, 'pepper', 'peppers'), onion: E(150, 'onion', 'onions'), 'red-onion': E(150, 'red onion', 'red onions'), spinach: F(142, 'clamshell', 'clamshells', '5 oz'),
  'green-beans': F(340, 'bag', 'bags', '12 oz'), zucchini: E(200, 'zucchini', 'zucchini'), 'snap-peas': F(227, 'bag', 'bags', '8 oz'), cabbage: F(397, 'bag', 'bags', '14 oz slaw mix'),
  mushrooms: F(227, 'pack', 'packs', '8 oz'), 'cherry-tomatoes': F(283, 'pint', 'pints'), 'roma-tomato': E(62, 'tomato', 'tomatoes'), cucumber: E(300, 'cucumber', 'cucumbers'),
  romaine: F(600, 'pack', 'packs', '3 hearts'), avocado: E(136, 'avocado', 'avocados'), garlic: E(40, 'head', 'heads'), ginger: E(50, 'knob', 'knobs'),
  'green-onion': E(100, 'bunch', 'bunches'), cilantro: E(60, 'bunch', 'bunches'), parsley: E(60, 'bunch', 'bunches'), basil: F(21, 'pack', 'packs', '0.75 oz'),
  jalapeno: E(14, 'jalapeño', 'jalapeños'), 'lime-juice': E(30, 'lime', 'limes'), 'lemon-juice': E(45, 'lemon', 'lemons'), 'orange-juice': F(946, 'carton', 'cartons', '32 oz'),
  pineapple: F(454, 'container', 'containers', '16 oz'), corn: F(454, 'bag', 'bags', '16 oz frozen'), peas: F(454, 'bag', 'bags', '16 oz frozen'), banana: E(1, 'banana', 'bananas'),
  'black-beans': F(250, 'can', 'cans', '15 oz'), 'pinto-beans': F(250, 'can', 'cans', '15 oz'), 'crushed-tomatoes': F(794, 'can', 'cans', '28 oz'), 'diced-tomatoes': F(411, 'can', 'cans', '14.5 oz'),
  'tomato-paste': F(170, 'can', 'cans', '6 oz'), 'green-chiles': F(113, 'can', 'cans', '4 oz'), 'chicken-broth': F(946, 'carton', 'cartons', '32 oz'), 'beef-broth': F(946, 'carton', 'cartons', '32 oz'),
  'chipotle-adobo': F(198, 'can', 'cans', '7 oz'), 'olive-oil': F(460, 'bottle', 'bottles', '16.9 oz'), 'avocado-oil': F(460, 'bottle', 'bottles', '16.9 oz'), 'sesame-oil': F(136, 'bottle', 'bottles', '5 oz'),
  'soy-sauce': F(296, 'bottle', 'bottles', '10 oz'), honey: F(340, 'bottle', 'bottles', '12 oz'), 'sf-honey': F(340, 'bottle', 'bottles', '12 oz'), 'brown-sugar': F(907, 'bag', 'bags', '2 lb'),
  mirin: F(296, 'bottle', 'bottles', '10 oz'), 'rice-vinegar': F(355, 'bottle', 'bottles', '12 oz'), 'apple-cider-vinegar': F(473, 'bottle', 'bottles', '16 oz'), 'red-wine-vinegar': F(375, 'bottle', 'bottles', '12.7 oz'),
  'white-wine': F(750, 'bottle', 'bottles', '750 ml'), 'red-wine': F(750, 'bottle', 'bottles', '750 ml'), miso: F(397, 'tub', 'tubs', '14 oz'), hoisin: F(241, 'jar', 'jars', '8.5 oz'),
  'oyster-sauce': F(255, 'bottle', 'bottles', '9 oz'), gochujang: F(500, 'tub', 'tubs', '17.6 oz'), 'chili-garlic-sauce': F(227, 'jar', 'jars', '8 oz'), 'hot-sauce': F(177, 'bottle', 'bottles', '6 oz'),
  'bbq-sauce': F(510, 'bottle', 'bottles', '18 oz'), dijon: F(340, 'jar', 'jars', '12 oz'), worcestershire: F(296, 'bottle', 'bottles', '10 oz'), salsa: F(454, 'jar', 'jars', '16 oz'),
  'salsa-verde': F(454, 'jar', 'jars', '16 oz'), 'enchilada-sauce': F(283, 'can', 'cans', '10 oz'), marinara: F(680, 'jar', 'jars', '24 oz'), 'ranch-mix': F(28, 'packet', 'packets', '1 oz'),
  'sesame-seeds': F(57, 'jar', 'jars', '2 oz'), 'vanilla-syrup': F(375, 'bottle', 'bottles', '12.7 oz'), espresso: F(30, 'bag of coffee', 'bags of coffee', '~30 shots'),
  salt: F(1361, 'box', 'boxes', '3 lb'), 'bay-leaf': F(5, 'jar', 'jars', '0.2 oz'), 'dannon-lf-strawberry': F(4, '4-pack', '4-packs', '4 cups'),
  'david-bar-pbcc': F(1, 'bar', 'bars'), 'fairlife-choc': F(4, '4-pack', '4-packs', '4 bottles'), 'bpn-mocha': F(30, 'tub', 'tubs', '~30 scoops'),
  'vanilla-latte': { size: 1, one: 'latte', many: 'lattes', notGrocery: true },
}
for (const s of ['black-pepper', 'garlic-powder', 'onion-powder', 'smoked-paprika', 'paprika', 'chili-powder', 'cumin', 'oregano', 'italian-seasoning', 'thyme', 'rosemary', 'coriander', 'ground-ginger', 'allspice', 'lemon-pepper', 'cayenne', 'red-pepper-flakes', 'chipotle-powder', 'cajun', 'dried-dill'])
  PKG[s] = F(45, 'jar', 'jars', '~1.5 oz')

export const CATEGORY_ORDER = ['Produce', 'Meat & Seafood', 'Dairy & Refrigerated', 'Grains & Pasta', 'Canned & Packaged', 'Sauces & Condiments', 'Spices', 'Snacks & Protein', 'Other']
