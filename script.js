const CSV_PATH = "./assets/csv/products_export_1-2.csv";
const CART_STORAGE_KEY = "laaroussa_cart_v1";
const BOUCLES_GOLD_IMAGE_BY_COLOR = {
  blanche: "blanche.jpeg",
  "bleu ciel": "bleuciel.jpeg",
  bleuciel: "bleuciel.jpeg",
  "bleu nuit": "bleunuit.jpeg",
  bleunuit: "bleunuit.jpeg",
  "bleu royal": "bleuroyal.jpeg",
  bleuroyal: "bleuroyal.jpeg",
  champagne: "champagne.jpeg",
  emeraude: "emeraude.jpeg",
  fuchsia: "fuschia.jpeg",
  fuschia: "fuschia.jpeg",
  gold: "gold.jpeg",
  grenat: "grenat.jpeg",
  noir: "noir.jpeg",
  rose: "rose.jpeg",
  "rose gold": "rosegold.jpeg",
  rosegold: "rosegold.jpeg",
  rouge: "rouge.jpeg",
  "vert lime": "vertlime.jpeg",
  vertlime: "vertlime.jpeg",
  violet: "violet.jpeg",
};

const METAL_LABEL_FR = {
  Gold: "Or",
  Silver: "Argent",
  "N/A": "N/A",
};

init();

async function init() {
  initNavigation();
  try {
    const rawCsv = await fetch(CSV_PATH).then((response) => response.text());
    const allProducts = buildProducts(parseCsv(rawCsv));
    const page = document.body.dataset.page || "collection";
    if (page === "home") renderHomePage(allProducts);
    if (page === "collection") renderCollectionPage(allProducts);
    if (page === "product") renderProductPage(allProducts);
    if (page === "cart") renderCartPage();
    updateCartBadges();
  } catch (error) {
    const fallback = document.getElementById("collectionGrid") || document.getElementById("featuredGrid");
    if (fallback) fallback.innerHTML = '<p class="empty-state">Impossible de charger le CSV.</p>';
    console.error(error);
  }
}

function getCartItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCartItems(items) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  updateCartBadges();
}

function updateCartBadges() {
  const count = getCartItems().reduce((sum, item) => sum + (item.qty || 1), 0);
  document.querySelectorAll(".cart-link strong").forEach((badge) => {
    badge.textContent = String(count);
  });
}

function initNavigation() {
  const page = document.body.dataset.page || "";
  const params = new URLSearchParams(window.location.search);
  const currentType = params.get("type");

  document.querySelectorAll(".main-nav a[data-nav]").forEach((link) => {
    link.classList.remove("is-active");
  });

  const navKeyByPage = {
    home: "home",
    collection: "collection",
    product: "collection",
    cart: "cart",
  };
  const defaultKey = navKeyByPage[page] || "collection";
  const defaultLink = document.querySelector(`.main-nav a[data-nav="${defaultKey}"]`);
  if (defaultLink) defaultLink.classList.add("is-active");

  if (page === "collection" && currentType) {
    const typeLink = document.querySelector(`.main-nav a[data-type="${cssEscape(currentType)}"]`);
    if (typeLink) {
      if (defaultLink) defaultLink.classList.remove("is-active");
      typeLink.classList.add("is-active");
    }
  }

  const cartLink = document.querySelector(".cart-link");
  if (cartLink && page === "cart") cartLink.classList.add("is-active");
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

function parseCsv(input) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      current = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  const headers = rows[0] || [];
  return rows.slice(1).map((values) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || "";
    });
    return obj;
  });
}

