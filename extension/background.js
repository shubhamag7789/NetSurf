/**
 * Netsurf Chrome Extension - Background Service Worker (MV3)
 * Orchestrates extension lifecycle, tab auto-injection, and background sync.
 */

// Helper to inject content script safely into http/https tabs
async function injectContentScriptIntoTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) return;
    if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("chrome-extension://")) {
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content_script.js"]
    });
    console.log(`[Netsurf] Injected content script into tab ${tabId} (${tab.url})`);
  } catch (err) {
    // Tab might be closed or restricted
  }
}

// Injects into all currently active http/https tabs
async function injectAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      if (tab.id) {
        await injectContentScriptIntoTab(tab.id);
      }
    }
  } catch (err) {
    console.warn("[Netsurf] Tab batch injection note:", err.message);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Netsurf] Background service worker initialized.");
  // Configure side panel to open on action click
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error("[Netsurf] Failed to set side panel behavior:", err));
  }
  
  // Register scheduled price tracking alarm (every 30 minutes)
  if (typeof chrome !== "undefined" && chrome.alarms) {
    chrome.alarms.create("netsurf_price_tracker_alarm", { periodInMinutes: 30 });
    console.log("[Netsurf] Scheduled price tracking alarm registered (30m interval).");
  }

  await injectAllTabs();
});

// ── SCHEDULED PRICE TRACKING & NOTIFICATIONS (PHASE 6) ──────────────────────

const NOTIF_FALLBACK_ICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236366f1'><circle cx='12' cy='12' r='10'/></svg>";
const notificationUrlMap = new Map();

async function executeScheduledPriceChecks() {
  try {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    const data = await new Promise(res => chrome.storage.local.get(["netsurf_auth_tokens"], res));
    const tokens = data.netsurf_auth_tokens;
    if (!tokens || !tokens.access_token) {
      console.log("[Netsurf] Scheduled check skipped: Guest/unauthenticated user.");
      return;
    }

    const resp = await fetch("http://127.0.0.1:8000/user/tracking/check-all", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json"
      }
    });

    if (resp.ok) {
      const result = await resp.json();
      console.log(`[Netsurf] Price tracking check completed: ${result.checked_count} items checked, ${result.notifications ? result.notifications.length : 0} alerts.`);

      if (result.notifications && result.notifications.length > 0 && chrome.notifications) {
        for (const notif of result.notifications) {
          const notifId = `netsurf_alert_${notif.item_id}_${Date.now()}`;
          if (notif.url) {
            notificationUrlMap.set(notifId, notif.url);
          }

          let title = "NetSurf Price Alert";
          if (notif.alert_type === "target_reached") title = "🎯 Target Price Reached!";
          else if (notif.alert_type === "significant_drop") title = "📉 Significant Price Drop!";
          else if (notif.alert_type === "repeated_failures") title = "⚠️ Price Tracker Warning";

          chrome.notifications.create(notifId, {
            type: "basic",
            iconUrl: NOTIF_FALLBACK_ICON,
            title: title,
            message: notif.message,
            priority: 2
          });
        }
      }
    }
  } catch (err) {
    console.warn("[Netsurf] Scheduled price check error:", err.message);
  }
}

// Listen to scheduled alarms
if (typeof chrome !== "undefined" && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "netsurf_price_tracker_alarm") {
      await executeScheduledPriceChecks();
    }
  });
}

// Handle notification click to open verified source URL
if (typeof chrome !== "undefined" && chrome.notifications) {
  chrome.notifications.onClicked.addListener((notifId) => {
    const targetUrl = notificationUrlMap.get(notifId);
    if (targetUrl && chrome.tabs) {
      chrome.tabs.create({ url: targetUrl });
    }
  });
}

// Auto-inject whenever a tab completes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://"))) {
    injectContentScriptIntoTab(tabId);
  }
});

// Relay messages and handle engine synchronization
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING_BACKGROUND") {
    sendResponse({ status: "ok", app: "Netsurf", version: "2.0.0" });
    return true;
  }
  if (message.type === "SYNC_ENGINE") {
    injectAllTabs().then(() => {
      sendResponse({ status: "synced" });
    });
    return true;
  }
});
