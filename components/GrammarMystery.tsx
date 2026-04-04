import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Lightbulb, CheckCircle, XCircle, Loader2, Trophy, Skull, RotateCcw, ChevronRight } from 'lucide-react';
import type { MysteryCase, MysteryClue, ProficiencyLevel } from '../types';
import { generateGrammarMystery, checkMysteryClue } from '../services/geminiService';
import { useXP } from '../hooks/useXP';
import { useStreak } from '../hooks/useStreak';

interface Props {
    onBack: () => void;
}

const DIFFICULTY_OPTIONS: ProficiencyLevel[] = [
    'A1-A2 (Beginner)' as ProficiencyLevel,
    'B1-B2 (Intermediate)' as ProficiencyLevel,
    'C1-C2 (Advanced)' as ProficiencyLevel,
];

const GRAMMAR_TOPICS = [
    'Subject-Verb Agreement', 'Tenses & Aspect', 'Articles (a/an/the)',
    'Prepositions', 'Modal Verbs', 'Conditionals', 'Passive Voice', 'Relative Clauses',
];

// Atmospheric case start screen
function CaseIntro({ mysteryCase, onStart }: { mysteryCase: MysteryCase; onStart: () => void }) {
    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-amber-950/30 to-slate-900 p-8">
            {/* Atmospheric background grid */}
            <div className="absolute inset-0 opacity-5"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fbbf24 0, #fbbf24 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #fbbf24 0, #fbbf24 1px, transparent 1px, transparent 40px)' }} />

            <div className="relative">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                        <Skull size={24} className="text-amber-400" />
                    </div>
                    <div>
                        <div className="text-amber-400 text-xs font-bold uppercase tracking-widest">Case #{mysteryCase.caseNumber}</div>
                        <div className="text-white text-2xl font-bold">{mysteryCase.title}</div>
                    </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded-full border border-emerald-500/30">
                        {mysteryCase.grammarFocus}
                    </span>
                    <span className="px-3 py-1 bg-slate-700 text-slate-300 text-xs rounded-full">
                        {mysteryCase.difficulty}
                    </span>
                    <span className="px-3 py-1 bg-slate-700 text-slate-300 text-xs rounded-full">
                        {mysteryCase.clues.length} clues
                    </span>
                </div>

                <div className="bg-slate-800/60 rounded-xl p-5 mb-6 border-l-4 border-amber-500">
                    <p className="text-slate-200 leading-relaxed italic text-sm">"{mysteryCase.narrative}"</p>
                </div>

                <motion.button onClick={onStart} whileTap={{ scale: 0.97 }}
                    className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
                    <Search size={18} /> Open Case File
                </motion.button>
            </div>
        </motion.div>
    );
}

