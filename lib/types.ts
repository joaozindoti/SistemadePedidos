export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: "pizza" | "bebida" | "esfirra";
  base_price: number;
  active: boolean;
  max_flavors: number | null;
  // false = tamanho sem preço especial (Brotinho): qualquer sabor no preço base.
  cobra_especial?: boolean;
  // Foto enviada pelo painel; nulo = foto padrão.
  image_url?: string | null;
}

export interface Flavor {
  id: string;
  name: string;
  flavor_type: "salgada" | "doce";
  extra_price: number;
  active: boolean;
  image_url?: string | null;
}

export interface TaxaEntrega {
  cidade: string;
  valor: number;
}

export interface Crust {
  id: string;
  name: string;
  extra_price: number;
  active: boolean;
}

export type OrderStatus =
  | "pendente"
  | "confirmado"
  | "preparo"
  | "pronto"
  | "saiu_entrega"
  | "finalizado"
  | "cancelado";

// Mesmos limites que o create-order valida; mudar aqui exige mudar lá.
export const ORDER_LIMITS = {
  maxCartItems: 30,
  maxQuantity: 50,
  nameMax: 80,
  phoneMinDigits: 10,
  phoneMaxDigits: 13,
  notesMax: 500,
  itemNotesMax: 200,
  addressFieldMax: 120,
} as const;

// "local" = comer na pizzaria.
export type OrderType = "entrega" | "retirada" | "local";

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  entrega: "Entrega",
  retirada: "Retirada",
  local: "Comer aqui",
};

export const ORDER_TYPE_ICON: Record<OrderType, string> = {
  entrega: "two_wheeler",
  retirada: "storefront",
  local: "restaurant",
};

// "Entrega" / "Retirada" / "Comer aqui".
export function orderTypeText(type: string): string {
  return ORDER_TYPE_LABEL[type as OrderType] ?? type;
}

export interface Address {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
}

export type CartItem = {
  key: string;
  kind: "pizza" | "simple";
  menu_item_id: string;
  menu_item_name: string;
  flavor_ids?: string[];
  flavor_names?: string[];
  crust_id?: string;
  crust_name?: string;
  quantity: number;
  item_notes?: string;
  unit_price: number;
};
