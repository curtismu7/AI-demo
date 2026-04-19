/**
 * useFlowMilestones - React hook that subscribes to milestonesStore.
 * Thin wrapper so React components get re-renders when milestones change.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  subscribe,
  addMilestone as storeAdd,
  updateMilestoneStatus as storeUpdate,
  clearMilestones as storeClear,
  getMilestones,
} from '../services/milestonesStore';

export function useFlowMilestones() {
  const [milestones, setMilestones] = useState(() => getMilestones());

  useEffect(() => {
    const unsub = subscribe(setMilestones);
    return unsub;
  }, []);

  const addMilestone    = useCallback((name, type, details) => storeAdd(name, type, details),  []);
  const updateStatus    = useCallback((id, status, more)   => storeUpdate(id, status, more),  []);
  const clearMilestones = useCallback(()                   => storeClear(),                   []);

  return { milestones, addMilestone, updateMilestoneStatus: updateStatus, clearMilestones };
}

export default useFlowMilestones;
