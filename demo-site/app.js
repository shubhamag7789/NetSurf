// Synthetic Laptops Data
const SYNTHETIC_LAPTOPS = [
  {
    id: "lap-01",
    name: "TechNova Aero 14",
    price: 42999,
    formattedPrice: "₹42,999",
    ram: "16 GB",
    ramNum: 16,
    storage: "512 GB SSD",
    storageNum: 512,
    cpu: "Intel Core i5-1235U",
    brand: "TechNova"
  },
  {
    id: "lap-02",
    name: "ByteForce Titan 15",
    price: 48500,
    formattedPrice: "₹48,500",
    ram: "16 GB",
    ramNum: 16,
    storage: "512 GB SSD",
    storageNum: 512,
    cpu: "AMD Ryzen 5 5600H",
    brand: "ByteForce"
  },
  {
    id: "lap-03",
    name: "NexPulse SlimBook 14",
    price: 36990,
    formattedPrice: "₹36,990",
    ram: "8 GB",
    ramNum: 8,
    storage: "256 GB SSD",
    storageNum: 256,
    cpu: "Intel Core i3-1115G4",
    brand: "NexPulse"
  },
  {
    id: "lap-04",
    name: "QuantumCore Pro 16",
    price: 58990,
    formattedPrice: "₹58,990",
    ram: "32 GB",
    ramNum: 32,
    storage: "1 TB SSD",
    storageNum: 1024,
    cpu: "AMD Ryzen 7 7735HS",
    brand: "QuantumCore"
  },
  {
    id: "lap-05",
    name: "ZenithBook Ultra 13",
    price: 49999,
    formattedPrice: "₹49,999",
    ram: "16 GB",
    ramNum: 16,
    storage: "1 TB SSD",
    storageNum: 1024,
    cpu: "AMD Ryzen 5 7530U",
    brand: "ZenithBook"
  },
  {
    id: "lap-06",
    name: "ApexVibe Creator X",
    price: 74990,
    formattedPrice: "₹74,990",
    ram: "32 GB",
    ramNum: 32,
    storage: "1 TB SSD",
    storageNum: 1024,
    cpu: "Intel Core i7-13700H",
    brand: "ApexVibe"
  },
  {
    id: "lap-07",
    name: "OmniLite Student 14",
    price: 29990,
    formattedPrice: "₹29,990",
    ram: "8 GB",
    ramNum: 8,
    storage: "256 GB SSD",
    storageNum: 256,
    cpu: "Intel Celeron N4020",
    brand: "OmniLite"
  }
];

let currentProducts = [...SYNTHETIC_LAPTOPS];
let labelToggled = false;
let ambiguityMode = false;

// DOM Elements
const grid = document.getElementById('product-grid');
const countBadge = document.getElementById('results-count');
const noResults = document.getElementById('no-results');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-button');
const maxPriceInput = document.getElementById('max-price');
const minRamSelect = document.getElementById('min-ram');
const minStorageSelect = document.getElementById('min-storage');
const applyFiltersBtn = document.getElementById('apply-filters-btn');
const resetFiltersBtn = document.getElementById('reset-filters-btn');
const toggleLabelBtn = document.getElementById('toggle-label-btn');
const labelStateText = document.getElementById('label-state-text');
const toggleAmbiguityBtn = document.getElementById('toggle-ambiguity-btn');
const ambiguityStateText = document.getElementById('ambiguity-state-text');
const ambiguousContainer = document.getElementById('ambiguous-container');
const checkoutStatus = document.getElementById('checkout-status');

// Render products
function renderProducts(products) {
  grid.innerHTML = '';
  
  if (products.length === 0) {
    noResults.classList.remove('hidden');
    countBadge.textContent = '0 products';
    return;
  }
  
  noResults.classList.add('hidden');
  countBadge.textContent = `${products.length} product${products.length > 1 ? 's' : ''}`;

  products.forEach(p => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.setAttribute('data-product-id', p.id);

    card.innerHTML = `
      <div class="product-header">
        <h3 class="product-name">${p.name}</h3>
        <span class="price">${p.formattedPrice}</span>
      </div>
      <ul class="specs-list">
        <li class="spec-item">
          <span>RAM</span>
          <strong class="spec-ram" data-spec="ram">${p.ram}</strong>
        </li>
        <li class="spec-item">
          <span>Storage</span>
          <strong class="spec-storage" data-spec="storage">${p.storage}</strong>
        </li>
        <li class="spec-item">
          <span>Processor</span>
          <strong class="spec-cpu" data-spec="cpu">${p.cpu}</strong>
        </li>
      </ul>
      <button type="button" class="btn-secondary" style="margin-top:auto;" onclick="alert('Viewing synthetic details for ${p.name}')">
        View Details
      </button>
    `;
    grid.appendChild(card);
  });
}

// Filter logic
function applyFilters() {
  const searchTerm = (searchInput.value || '').trim().toLowerCase();
  const maxPrice = parseFloat(maxPriceInput.value) || Infinity;
  const minRam = parseInt(minRamSelect.value, 10) || 0;
  const minStorage = parseInt(minStorageSelect.value, 10) || 0;

  currentProducts = SYNTHETIC_LAPTOPS.filter(p => {
    // Search query match
    const matchesSearch = !searchTerm || 
      searchTerm === 'laptop' || 
      p.name.toLowerCase().includes(searchTerm) || 
      p.cpu.toLowerCase().includes(searchTerm) ||
      p.brand.toLowerCase().includes(searchTerm);

    // Filter checks
    const matchesPrice = p.price <= maxPrice;
    const matchesRam = p.ramNum >= minRam;
    const matchesStorage = p.storageNum >= minStorage;

    return matchesSearch && matchesPrice && matchesRam && matchesStorage;
  });

  renderProducts(currentProducts);
}

// Reset filters
function resetFilters() {
  searchInput.value = '';
  maxPriceInput.value = '';
  minRamSelect.value = '';
  minStorageSelect.value = '';
  currentProducts = [...SYNTHETIC_LAPTOPS];
  renderProducts(currentProducts);
}

// Toggle button label (e.g. "Search" -> "Find Laptops") for adaptive testing
function toggleButtonLabel() {
  labelToggled = !labelToggled;
  const newLabel = labelToggled ? 'Find Laptops' : 'Search';
  searchBtn.textContent = newLabel;
  labelStateText.textContent = labelToggled ? 'Renamed ("Find Laptops")' : 'Original';
  console.log(`[Demo Site] Search button renamed to: "${newLabel}"`);
}

// Toggle Ambiguity Mode
function toggleAmbiguity() {
  ambiguityMode = !ambiguityMode;
  if (ambiguityMode) {
    ambiguousContainer.classList.remove('hidden');
    ambiguityStateText.textContent = 'ON';
  } else {
    ambiguousContainer.classList.add('hidden');
    ambiguityStateText.textContent = 'OFF';
  }
  console.log(`[Demo Site] Ambiguity mode set to: ${ambiguityMode}`);
}

// Simulated Checkout
window.handleSimulatedCheckout = function() {
  checkoutStatus.innerHTML = '<span style="color:#10b981;">✅ Simulated checkout submitted safely in sandbox mode.</span>';
};

// Event Listeners
searchBtn.addEventListener('click', applyFilters);
applyFiltersBtn.addEventListener('click', applyFilters);
resetFiltersBtn.addEventListener('click', resetFilters);
toggleLabelBtn.addEventListener('click', toggleButtonLabel);
toggleAmbiguityBtn.addEventListener('click', toggleAmbiguity);

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyFilters();
});

// Initial Render
renderProducts(currentProducts);
