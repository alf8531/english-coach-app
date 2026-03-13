import { useState, useCallback, useEffect } from 'react';
import type { VocabItem } from '../types';

const STORAGE_KEY = 'vocab_deck_v3';

// SM-2 Algorithm implementation
function sm2(item: VocabItem, quality: number): VocabItem {
    // quality: 0=complete blackout, 1=incorrect, 2=incorrect easy, 3=correct hard, 4=correct, 5=perfect
    const q = Math.max(0, Math.min(5, quality));
    let { easeFactor, interval, repetitions } = item;

    if (q < 3) {
        // Failed — reset repetitions
        repetitions = 0;
        interval = 1;
    } else {
        if (repetitions === 0) interval = 1;
        else if (repetitions === 1) interval = 6;
        else interval = Math.round(interval * easeFactor);
        repetitions += 1;
    }

    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

    const nextReviewAt = Date.now() + interval * 24 * 60 * 60 * 1000;
    const srsLevel: VocabItem['srsLevel'] =
        repetitions === 0 ? 'new'
            : interval < 7 ? 'learning'
                : interval < 21 ? 'review'
                    : 'mastered';

    return { ...item, easeFactor, interval, repetitions, nextReviewAt, srsLevel };
}

function makeNewItem(word: string, phonetic: string, definition: string, example: string): VocabItem {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        word, phonetic, definition, example,
        dateAdded: Date.now(),
        nextReviewAt: Date.now(),
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        srsLevel: 'new',
    };
}

export function useVocabDeck() {
    const [deck, setDeck] = useState<VocabItem[]>(() => {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Partial<VocabItem>[];
            // Migrate old items that lack SRS fields
            return raw.map(item => ({
                id: item.id ?? `migrated-${Math.random()}`,
                word: item.word ?? '',
                phonetic: item.phonetic ?? '',
                definition: item.definition ?? '',
                example: item.example ?? '',
                dateAdded: item.dateAdded ?? Date.now(),
                nextReviewAt: item.nextReviewAt ?? Date.now(),
                interval: item.interval ?? 0,
                easeFactor: item.easeFactor ?? 2.5,
                repetitions: item.repetitions ?? 0,
                srsLevel: item.srsLevel ?? 'new',
            }));
        } catch {
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
    }, [deck]);

    const dueCards = deck.filter(c => c.nextReviewAt <= Date.now());
    const dueCount = dueCards.length;

    const addWord = useCallback((word: string, phonetic: string, definition: string, example: string) => {
        setDeck(prev => {
            if (prev.some(i => i.word.toLowerCase() === word.toLowerCase())) return prev;
            return [...prev, makeNewItem(word, phonetic, definition, example)];
        });
    }, []);

    const reviewCard = useCallback((id: string, quality: number) => {
        setDeck(prev => prev.map(item => item.id === id ? sm2(item, quality) : item));
    }, []);

    const removeWord = useCallback((id: string) => {
        setDeck(prev => prev.filter(item => item.id !== id));
    }, []);

    return { deck, dueCards, dueCount, addWord, reviewCard, removeWord };
}
