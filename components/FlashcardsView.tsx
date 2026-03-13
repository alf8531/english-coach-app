import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, ChevronLeft, ChevronRight, Trophy, Clock, BookOpen, Zap } from 'lucide-react';
import { useVocabDeck } from '../hooks/useVocabDeck';
import { useXP } from '../hooks/useXP';
import { useStreak } from '../hooks/useStreak';
import { generateNativeAudio } from '../services/geminiService';

interface Props {
  onBack: () => void;
}

const QUALITY_BUTTONS = [
  { label: 'Again', quality: 0, color: 'border-red-500/50 text-red-400 hover:bg-red-500/10', desc: 'Complete blackout' },
  { label: 'Hard', quality: 2, color: 'border-orange-500/50 text-orange-400 hover:bg-orange-500/10', desc: 'Incorrect but familiar' },
  { label: 'Good', quality: 4, color: 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10', desc: 'Correct with effort' },
  { label: 'Easy', quality: 5, color: 'border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10', desc: 'Perfect recall' },
];

const SRS_LEVEL_CONFIG = {
  new: { label: 'New', color: 'text-slate-400', bg: 'bg-slate-700' },
  learning: { label: 'Learning', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  review: { label: 'Review', color: 'text-indigo-400', bg: 'bg-indigo-500/20' },
  mastered: { label: 'Mastered', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
};

export const FlashcardsView: React.FC<Props> = ({ onBack }) => {
  const { deck, dueCards, dueCount, reviewCard, removeWord } = useVocabDeck();
  const { addXP } = useXP();
  const { recordActivity } = useStreak();

  const [mode, setMode] = useState<'due' | 'all'>('due');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const displayDeck = mode === 'due' ? dueCards : deck;
  const current = displayDeck[currentIndex];

  const playAudio = useCallback(async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!current || isPlaying) return;
    setIsPlaying(true);
    try {
      const buffer = await generateNativeAudio(current.word);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start(0);
    } catch {
      setIsPlaying(false);
    }
  }, [current, isPlaying]);

  const handleReview = useCallback((quality: number) => {
    if (!current) return;
    reviewCard(current.id, quality);
    setReviewed(r => r + 1);
    if (quality >= 4) addXP('flashcards', quality === 5 ? 100 : 80);
    recordActivity('flashcards');
    setIsFlipped(false);
    setTimeout(() => {
      if (currentIndex < displayDeck.length - 1) {
        setCurrentIndex(i => i + 1);
      } else {
        setSessionDone(true);
      }
    }, 200);
  }, [current, currentIndex, displayDeck.length, reviewCard, addXP, recordActivity]);

  const formatNextReview = (ts: number) => {
    const diff = ts - Date.now();
    if (diff <= 0) return 'Due now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  if (deck.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-8">
        <div className="text-center">
          <BookOpen size={48} className="text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Vocab Bank Empty</h2>
          <p className="text-slate-400 mb-6">Add words from highlighted phrases, YouTube transcripts, or analysis results.</p>
          <button onClick={onBack} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all">
            ← Back to Menu
          </button>
        </div>
      </div>
    );
  }

  if (sessionDone || (mode === 'due' && dueCount === 0 && !sessionDone)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-8">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center bg-slate-800/60 border border-white/5 rounded-3xl p-10 max-w-sm">
          <Trophy size={48} className="text-amber-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            {sessionDone ? 'Session Complete!' : 'Nothing Due!'}
          </h2>
          <p className="text-slate-400 mb-2">
            {sessionDone ? `Reviewed ${reviewed} cards this session.` : `${deck.length} words in your bank — all caught up!`}
          </p>
          {!sessionDone && dueCount === 0 && (
            <p className="text-slate-500 text-sm mb-6">
              Next review in: {deck.length > 0 ? formatNextReview(Math.min(...deck.map(d => d.nextReviewAt))) : '—'}
            </p>
          )}
          <div className="flex gap-3 mt-6">
            <button onClick={() => { setMode('all'); setCurrentIndex(0); setIsFlipped(false); setSessionDone(false); setReviewed(0); }}
              className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-all">
              Browse All
            </button>
            <button onClick={onBack}
              className="flex-1 py-3 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded-xl font-semibold text-sm transition-all">
              ← Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const srsConfig = current ? SRS_LEVEL_CONFIG[current.srsLevel] : SRS_LEVEL_CONFIG.new;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Vocab Bank</h1>
            <p className="text-slate-400 text-xs">{deck.length} words · {dueCount} due today</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setMode('due'); setCurrentIndex(0); setIsFlipped(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === 'due' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
              Due ({dueCount})
            </button>
            <button onClick={() => { setMode('all'); setCurrentIndex(0); setIsFlipped(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === 'all' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
              All
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>{currentIndex + 1} / {displayDeck.length}</span>
            <span>{Math.round(((currentIndex) / displayDeck.length) * 100)}% complete</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <motion.div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-1.5 rounded-full"
              animate={{ width: `${((currentIndex) / displayDeck.length) * 100}%` }} />
          </div>
        </div>

        {/* Card */}
        {current && (
          <div className="relative" style={{ perspective: '1200px' }}>
            <AnimatePresence mode="wait">
              <motion.div key={`${current.id}-${isFlipped}`}
                initial={false}
                className="relative"
                style={{ transformStyle: 'preserve-3d' }}>

                {!isFlipped ? (
                  /* FRONT */
                  <motion.div initial={{ rotateY: 0 }} animate={{ rotateY: 0 }}
                    onClick={() => setIsFlipped(true)}
                    className="bg-gradient-to-br from-slate-800 to-indigo-900/30 border border-indigo-500/20 rounded-3xl p-8 cursor-pointer min-h-64 flex flex-col items-center justify-center text-center">
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold mb-4 ${srsConfig.bg} ${srsConfig.color}`}>
                      {srsConfig.label} · next: {formatNextReview(current.nextReviewAt)}
                    </div>
                    <h2 className="text-5xl font-black text-white mb-3 tracking-tight">{current.word}</h2>
                    <p className="text-indigo-400 text-xl font-semibold mb-4">{current.phonetic}</p>

                    <button onClick={playAudio}
                      className={`p-4 rounded-full transition-all ${isPlaying ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-500/20 hover:bg-indigo-500/30'}`}>
                      <Volume2 size={20} className="text-indigo-300" />
                    </button>

                    <p className="text-slate-500 text-xs mt-6">Tap to reveal definition</p>
                  </motion.div>
                ) : (
                  /* BACK */
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-slate-900 to-slate-800 border border-white/5 rounded-3xl p-8 min-h-64">
                    <div className="flex items-center gap-3 mb-4">
                      <h3 className="text-3xl font-black text-white">{current.word}</h3>
                      <button onClick={playAudio}
                        className={`p-2 rounded-full transition-all ${isPlaying ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-500/20 hover:bg-indigo-500/30'}`}>
                        <Volume2 size={14} className="text-indigo-300" />
                      </button>
                    </div>
                    <div className="w-12 h-1 bg-indigo-500 rounded-full mb-4" />
                    <p className="text-slate-200 text-base leading-relaxed mb-4">{current.definition}</p>
                    {current.example && (
                      <div className="bg-slate-700/40 rounded-xl p-4 border-l-4 border-indigo-500">
                        <p className="text-slate-300 text-sm italic">"{current.example}"</p>
                      </div>
                    )}

                    {/* SM-2 quality buttons */}
                    <div className="mt-6 grid grid-cols-4 gap-2">
                      {QUALITY_BUTTONS.map(btn => (
                        <button key={btn.quality} onClick={() => handleReview(btn.quality)}
                          className={`py-3 px-1 rounded-xl border text-xs font-bold transition-all ${btn.color}`}>
                          <div>{btn.label}</div>
                          <div className="text-current opacity-50 text-[10px] mt-0.5 hidden sm:block">{btn.desc}</div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button onClick={() => { setCurrentIndex(i => Math.max(0, i - 1)); setIsFlipped(false); }}
            disabled={currentIndex === 0}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-all">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => { setCurrentIndex(i => Math.min(displayDeck.length - 1, i + 1)); setIsFlipped(false); }}
            disabled={currentIndex === displayDeck.length - 1}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-all">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlashcardsView;
