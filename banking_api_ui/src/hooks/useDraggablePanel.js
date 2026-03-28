// banking_api_ui/src/hooks/useDraggablePanel.js
import { useState, useCallback } from 'react';

/**
 * Shared hook for draggable + resizable fixed-position panels.
 * No viewport clamping — panel can be dragged off any edge or to a second screen.
 *
 * @param {() => { x: number, y: number }} initialPos  Lazy initialiser (called once on mount).
 * @param {{ w: number, h: number }}       initialSize
 * @returns {{ pos, size, handleDragStart, handleResizeStart }}
 */
export function useDraggablePanel(initialPos, initialSize) {
  const [pos,  setPos]  = useState(initialPos);
  const [size, setSize] = useState(initialSize);

  /** Drag from any element that calls this on mousedown. */
  const handleDragStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const offX = e.clientX - pos.x;
    const offY = e.clientY - pos.y;
    const onMove = (ev) => setPos({ x: ev.clientX - offX, y: ev.clientY - offY });
    const onUp   = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [pos.x, pos.y]);

  /** Resize from the bottom-right grip. */
  const handleResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = size.w,    startH = size.h;
    const onMove = (ev) => setSize({
      w: Math.max(280, startW + ev.clientX - startX),
      h: Math.max(180, startH + ev.clientY - startY),
    });
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor     = 'se-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [size.w, size.h]);

  return { pos, size, handleDragStart, handleResizeStart };
}
