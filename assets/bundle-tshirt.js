/**
 * Custom Element: BundleTshirtSelector
 * Manages extra T-shirt quantity, size synchronization with the main shirt product,
 * live price preview calculation, and multi-line batch cart item generation.
 */
export class BundleTshirtSelector extends HTMLElement {
  /** @type {Record<string, number>} */
  extraVariants = {};

  /** @type {Array<{id: number, title: string, price: number, options: string[]}>} */
  mainVariants = [];

  /** @type {number} */
  unitPriceCents = 0;

  /** @type {number} */
  basePriceCents = 0;

  /** @type {string} */
  moneyFormat = '${{amount}}';

  /** @type {string} */
  currencyPrefix = '';

  /** @type {string} */
  currencySuffix = '';

  /** @type {HTMLInputElement | null} */
  qtyInput = null;

  /** @type {HTMLButtonElement | null} */
  minusBtn = null;

  /** @type {HTMLButtonElement | null} */
  plusBtn = null;

  /** @type {HTMLElement | null} */
  sizeDisplay = null;

  /** @type {HTMLElement | null} */
  summaryDisplay = null;

  /** @type {MutationObserver | null} */
  #observer = null;

  connectedCallback() {
    this.#initData();
    this.#bindElements();
    this.#attachListeners();
    
    // Initial instant sync
    this.updateState();

    // Redundant verification ticks
    requestAnimationFrame(() => this.updateState());
    setTimeout(() => this.updateState(), 50);
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
  }

  #initData() {
    this.unitPriceCents = Number(this.dataset.unitPriceCents) || 0;
    this.basePriceCents = Number(this.dataset.basePrice) || 0;
    this.moneyFormat = this.dataset.moneyFormat || '${{amount}}';

    // Parse currency prefix/suffix from formatted unit price
    const formattedUnit = this.dataset.formattedUnitPrice || '';
    if (formattedUnit) {
      const match = formattedUnit.match(/^([^0-9,.]+)?([0-9,.]+)([^0-9,.]+)?$/);
      if (match) {
        this.currencyPrefix = match[1] || '';
        this.currencySuffix = match[3] || '';
      }
    }

    if (!this.currencyPrefix && !this.currencySuffix) {
      this.currencyPrefix = this.moneyFormat.includes('Rs') ? 'Rs. ' : (this.moneyFormat.includes('₹') ? '₹' : '$');
    }

    const extraScript = this.querySelector('script[ref="extraProductData"]');
    if (extraScript) {
      try {
        const parsed = JSON.parse(extraScript.textContent || '{}');
        this.extraVariants = parsed.variants || {};
        if (parsed.unitPriceCents) {
          this.unitPriceCents = Number(parsed.unitPriceCents);
        }
      } catch (err) {
        console.error('Error parsing extra t-shirt product data:', err);
      }
    }

