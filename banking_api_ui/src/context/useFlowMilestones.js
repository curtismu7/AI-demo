/**
 * useFlowMilestones Hook
 * Manages OIDC flow milestones with localStorage persistence
 * 
 * Milestone structure:
 * {
 *   id: string (e.g., 'm-1234567890-abc123')
 *   name: string (e.g., 'OIDC Authentication')
 *   type: 'oidc_login' | 'exchange_start' | 'exchange_complete' | 'mcp_tool_call' | 'backend_operation' | 'flow_complete'
 *   timestamp: ISO8601 string
 *   status: 'pending' | 'active' | 'done' | 'error'
 *   details?: { exchangePath?, toolName?, operationName?, errorMsg? }
 * }
 */

import { useContext, useCallback, useEffect, useState } from 'react';
import { TokenChainContext } from './TokenChainContext';

const MILESTONES_KEY = 'flowMilestones';
const MILESTONES_VERSION_KEY = 'flowMilestonesVersion';
const MAX_MILESTONES = 50;
const SCHEMA_VERSION = 1;

/**
 * Generate unique milestone ID
 * @returns {string}
 */
function generateMilestoneId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Load milestones from localStorage with error recovery
 * @returns {Array}
 */
function loadMilestonesFromStorage() {
  try {
    const stored = localStorage.getItem(MILESTONES_KEY);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      console.warn('[flowMilestones] Invalid milestones structure, resetting');
      return [];
    }
    
    return parsed;
  } catch (err) {
    console.warn('[flowMilestones] Failed to load from localStorage:', err.message);
    try {
      localStorage.removeItem(MILESTONES_KEY);
    } catch (e) {}
    return [];
  }
}

/**
 * Save milestones to localStorage with quota handling
 * @param {Array} milestones
 */
function saveMilestonesToStorage(milestones) {
  try {
    const toStore = milestones.slice(-MAX_MILESTONES); // Keep only last 50
    localStorage.setItem(MILESTONES_KEY, JSON.stringify(toStore));
    localStorage.setItem(MILESTONES_VERSION_KEY, String(SCHEMA_VERSION));
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      console.warn('[flowMilestones] localStorage quota exceeded, clearing oldest entries');
      try {
        // Clear oldest 10 milestones and retry
        const current = loadMilestonesFromStorage();
        if (current.length > 10) {
          const trimmed = current.slice(10);
          localStorage.setItem(MILESTONES_KEY, JSON.stringify(trimmed));
        } else {
          localStorage.removeItem(MILESTONES_KEY);
        }
      } catch (e) {
        console.error('[flowMilestones] Failed to recover from quota error:', e.message);
      }
    } else {
      console.error('[flowMilestones] Failed to save to localStorage:', err.message);
    }
  }
}

/**
 * Hook: useFlowMilestones
 * Returns milestones array and management functions
 * 
 * @returns {{
 *   milestones: Array<Milestone>,
 *   addMilestone: (name: string, type: string, details?: object) => string,
 *   updateMilestoneStatus: (id: string, status: string, moreDetails?: object) => void,
 *   clearMilestones: () => void
 * }}
 */
export function useFlowMilestones() {
  const [milestones, setMilestones] = useState([]);
  const [initialized, setInitialized] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    const loaded = loadMilestonesFromStorage();
    setMilestones(loaded);
    setInitialized(true);
  }, []);

  const addMilestone = useCallback(
    (name, type, details = {}) => {
      const milestone = {
        id: generateMilestoneId(),
        name,
        type,
        timestamp: new Date().toISOString(),
        status: 'pending',
        details: details || {}
      };

      setMilestones((prev) => {
        const updated = [...prev, milestone];
        saveMilestonesToStorage(updated);
        return updated;
      });

      return milestone.id;
    },
    []
  );

  const updateMilestoneStatus = useCallback(
    (milestoneId, newStatus, moreDetails = {}) => {
      setMilestones((prev) => {
        const updated = prev.map((m) => {
          if (m.id === milestoneId) {
            return {
              ...m,
              status: newStatus,
              details: { ...m.details, ...moreDetails }
            };
          }
          return m;
        });
        saveMilestonesToStorage(updated);
        return updated;
      });
    },
    []
  );

  const clearMilestones = useCallback(() => {
    setMilestones([]);
    try {
      localStorage.removeItem(MILESTONES_KEY);
      localStorage.removeItem(MILESTONES_VERSION_KEY);
    } catch (err) {
      console.warn('[flowMilestones] Failed to clear from localStorage:', err.message);
    }
  }, []);

  return {
    milestones,
    addMilestone,
    updateMilestoneStatus,
    clearMilestones,
    initialized
  };
}

export default useFlowMilestones;
