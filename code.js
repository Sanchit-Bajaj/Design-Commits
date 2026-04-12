// ─── Design Commits — Plugin Backend ────────────────────────────────────────
// Runs in Figma's JS sandbox (no DOM, no fetch).
// Communicates with ui.html exclusively via postMessage.

figma.showUI(__html__, {
  width: 380,
  height: 620,
  title: "Design Commits"
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── IN-MEMORY ACCUMULATORS ───────────────────────────────────────────────────
// Loaded from storage on init, then incremented by documentchange events.
let todayChanges = { created: 0, deleted: 0, edited: 0 };
let currentDate  = todayStr();
let saveTimer    = null;
let uiReady      = false;

// documentchange requires loadAllPagesAsync first when documentAccess = dynamic-page
figma.loadAllPagesAsync().then(() => {
  try {
    figma.on("documentchange", (event) => {
      try {
        const today = todayStr();
        if (today !== currentDate) {
          currentDate  = today;
          todayChanges = { created: 0, deleted: 0, edited: 0 };
        }
        for (const change of event.documentChanges) {
          if      (change.type === "CREATE")          todayChanges.created++;
          else if (change.type === "DELETE")          todayChanges.deleted++;
          else if (change.type === "PROPERTY_CHANGE") todayChanges.edited++;
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          try {
            await persistToday();
            if (uiReady) {
              const total = todayChanges.created + todayChanges.deleted + todayChanges.edited;
              figma.ui.postMessage({
                type:         "CHANGES_UPDATE",
                todayChanges: Object.assign({}, todayChanges),
                total
              });
            }
          } catch (e) {}
        }, 15000); // batch UI updates every 15s to avoid distraction
      } catch (e) {}
    });
  } catch (e) {
    console.warn("documentchange unavailable:", e);
  }
});

// ─── PERSIST TODAY ────────────────────────────────────────────────────────────
async function persistToday() {
  const today    = todayStr();
  const fileName = figma.root.name || "Untitled";
  const fileKey  = figma.fileKey   || "local";

  // Merge file entry into today's file list (dedup by key)
  const existing   = await figma.clientStorage.getAsync(`files_${today}`) || [];
  const alreadyIn  = existing.some(f => f.key === fileKey);
  if (!alreadyIn) {
    existing.unshift({ name: fileName, key: fileKey }); // newest first
    await figma.clientStorage.setAsync(`files_${today}`, existing);
  }

  await figma.clientStorage.setAsync(`day_${today}`, todayChanges);

  const days = await figma.clientStorage.getAsync("days") || [];
  if (!days.includes(today)) {
    days.push(today);
    await figma.clientStorage.setAsync("days", days);
  }
}


// ─── BUILD HEATMAP + FILEMAP FROM STORAGE ────────────────────────────────────
async function buildMaps() {
  const days    = await figma.clientStorage.getAsync("days") || [];
  const heatmap = {};
  const fileMap = {};
  for (const d of days) {
    const v = await figma.clientStorage.getAsync(`day_${d}`);
    if (v) heatmap[d] = (v.created || 0) + (v.deleted || 0) + (v.edited || 0);
    const f = await figma.clientStorage.getAsync(`files_${d}`);
    if (f && f.length) fileMap[d] = f;
  }
  return { heatmap, fileMap };
}

// ─── MESSAGE ROUTER ───────────────────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {

  // ── REQUEST_INIT ──────────────────────────────────────────────────────────
  if (msg.type === "REQUEST_INIT") {
    const user      = await figma.clientStorage.getAsync("user") || null;
    const figmaUser = figma.currentUser;
    const today     = todayStr();

    // Load today's previously accumulated changes (from earlier in the day)
    const saved = await figma.clientStorage.getAsync(`day_${today}`);
    if (saved) {
      todayChanges = saved;
      currentDate  = today;
    }

    const { heatmap, fileMap } = await buildMaps();
    const todayTotal = todayChanges.created + todayChanges.deleted + todayChanges.edited;
    if (todayTotal > 0) heatmap[today] = todayTotal;

    uiReady = true;

    figma.ui.postMessage({
      type:         "INIT",
      user,
      figmaUser:    figmaUser
        ? { name: figmaUser.name, photoUrl: figmaUser.photoUrl, id: figmaUser.id }
        : null,
      todayChanges: Object.assign({}, todayChanges),
      total:        todayTotal,
      heatmap,
      fileMap,
      sessionStart: Date.now(),
      fileName:     figma.root.name,
      fileKey:      figma.fileKey || null
    });
  }

  // ── AUTH_SUBMIT ───────────────────────────────────────────────────────────
  else if (msg.type === "AUTH_SUBMIT") {
    const figmaUser = figma.currentUser;
    const user = {
      email:     msg.email.trim().toLowerCase(),
      name:      msg.name || (figmaUser ? figmaUser.name : "Designer"),
      figmaId:   figmaUser ? figmaUser.id : null,
      createdAt: new Date().toISOString()
    };
    await figma.clientStorage.setAsync("user", user);

    const today      = todayStr();
    const { heatmap, fileMap } = await buildMaps();
    const todayTotal = todayChanges.created + todayChanges.deleted + todayChanges.edited;
    if (todayTotal > 0) heatmap[today] = todayTotal;

    uiReady = true;

    figma.ui.postMessage({
      type:         "INIT",
      user,
      figmaUser:    figmaUser
        ? { name: figmaUser.name, photoUrl: figmaUser.photoUrl, id: figmaUser.id }
        : null,
      todayChanges: Object.assign({}, todayChanges),
      total:        todayTotal,
      heatmap,
      fileMap,
      sessionStart: Date.now(),
      fileName:     figma.root.name,
      fileKey:      figma.fileKey || null
    });
  }

  // ── MINIMIZE / RESTORE ────────────────────────────────────────────────────
  else if (msg.type === "MINIMIZE") {
    figma.ui.resize(260, 44);
  }
  else if (msg.type === "RESTORE") {
    figma.ui.resize(380, 620);
  }

  // ── SIGN_OUT ──────────────────────────────────────────────────────────────
  else if (msg.type === "SIGN_OUT") {
    await figma.clientStorage.deleteAsync("user");
    figma.ui.postMessage({ type: "SIGNED_OUT" });
  }

  // ── CLOSE ─────────────────────────────────────────────────────────────────
  else if (msg.type === "CLOSE") {
    figma.closePlugin();
  }
};
