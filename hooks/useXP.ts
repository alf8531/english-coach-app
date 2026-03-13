import { useState, useCallback, useEffect } from 'react';
import type { XPEntry } from '../types';

const STORAGE_KEY = 'fluency_xp_v2';
const XP_MULTIPLIERS: Record<XPEntry['module'], number> = {
    reading: 1.0,
    writing: 1.2,
    listening: 1.0,
    deepchat: 1.5,
    flashcards: 0.5,
    youtube: 1.3,
    mystery: 1.4,
};

export function levelFromXP(xp: number): { level: number; label: string; xpInLevel: number; xpToNext: number } {
    // Each level requires 200 * level XP: L1=200, L2=400, L3=600...
    let level = 1;
    let remaining = xp;
    while (remaining >= level * 200) {
        remaining -= level * 200;
        level++;
    }
    const xpToNext = level * 200;
    return { level, label: getLevelLabel(level), xpInLevel: remaining, xpToNext };
}

function getLevelLabel(level: number): string {
    if (level <= 2) return 'Beginner';
    if (level <= 5) return 'Learner';
    if (level <= 9) return 'Conversational';
    if (level <= 14) return 'Fluent';
    if (level <= 20) return 'Advanced';
    return 'Master';
}

export function getWeeklyXP(log: XPEntry[]): { day: string; xp: number }[] {
    const days: { day: string; xp: number }[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('en-US', { weekday: 'short' });
        const xp = log
            .filter(e => new Date(e.ts).toISOString().slice(0, 10) === dateStr)
            .reduce((s, e) => s + e.amount, 0);
        days.push({ day: label, xp });
    }
    return days;
}

export function useXP() {
    const [log, setLog] = useState<XPEntry[]>(() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    }, [log]);

    const totalXP = log.reduce((s, e) => s + e.amount, 0);
    const levelInfo = levelFromXP(totalXP);
    const weeklyXP = getWeeklyXP(log);

    const addXP = useCallback((module: XPEntry['module'], baseScore: number) => {
        const multiplier = XP_MULTIPLIERS[module] ?? 1;
        const amount = Math.round((baseScore / 100) * 100 * multiplier);
        const entry: XPEntry = { module, amount, ts: Date.now() };
        setLog(prev => [...prev, entry]);
        return amount;
    }, []);

    return { log, totalXP, levelInfo, weeklyXP, addXP };
}
