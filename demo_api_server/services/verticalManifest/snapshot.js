'use strict';

function createSnapshot(store, overlay, hooks) {
  const { getActiveId, setActiveId, onRestoredId, onRestoredActive } = hooks;

  function save(userId) {
    const overlays = {};
    for (const id of store.listOverlayIds()) {
      overlays[id] = overlay.get(id);
    }
    const savedAt = Date.now();
    store.setSnapshot(userId, { activeId: getActiveId(), overlays, savedAt });
    return savedAt;
  }

  function restore(userId) {
    const snap = store.getSnapshot(userId);
    if (!snap) return { restored: false };

    // Clear current overlays for any id present in the snapshot OR currently
    // overlaid. This wipes ids that were added since the snapshot was taken.
    const allIds = new Set([
      ...Object.keys(snap.overlays || {}),
      ...store.listOverlayIds(),
    ]);
    for (const id of allIds) overlay.clearAll(id);

    // Apply the snapshot's overlays via the raw store (skip overlay.setField's
    // per-field merged-manifest validation — they were valid when saved, and the
    // schema hasn't changed).
    for (const [id, ov] of Object.entries(snap.overlays || {})) {
      store.setOverlay(id, ov);
      onRestoredId(id);
    }

    if (snap.activeId) {
      setActiveId(snap.activeId);
      onRestoredActive(snap.activeId);
    }
    return { restored: true, savedAt: snap.savedAt };
  }

  function peek(userId) {
    const s = store.getSnapshot(userId);
    return s ? { savedAt: s.savedAt } : null;
  }

  function clear(userId) { store.clearSnapshot(userId); }

  return { save, restore, peek, clear };
}

module.exports = { createSnapshot };
