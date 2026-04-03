// banking_api_ui/src/context/IndustryBrandingContext.js
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import axios from 'axios';
import { getIndustryPreset, DEFAULT_INDUSTRY_ID } from '../config/industryPresets';

const STORAGE_KEY = 'bx_industry_preset_id';

const IndustryBrandingContext = createContext({
  industryId: DEFAULT_INDUSTRY_ID,
  preset: () => getIndustryPreset(DEFAULT_INDUSTRY_ID),
  setIndustryId: () => {},
  applyIndustryId: () => {},
});

function readStoredIndustryId() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim();
    if (v) return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** Apply CSS variables + data-industry on &lt;html&gt; for global theme hooks. */
function applyPresetToDocument(preset) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.industry = preset.id;
  Object.entries(preset.cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function IndustryBrandingProvider({ children }) {
  const [industryId, setIndustryIdState] = useState(() => {
    const stored = readStoredIndustryId();
    return stored || DEFAULT_INDUSTRY_ID;
  });

  const preset = useMemo(() => getIndustryPreset(industryId), [industryId]);

  useLayoutEffect(() => {
    applyPresetToDocument(preset);
  }, [preset]);

  /** Sync from server GET /api/admin/config (public field ui_industry_preset). */
  useEffect(() => {
    let cancelled = false;
    axios
      .get('/api/admin/config')
      .then(({ data }) => {
        const sid = data?.config?.ui_industry_preset;
        if (cancelled || !sid || typeof sid !== 'string') return;
        const next = sid.trim();
        if (!next) return;
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* ignore */
        }
        setIndustryIdState(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setIndustryId = useCallback((id) => {
    const next = id && typeof id === 'string' ? id.trim() : DEFAULT_INDUSTRY_ID;
    const resolved = getIndustryPreset(next).id;
    setIndustryIdState(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, resolved);
    } catch {
      /* ignore */
    }
  }, []);

  const applyIndustryId = useCallback((id) => {
    setIndustryId(id);
    applyPresetToDocument(getIndustryPreset(id));
  }, [setIndustryId]);

  const value = useMemo(
    () => ({
      industryId: preset.id,
      preset,
      setIndustryId,
      applyIndustryId,
    }),
    [preset, setIndustryId, applyIndustryId],
  );

  return (
    <IndustryBrandingContext.Provider value={value}>{children}</IndustryBrandingContext.Provider>
  );
}

export function useIndustryBranding() {
  return useContext(IndustryBrandingContext);
}
