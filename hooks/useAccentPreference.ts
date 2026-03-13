import { useState, useCallback, useEffect } from 'react';
import type { AccentPreference } from '../types';

const STORAGE_KEY = 'accent_pref_v1';

export const ACCENT_LABELS: Record<AccentPreference, string> = {
    'en-US': '🇺🇸 American',
    'en-GB': '🇬🇧 British',
    'en-AU': '🇦🇺 Australian',
};

export const ACCENT_HINTS: Record<AccentPreference, string> = {
    'en-US': 'in a clear, natural American (General American) accent',
    'en-GB': 'in a natural Received Pronunciation British accent',
    'en-AU': 'in a natural Australian accent',
};

export function useAccentPreference() {
    const [accent, setAccentState] = useState<AccentPreference>(() => {
        return (localStorage.getItem(STORAGE_KEY) as AccentPreference) ?? 'en-US';
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, accent);
    }, [accent]);

    const setAccent = useCallback((a: AccentPreference) => setAccentState(a), []);
    const accentHint = ACCENT_HINTS[accent];

    return { accent, accentHint, setAccent, ACCENT_LABELS };
}