    const mainVariantsScript = this.querySelector('script[ref="mainProductVariants"]');
    if (mainVariantsScript) {
      try {
        this.mainVariants = JSON.parse(mainVariantsScript.textContent || '[]');
      } catch (err) {
        console.error('Error parsing main product variants:', err);
      }
    }
  }

  #bindElements() {
    this.qtyInput = this.querySelector('input[ref="qtyInput"]');
    this.minusBtn = this.querySelector('button[ref="minusBtn"]');
    this.plusBtn = this.querySelector('button[ref="plusBtn"]');
    this.sizeDisplay = this.querySelector('[ref="sizeDisplay"]');
    this.summaryDisplay = this.querySelector('[ref="summaryDisplay"]');
  }

  #attachListeners() {
    this.minusBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.adjustQuantity(-1);
    });

    this.plusBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.adjustQuantity(1);
    });

    this.qtyInput?.addEventListener('change', () => {
      this.#sanitizeQuantity();
      this.updateState();
    });

    this.qtyInput?.addEventListener('input', () => {
      this.#sanitizeQuantity();
      this.updateState();
    });

    // 0ms Instant Optimistic Action Handler
    const handleInstantOptionSelection = (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const inVariantPicker = target.closest('variant-picker') || target.closest('.variant-option');
      if (!inVariantPicker) return;

      // 1. Radio or Label
      let radio = null;
      if (target instanceof HTMLInputElement && target.type === 'radio') {
        radio = target;
      } else {
        radio = target.closest('label')?.querySelector('input[type="radio"]') || target.querySelector('input[type="radio"]');
      }

      if (radio && radio.value) {
        const val = radio.value.trim().toLowerCase();
        
        if (val === 'with t-shirt' || (val.includes('with') && val.includes('t-shirt'))) {
          this.classList.add('is-active');
          this.style.display = 'block';
        } else if (val === 'without t-shirt' || (val.includes('without') && val.includes('t-shirt'))) {
          this.classList.remove('is-active');
          this.style.display = 'none';
        }

        const standardSizes = ['5XL', '4XL', '3XL', '2XL', 'XXL', 'XL', 'L', 'M', 'S', 'XS'];
        const trimmedVal = radio.value.trim().toUpperCase();
        if (standardSizes.includes(trimmedVal)) {
          if (this.sizeDisplay) {
            this.sizeDisplay.textContent = radio.value.trim();
          }
          this.#updateSummary(parseInt(this.qtyInput?.value || '1', 10), radio.value.trim());
        }
      }

      // 2. Select Dropdown
      if (target instanceof HTMLSelectElement) {
        const val = target.value.trim().toLowerCase();
        if (val === 'with t-shirt' || (val.includes('with') && val.includes('t-shirt'))) {
          this.classList.add('is-active');
          this.style.display = 'block';
        } else if (val === 'without t-shirt' || (val.includes('without') && val.includes('t-shirt'))) {
          this.classList.remove('is-active');
          this.style.display = 'none';
        }

        const standardSizes = ['5XL', '4XL', '3XL', '2XL', 'XXL', 'XL', 'L', 'M', 'S', 'XS'];
        const trimmedVal = target.value.trim().toUpperCase();
        if (standardSizes.includes(trimmedVal)) {
          if (this.sizeDisplay) {
            this.sizeDisplay.textContent = target.value.trim();
          }
          this.#updateSummary(parseInt(this.qtyInput?.value || '1', 10), target.value.trim());
        }
      }

      // Synchronous full update
      this.updateState();
    };

    // Use capture phase on pointerdown, click, and change for immediate 0ms response
    document.addEventListener('pointerdown', handleInstantOptionSelection, { capture: true, passive: true });
    document.addEventListener('click', handleInstantOptionSelection, { capture: true });
    document.addEventListener('change', handleInstantOptionSelection, { capture: true });

    // Catch background theme AJAX events
    const onVariantAsync = (e) => {
      if (e?.detail?.resource?.price) {
        this.basePriceCents = Number(e.detail.resource.price);
      }
      this.updateState();
    };

    document.addEventListener('variant:update', onVariantAsync);
    document.addEventListener('variant:selected', onVariantAsync);
    window.addEventListener('popstate', () => this.updateState());

    const form = this.closest('form, product-form-component') || document.body;
    this.#observer = new MutationObserver(() => {
      this.updateState();
    });
    this.#observer.observe(form, { subtree: true, attributes: true, attributeFilter: ['value', 'checked', 'data-current-checked'] });
  }

  /**
   * Adjusts quantity by delta (+1 or -1)
   * @param {number} delta
   */
  adjustQuantity(delta) {
    if (!this.qtyInput) return;
    let current = parseInt(this.qtyInput.value, 10) || 1;
    current = Math.max(1, current + delta);
    this.qtyInput.value = current.toString();
    this.updateState();
  }

  #sanitizeQuantity() {
    if (!this.qtyInput) return;
    let val = parseInt(this.qtyInput.value, 10);
    if (isNaN(val) || val < 1) {
      val = 1;
    }
    this.qtyInput.value = val.toString();
  }

  /**
   * Finds the currently active variant object
   * @returns {{id: number, title: string, price: number, options: string[]} | null}
   */
  getCurrentVariant() {
    const form = this.closest('form') || document;
    const variantIdInput = form.querySelector('input[name="id"]');
    const currentId = variantIdInput ? Number(variantIdInput.value) : null;

    if (currentId && this.mainVariants.length > 0) {
      const found = this.mainVariants.find((v) => Number(v.id) === currentId);
      if (found) return found;
    }

    const urlVariantId = new URL(window.location.href).searchParams.get('variant');
    if (urlVariantId && this.mainVariants.length > 0) {
      const found = this.mainVariants.find((v) => Number(v.id) === Number(urlVariantId));
      if (found) return found;
    }

    const selectedOptions = this.getSelectedOptionValues();
    if (selectedOptions.length > 0 && this.mainVariants.length > 0) {
      const match = this.mainVariants.find((v) => {
        return selectedOptions.every((opt) => v.options.includes(opt) || v.title.includes(opt));
      });
      if (match) return match;
    }

    return this.mainVariants[0] || null;
  }

  /**
   * Returns list of currently selected option values
   * @returns {string[]}
   */
  getSelectedOptionValues() {
    const values = [];

    const checkedRadios = document.querySelectorAll(
      'variant-picker input[type="radio"]:checked, variant-picker input[type="radio"][data-current-checked="true"], fieldset.variant-option input[type="radio"]:checked'
    );
    checkedRadios.forEach((radio) => {
      if (radio instanceof HTMLInputElement && radio.value) {
        values.push(radio.value.trim());
      }
    });

    const selects = document.querySelectorAll('variant-picker select, .variant-option select');
    selects.forEach((select) => {
      if (select instanceof HTMLSelectElement && select.value) {
        values.push(select.value.trim());
      }
    });

    return values;
  }

  /**
   * Checks if "With T-Shirt" is currently selected
   * @returns {boolean}
   */
  isWithTShirtSelected() {
    // 1. Immediate check on active radios / values in DOM
    const selectedOptions = this.getSelectedOptionValues();
    for (const opt of selectedOptions) {
      const lower = opt.toLowerCase();
      if (lower.includes('with') && !lower.includes('without')) {
        return true;
      }
      if (lower.includes('without')) {
        return false;
      }
    }

    // 2. Check current variant object
    const currentVariant = this.getCurrentVariant();
    if (currentVariant) {
      const titleLower = (currentVariant.title || '').toLowerCase();
      const optionsLower = (currentVariant.options || []).map((o) => o.toLowerCase());
      
      const hasWith = titleLower.includes('with') || optionsLower.some((o) => o.includes('with'));
      const hasWithout = titleLower.includes('without') || optionsLower.some((o) => o.includes('without'));

      if (hasWith && !hasWithout) {
        return true;
      }
      if (hasWithout) {
        return false;
      }
    }

    // 3. Check legend or text values
    const legendValues = document.querySelectorAll('.variant-option__swatch-value, .variant-option__legend-label');
    for (const el of legendValues) {
      const text = (el.textContent || '').toLowerCase();
      if (text.includes('with t-shirt') || (text.includes('with') && text.includes('t-shirt') && !text.includes('without'))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Reads currently selected Size option from the shirt
   * @returns {string}
   */
  getSelectedShirtSize() {
    // 1. Direct check on checked radio inputs
    const sizeRadios = document.querySelectorAll(
      'fieldset.variant-option input[type="radio"]:checked, variant-picker fieldset input[type="radio"]:checked'
    );
    for (const radio of sizeRadios) {
      if (!(radio instanceof HTMLInputElement)) continue;
      const fieldset = radio.closest('fieldset');
      const legendText = (fieldset?.querySelector('legend')?.textContent || '').toLowerCase();
      const name = radio.name.toLowerCase();
      if (legendText.includes('size') || name.includes('size')) {
        return radio.value.trim();
      }
    }

    // 2. Check current variant object
    const currentVariant = this.getCurrentVariant();
    if (currentVariant && currentVariant.options) {
      const standardSizes = ['5XL', '4XL', '3XL', '2XL', 'XXL', 'XL', 'L', 'M', 'S', 'XS'];
      for (const opt of currentVariant.options) {
        const trimmed = opt.trim().toUpperCase();
        if (standardSizes.includes(trimmed)) {
          return opt.trim();
        }
      }
      for (const opt of currentVariant.options) {
        const lower = opt.toLowerCase();
        if (!lower.includes('t-shirt') && !lower.includes('without') && !lower.includes('with')) {
          return opt.trim();
        }
      }
    }

    // 3. Check select dropdowns
    const selects = document.querySelectorAll('variant-picker select, .variant-option select');
    for (const select of selects) {
      if (!(select instanceof HTMLSelectElement)) continue;
      const labelText = (select.closest('.variant-option')?.querySelector('label')?.textContent || '').toLowerCase();
      const name = select.name.toLowerCase();
      if (labelText.includes('size') || name.includes('size')) {
        return select.value.trim();
      }
    }

    // 4. Check legend swatch label value
    const sizeLegendValue = document.querySelector('.variant-option__legend-label .variant-option__swatch-value');
    if (sizeLegendValue) {
      const val = sizeLegendValue.textContent.replace(':', '').trim();
      if (val) return val;
    }

    return 'M';
  }

  /**
   * Updates visibility, size label, summary text, and price preview
   */
  updateState() {
    const withTShirt = this.isWithTShirtSelected();
    const currentSize = this.getSelectedShirtSize();

    if (this.sizeDisplay) {
      this.sizeDisplay.textContent = currentSize;
    }

    if (!withTShirt) {
      this.classList.remove('is-active');
      this.style.display = 'none';
      if (this.qtyInput && this.qtyInput.value !== '1') {
        this.qtyInput.value = '1';
      }
      this.restoreOriginalPrice();
      return;
    }

    // Reveal component instantly
    this.classList.add('is-active');
    this.style.display = 'block';

    const qty = parseInt(this.qtyInput?.value || '1', 10) || 1;

    // Update minus button state
    if (this.minusBtn) {
      this.minusBtn.disabled = qty <= 1;
    }

    // Update summary text
    this.#updateSummary(qty, currentSize);

    // Update live price preview
    this.updatePricePreview(qty);
  }

  /**
   * Updates the summary block
   * @param {number} qty
   * @param {string} currentSize
   */
  #updateSummary(qty, currentSize) {
    if (!this.summaryDisplay) return;

    if (qty > 1) {
      const extraQty = qty - 1;
      const extraCost = extraQty * this.unitPriceCents;
      const formattedExtra = this.formatMoney(extraCost);
      this.summaryDisplay.innerHTML = `
        <span class="bundle-tshirt__summary-count">${qty} T-Shirts total (${currentSize})</span>
        <span class="bundle-tshirt__summary-extra bundle-tshirt__summary-extra--paid">+${formattedExtra} (${extraQty} extra)</span>
      `;
    } else {
      this.summaryDisplay.innerHTML = `
        <span class="bundle-tshirt__summary-count">1 T-Shirt total (${currentSize})</span>
        <span class="bundle-tshirt__summary-extra bundle-tshirt__summary-extra--included">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Included with shirt
        </span>
      `;
    }
  }

  /**
   * Updates price display with base price + (qty - 1) * unit price
   * @param {number} qty
   */
  updatePricePreview(qty) {
    const priceContainer = document.querySelector('product-price');
    if (!priceContainer) return;

    const salePriceEl = priceContainer.querySelector('.c-sale-price, .price');
    if (!salePriceEl) return;

    if (!salePriceEl.dataset.originalPrice) {
      salePriceEl.dataset.originalPrice = salePriceEl.textContent || '';
    }

    const currentVariant = this.getCurrentVariant();
    const baseCents = currentVariant ? currentVariant.price : (this.basePriceCents || this.#parsePriceCents(salePriceEl.dataset.originalPrice));

    if (qty > 1 && this.unitPriceCents > 0) {
      const extraCents = (qty - 1) * this.unitPriceCents;
      const totalCents = baseCents + extraCents;
      salePriceEl.textContent = this.formatMoney(totalCents);
    } else {
      if (salePriceEl.dataset.originalPrice) {
        salePriceEl.textContent = salePriceEl.dataset.originalPrice;
      }
    }
  }

  restoreOriginalPrice() {
    const priceContainer = document.querySelector('product-price');
    const salePriceEl = priceContainer?.querySelector('.c-sale-price, .price');
    if (salePriceEl && salePriceEl.dataset.originalPrice) {
      salePriceEl.textContent = salePriceEl.dataset.originalPrice;
    }
  }

  /**
   * @param {string} text
   * @returns {number}
   */
  #parsePriceCents(text) {
    const clean = (text || '').replace(/[^0-9.]/g, '');
    const num = parseFloat(clean);
    return !isNaN(num) && num > 0 ? Math.round(num * 100) : 0;
  }

  /**
   * Resolves extra t-shirt variant ID matching the current shirt size
   * @param {string} size
   * @returns {number | null}
   */
  lookupExtraVariantId(size) {
    if (!size) return null;
    const cleanSize = size.trim();

    if (this.extraVariants[cleanSize]) {
      return Number(this.extraVariants[cleanSize]);
    }

    const lowerSize = cleanSize.toLowerCase();
    if (this.extraVariants[lowerSize]) {
      return Number(this.extraVariants[lowerSize]);
    }

    for (const [key, id] of Object.entries(this.extraVariants)) {
      if (key.toLowerCase() === lowerSize || key.toLowerCase().includes(lowerSize)) {
        return Number(id);
      }
    }

    const firstVal = Object.values(this.extraVariants)[0];
    return firstVal ? Number(firstVal) : null;
  }

  /**
   * Returns batch line items for cart submission
   * @param {string | number} mainShirtVariantId
   * @param {number} mainShirtQty
   * @returns {Array<{id: number, quantity: number, properties?: Record<string, any>}> | null}
   */
  getBatchItems(mainShirtVariantId, mainShirtQty) {
    if (!this.isWithTShirtSelected()) {
      return null;
    }

    const tshirtQty = parseInt(this.qtyInput?.value || '1', 10) || 1;
    const currentSize = this.getSelectedShirtSize();
    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const shirtQtyNum = Number(mainShirtQty) || 1;

    // Line 1: Main Shirt
    const mainItem = {
      id: Number(mainShirtVariantId),
      quantity: shirtQtyNum,
      properties: {
        _bundle_id: bundleId,
        _bundle_role: 'main_shirt',
        'T-Shirt Selection': `With T-Shirt (Included: 1x Size ${currentSize})`
      }
    };

    // If extra units chosen (qty > 1)
    if (tshirtQty > 1) {
      const extraUnitsPerShirt = tshirtQty - 1;
      const extraVariantId = this.lookupExtraVariantId(currentSize);

      if (extraVariantId) {
        const extraItem = {
          id: Number(extraVariantId),
          quantity: extraUnitsPerShirt * shirtQtyNum,
          properties: {
            _bundle_id: bundleId,
            _bundle_role: 'extra_tshirt',
            'Size': currentSize,
            '_parent_product': this.dataset.productTitle || 'Shirt'
          }
        };

        return [mainItem, extraItem];
      }
    }

    return [mainItem];
  }

  /**
   * Formats cents into formatted money string matching theme format
   * @param {number} cents
   * @returns {string}
   */
  formatMoney(cents) {
    const formattedNumber = (cents / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const prefix = this.currencyPrefix || '';
    const suffix = this.currencySuffix || '';

    return `${prefix}${formattedNumber}${suffix}`;
  }
}

if (!customElements.get('bundle-tshirt-selector')) {
  customElements.define('bundle-tshirt-selector', BundleTshirtSelector);
}
