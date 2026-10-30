/**
 * NetSurf Semantic Autofill Engine
 * Provides high-speed, intelligent form understanding and 1-click batch autofill.
 * Understands arbitrary form field names, IDs, labels, placeholders, and ARIA attributes
 * mapping them semantically to canonical user profile fields.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NetSurfAutofill = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  // Canonical Semantic Mapping Rules
  const SEMANTIC_DICTIONARY = [
    {
      field: "title",
      patterns: [/title/i, /salutation/i, /prefix/i, /honorific/i],
      exclude: [/job.*title/i, /work.*title/i, /title.*job/i]
    },
    {
      field: "firstName",
      patterns: [/first.*name/i, /\bfname\b/i, /given.*name/i, /forename/i, /pr[eé]nom/i, /vorname/i, /nombre/i, /01name_f/i, /name_f/i]
    },
    {
      field: "middleInitial",
      patterns: [/middle.*initial/i, /\bmid.*init\b/i, /\bmi\b/i, /middle.*name/i, /m_initial/i, /02name_m/i, /name_m/i]
    },
    {
      field: "lastName",
      patterns: [/last.*name/i, /\blname\b/i, /family.*name/i, /surname/i, /nachname/i, /apellido/i, /03name_l/i, /name_l/i]
    },
    {
      field: "fullName",
      patterns: [/full.*name/i, /your.*name/i, /contact.*name/i, /applicant.*name/i, /customer.*name/i, /^name$/i, /\bname\b/i],
      exclude: [/first/i, /last/i, /middle/i, /user/i, /card/i, /file/i]
    },
    {
      field: "company",
      patterns: [/company/i, /organization/i, /organisation/i, /employer/i, /business.*name/i, /workplace/i, /04comp_nm/i, /comp_nm/i]
    },
    {
      field: "position",
      patterns: [/position/i, /job.*title/i, /designation/i, /occupation/i, /job.*role/i, /05pos_nm/i, /pos_nm/i]
    },
    {
      field: "address1",
      patterns: [/address.*(?:line)?.*1/i, /street.*address/i, /\bstreet\b/i, /addr(?:ess)?_?l?1/i, /billing.*address.*1/i, /shipping.*address.*1/i, /06addr_l1/i, /addr_l1/i]
    },
    {
      field: "address2",
      patterns: [/address.*(?:line)?.*2/i, /\bapt\b/i, /suite/i, /\bunit\b/i, /building/i, /floor/i, /addr(?:ess)?_?l?2/i, /07addr_l2/i, /addr_l2/i]
    },
    {
      field: "city",
      patterns: [/\bcity\b/i, /town/i, /suburb/i, /locality/i, /08addr_ci/i, /addr_ci/i]
    },
    {
      field: "state",
      patterns: [/\bstate\b/i, /province/i, /region/i, /\bst\b/i, /administrative_area/i, /09addr_st/i, /addr_st/i]
    },
    {
      field: "country",
      patterns: [/country/i, /nation/i, /\bcntry\b/i, /10addr_ct/i, /addr_ct/i]
    },
    {
      field: "zip",
      patterns: [/\bzip\b/i, /zip.*code/i, /postal.*code/i, /pincode/i, /pin.*code/i, /postcode/i, /11addr_zp/i, /addr_zp/i]
    },
    {
      field: "email",
      patterns: [/email/i, /e-?mail/i, /user.*email/i, /\bmail\b/i]
    },
    {
      field: "cellPhone",
      patterns: [/cell.*phone/i, /mobile/i, /\bcell\b/i, /cell_phone/i, /cellphone/i]
    },
    {
      field: "homePhone",
      patterns: [/home.*phone/i, /home_phone/i, /residence.*phone/i, /home.*tel/i]
    },
    {
      field: "workPhone",
      patterns: [/work.*phone/i, /work_phone/i, /office.*phone/i, /business.*phone/i, /work.*tel/i]
    },
    {
      field: "phone",
      patterns: [/\bphone\b/i, /telephone/i, /\btel\b/i, /phone.*number/i, /contact.*number/i],
      exclude: [/cell/i, /mobile/i, /home/i, /work/i, /fax/i]
    },
    {
      field: "fax",
      patterns: [/\bfax\b/i, /facsimile/i]
    },
    {
      field: "website",
      patterns: [/web.*site/i, /website/i, /\burl\b/i, /homepage/i, /portfolio/i, /web_site/i]
    },
    {
      field: "gender",
      patterns: [/gender/i, /\bsex\b/i]
    },
    {
      field: "userId",
      patterns: [/user.*id/i, /username/i, /user_id/i, /login.*id/i, /^login$/i]
    },
    {
      field: "education",
      patterns: [/education/i, /degree/i, /qualification/i, /academic/i, /university/i, /college/i, /school/i, /major/i, /field.*study/i]
    },
    {
      field: "skills",
      patterns: [/skills?/i, /technolog(?:y|ies)/i, /technical.*skills/i, /expertise/i, /competenc(?:y|ies)/i, /tools/i]
    },
    {
      field: "experience",
      patterns: [/experience/i, /years.*experience/i, /work.*experience/i, /total.*experience/i, /exp.*years/i]
    },
    {
      field: "location",
      patterns: [/location/i, /preferred.*location/i, /current.*location/i, /current.*city/i]
    },
    {
      field: "salary",
      patterns: [/salary/i, /expected.*salary/i, /current.*salary/i, /compensation/i, /ctc/i, /expected.*ctc/i]
    },
    {
      field: "linkedin",
      patterns: [/linkedin/i, /linkedin.*profile/i, /linkedin.*url/i]
    },
    {
      field: "github",
      patterns: [/github/i, /github.*profile/i, /github.*url/i]
    },
    {
      field: "portfolio",
      patterns: [/portfolio/i, /portfolio.*url/i, /personal.*website/i]
    },
    {
      field: "resume",
      patterns: [/resume/i, /cv/i, /resume.*url/i, /cv.*url/i]
    },
    {
      field: "comments",
      patterns: [/comment/i, /message/i, /notes/i, /inquiry/i, /remarks/i]
    }
  ];

  /**
   * Cleans and normalizes string for semantic matching.
   */
  function normalizeString(str) {
    if (!str) return "";
    return String(str)
      .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase to spaces
      .replace(/[_\-\/\\:;,\.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /**
   * Inspects a single DOM input / select / textarea and returns its combined contextual text.
   */
  function inspectElementContext(el) {
    const contexts = [];

    // 1. Element standard attributes
    if (el.getAttribute("autocomplete")) contexts.push(el.getAttribute("autocomplete"));
    if (el.getAttribute("name")) contexts.push(el.getAttribute("name"));
    if (el.id) contexts.push(el.id);
    if (el.getAttribute("placeholder")) contexts.push(el.getAttribute("placeholder"));
    if (el.getAttribute("aria-label")) contexts.push(el.getAttribute("aria-label"));
    if (el.getAttribute("title")) contexts.push(el.getAttribute("title"));

    // 2. Explicit label via for="id"
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl && lbl.innerText) contexts.push(lbl.innerText);
      } catch { }
    }

    // 3. Wrapping label
    const parentLabel = el.closest("label");
    if (parentLabel && parentLabel.innerText) {
      contexts.push(parentLabel.innerText);
    }

    // 4. Preceding table cell (e.g. <td>First Name</td><td><input></td>)
    const td = el.closest("td");
    if (td && td.previousElementSibling) {
      const prevText = td.previousElementSibling.innerText || "";
      if (prevText.trim().length > 1 && prevText.trim().length < 60) {
        contexts.push(prevText);
      }
    }

    // 5. Preceding sibling element or parent form-group label
    const parentGroup = el.closest(".form-group, .field, .input-row, tr, div");
    if (parentGroup) {
      const labelEl = parentGroup.querySelector("label, .label, .field-label, dt, th, span.title");
      if (labelEl && labelEl !== el && labelEl.innerText) {
        contexts.push(labelEl.innerText);
      }
    }

    return contexts.map(normalizeString).join(" ");
  }

  /**
   * Identifies the canonical semantic field name for an element.
   */
  function identifySemanticField(el) {
    const context = inspectElementContext(el);
    if (!context) return null;

    // Direct autocomplete mapping (highest confidence)
    const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (auto.includes("given-name")) return "firstName";
    if (auto.includes("family-name")) return "lastName";
    if (auto.includes("email")) return "email";
    if (auto.includes("tel") || auto.includes("phone")) return "phone";
    if (auto.includes("address-line1")) return "address1";
    if (auto.includes("address-line2")) return "address2";
    if (auto.includes("address-level2")) return "city";
    if (auto.includes("address-level1")) return "state";
    if (auto.includes("postal-code")) return "zip";
    if (auto.includes("country")) return "country";
    if (auto.includes("organization")) return "company";

    for (const rule of SEMANTIC_DICTIONARY) {
      // Check exclusions first
      if (rule.exclude && rule.exclude.some(ex => ex.test(context))) {
        continue;
      }
      for (const pattern of rule.patterns) {
        if (pattern.test(context)) {
          return rule.field;
        }
      }
    }

    return null;
  }

  /**
   * Standardizes incoming profile or user prompt data into canonical dictionary keys.
   */
  function normalizeProfileData(rawObj) {
    if (!rawObj || typeof rawObj !== "object") return {};
    const normalized = {};

    for (const [rawKey, val] of Object.entries(rawObj)) {
      if (val == null || val === "") continue;
      const keyNorm = normalizeString(rawKey);

      let matchedField = null;
      for (const rule of SEMANTIC_DICTIONARY) {
        if (rule.field.toLowerCase() === keyNorm.replace(/\s+/g, "")) {
          matchedField = rule.field;
          break;
        }
        if (rule.patterns.some(p => p.test(keyNorm))) {
          matchedField = rule.field;
          break;
        }
      }

      if (matchedField) {
        normalized[matchedField] = String(val).trim();
      } else {
        // Retain unmapped key as lowercase fallback
        normalized[keyNorm.replace(/\s+/g, "_")] = String(val).trim();
      }
    }

    // Synthesize fullName if missing
    if (!normalized.fullName && (normalized.firstName || normalized.lastName)) {
      normalized.fullName = [normalized.firstName, normalized.middleInitial, normalized.lastName].filter(Boolean).join(" ");
    }

    // Synthesize phone fallbacks
    if (!normalized.phone) {
      normalized.phone = normalized.cellPhone || normalized.homePhone || normalized.workPhone || "";
    }

    return normalized;
  }

  /**
   * High-Speed Instant Semantic Form Filling.
   * Scans all inputs on page, binds semantic values, dispatches reactive events,
   * and highlights fields with visual cyan pulse.
   */
  function semanticallyFillForm(rawProfileData) {
    const startTime = performance.now();
    const data = normalizeProfileData(rawProfileData);
    const filledFields = [];
    const elementsList = Array.from(document.querySelectorAll(
      "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])"
    ));

    for (const el of elementsList) {
      // Skip invisible elements
      if (el.offsetParent === null && el.type !== "select-one") continue;

      const semanticKey = identifySemanticField(el);
      if (!semanticKey) continue;

      let valueToFill = data[semanticKey];

      // Smart fallback for phone variants
      if (!valueToFill && (semanticKey === "cellPhone" || semanticKey === "homePhone" || semanticKey === "workPhone")) {
        valueToFill = data.phone;
      }
      if (!valueToFill && semanticKey === "phone") {
        valueToFill = data.cellPhone || data.workPhone || data.homePhone;
      }

      if (valueToFill == null || valueToFill === "") continue;

      // Fill Input / Textarea
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const prototype = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, valueToFill);
        } else {
          el.value = valueToFill;
        }

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));

        flashElementHighlight(el);
        filledFields.push({ field: semanticKey, label: getElementDisplayLabel(el), value: valueToFill });
      }
      // Fill Select Dropdown
      else if (el instanceof HTMLSelectElement) {
        const valLower = String(valueToFill).toLowerCase().trim();
        let matched = false;

        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          const optText = (opt.text || "").toLowerCase().trim();
          const optVal = (opt.value || "").toLowerCase().trim();

          if (optText === valLower || optVal === valLower || (valLower.length >= 3 && (optText.includes(valLower) || valLower.includes(optText)))) {
            el.selectedIndex = i;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("input", { bubbles: true }));
            flashElementHighlight(el);
            filledFields.push({ field: semanticKey, label: getElementDisplayLabel(el), value: opt.text });
            matched = true;
            break;
          }
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      filledCount: filledFields.length,
      durationMs,
      filledFields
    };
  }

  function flashElementHighlight(el) {
    const originalBorder = el.style.borderColor;
    const originalShadow = el.style.boxShadow;
    const originalTransition = el.style.transition;

    el.style.transition = "all 0.25s ease";
    el.style.borderColor = "#06b6d4";
    el.style.boxShadow = "0 0 10px rgba(6, 182, 212, 0.6)";

    setTimeout(() => {
      el.style.borderColor = originalBorder;
      el.style.boxShadow = originalShadow;
      el.style.transition = originalTransition;
    }, 2000);
  }

  function getElementDisplayLabel(el) {
    const context = inspectElementContext(el);
    if (context && context.length > 0) {
      return context.split(" ").slice(0, 3).join(" ");
    }
    return el.getAttribute("name") || el.id || "Field";
  }

  /**
   * Parses natural language prompt strings into structured form details dictionary.
   * e.g. "Title Mr.\nFirst Name Rahul\nLast Name Sharma\nAddress Line 1 123 MG Road"
   */
  function parseFormDetailsFromText(text) {
    if (!text || typeof text !== "string") return {};
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsed = {};

    for (const line of lines) {
      // Match "Key: Value" or "Key Value"
      const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch) {
        const k = colonMatch[1].trim();
        const v = colonMatch[2].trim();
        if (k.length > 1 && v.length > 0 && !/^(criteria|instructions|recommend|fill|autofill)/i.test(k)) {
          parsed[k] = v;
          continue;
        }
      }

      // Match common field prefixes without colon (e.g. "First Name Rahul", "City Gurugram")
      const fieldPrefixes = [
        "Title", "First Name", "Middle Initial", "Last Name", "Full Name",
        "Company", "Position", "Job Title", "Address Line 1", "Address Line 2",
        "Address 1", "Address 2", "Street", "City", "State", "State / Province",
        "Province", "Country", "Zip", "Zip Code", "Postal Code", "PIN", "Pincode",
        "Home Phone", "Work Telephone", "Work Phone", "Cell Phone", "Cell",
        "Mobile", "Phone", "E-mail", "Email", "Web Site", "Website", "URL",
        "User ID", "Username", "Comments", "Message"
      ];

      for (const prefix of fieldPrefixes) {
        const regex = new RegExp(`^${prefix}\\s+([A-Za-z0-9\\s\\+\\-\\.,/&#@]+)$`, "i");
        const match = line.match(regex);
        if (match && match[1]) {
          parsed[prefix] = match[1].trim();
          break;
        }
      }
    }

    return parsed;
  }

  /**
   * Scans the active DOM for fillable forms and inputs.
   */
  function detectPageForms() {
    if (typeof document === "undefined") {
      return { hasForm: false, formCount: 0, fieldCount: 0, fields: [] };
    }
    const forms = Array.from(document.querySelectorAll("form"));
    const elementsList = Array.from(document.querySelectorAll(
      "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])"
    )).filter(el => el.offsetParent !== null || el.type === "select-one");

    const fields = elementsList.map((el, idx) => ({
      index: idx,
      id: el.id || "",
      name: el.getAttribute("name") || "",
      type: el.type || el.tagName.toLowerCase(),
      label: getElementDisplayLabel(el),
      semanticKey: identifySemanticField(el)
    }));

    return {
      hasForm: elementsList.length > 0,
      formCount: forms.length,
      fieldCount: elementsList.length,
      fields
    };
  }

  /**
   * Previews semantic field alignments between DOM inputs and a user profile without modifying DOM.
   */
  function previewFormMappings(rawProfileData) {
    if (typeof document === "undefined") {
      return { hasForm: false, totalFields: 0, matchedCount: 0, fields: [] };
    }
    const data = normalizeProfileData(rawProfileData || {});
    const elementsList = Array.from(document.querySelectorAll(
      "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])"
    )).filter(el => el.offsetParent !== null || el.type === "select-one");

    const mapped = [];
    let matchedCount = 0;

    elementsList.forEach((el, idx) => {
      const semanticKey = identifySemanticField(el);
      let proposedValue = "";
      if (semanticKey && data[semanticKey] != null) {
        proposedValue = String(data[semanticKey]);
      } else if (semanticKey === "phone" && (data.cellPhone || data.workPhone || data.homePhone)) {
        proposedValue = String(data.cellPhone || data.workPhone || data.homePhone);
      } else if ((semanticKey === "cellPhone" || semanticKey === "homePhone") && data.phone) {
        proposedValue = String(data.phone);
      }

      const isSensitive = el.type === "password" ||
        /password|passcode|credit.*card|card.*number|cvv|cvc|security.*code|ssn|social.*security|pin\b|otp|two.*factor/i.test(
          `${el.id} ${el.getAttribute("name") || ""} ${getElementDisplayLabel(el)} ${el.getAttribute("placeholder") || ""}`
        );

      const isMatched = Boolean(!isSensitive && proposedValue && proposedValue.trim() !== "");
      if (isMatched) matchedCount++;

      mapped.push({
        index: idx,
        id: el.id || `field_${idx}`,
        name: el.getAttribute("name") || el.id || `field_${idx}`,
        label: getElementDisplayLabel(el),
        type: el.type || el.tagName.toLowerCase(),
        semanticKey: semanticKey || "unrecognized",
        proposedValue: isSensitive ? "" : (proposedValue || ""),
        currentValue: el.value || "",
        isMatched: isMatched,
        isSensitive: isSensitive
      });
    });

    return {
      hasForm: elementsList.length > 0,
      totalFields: elementsList.length,
      matchedCount: matchedCount,
      fields: mapped
    };
  }

  /**
   * Fills only user-confirmed fields and dispatches reactive events.
   * STRICT SAFETY: Never clicks submit or dispatches submit events automatically!
   */
  function fillConfirmedFields(confirmedMappings) {
    if (typeof document === "undefined") {
      return { success: false, filledCount: 0, totalFields: 0, filledFields: [], unmatchedFields: [] };
    }
    const startTime = performance.now();
    const elementsList = Array.from(document.querySelectorAll(
      "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])"
    )).filter(el => el.offsetParent !== null || el.type === "select-one");

    const filledFields = [];
    const unmatchedFields = [];

    const mappingMap = new Map();
    if (Array.isArray(confirmedMappings)) {
      confirmedMappings.forEach(item => {
        if (item.index !== undefined) mappingMap.set(`idx_${item.index}`, item.value);
        if (item.id) mappingMap.set(`id_${item.id}`, item.value);
        if (item.name) mappingMap.set(`name_${item.name}`, item.value);
        if (item.semanticKey) mappingMap.set(`key_${item.semanticKey}`, item.value);
      });
    } else if (confirmedMappings && typeof confirmedMappings === "object") {
      Object.entries(confirmedMappings).forEach(([k, v]) => {
        mappingMap.set(k, v);
      });
    }

    elementsList.forEach((el, idx) => {
      const elId = el.id || "";
      const elName = el.getAttribute("name") || "";
      const semanticKey = identifySemanticField(el);

      let valToSet = mappingMap.get(`idx_${idx}`) ||
        (elId ? mappingMap.get(`id_${elId}`) : null) ||
        (elName ? mappingMap.get(`name_${elName}`) : null) ||
        (semanticKey ? mappingMap.get(`key_${semanticKey}`) : null) ||
        (semanticKey ? mappingMap.get(semanticKey) : null);

      if (valToSet == null || valToSet === "") {
        unmatchedFields.push({
          index: idx,
          id: elId,
          name: elName,
          label: getElementDisplayLabel(el),
          semanticKey
        });
        return;
      }

      valToSet = String(valToSet).trim();

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        if (desc && desc.set) {
          desc.set.call(el, valToSet);
        } else {
          el.value = valToSet;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
        flashElementHighlight(el);
        filledFields.push({ index: idx, id: elId, name: elName, label: getElementDisplayLabel(el), value: valToSet });
      } else if (el instanceof HTMLSelectElement) {
        const lower = valToSet.toLowerCase();
        let matched = false;
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          const optText = (opt.text || "").toLowerCase().trim();
          const optVal = (opt.value || "").toLowerCase().trim();
          if (optText === lower || optVal === lower || (lower.length >= 3 && (optText.includes(lower) || lower.includes(optText)))) {
            el.selectedIndex = i;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("input", { bubbles: true }));
            flashElementHighlight(el);
            filledFields.push({ index: idx, id: elId, name: elName, label: getElementDisplayLabel(el), value: opt.text });
            matched = true;
            break;
          }
        }
        if (!matched) {
          unmatchedFields.push({ index: idx, id: elId, name: elName, label: getElementDisplayLabel(el), reason: "No matching option" });
        }
      }
    });

    const durationMs = Math.round(performance.now() - startTime);
    return {
      success: true,
      filledCount: filledFields.length,
      unmatchedCount: unmatchedFields.length,
      totalFields: elementsList.length,
      durationMs,
      filledFields,
      unmatchedFields
    };
  }

  return {
    SEMANTIC_DICTIONARY,
    normalizeString,
    inspectElementContext,
    identifySemanticField,
    normalizeProfileData,
    semanticallyFillForm,
    parseFormDetailsFromText,
    detectPageForms,
    previewFormMappings,
    fillConfirmedFields
  };
});
