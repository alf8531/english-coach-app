import { useState, useCallback, useEffect } from 'react';
import type { ScoreEntry } from '../types';

const STORAGE_KEY = 'score_history_v2';
const MAX_ENTRIES = 200;

export function useScoreHistory() {
    const [history, setHistory] = useState<ScoreEntry[]>(() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }, [history]);

    const recordScore = useCallback((module: ScoreEntry['module'], score: number) => {
        setHistory(prev => {
            const next = [...prev, { module, score, ts: Date.now() }];
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
        });
    }, []);

    const getHistory = useCallback((module?: ScoreEntry['module']) => {
        return module ? history.filter(h => h.module === module) : history;
    }, [history]);

    const getRecentAverage = useCallback((module?: ScoreEntry['module'], days = 7) => {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const filtered = (module ? history.filter(h => h.module === module) : history)
            .filter(h => h.ts >= cutoff);
        if (!filtered.length) return null;
        return Math.round(filtered.reduce((s, h) => s + h.score, 0) / filtered.length);
    }, [history]);

    return { history, recordScore, getHistory, getRecentAverage };
}
