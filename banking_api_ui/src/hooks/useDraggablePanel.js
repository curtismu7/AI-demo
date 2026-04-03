// banking_api_ui/src/hooks/useDraggablePanel.js
import { useState, useCallback, useRef } from 'react';

/**
 * Shared hook for draggable + resizable fixed-position panels.
 * No viewport clamping -- panel can be dragged off any edge or to a second screen.
 *
 * @param {() => { x: number, y: number } | { x: number, y: number }} initialPos  Lazy initialiser or plain object.
 * @param {{ w: number, h: number }}       initialSize
 * @param {{ storageKey?: string, minW?: number, minH?: number }} [options]
 * @returns {{ pos, size, handleDragStart, handleResizeStart }}
 */
export function useDraggablePanel(initialPos, initialSize, options = {}) {
  const { storageKey, minW: minWOpt, minH: minHOpt } = options;
  const resolvedMinW = minWOpt != null ? minWOpt : 280;
  const resolvedMinH = minHOpt != null ? minHOpt : 180;

  const [pos, setPos] = useState(() => {
    if (storageKey) {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (stored?.pos?.x != null && stored?.pos?.y != null) return stored.pos;
      } catch {}
    }
    return typeof initialPos === 'function' ? initialPos() : initialPos;
  });

  const [size, setSize] = useState(() => {
    if (storageKey) {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (stored?.size?.w != null) return stored.size;
      } catch {}
    }
    return initialSize;
  });

  // Refs allow event handlers to always read the latest pos/size without
  // being recreated on every state change (fixes stale-closure drag bug).
  const posRef  = useRef(pos);
  const sizeRef = useRef(size);
  posRef.current  = pos;
  sizeRef.current = size;

  /** Drag from any element that calls this on mousedown. */
  const handleDragStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const offX = e.clientX - posRef.current.x;
    const offY = e.clientY - posRef.current.y;
    const onMove = (ev) => setPos({ x: ev.clientX - offX, y: ev.clientY - offY });
    const onUp   = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.style.userSelect = '';
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ pos: posRef.current, size: sizeRef.current }));
        } catch {}
      }
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Resize from the bottom-right grip. */
  const handleResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = sizeRef.current.w, startH = sizeRef.current.h;
    const onMove = (ev) => setSize({
      w: Math.max(resolvedMinW, startW + ev.clientX - startX),
      h: Math.max(resolvedMinH, startH + ev.clientY - startY),
    });
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ pos: posRef.current, size: sizeRef.current }));
        } catch {}
      }
    };
    document.body.style.cursor     = 'se-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [resolvedMinW, resolvedMinH, storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pos, size, handleDragStart, handleResizeStart };
}
