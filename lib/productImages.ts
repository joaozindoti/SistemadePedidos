// Fotos do cardápio (geradas pra marca, em public/cardapio). O banco não tem
// imagem por sabor, então o vínculo é pelo nome. Sabor sem foto cai no
// ícone padrão — dá pra ir completando só soltando o arquivo e a linha aqui.

const FLAVOR_IMAGES: Record<string, string> = {
  calabresa: "/cardapio/sabores/calabresa.webp",
  mussarela: "/cardapio/sabores/mussarela.webp",
  bacon: "/cardapio/sabores/bacon.webp",
  baiana: "/cardapio/sabores/baiana.webp",
  portuguesa: "/cardapio/sabores/portuguesa.webp",
};

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function flavorImage(name: string): string | null {
  return FLAVOR_IMAGES[normalize(name)] ?? null;
}

export const PIZZA_IMAGE = "/cardapio/pizza.webp";
export const ESFIRRA_IMAGE = "/cardapio/esfirra.webp";

// Bebidas usam foto real do rótulo (Wikimedia Commons / Open Food Facts,
// licenças livres — créditos em public/cardapio/bebidas/CREDITOS.txt e no
// rodapé): lata pra 350ml, garrafa pra 1L/2L.
export function simpleItemImage(name: string, category: string): string | null {
  if (category === "esfirra") return ESFIRRA_IMAGE;
  if (category !== "bebida") return null;
  const n = normalize(name);
  const pack = n.includes("350") ? "lata" : "garrafa";
  if (n.includes("coca")) return `/cardapio/bebidas/coca-${pack}.webp`;
  if (n.includes("fanta") || n.includes("laranja")) return `/cardapio/bebidas/fanta-${pack}.webp`;
  if (n.includes("guarana")) return `/cardapio/bebidas/guarana-${pack}.webp`;
  return null;
}
