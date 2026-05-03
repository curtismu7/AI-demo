import React, { useEffect, useState, useRef } from 'react';
import AgentDemoGuide from './AgentDemoGuide';
import './AgentDemoGuide.css';

/**
 * Pop-out version of the Agent Demo Guide — displayed in a separate window.
 */
export default function DemoGuidePopout() {
  const [data, setData] = useState(null);
  const [size, setSize] = useState({ width: 1150, height: 800 });
  const [pos, setPos] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const broadcastChannelRef = useRef(null);

  useEffect(() => {
    // Load initial data from sessionStorage
    try {
      const stored = sessionStorage.getItem('demo_guide_modal_popout');
      if (stored) {
        setData(JSON.parse(stored));
      }
    } catch (_) {}

    // Listen to BroadcastChannel for updates from original window
    try {
      broadcastChannelRef.current = new BroadcastChannel('demo-guide-modal');
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data.type === 'state-update' && event.data.data) {
          setData(event.data.data);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e.message);
    }

    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  const handleMouseDownHeader = (e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  if (!data) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', fontSize: '14px', color: '#666' }}>
        Loading demo guide…
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent' }}>
      <div
        style={{
          position: 'fixed',
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Header — draggable */}
        <div
          onMouseDown={handleMouseDownHeader}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            padding: '12px 16px',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f9f9f9',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            📚 Banking Agent Demo Guide
          </h2>
          <button
            type="button"
            onClick={() => window.close()}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '0 8px',
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AgentDemoGuide
            onClose={() => window.close()}
            initialActiveScenario={data.activeScenario}
            initialExpandedSteps={data.expandedSteps}
            isPopout={true}
          />
        </div>
      </div>
    </div>
  );
}
