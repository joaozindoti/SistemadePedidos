export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: "pizza" | "bebida" | "esfirra";
  base_price: number;
  active: boolean;
  max_flavors: number | null;
}

export interface Flavor {
  id: string;
  name: string;
  flavor_type: "salgada" | "doce";
  extra_price: number;
  active: boolean;
}

export interface Crust {
  id: string;
  name: string;
  extra_price: number;
  active: boolean;
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
