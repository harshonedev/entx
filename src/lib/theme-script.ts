/** Light is the newsprint day edition, dark the Night Edition; "system" follows the OS. */
export const THEME_KEY = "entx-theme";

/**
 * Inlined in <head> by both layouts so the page never flashes the wrong edition: sets html[data-theme]
 * to the resolved theme and keeps following the OS while no explicit choice is stored.
 */
export const themeScript = `(function(){try{var k=${JSON.stringify(THEME_KEY)},d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){var v=null;try{v=localStorage.getItem(k)}catch(e){}d.dataset.theme=v==="light"||v==="dark"?v:m.matches?"dark":"light"}a();m.addEventListener("change",a);addEventListener("storage",function(e){if(e.key===k)a()})}catch(e){}})();`;
