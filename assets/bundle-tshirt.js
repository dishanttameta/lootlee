/**
 * Custom Element: BundleTshirtSelector
 * Manages extra T-shirt quantity stepper, size synchronization with the main shirt product,
 * live price preview, and multi-line batch cart item generation.
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

  /** @type {boolean} */
  #wasActive = false;

  /** @type {MutationObserver | null} */
  #observer = null;

  connectedCallback() {
    this.#initData();
    this.#bindElements();
    this.#attachListeners();

    // Initial instant sync
    this.updateState();

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

      this.updateState();
    };

    // Use capture phase for immediate response
    document.addEventListener('pointerdown', handleInstantOptionSelection, { capture: true, passive: true });
    document.addEventListener('click', handleInstantOptionSelection, { capture: true });
    document.addEventListener('change', handleInstantOptionSelection, { capture: true });

    // Listen for Shirt Quantity changes to clamp / sync T-Shirt Quantity
    const onShirtQuantityChange = () => {
      this.updateState();
    };

    document.addEventListener('input', onShirtQuantityChange);
    document.addEventListener('change', onShirtQuantityChange);
    document.addEventListener('theme:quantity:update', onShirtQuantityChange);
    document.addEventListener('quantity-selector:update', onShirtQuantityChange);

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
   * Reads current Shirt Quantity from the main product form
   * @returns {number}
   */
  getShirtQuantity() {
    const form = this.closest('form, product-form-component') || document;
    const qtyInput = form.querySelector('quantity-selector-component input[ref="quantityInput"], input[name="quantity"]');
    if (qtyInput instanceof HTMLInputElement) {
      const val = parseInt(qtyInput.value, 10);
      return !isNaN(val) && val > 0 ? val : 1;
    }
    return 1;
  }

  /**
   * Adjusts T-shirt quantity by delta (+1 or -1) with min=1 and max=shirtQuantity constraints
   * @param {number} delta
   */
  adjustQuantity(delta) {
    if (!this.qtyInput) return;
    const shirtQty = this.getShirtQuantity();
    let current = parseInt(this.qtyInput.value, 10) || 1;
    
    current = current + delta;
    current = Math.max(1, Math.min(current, shirtQty));

    this.qtyInput.value = current.toString();
    this.updateState();
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
    // 1. Check active radios / inputs in DOM
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
   * Updates visibility, size label, quantity clamping, summary text, and stepper buttons
   */
  updateState() {
    const withTShirt = this.isWithTShirtSelected();
    const currentSize = this.getSelectedShirtSize();
    const shirtQty = this.getShirtQuantity();

    if (this.sizeDisplay) {
      this.sizeDisplay.textContent = currentSize;
    }

    if (!withTShirt) {
      this.classList.remove('is-active');
      this.style.display = 'none';
      this.#wasActive = false;
      return;
    }

    // Reveal component
    this.classList.add('is-active');
    this.style.display = 'block';

    // If first time activated: default T-Shirt Quantity = current Shirt Quantity
    if (!this.#wasActive) {
      if (this.qtyInput) {
        this.qtyInput.value = shirtQty.toString();
      }
      this.#wasActive = true;
    }

    let tshirtQty = parseInt(this.qtyInput?.value || '1', 10) || 1;

    // Automatic clamping rule: If customer changes Shirt Quantity to a lower number, clamp down to match
    if (tshirtQty > shirtQty) {
      tshirtQty = shirtQty;
      if (this.qtyInput) {
        this.qtyInput.value = tshirtQty.toString();
      }
    } else if (tshirtQty < 1) {
      tshirtQty = 1;
      if (this.qtyInput) {
        this.qtyInput.value = tshirtQty.toString();
      }
    }

    if (this.qtyInput) {
      this.qtyInput.setAttribute('max', shirtQty.toString());
    }

    // Stepper button disabled states
    if (this.minusBtn) {
      this.minusBtn.disabled = tshirtQty <= 1;
    }
    if (this.plusBtn) {
      this.plusBtn.disabled = tshirtQty >= shirtQty;
    }

    // Update summary text
    this.#updateSummary(tshirtQty, currentSize);
  }

  /**
   * Updates the summary display block
   * @param {number} qty
   * @param {string} currentSize
   */
  #updateSummary(qty, currentSize) {
    if (!this.summaryDisplay) return;

    const totalPriceCents = qty * this.unitPriceCents;
    const formattedTotal = this.formatMoney(totalPriceCents);
    const countLabel = qty === 1 ? '1 T-Shirt' : `${qty} T-Shirts`;

    this.summaryDisplay.innerHTML = `
      <span class="bundle-tshirt__summary-count">${countLabel} (${currentSize})</span>
      <span class="bundle-tshirt__summary-price">${formattedTotal}</span>
    `;
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

    const shirtQtyNum = Number(mainShirtQty) || this.getShirtQuantity();
    let tshirtQty = parseInt(this.qtyInput?.value || '1', 10) || 1;
    tshirtQty = Math.max(1, Math.min(tshirtQty, shirtQtyNum));

    const currentSize = this.getSelectedShirtSize();
    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Line 1: Main Shirt
    const mainItem = {
      id: Number(mainShirtVariantId),
      quantity: shirtQtyNum,
      properties: {
        _bundle_id: bundleId,
        _bundle_role: 'main_shirt',
        'T-Shirt': 'With T-Shirt'
      }
    };

    // Line 2: Extra T-Shirt
    const extraVariantId = this.lookupExtraVariantId(currentSize);
    if (extraVariantId) {
      const extraItem = {
        id: Number(extraVariantId),
        quantity: tshirtQty,
        properties: {
          _bundle_id: bundleId,
          _bundle_role: 'extra_tshirt',
          'Size': currentSize
        }
      };

      return [mainItem, extraItem];
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