// Individual clue card
function ClueCard({
    clue, index, onAnswer
}: {
    clue: MysteryClue;
    index: number;
    key?: React.Key;
    onAnswer: (clueId: string, answer: string) => void;
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const [revealed, setRevealed] = useState(false);

    const isCorrect = selected === clue.correctOption;
    const isWrong = selected !== null && !isCorrect;

    return (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }}
            className={`rounded-2xl border p-5 transition-colors ${clue.solved ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-600/40 bg-slate-800/40'
                }`}>
            <div className="flex items-start gap-3 mb-4">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5 ${clue.solved ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-amber-400'
                    }`}>
                    {clue.solved ? '✓' : index + 1}
                </div>
                <div>
                    <div className="text-xs text-amber-400 uppercase tracking-wider mb-1 font-semibold">Clue {index + 1}</div>
                    <p className="text-white text-sm leading-relaxed">
                        {clue.text.split(clue.errorWord ?? '|||').map((part, i) => (
                            <React.Fragment key={i}>
                                {part}
                                {i < clue.text.split(clue.errorWord ?? '|||').length - 1 && (
                                    <span className="text-red-400 underline decoration-dotted font-semibold">{clue.errorWord}</span>
                                )}
                            </React.Fragment>
                        ))}
                    </p>
                </div>
            </div>

            {!clue.solved && (
                <div className="space-y-2 ml-10">
                    {clue.options.map(opt => (
                        <motion.button key={opt} whileTap={{ scale: 0.98 }}
                            disabled={selected !== null}
                            onClick={() => {
                                setSelected(opt);
                                setRevealed(true);
                                onAnswer(clue.id, opt);
                            }}
                            className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all border ${selected === null ? 'border-slate-600/40 bg-slate-700/40 hover:bg-slate-700 hover:border-slate-500 text-slate-200'
                                : opt === clue.correctOption ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                                    : opt === selected ? 'border-red-500/60 bg-red-500/10 text-red-300'
                                        : 'border-slate-600/30 bg-slate-800/30 text-slate-500'
                                }`}>
                            {opt}
                        </motion.button>
                    ))}

                    {revealed && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className={`mt-3 p-3 rounded-xl text-sm ${isCorrect ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                            {isCorrect ? (
                                <><CheckCircle size={14} className="inline mr-1.5" />{clue.hint}</>
                            ) : (
                                <><XCircle size={14} className="inline mr-1.5" />Incorrect. {clue.hint}</>
                            )}
                        </motion.div>
                    )}
                </div>
            )}

            {clue.solved && (
                <div className="ml-10 p-3 bg-emerald-500/10 rounded-xl text-emerald-300 text-sm">
                    <CheckCircle size={14} className="inline mr-1.5" />{clue.hint}
                </div>
            )}
        </motion.div>
    );
}

export const GrammarMystery: React.FC<Props> = ({ onBack }) => {
    const [phase, setPhase] = useState<'setup' | 'intro' | 'active' | 'verdict'>('setup');
    const [difficulty, setDifficulty] = useState<ProficiencyLevel>('B1-B2 (Intermediate)' as ProficiencyLevel);
    const [topic, setTopic] = useState(GRAMMAR_TOPICS[1]);
    const [mysteryCase, setMysteryCase] = useState<MysteryCase | null>(null);
    const [clues, setClues] = useState<MysteryClue[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [score, setScore] = useState(0);
    const { addXP } = useXP();
    const { recordActivity } = useStreak();

    const generateCase = useCallback(async () => {
        setIsLoading(true);
        try {
            const newCase = await generateGrammarMystery(difficulty, topic);
            setMysteryCase(newCase);
            setClues(newCase.clues.map(c => ({ ...c, solved: false })));
            setScore(0);
            setPhase('intro');
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [difficulty, topic]);

    const handleAnswer = useCallback((clueId: string, answer: string) => {
        if (!mysteryCase) return;
        setClues(prev => prev.map(c => {
            if (c.id !== clueId) return c;
            const correct = answer === c.correctOption;
            if (correct) setScore(s => s + 1);
            return { ...c, solved: correct };
        }));
    }, [mysteryCase]);

    const handleVerdictCheck = useCallback(() => {
        const allAnswered = clues.every(c => c.solved || clues.some(c2 => c2.id === c.id));
        if (allAnswered) {
            const finalScore = Math.round((score / clues.length) * 100);
            addXP('mystery', finalScore);
            recordActivity('mystery');
            setPhase('verdict');
        }
    }, [clues, score, addXP, recordActivity]);

    useEffect(() => {
        if (phase === 'active' && clues.length > 0 && clues.every(c => c.solved)) {
            setTimeout(handleVerdictCheck, 500);
        }
    }, [clues, phase, handleVerdictCheck]);

    const pct = clues.length > 0 ? Math.round((clues.filter(c => c.solved).length / clues.length) * 100) : 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-amber-950/10 to-slate-950 p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button onClick={onBack}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
                        ←
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <Skull size={20} className="text-amber-400" />
                            <h1 className="text-2xl font-bold text-white">Grammar Mystery</h1>
                        </div>
                        <p className="text-slate-400 text-sm">Solve the case, master the grammar</p>
                    </div>
                    {phase === 'active' && (
                        <div className="text-right">
                            <div className="text-white font-bold">{clues.filter(c => c.solved).length}/{clues.length}</div>
                            <div className="text-slate-400 text-xs">Solved</div>
                        </div>
                    )}
                </div>

                <AnimatePresence mode="wait">
                    {/* SETUP */}
                    {phase === 'setup' && (
                        <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                            <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-6 mb-4">
                                <h3 className="text-white font-semibold mb-4">Configure Your Case</h3>

                                <label className="block text-slate-400 text-sm mb-2">Difficulty Level</label>
                                <div className="grid grid-cols-3 gap-2 mb-5">
                                    {DIFFICULTY_OPTIONS.map(d => (
                                        <button key={d} onClick={() => setDifficulty(d)}
                                            className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border ${difficulty === d
                                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                                : 'border-slate-600/40 text-slate-400 hover:border-slate-500'
                                                }`}>
                                            {d.split(' ')[0]}
                                        </button>
                                    ))}
                                </div>

                                <label className="block text-slate-400 text-sm mb-2">Grammar Focus</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {GRAMMAR_TOPICS.map(t => (
                                        <button key={t} onClick={() => setTopic(t)}
                                            className={`py-2 px-3 rounded-xl text-xs text-left transition-all border ${topic === t
                                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                                : 'border-slate-600/40 text-slate-400 hover:border-slate-500'
                                                }`}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <motion.button onClick={generateCase} disabled={isLoading} whileTap={{ scale: 0.97 }}
                                className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20">
                                {isLoading ? <><Loader2 size={18} className="animate-spin" /> Generating Case...</> : <><Search size={18} /> Open New Case</>}
                            </motion.button>
                        </motion.div>
                    )}

                    {/* INTRO */}
                    {phase === 'intro' && mysteryCase && (
                        <motion.div key="intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <CaseIntro mysteryCase={mysteryCase} onStart={() => setPhase('active')} />
                        </motion.div>
                    )}

                    {/* ACTIVE */}
                    {phase === 'active' && mysteryCase && (
                        <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex-1 bg-slate-700 rounded-full h-2">
                                    <motion.div className="bg-amber-500 h-2 rounded-full"
                                        animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
                                </div>
                                <span className="text-amber-400 text-sm font-bold">{pct}%</span>
                            </div>

                            <div className="space-y-4">
                                {clues.map((clue, i) => (
                                    <ClueCard key={clue.id} clue={clue} index={i} onAnswer={handleAnswer} />
                                ))}
                            </div>

                            <motion.button onClick={handleVerdictCheck}
                                className="mt-6 w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                                whileTap={{ scale: 0.97 }}>
                                <ChevronRight size={18} /> Deliver Verdict
                            </motion.button>
                        </motion.div>
                    )}

                    {/* VERDICT */}
                    {phase === 'verdict' && mysteryCase && (
                        <motion.div key="verdict" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                            <div className="bg-gradient-to-br from-slate-800 to-amber-950/30 rounded-3xl border border-amber-500/30 p-8 text-center">
                                <Trophy size={48} className="text-amber-400 mx-auto mb-4" />
                                <div className="text-amber-400 text-sm font-bold uppercase tracking-widest mb-2">Case Closed</div>
                                <h2 className="text-3xl font-bold text-white mb-2">{mysteryCase.title}</h2>
                                <div className="text-5xl font-black text-white mb-1">{Math.round((score / clues.length) * 100)}%</div>
                                <div className="text-slate-400 text-sm mb-6">{score} of {clues.length} clues solved</div>

                                <div className="bg-slate-700/40 rounded-xl p-5 text-left mb-6">
                                    <h4 className="text-amber-400 font-semibold text-sm uppercase tracking-wide mb-2 flex items-center gap-2">
                                        <Lightbulb size={14} /> The Verdict
                                    </h4>
                                    <p className="text-slate-200 text-sm leading-relaxed">{mysteryCase.verdict}</p>
                                    <p className="text-slate-400 text-xs mt-2 leading-relaxed">{mysteryCase.explanation}</p>
                                </div>

                                <div className="flex gap-3">
                                    <button onClick={() => { setPhase('setup'); setMysteryCase(null); }}
                                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all">
                                        <RotateCcw size={16} /> New Case
                                    </button>
                                    <button onClick={onBack}
                                        className="flex-1 py-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 rounded-xl font-semibold transition-all">
                                        Exit
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default GrammarMystery;
