(function () {
  try {
    var k = "mt-theme";
    var m = localStorage.getItem(k) || "system";
    var d =
      m === "dark" ||
      (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", d);
    document.documentElement.dataset.theme = d ? "dark" : "light";
  } catch (e) {
    /* theme init is best-effort */
  }
})();
