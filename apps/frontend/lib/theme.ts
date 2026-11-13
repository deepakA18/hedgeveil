export const themeStorageKey = "hedgeveil.theme";

// Runs before paint. The desk's CSP authorizes this with its request nonce.
export const themeInit = `try{var t=localStorage.getItem("${themeStorageKey}")==="dark"?"dark":"light";document.documentElement.dataset.theme=t;document.documentElement.classList.toggle("dark",t==="dark");document.querySelector('meta[name="theme-color"]')?.setAttribute("content",t==="dark"?"#111813":"#f7f8f2")}catch{}`;
