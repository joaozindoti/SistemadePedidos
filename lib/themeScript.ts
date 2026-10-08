// Fica fora de lib/theme.tsx ("use client") porque o layout raiz é server
// component: exportar uma string de um módulo client vira referência de
// client, não o texto.
export const THEME_STORAGE_KEY = "ss-tema";

// Roda no <head> antes da pintura, pra página não piscar no tema errado.
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='claro'){document.documentElement.dataset.theme='light'}}catch(e){}`;
