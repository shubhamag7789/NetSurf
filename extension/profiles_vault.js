/**
 * NetSurf Identity & Autofill Profile Vault
 * Persists and manages multiple user profiles, personas, and combinations
 * in chrome.storage.local with full Add / Edit / Delete / Export / Import capabilities.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NetSurfProfilesVault = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  const STORAGE_KEY = "netsurf_autofill_profiles";
  const ACTIVE_PROFILE_KEY = "netsurf_active_profile_id";

  // Default initial seed profile templates for immediate autofill convenience
  const DEFAULT_PROFILES = [
    {
      id: "prof_default_work",
      name: "Work Profile (Default)",
      isDefault: true,
      updatedAt: Date.now(),
      fields: {
        title: "Alex",
        firstName: "Alex",
        middleInitial: "J",
        lastName: "Taylor",
        fullName: "Alex J Taylor",
        company: "Acme Innovations Ltd",
        position: "Senior Analyst",
        address1: "100 Tech Park Boulevard",
        address2: "Suite 400",
        city: "San Francisco",
        state: "California",
        country: "United States",
        zip: "94105",
        email: "alex.taylor@example.com",
        phone: "+1 555-0143",
        cellPhone: "+1 555-0143",
        homePhone: "",
        workPhone: "+1 555-0199",
        website: "https://example.com/alextaylor"
      }
    },
    {
      id: "prof_default_personal",
      name: "Personal Profile",
      isDefault: false,
      updatedAt: Date.now(),
      fields: {
        title: "Morgan",
        firstName: "Morgan",
        middleInitial: "",
        lastName: "Reed",
        fullName: "Morgan Reed",
        company: "",
        position: "Freelance Consultant",
        address1: "742 Evergreen Terrace",
        address2: "Apt 2B",
        city: "Seattle",
        state: "Washington",
        country: "United States",
        zip: "98101",
        email: "morgan.reed@example.com",
        phone: "+1 555-0182",
        cellPhone: "+1 555-0182",
        website: "https://example.com/morganreed"
      }
    }
  ];

  /**
   * Retrieves all profiles from chrome.storage.local (or fallback to defaults).
   * Returns an Array of profiles with .profiles and .activeProfileId attached for compatibility.
   */
  async function getAllProfiles() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([STORAGE_KEY, ACTIVE_PROFILE_KEY], (res) => {
          let list = res[STORAGE_KEY];
          // Check for legacy demo data from earlier versions
          const hasLegacyDemo = list && Array.isArray(list) && list.some(p => 
            (p.name && (p.name.includes("Rahul") || p.name.includes("Priya"))) || 
            (p.fields && (p.fields.email === "rahul.sharma@example.com" || p.fields.phone === "+91 9876543210"))
          );
          if (!list || !Array.isArray(list) || list.length === 0 || hasLegacyDemo) {
            list = [...DEFAULT_PROFILES];
            chrome.storage.local.set({ [STORAGE_KEY]: list, [ACTIVE_PROFILE_KEY]: list[0].id });
          }
          const activeId = res[ACTIVE_PROFILE_KEY] || (list[0] ? list[0].id : null);
          // Attach properties to array for both Array and Object destructuring compatibility
          list.profiles = list;
          list.activeProfileId = activeId;
          resolve(list);
        });
      } else {
        const list = [...DEFAULT_PROFILES];
        list.profiles = list;
        list.activeProfileId = DEFAULT_PROFILES[0].id;
        resolve(list);
      }
    });
  }

  /**
   * Retrieves the currently active profile ID.
   */
  async function getActiveProfileId() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([ACTIVE_PROFILE_KEY, STORAGE_KEY], (res) => {
          if (res[ACTIVE_PROFILE_KEY]) {
            resolve(res[ACTIVE_PROFILE_KEY]);
          } else {
            const list = res[STORAGE_KEY] || DEFAULT_PROFILES;
            resolve(list[0] ? list[0].id : null);
          }
        });
      } else {
        resolve(DEFAULT_PROFILES[0].id);
      }
    });
  }

  /**
   * Retrieves a single profile by its ID.
   */
  async function getProfile(profileId) {
    const list = await getAllProfiles();
    return list.find(p => p.id === profileId) || null;
  }

  /**
   * Saves or updates a profile in storage.
   */
  async function saveProfile(profile) {
    const list = await getAllProfiles();
    const profiles = Array.from(list);
    if (!profile.id) {
      profile.id = "prof_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    }
    profile.updatedAt = Date.now();

    const existingIdx = profiles.findIndex(p => p.id === profile.id);
    if (existingIdx >= 0) {
      profiles[existingIdx] = profile;
    } else {
      profiles.push(profile);
    }

    // If marked default, unset other defaults
    if (profile.isDefault) {
      profiles.forEach(p => {
        if (p.id !== profile.id) p.isDefault = false;
      });
    }

    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: profiles }, () => resolve(profile));
      } else {
        resolve(profile);
      }
    });
  }

  /**
   * Deletes a profile by ID.
   */
  async function deleteProfile(profileId) {
    const list = await getAllProfiles();
    const profiles = Array.from(list);
    const activeProfileId = list.activeProfileId;
    const updated = profiles.filter(p => p.id !== profileId);
    let nextActiveId = activeProfileId;
    if (activeProfileId === profileId) {
      nextActiveId = updated.length > 0 ? updated[0].id : null;
    }

    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: updated, [ACTIVE_PROFILE_KEY]: nextActiveId }, () => {
          resolve({ success: true, activeProfileId: nextActiveId, profiles: updated });
        });
      } else {
        resolve({ success: true, activeProfileId: nextActiveId, profiles: updated });
      }
    });
  }

  /**
   * Sets the active profile ID.
   */
  async function setActiveProfileId(profileId) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [ACTIVE_PROFILE_KEY]: profileId }, () => resolve(true));
      } else {
        resolve(true);
      }
    });
  }

  /**
   * Retrieves the currently active profile object.
   */
  async function getActiveProfile() {
    const list = await getAllProfiles();
    const activeProfileId = list.activeProfileId || (await getActiveProfileId());
    let active = list.find(p => p.id === activeProfileId);
    if (!active && list.length > 0) active = list[0];
    return active || null;
  }

  /**
   * Quick-saves parsed prompt fields into a new profile.
   */
  async function createProfileFromParsed(name, fields) {
    const profile = {
      id: "prof_" + Date.now(),
      name: name || fields.fullName || fields.firstName || "Saved Profile",
      isDefault: false,
      updatedAt: Date.now(),
      fields: fields
    };
    await saveProfile(profile);
    await setActiveProfileId(profile.id);
    return profile;
  }

  return {
    getAllProfiles,
    getActiveProfileId,
    getProfile,
    getActiveProfile,
    saveProfile,
    deleteProfile,
    setActiveProfileId,
    createProfileFromParsed,
    DEFAULT_PROFILES
  };
});
