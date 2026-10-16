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

// Bebidas usam a foto do produto (enviada pela pizzaria), uma por tamanho:
// lata 350ml, garrafa 1L e garrafa 2L.
export function simpleItemImage(name: string, category: string): string | null {
  if (category === "esfirra") return ESFIRRA_IMAGE;
  if (category !== "bebida") return null;
  const n = normalize(name);
  const size = n.includes("350") ? "lata" : n.includes("2 litro") || n.includes("2l") ? "2l" : "1l";
  if (n.includes("agua")) return "/cardapio/bebidas/agua.webp";
  if (n.includes("coca") && (n.includes("zero") || n.includes("sem acucar"))) {
    return `/cardapio/bebidas/coca-zero-${size}.webp`;
  }
  if (n.includes("coca")) return `/cardapio/bebidas/coca-${size}.webp`;
  if (n.includes("sprite")) return `/cardapio/bebidas/sprite-zero-${size === "1l" ? "2l" : size}.webp`;
  if (n.includes("jesus")) return `/cardapio/bebidas/jesus-${size}.webp`;
  if (n.includes("fanta") || n.includes("laranja")) return `/cardapio/bebidas/fanta-${size}.webp`;
  if (n.includes("guarana")) return `/cardapio/bebidas/guarana-${size}.webp`;
  return null;
}

// Foto de produto (fundo branco) aparece inteira; foto de prato preenche.
export function isPackshot(src: string | null): boolean {
  return Boolean(src?.includes("/cardapio/bebidas/"));
}