function buildProducts(csvRows) {
  const map = new Map();

  csvRows.forEach((row) => {
    const handle = row.Handle?.trim();
    if (!handle) return;

    if (!map.has(handle)) {
      map.set(handle, {
        handle,
        code: extractCode(row.Title),
        title: row.Title?.trim() || handle,
        vendor: row.Vendor?.trim() || "",
        category: row["Product Category"]?.trim() || "Uncategorized",
        type: inferType(row.Title, handle, row.Type, row["Product Category"]),
        basePrice: Number.parseFloat(row["Variant Price"]) || 0,
        variants: [],
      });
    }

    const product = map.get(handle);
    const metal = normalizeMetal(row["Option1 Value"]);
    const color = normalizeColor(row["Option2 Value"]);
    const price = Number.parseFloat(row["Variant Price"]) || product.basePrice;
    const sku = row["Variant SKU"]?.trim() || "";

    if (!metal && !color) return;

    const signature = `${metal}__${color}`.toLowerCase();
    const alreadyExists = product.variants.some((variant) => variant.signature === signature);
    if (alreadyExists) return;

    product.variants.push({
      signature,
      metal: metal || "N/A",
      color: color || "N/A",
      sku,
      price,
    });
  });

  return [...map.values()]
    .map((product) => {
      const metals = [...new Set(product.variants.map((variant) => variant.metal))];
      const colors = [...new Set(product.variants.map((variant) => variant.color))];
      return { ...product, metals, colors };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function extractCode(title) {
  if (!title) return "CODE";
  const left = title.split("|")[0]?.trim();
  return left || title;
}

function normalizeMetal(value) {
  const clean = (value || "").trim().toLowerCase();
  if (clean.includes("gold")) return "Gold";
  if (clean.includes("silver")) return "Silver";
  return "";
}

function inferType(title, handle, rawType, rawCategory) {
  const source = `${title || ""} ${handle || ""} ${rawType || ""} ${rawCategory || ""}`.toLowerCase();

  if (source.includes("belt") || source.includes("ceinture")) return "BELT";
  if (source.includes("back accessoires") || source.includes("back accessory")) return "Back accessoires";
  // Broche must be detected before Earrings to avoid mixing categories.
  if (
    source.includes("broche") ||
    source.includes("brooch") ||
    source.includes("broche ") ||
    source.includes("-b")
  ) {
    return "Broche";
  }
  if (source.includes("earring") || source.includes("boucle") || source.includes("-e")) return "Earrings";
  if (source.includes("necklace") || source.includes("collier") || source.includes("-n")) return "Colliers";
  if (source.includes("crown") || source.includes("couronne")) return "Crown";

  // Anything uncategorized/other is intentionally grouped as Set.
  if (source.includes("set") || source.includes("-s") || source.includes("other") || source.includes("uncategorized")) return "Set";

  return "Set";
}

function normalizeColor(value) {
  if (!value) return "";
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  const colorMap = {
    white: "Blanche",
    black: "Noir",
    champagne: "Champagne",
    blue: "Bleu Royal",
    "petrol blue": "Bleu Nuit",
    lilla: "Violet",
    nude: "Rose",
    "nude (dark)": "Rose Gold",
    "nude 2": "Rose Gold",
    "baby blue": "Bleu Ciel",
    "almond green": "Vert Lime",
    pink: "Rose",
    "gold/taupe": "Gold",
    bordeaux: "Grenat",
    green: "Emeraude",
    fuchsia: "Fuchsia",
    fucshia: "Fuchsia",
  };
  return colorMap[normalized] || normalized.replace(/\b(\w)/g, (match) => match.toUpperCase());
}

function fillSelect(selectEl, defaultLabel, values) {
  selectEl.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = defaultLabel;
  selectEl.appendChild(allOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    if (selectEl.id.toLowerCase().includes("metal")) {
      option.textContent = metalLabelFr(value);
    } else if (selectEl.id.toLowerCase().includes("color")) {
      option.textContent = colorLabelFr(value);
    } else {
      option.textContent = value;
    }
    selectEl.appendChild(option);
  });
}

function renderActiveFilters(filters) {
  const activeFiltersEl = document.getElementById("activeFilters");
  if (!activeFiltersEl) return;
  activeFiltersEl.innerHTML = "";
  const chips = [];

  if (filters.selectedCategory) chips.push(`Catégorie: ${filters.selectedCategory}`);
  if (filters.selectedMetal) chips.push(`Métal: ${metalLabelFr(filters.selectedMetal)}`);
  if (filters.selectedColor) chips.push(`Couleur: ${colorLabelFr(filters.selectedColor)}`);
  if (filters.searchQuery) chips.push(`Recherche: ${filters.searchQuery}`);
  if (Array.isArray(filters.extraChips)) chips.push(...filters.extraChips);

  if (chips.length === 0) {
    const span = document.createElement("span");
    span.textContent = "Aucun filtre actif";
    activeFiltersEl.appendChild(span);
    return;
  }

  chips.forEach((chip) => {
    const span = document.createElement("span");
    span.textContent = chip;
    activeFiltersEl.appendChild(span);
  });
}

function renderProducts(products, targetEl, withActions = true) {
  targetEl.innerHTML = "";

  if (products.length === 0) {
    targetEl.innerHTML = '<p class="empty-state">Aucun produit ne correspond aux filtres sélectionnés.</p>';
    return;
  }

  products.forEach((product) => {
    const card = document.createElement("a");
    card.className = "product-card";
    const type = product.type || "Other";
    const price = formatPrice(minProductPrice(product));
    const firstColor = product.colors[0] || "N/A";
    const firstMetal = product.metals.includes("Gold") ? "Gold" : product.metals[0] || "N/A";
    const query = new URLSearchParams({ handle: product.handle, fromType: product.type }).toString();
    card.href = `./product.html?${query}`;
    const imagePath = getGoldImagePath(product.handle, firstMetal, firstColor);
    const visualStyle = imagePath
      ? `background-image:url('${imagePath}'); background-color:#f3f3f3;`
      : `background:${buildCodeGradient(product.code)};`;
    const visualText = imagePath ? "" : product.code;
    card.innerHTML = `
      <div class="product-visual${imagePath ? " has-photo" : ""}" style="${visualStyle}">${visualText}</div>
      <div class="product-body">
        <div class="chips"><span class="chip">${type}</span><span class="chip">${product.metals.map(metalLabelFr).join(" / ")}</span></div>
        <h3 class="product-title">${product.title}</h3>
        <p class="price">${price}</p>
        <p class="meta">Couleur principale: ${colorLabelFr(firstColor)} · Métal: ${metalLabelFr(firstMetal)}</p>
      </div>
    `;
    targetEl.appendChild(card);
  });
}

function minProductPrice(product) {
  if (!product.variants.length) return product.basePrice || 0;
  return Math.min(...product.variants.map((variant) => variant.price));
}

function formatPrice(value) {
  return `${value.toFixed(2)} EUR`;
}

function buildCodeGradient(code) {
  const seed = [...code].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (seed * 1.6) % 360;
  return `linear-gradient(135deg, hsl(${hueA} 56% 47%), hsl(${hueB} 62% 36%))`;
}

function colorValue(colorName) {
  const map = {
    Black: "#1a1a1a",
    White: "#f2f2f2",
    Champagne: "#d9c49b",
    Blue: "#4b6fcf",
    Bordeaux: "#792944",
    Green: "#4f8f68",
    Fuchsia: "#cc3f93",
    "Petrol Blue": "#2f5f74",
    "Petrol blue": "#2f5f74",
    Lilla: "#9f8cc9",
    Nude: "#e5c0ad",
    "Nude (Dark)": "#b98b78",
    "Nude (dark)": "#b98b78",
    "Nude 2": "#c59781",
    "Baby blue": "#9ecbf0",
    "Almond green": "#93b29c",
    Pink: "#e08eb3",
    "Gold/Taupe": "#a89469",
    Blanche: "#f6f6f2",
    "Bleu Ciel": "#91c5ef",
    "Bleu Nuit": "#27446f",
    "Bleu Royal": "#2f58b6",
    Emeraude: "#16795e",
    Grenat: "#7f2239",
    Noir: "#111111",
    Rose: "#d888af",
    "Rose Gold": "#c78573",
    Rouge: "#cc3232",
    "Vert Lime": "#8cb13f",
    Violet: "#7240b3",
  };
  return map[colorName] || "#c7b5a9";
}

function getGoldImagePath(handle, metal, color) {
  if ((handle || "").toLowerCase() !== "la-e11-earrings") return "";
  if ((metal || "").toLowerCase() !== "gold") return "";
  const normalized = (color || "").trim().toLowerCase();
  const filename = BOUCLES_GOLD_IMAGE_BY_COLOR[normalized];
  if (!filename) return "";
  return `./assets/images/BOUCLES/${filename}`;
}

function metalLabelFr(value) {
  return METAL_LABEL_FR[value] || value;
}

function colorLabelFr(value) {
  return (value || "").trim();
}

function renderHomePage(allProducts) {
  const featured = document.getElementById("featuredGrid");
  if (!featured) return;

  const products = allProducts.slice(0, 8);
  renderProducts(products, featured, false);
}

function renderCollectionPage(allProducts) {
  const metalSelectEl = document.getElementById("metalSelect");
  const colorSelectEl = document.getElementById("colorSelect");
  const inStockOnlyEl = document.getElementById("inStockOnly");
  const priceMinInputEl = document.getElementById("priceMinInput");
  const priceMaxInputEl = document.getElementById("priceMaxInput");
  const resetFiltersBtnEl = document.getElementById("resetFiltersBtn");
  const collectionGridEl = document.getElementById("collectionGrid");
  if (
    !metalSelectEl ||
    !colorSelectEl ||
    !inStockOnlyEl ||
    !priceMinInputEl ||
    !priceMaxInputEl ||
    !resetFiltersBtnEl ||
    !collectionGridEl
  ) {
    return;
  }

  fillSelect(metalSelectEl, "Tous les métaux", [...new Set(allProducts.flatMap((product) => product.metals))].sort());
  fillSelect(colorSelectEl, "Toutes les couleurs", [...new Set(allProducts.flatMap((product) => product.colors))].sort());
  const allMinPrice = Math.floor(Math.min(...allProducts.map((product) => minProductPrice(product))));
  const allMaxPrice = Math.ceil(Math.max(...allProducts.map((product) => minProductPrice(product))));

  const params = new URLSearchParams(window.location.search);
  const forcedTypeFromNav = params.get("type") || "";
  metalSelectEl.value = params.get("metal") || "";
  colorSelectEl.value = params.get("color") || "";
  inStockOnlyEl.checked = params.get("inStock") === "1";
  priceMinInputEl.value = params.get("minPrice") || "0";
  priceMaxInputEl.value = params.get("maxPrice") || "0";
  priceMinInputEl.min = String(allMinPrice);
  priceMinInputEl.max = String(allMaxPrice);
  priceMaxInputEl.min = String(allMinPrice);
  priceMaxInputEl.max = String(allMaxPrice);

  const render = () => {
    const selectedType = forcedTypeFromNav;
    const selectedMetal = metalSelectEl.value;
    const selectedColor = colorSelectEl.value;
    const minPrice = Number.parseFloat(priceMinInputEl.value || String(allMinPrice));
    const maxPrice = Number.parseFloat(priceMaxInputEl.value || String(allMaxPrice));
    const inStockOnly = inStockOnlyEl.checked;
    const isPriceFilterDisabled = minPrice === 0 && maxPrice === 0;

    const filtered = allProducts.filter((product) => {
      const startingPrice = minProductPrice(product);
      const byType = !selectedType || product.type === selectedType;
      const byMetal = !selectedMetal || product.metals.includes(selectedMetal);
      const byColor = !selectedColor || product.colors.includes(selectedColor);
      const byPrice =
        isPriceFilterDisabled ||
        (startingPrice >= Math.min(minPrice, maxPrice) && startingPrice <= Math.max(minPrice, maxPrice));
      const byStock = !inStockOnly || product.variants.length > 0;
      return byType && byMetal && byColor && byPrice && byStock;
    });

    renderActiveFilters({
      selectedCategory: selectedType,
      selectedMetal,
      selectedColor,
      extraChips: [
        inStockOnly ? "Disponibilité: En stock" : "",
        isPriceFilterDisabled
          ? "Prix: Tous"
          : `Prix: ${Math.min(minPrice, maxPrice)} - ${Math.max(minPrice, maxPrice)} EUR`,
      ].filter(Boolean),
    });
    renderProducts(filtered, collectionGridEl, true);
  };

  metalSelectEl.addEventListener("change", render);
  colorSelectEl.addEventListener("change", render);
  inStockOnlyEl.addEventListener("change", render);
  priceMinInputEl.addEventListener("input", render);
  priceMaxInputEl.addEventListener("input", render);
  resetFiltersBtnEl.addEventListener("click", () => {
    metalSelectEl.value = "";
    colorSelectEl.value = "";
    inStockOnlyEl.checked = false;
    priceMinInputEl.value = "0";
    priceMaxInputEl.value = "0";
    render();
  });
  render();
}

function renderProductPage(allProducts) {
  const detailsEl = document.getElementById("productDetails");
  if (!detailsEl) return;
  const params = new URLSearchParams(window.location.search);
  const handle = params.get("handle");
  const fromType = params.get("fromType");
  const product = allProducts.find((item) => item.handle === handle) || allProducts[0];
  if (!product) return;

  const backLink = document.getElementById("backToCollection");
  if (backLink) {
    const typeValue = fromType || product.type;
    backLink.href = typeValue ? `./collection.html?type=${encodeURIComponent(typeValue)}` : "./collection.html";
  }

  detailsEl.innerHTML = `
    <div class="product-preview" id="productPreview" style="background:${buildCodeGradient(product.code)}">${product.code}</div>
    <div>
      <h1>${product.title}</h1>
      <p class="price">${formatPrice(minProductPrice(product))}</p>
      <p class="meta">Type: ${product.type} · Catégorie: ${product.category}</p>
      <div class="chips">
        <span class="chip">Livraison soignee</span>
        <span class="chip">Finition artisanale</span>
        <span class="chip">Echange possible</span>
      </div>
      <div class="variant-pickers">
        <div class="picker-group">
          <span>Métal</span>
          <div id="detailMetalButtons" class="swatches swatches-metal"></div>
        </div>
        <div class="picker-group">
          <span>Couleur</span>
          <div id="detailColorButtons" class="swatches swatches-color"></div>
        </div>
      </div>
      <div class="selection-box" id="selectionBox"></div>
      <div class="variant-extra" id="variantExtra"></div>
      <button type="button" class="btn btn-primary add-to-cart-btn" id="addToCartBtn">Ajouter au panier</button>
    </div>
  `;

  const detailMetalButtons = document.getElementById("detailMetalButtons");
  const detailColorButtons = document.getElementById("detailColorButtons");
  const selectionBox = document.getElementById("selectionBox");
  const variantExtra = document.getElementById("variantExtra");
  const addToCartBtn = document.getElementById("addToCartBtn");
  const productPreview = document.getElementById("productPreview");
  let selectedMetal = product.metals.includes("Gold") ? "Gold" : product.metals[0] || "";
  let selectedColor = product.colors[0] || "";

  detailMetalButtons.innerHTML = product.metals
    .map((metal) => {
      const metalClass = metal.toLowerCase() === "gold" ? "swatch-gold" : "swatch-silver";
      return `<button type="button" class="swatch metal-swatch ${metalClass}" data-metal="${metal}" title="${metalLabelFr(metal)}"></button>`;
    })
    .join("");

  detailColorButtons.innerHTML = product.colors
    .map((color) => {
      return `<button type="button" class="swatch color-swatch" data-color="${color}" style="background:${colorValue(
        color
      )}" title="${colorLabelFr(color)}"></button>`;
    })
    .join("");

  const updateActiveButtons = () => {
    [...detailMetalButtons.querySelectorAll(".metal-swatch")].forEach((button) => {
      button.classList.toggle("is-active", button.dataset.metal === selectedMetal);
    });
    [...detailColorButtons.querySelectorAll(".color-swatch")].forEach((button) => {
      button.classList.toggle("is-active", button.dataset.color === selectedColor);
    });
  };

  const refresh = () => {
    const metal = selectedMetal;
    const color = selectedColor;
    const variant = product.variants.find((item) => item.metal === metal && item.color === color);
    const code = variant?.sku || product.code;
    const price = variant?.price ?? product.basePrice;
    const imagePath = getGoldImagePath(product.handle, metal, color);
    if (imagePath) {
      productPreview.textContent = "";
      productPreview.style.backgroundImage = `url('${imagePath}')`;
      productPreview.style.backgroundSize = "contain";
      productPreview.style.backgroundPosition = "center";
      productPreview.style.backgroundRepeat = "no-repeat";
      productPreview.style.backgroundColor = "#f3f3f3";
    } else {
      productPreview.textContent = code;
      productPreview.style.backgroundImage = "";
      productPreview.style.background = `linear-gradient(140deg, ${metal === "Gold" ? "#cba34a" : "#b3bdc9"}, ${colorValue(color)})`;
    }
    selectionBox.textContent = `Sélection: ${metalLabelFr(metal || "N/A")} / ${colorLabelFr(color || "N/A")} · ${formatPrice(price)}`;
    variantExtra.textContent = `Référence: ${code} · Finition: ${metalLabelFr(metal)} · Teinte: ${colorLabelFr(color)}`;
    updateActiveButtons();
  };

  detailMetalButtons.addEventListener("click", (event) => {
    const button = event.target.closest(".metal-swatch");
    if (!button) return;
    selectedMetal = button.dataset.metal || selectedMetal;
    refresh();
  });

  detailColorButtons.addEventListener("click", (event) => {
    const button = event.target.closest(".color-swatch");
    if (!button) return;
    selectedColor = button.dataset.color || selectedColor;
    refresh();
  });

  addToCartBtn.addEventListener("click", () => {
    const metal = selectedMetal;
    const color = selectedColor;
    const variant = product.variants.find((item) => item.metal === metal && item.color === color);
    const code = variant?.sku || product.code;
    const price = variant?.price ?? product.basePrice;
    const imagePath = getGoldImagePath(product.handle, metal, color);
    const items = getCartItems();
    const key = `${product.handle}__${metal}__${color}`;
    const existing = items.find((item) => item.key === key);

    if (existing) {
      existing.qty += 1;
    } else {
      items.push({
        key,
        handle: product.handle,
        title: product.title,
        metal,
        color,
        code,
        price,
        imagePath,
        qty: 1,
      });
    }
    saveCartItems(items);
    addToCartBtn.textContent = "Ajouté ✓";
    window.setTimeout(() => {
      addToCartBtn.textContent = "Ajouter au panier";
    }, 900);
  });

  refresh();
}

function renderCartPage() {
  const listEl = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  if (!listEl || !totalEl) return;

  const items = getCartItems();
  if (!items.length) {
    listEl.innerHTML = '<section class="empty-state">Aucun article pour le moment. Continue ta sélection depuis la collection.</section>';
    totalEl.textContent = formatPrice(0);
    return;
  }

  listEl.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "cart-row";
    const visualStyle = item.imagePath
      ? `background-image:url('${item.imagePath}'); background-size:contain; background-repeat:no-repeat; background-position:center; background-color:#f3f3f3;`
      : `background:${buildCodeGradient(item.code)};`;
    row.innerHTML = `
      <div class="cart-thumb" style="${visualStyle}">${item.imagePath ? "" : item.code}</div>
      <div class="cart-main">
        <h3>${item.title}</h3>
        <p>${metalLabelFr(item.metal)} · ${colorLabelFr(item.color)} · ${item.code}</p>
      </div>
      <div class="cart-side">
        <strong>${formatPrice(item.price)}</strong>
        <span>Qté: ${item.qty}</span>
      </div>
    `;
    listEl.appendChild(row);
  });

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  totalEl.textContent = formatPrice(total);
}
