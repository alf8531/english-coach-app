import { useState, useCallback, useEffect } from 'react';
import type { StreakData } from '../types';

const STORAGE_KEY = 'unified_streak_v2';

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

const DEFAULT: StreakData = {
    streak: 0,
    lastActiveDate: '',
    modulesCompletedToday: [],
};

export function useStreak() {
    const [data, setData] = useState<StreakData>(() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') ?? DEFAULT;
        } catch {
            return DEFAULT;
        }
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, [data]);

    const recordActivity = useCallback((module: string) => {
        setData(prev => {
            const today = todayStr();
            const yesterday = yesterdayStr();

            // Already recorded this module today
            if (prev.lastActiveDate === today && prev.modulesCompletedToday.includes(module)) {
                return prev;
            }

            let newStreak = prev.streak;
            let newModules = prev.modulesCompletedToday;

            if (prev.lastActiveDate === today) {
                // Same day, add module
                newModules = [...newModules, module];
            } else if (prev.lastActiveDate === yesterday) {
                // Consecutive day — extend streak
                newStreak = prev.streak + 1;
                newModules = [module];
            } else {
                // New streak from scratch
                newStreak = 1;
                newModules = [module];
            }

            return {
                streak: newStreak,
                lastActiveDate: today,
                modulesCompletedToday: newModules,
            };
        });
    }, []);

    const isActiveToday = data.lastActiveDate === todayStr();

    return {
        streak: data.streak,
        lastActiveDate: data.lastActiveDate,
        modulesCompletedToday: data.modulesCompletedToday,
        isActiveToday,
        recordActivity,
    };
}
