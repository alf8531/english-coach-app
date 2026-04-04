import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StoryEpisode, ProficiencyLevel, StoryDialogue, StoryClue,
    EpisodeProgress, KnowMoreContent, SuspectProfile
} from '../types';
import {
    Play, Lock, LogOut, VolumeX, RotateCcw, Pause, Layers,
    Mic, FileText, CheckCircle2, ChevronLeft, Send, Star,
    BookOpen, Sparkles, Trophy, AlertCircle, ChevronRight, X, Loader2
} from 'lucide-react';
import { askDetectiveQuestion, explainDialogueLine } from '../services/geminiService';

interface Props {
    onBack: () => void;
    userLevel: ProficiencyLevel;
    onSaveVocab?: (word: string, definition: string, example: string) => void;
}

type View = 'library' | 'suspect-hub' | 'interview' | 'verdict' | 'results';

// ── Achievement definitions ───────────────────────────────────────────────────
const ACHIEVEMENTS = [
    { id: 'first_case', title: 'Rookie Detective', description: 'Solve your first case', icon: '🔍' },
    { id: 'interrogator', title: 'Master Interrogator', description: 'Interview 10 suspects', icon: '🎤' },
    { id: 'vocab_hunter', title: 'Vocab Hunter', description: 'Save 20 words to notebook', icon: '📚' },
    { id: 'solver', title: 'Mystery Solver', description: 'Solve 5 cases correctly', icon: '⭐' },
    { id: 'listener', title: 'Expert Listener', description: 'Find 10 hidden clues', icon: '👂' },
    { id: 'streak', title: 'Unstoppable Streak', description: 'Complete a 7-day streak', icon: '🔥' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const getTodayStr = () => new Date().toISOString().slice(0, 10);

const getLevelWeight = (l: ProficiencyLevel) => {
    if (l.includes('A1')) return 1;
    if (l.includes('B1')) return 2;
    if (l.includes('C1')) return 3;
    if (l.includes('Native')) return 4;
    return 0;
};

const getLevelGroup = (l: ProficiencyLevel) => {
    if (l.includes('A1') || l.includes('A2') || l.includes('Beginner')) return 'Beginner';
    if (l.includes('B1') || l.includes('B2') || l.includes('Intermediate')) return 'Intermediate';
    return 'Pro Level';
};

const getLevelBadgeColor = (l: ProficiencyLevel) => {
    if (l.includes('A1') || l.includes('Beginner')) return 'bg-emerald-500';
    if (l.includes('B1') || l.includes('Intermediate')) return 'bg-blue-500';
    return 'bg-orange-500';
};

const getLevelBadgeLabel = (l: ProficiencyLevel) => {
    if (l.includes('Beginner')) return 'A1';
    if (l.includes('Intermediate')) return 'B1';
    if (l.includes('Advanced')) return 'C1';
    return 'N';
};

const loadProgress = (episodeId: string): EpisodeProgress => {
    const raw = localStorage.getItem(`detective_progress_${episodeId}`);
    if (raw) return JSON.parse(raw);
    return {
        episodeId,
        starsEarned: 0,
        interviewedSuspects: [],
        collectedClueIds: [],
        contradictionsFound: [],
        quizzesPassed: 0,
        totalQuizzes: 0,
        verdictSubmitted: false,
    };
};

const saveProgress = (p: EpisodeProgress) => {
    localStorage.setItem(`detective_progress_${p.episodeId}`, JSON.stringify(p));
};

const calcStars = (p: EpisodeProgress): number => {
    if (!p.verdictSubmitted) return p.interviewedSuspects.length > 0 ? 1 : 0;
    let stars = 1;
    if (p.collectedClueIds.length >= 1 && p.totalQuizzes > 0 && p.quizzesPassed / p.totalQuizzes >= 0.5) stars = 2;
    if (p.verdictCorrect && p.totalQuizzes > 0 && p.quizzesPassed === p.totalQuizzes) stars = 3;
    if (p.verdictCorrect && stars < 2) stars = 2;
    return stars;
};

// ── Component ─────────────────────────────────────────────────────────────────
const DetectiveStories: React.FC<Props> = ({ onBack, userLevel, onSaveVocab }) => {
    const [episodes, setEpisodes] = useState<StoryEpisode[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Navigation
    const [currentView, setCurrentView] = useState<View>('library');
    const [playingEpisode, setPlayingEpisode] = useState<StoryEpisode | null>(null);

    // Suspect hub
    const [selectedSuspect, setSelectedSuspect] = useState<SuspectProfile | null>(null);

    // Interview
    const [witnessDialogues, setWitnessDialogues] = useState<StoryDialogue[]>([]);
    const [currentMsgIdx, setCurrentMsgIdx] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [showInquiry, setShowInquiry] = useState(false);
    const [inquiryText, setInquiryText] = useState('');
    const [isAsking, setIsAsking] = useState(false);

    // Know More
    const [expandedKnowMore, setExpandedKnowMore] = useState<string | null>(null);
    const [knowMoreLoading, setKnowMoreLoading] = useState<string | null>(null);
    const [knowMoreCache, setKnowMoreCache] = useState<Record<string, KnowMoreContent>>({});

    // Case notebook / clues
    const [showNotebook, setShowNotebook] = useState(false);
    const [showContradictionPicker, setShowContradictionPicker] = useState(false);
    const [selectedTestimony, setSelectedTestimony] = useState<string | null>(null);
    const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);

    // Quiz state
    const [quizAnswers, setQuizAnswers] = useState<Record<string, { answered: boolean; correct: boolean }>>({});

    // Verdict
    const [verdictSuspect, setVerdictSuspect] = useState<string | null>(null);
    const [verdictEvidence, setVerdictEvidence] = useState<string | null>(null);

    // Per-episode progress
    const [progress, setProgress] = useState<EpisodeProgress | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // ── Load episodes ───────────────────────────────────────────────────────────
    useEffect(() => {
        fetch('/api/stories')
            .then(res => res.json())
            .then(data => {
                setEpisodes(data.filter((e: StoryEpisode) => e.isPublished));
                setIsLoading(false);
            })
            .catch(() => setIsLoading(false));
    }, []);

    // ── TTS ─────────────────────────────────────────────────────────────────────
    const speakLine = useCallback((text: string, rate = 0.9) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = rate * playbackSpeed;
        u.onstart = () => setIsPlaying(true);
        u.onend = () => setIsPlaying(false);
        u.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(u);
    }, [playbackSpeed]);

    const stopSpeaking = () => {
        window.speechSynthesis?.cancel();
        setIsPlaying(false);
    };

    const togglePlay = (text: string) => {
        if (isPlaying) stopSpeaking(); else speakLine(text);
    };

    const cycleSpeed = () => {
        setPlaybackSpeed(s => s === 1 ? 1.25 : s === 1.25 ? 1.5 : 1);
    };

    // ── Case selection ──────────────────────────────────────────────────────────
    const handleSelectCase = (ep: StoryEpisode) => {
        setPlayingEpisode(ep);
        const p = loadProgress(ep.id);
        setProgress(p);
        const suspects = ep.suspects || [];
        setSelectedSuspect(suspects.find(s => s.isInitiallyUnlocked) || suspects[0] || null);
        setCurrentView('suspect-hub');
    };

    // ── Start interview ─────────────────────────────────────────────────────────
    const startInterview = () => {
        if (!selectedSuspect || !playingEpisode) return;
        const dialogues: StoryDialogue[] = [];
        playingEpisode.scenes.forEach(scene => {
            scene.dialogues.forEach(d => {
                if (d.character === selectedSuspect.name) dialogues.push(d);
            });
        });
        setWitnessDialogues(dialogues);
        setCurrentMsgIdx(0);
        setShowInquiry(false);
        setCurrentView('interview');
        if (dialogues[0]) speakLine(dialogues[0].text);
    };

    // ── Message navigation ──────────────────────────────────────────────────────
    const nextMessage = () => {
        stopSpeaking();
        setShowInquiry(false);
        setExpandedKnowMore(null);
        if (currentMsgIdx < witnessDialogues.length - 1) {
            const next = currentMsgIdx + 1;
            setCurrentMsgIdx(next);

            // Auto-collect hidden clues
            const d = witnessDialogues[next];
            if (d.isHiddenClue && playingEpisode && progress) {
                const clue = playingEpisode.availableClues.find(c => c.discoveredAtDialogueId === d.id || c.description.toLowerCase().includes(d.character.toLowerCase()));
                if (clue && !progress.collectedClueIds.includes(clue.id)) {
                    const updated = { ...progress, collectedClueIds: [...progress.collectedClueIds, clue.id] };
                    setProgress(updated);
                    saveProgress(updated);
                }
            }
            speakLine(d?.text || '');
        } else {
            // End of interview — mark suspect as done
            if (playingEpisode && progress && selectedSuspect) {
                const updated = {
                    ...progress,
                    interviewedSuspects: progress.interviewedSuspects.includes(selectedSuspect.name)
                        ? progress.interviewedSuspects
                        : [...progress.interviewedSuspects, selectedSuspect.name]
                };
                setProgress(updated);
                saveProgress(updated);
            }
            setCurrentView('suspect-hub');
        }
    };

    // ── Know More ───────────────────────────────────────────────────────────────
    const handleKnowMore = async (dialogue: StoryDialogue) => {
        const key = dialogue.id;
        if (expandedKnowMore === key) { setExpandedKnowMore(null); return; }
        setExpandedKnowMore(key);
        if (knowMoreCache[key] || dialogue.knowMore) {
            if (dialogue.knowMore && !knowMoreCache[key]) {
                setKnowMoreCache(prev => ({ ...prev, [key]: dialogue.knowMore! }));
            }
            return;
        }
        setKnowMoreLoading(key);
        try {
            const data = await explainDialogueLine(dialogue.text, userLevel);
            setKnowMoreCache(prev => ({ ...prev, [key]: data as KnowMoreContent }));
        } catch { /* silently fail */ } finally {
            setKnowMoreLoading(null);
        }
    };

    // ── Voice input (Web Speech API) ────────────────────────────────────────────
    const startVoiceInput = () => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { setShowInquiry(true); return; }
        const rec = new SR();
        rec.lang = 'en-US';
        rec.onresult = (e: any) => setInquiryText(e.results[0][0].transcript);
        rec.start();
    };

    // ── AI Inquiry ──────────────────────────────────────────────────────────────
    const handleInquirySubmit = async () => {
        if (!inquiryText.trim() || !selectedSuspect || !playingEpisode || isAsking) return;
        setIsAsking(true);
        const question = inquiryText.trim();
        setInquiryText('');
        const userMsg: StoryDialogue = { id: 'u-' + Date.now(), character: 'Detective', text: question };
        setWitnessDialogues(prev => { const a = [...prev]; a.splice(currentMsgIdx + 1, 0, userMsg); return a; });
        setCurrentMsgIdx(prev => prev + 1);
        setShowInquiry(false);
        try {
            const ctx = `Episode: ${playingEpisode.title}. ${playingEpisode.description}`;
            const res = await askDetectiveQuestion(question, ctx, selectedSuspect.name);
            const reply: StoryDialogue = { id: 'w-' + Date.now(), character: selectedSuspect.name, text: `[${res.answer.toUpperCase()}] ${res.explanation}` };
            setWitnessDialogues(prev => { const a = [...prev]; a.splice(currentMsgIdx + 2, 0, reply); return a; });
            setCurrentMsgIdx(prev => prev + 1);
            speakLine(reply.text);
        } catch { alert('Error asking the witness. Try again.'); }
        finally { setIsAsking(false); }
    };

    // ── Quiz answer ─────────────────────────────────────────────────────────────
    const handleQuizAnswer = (dialogueId: string, answer: string, correct: string) => {
        const isCorrect = answer.toLowerCase() === correct.toLowerCase();
        setQuizAnswers(prev => ({ ...prev, [dialogueId]: { answered: true, correct: isCorrect } }));
        if (progress) {
            const updated = {
                ...progress,
                quizzesPassed: isCorrect ? progress.quizzesPassed + 1 : progress.quizzesPassed,
                totalQuizzes: progress.totalQuizzes + 1,
            };
            setProgress(updated);
            saveProgress(updated);
        }
    };

    // ── Verdict submission ──────────────────────────────────────────────────────
    const handleVerdictSubmit = () => {
        if (!verdictSuspect || !verdictEvidence || !playingEpisode || !progress) return;
        const sol = playingEpisode.solution;
        const correct = verdictSuspect === sol?.culpritName && verdictEvidence === sol?.keyEvidenceId;
        const stars = calcStars({ ...progress, verdictSubmitted: true, verdictCorrect: correct });
        const updated = { ...progress, verdictSubmitted: true, verdictCorrect: correct, starsEarned: stars, completedAt: Date.now() };
        setProgress(updated);
        saveProgress(updated);
        // Update episode progress in local episodes list
        setEpisodes(prev => prev.map(ep => ep.id === playingEpisode.id ? { ...ep } : ep));
        setCurrentView('results');
        // Award XP
        if (typeof (window as any).__addXP === 'function') {
            (window as any).__addXP({ module: 'mystery', amount: correct ? 50 : 20, ts: Date.now() });
        }
        // Check for achievements
        checkAchievements(correct);
    };

    const checkAchievements = (verdictCorrect: boolean) => {
        const raw = localStorage.getItem('detective_achievements') || '{}';
        const unlocked = JSON.parse(raw);
        const allProgress = Object.keys(localStorage)
            .filter(k => k.startsWith('detective_progress_'))
            .map(k => JSON.parse(localStorage.getItem(k) || '{}') as EpisodeProgress);
        const completedCases = allProgress.filter(p => p.verdictSubmitted).length;
        const solvedCorrectly = allProgress.filter(p => p.verdictCorrect).length + (verdictCorrect ? 1 : 0);
        const totalSuspects = allProgress.reduce((s, p) => s + p.interviewedSuspects.length, 0);
        const totalClues = allProgress.reduce((s, p) => s + p.collectedClueIds.length, 0);
        if (completedCases >= 1 && !unlocked['first_case']) unlocked['first_case'] = Date.now();
        if (totalSuspects >= 10 && !unlocked['interrogator']) unlocked['interrogator'] = Date.now();
        if (solvedCorrectly >= 5 && !unlocked['solver']) unlocked['solver'] = Date.now();
        if (totalClues >= 10 && !unlocked['listener']) unlocked['listener'] = Date.now();
        localStorage.setItem('detective_achievements', JSON.stringify(unlocked));
    };

    // ── Scroll to bottom of chat ────────────────────────────────────────────────
    useEffect(() => {
        if (currentView === 'interview') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [currentMsgIdx, currentView]);

    // ── Loading ─────────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-white">
                    <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="font-bold text-slate-400">Loading cases...</p>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // SCREEN 5 — RESULTS
    // ════════════════════════════════════════════════════════════════════════
    if (currentView === 'results' && playingEpisode && progress) {
        const sol = playingEpisode.solution;
        const stars = progress.starsEarned;
        const xpEarned = progress.verdictCorrect ? 50 : 20;
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
                <div className="w-full max-w-md space-y-6">
                    {/* Result card */}
                    <div className={`rounded-3xl p-8 text-center border ${progress.verdictCorrect ? 'bg-emerald-900/30 border-emerald-500/40' : 'bg-red-900/30 border-red-500/40'}`}>
                        <div className="text-6xl mb-4">{progress.verdictCorrect ? '🎉' : '❌'}</div>
                        <h2 className="text-2xl font-black mb-2">{progress.verdictCorrect ? 'Case Solved!' : 'Incorrect Verdict'}</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">{sol?.explanation}</p>
                    </div>
                    {/* Stars */}
                    <div className="flex justify-center gap-3">
                        {[1, 2, 3].map(n => (
                            <Star key={n} size={36} className={stars >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-700 fill-slate-700'} />
                        ))}
                    </div>
                    {/* XP */}
                    <div className="bg-purple-900/30 border border-purple-500/30 rounded-2xl p-4 text-center">
                        <p className="text-purple-300 text-sm font-bold">+{xpEarned} XP Earned</p>
                    </div>
                    {/* Language takeaways */}
                    {sol?.languageTakeaways?.length > 0 && (
                        <div className="bg-slate-900 rounded-2xl p-4 border border-white/5">
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-3">Key Expressions</h3>
                            <ul className="space-y-2">
                                {sol.languageTakeaways.map((t, i) => (
                                    <li key={i} className="text-sm text-slate-200 flex gap-2"><span className="text-amber-400">•</span>{t}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => { setCurrentView('library'); setPlayingEpisode(null); }} className="h-12 bg-white/10 hover:bg-white/20 rounded-2xl font-bold text-sm transition-colors">Go Back</button>
                        <button onClick={() => { setCurrentView('suspect-hub'); setVerdictSuspect(null); setVerdictEvidence(null); }} className="h-12 bg-blue-500 hover:bg-blue-400 rounded-2xl font-bold text-sm transition-colors">
                            {stars < 3 ? 'Retry' : 'Next Case'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // SCREEN 4 — VERDICT
    // ════════════════════════════════════════════════════════════════════════
    if (currentView === 'verdict' && playingEpisode) {
        const suspects = playingEpisode.suspects || [];
        const clues = playingEpisode.availableClues || [];
        return (
            <div className="min-h-screen bg-black text-white flex flex-col font-sans">
                <div className="p-6 border-b border-white/10">
                    <button onClick={() => setCurrentView('suspect-hub')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                        <ChevronLeft size={20} /> Back
                    </button>
                    <h1 className="text-2xl font-black mt-4">⚖️ Deliver your verdict</h1>
                    <p className="text-slate-400 text-sm mt-1">{playingEpisode.title}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Culprit selection */}
                    <section>
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Who is the culprit?</h2>
                        <div className="grid grid-cols-3 gap-4">
                            {suspects.map(s => (
                                <button key={s.name} onClick={() => setVerdictSuspect(s.name)} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${verdictSuspect === s.name ? 'border-red-500 bg-red-900/20' : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
                                    <div className={`w-16 h-16 rounded-full overflow-hidden border-2 ${verdictSuspect === s.name ? 'border-red-500' : 'border-transparent'}`}>
                                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${s.avatarSeed}&backgroundColor=1e293b`} className="w-full h-full" alt={s.name} />
                                    </div>
                                    <span className="text-xs font-bold text-center leading-tight">{s.name}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                    {/* Key evidence */}
                    <section>
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">What is the key evidence?</h2>
                        <div className="space-y-3">
                            {clues.map(c => (
                                <button key={c.id} onClick={() => setVerdictEvidence(c.id)} className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${verdictEvidence === c.id ? 'border-amber-500 bg-amber-900/20' : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
                                    <p className="font-bold text-sm">{c.name}</p>
                                    <p className="text-xs text-slate-400 mt-1">{c.description}</p>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
                <div className="p-6 border-t border-white/10">
                    <button onClick={handleVerdictSubmit} disabled={!verdictSuspect || !verdictEvidence} className="w-full h-14 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-2xl font-black text-lg transition-colors">
                        🔍 Accuse
                    </button>
                </div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // SCREEN 3 — DIALOGUE PLAYER (INTERVIEW)
    // ════════════════════════════════════════════════════════════════════════
    if (currentView === 'interview' && playingEpisode && selectedSuspect) {
        const currentDialogue = witnessDialogues[currentMsgIdx];
        const isLastMsg = currentMsgIdx >= witnessDialogues.length - 1;
        const hasActiveQuiz = currentDialogue?.quiz && !quizAnswers[currentDialogue.id];
        const knownMoreKey = currentDialogue?.id;
        const kmData = knownMoreKey ? (knowMoreCache[knownMoreKey] || currentDialogue?.knowMore) : null;

        const getActionVerb = () => {
            if (hasActiveQuiz) return 'Present Evidence';
            if (isLastMsg) return 'Finish';
            return currentMsgIdx === 0 ? 'Interrogate' : 'Next';
        };

        return (
            <div className="min-h-screen bg-black text-white flex flex-col font-sans">
                {/* Character header */}
                <div className="flex flex-col items-center pt-8 pb-4 shrink-0 border-b border-white/5">
                    <div className="w-20 h-20 rounded-3xl overflow-hidden border-2 border-slate-700 mb-3">
                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selectedSuspect.avatarSeed}&backgroundColor=1e293b`} className="w-full h-full object-cover" alt={selectedSuspect.name} />
                    </div>
                    <h2 className="text-xl font-black">{selectedSuspect.name}</h2>
                    <p className="text-slate-400 text-sm">{selectedSuspect.role}</p>
                </div>

                {/* Chat area */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                    {witnessDialogues.slice(0, currentMsgIdx + 1).map((dialog, idx) => {
                        const isCurrent = idx === currentMsgIdx;
                        const isDetective = dialog.character === 'Detective';
                        const qResult = quizAnswers[dialog.id];
                        const thisKmData = knowMoreCache[dialog.id] || dialog.knowMore;

                        return (
                            <div key={dialog.id || idx} className={`transition-opacity duration-300 ${isCurrent ? 'opacity-100' : 'opacity-55'} ${isDetective ? 'flex flex-col items-end' : ''}`}>
                                {!isDetective && (
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                                            <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selectedSuspect.avatarSeed}&backgroundColor=1e293b`} className="w-full h-full" alt="" />
                                        </div>
                                        <span className="text-xs text-slate-400 font-bold">{selectedSuspect.name}</span>
                                        {dialog.isHiddenClue && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">🔍 Clue</span>}
                                    </div>
                                )}
                                {isDetective && <span className="text-xs text-blue-400 font-bold mb-2">Detective (You)</span>}

                                <div className={`${isDetective ? 'bg-blue-600 rounded-tr-sm' : 'bg-[#1e1e1e] border border-white/5 rounded-tl-sm'} rounded-3xl p-4 max-w-[90%]`}>
                                    {/* Audio controls */}
                                    {!isDetective && (
                                        <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-3">
                                            <button onClick={() => isCurrent && togglePlay(dialog.text)} className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center hover:bg-blue-400 transition-colors shrink-0">
                                                {isPlaying && isCurrent ? <Pause fill="white" size={16} /> : <Play fill="white" size={16} className="ml-0.5" />}
                                            </button>
                                            {/* Waveform */}
                                            <div className="flex-1 flex items-center h-6 gap-0.5 opacity-50">
                                                {[...Array(16)].map((_, i) => (
                                                    <div key={i} className={`w-0.5 bg-white rounded-full ${isPlaying && isCurrent ? 'animate-pulse' : ''}`} style={{ height: `${20 + (i % 5) * 16}%` }} />
                                                ))}
                                            </div>
                                            <button onClick={() => isCurrent && speakLine(dialog.text)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-xs font-bold">
                                                <RotateCcw size={12} />
                                            </button>
                                            <button onClick={cycleSpeed} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-xs font-bold">
                                                {playbackSpeed}x
                                            </button>
                                        </div>
                                    )}

                                    <p className="text-base text-slate-100 leading-relaxed font-medium">{dialog.text}</p>

                                    {/* Quiz */}
                                    {dialog.quiz && (
                                        <div className="mt-4 p-3 bg-black/30 rounded-2xl border border-white/10">
                                            <p className="text-xs font-black text-amber-400 uppercase tracking-wide mb-2">{dialog.quiz.prompt}</p>
                                            {dialog.quiz.sentence && <p className="text-sm text-slate-300 mb-3 italic">"{dialog.quiz.sentence}"</p>}
                                            {!qResult ? (
                                                dialog.quiz.type === 'true-false' ? (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleQuizAnswer(dialog.id, 'true', dialog.quiz!.correctAnswer)} className="flex-1 py-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-sm hover:bg-emerald-600/50 transition-colors">✓ Truth</button>
                                                        <button onClick={() => handleQuizAnswer(dialog.id, 'false', dialog.quiz!.correctAnswer)} className="flex-1 py-2 rounded-xl bg-red-600/30 border border-red-500/40 text-red-300 font-bold text-sm hover:bg-red-600/50 transition-colors">✗ Lie</button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {(dialog.quiz.options || [dialog.quiz.correctAnswer, dialog.quiz.hint || '— incorrect —']).map(opt => (
                                                            <button key={opt} onClick={() => handleQuizAnswer(dialog.id, opt, dialog.quiz!.correctAnswer)} className="w-full text-left px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm hover:bg-white/15 transition-colors">{opt}</button>
                                                        ))}
                                                    </div>
                                                )
                                            ) : (
                                                <div className={`p-2 rounded-xl text-sm font-bold ${qResult.correct ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
                                                    {qResult.correct ? '✅ Correct!' : `❌ Incorrect. ${dialog.quiz.hint || ''}`}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Saber más */}
                                    {!isDetective && isCurrent && (
                                        <div className="mt-4 border-t border-white/10 pt-3">
                                            <button onClick={() => handleKnowMore(dialog)} className="flex items-center justify-between w-full text-white font-bold text-sm hover:text-blue-400 transition-colors">
                                                <span>Know More</span>
                                                {knowMoreLoading === dialog.id ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} className="text-amber-500" />}
                                            </button>
                                            {expandedKnowMore === dialog.id && thisKmData && (
                                                <div className="mt-3 space-y-3 animate-in fade-in duration-300">
                                                    {thisKmData.vocabulary?.length > 0 && (
                                                        <div>
                                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Vocabulary</p>
                                                            {thisKmData.vocabulary.map((v, i) => (
                                                                <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-white/5">
                                                                    <div>
                                                                        <span className="font-bold text-sm text-white">{v.word}</span>
                                                                        <span className="text-xs text-slate-500 ml-2">{v.ipa}</span>
                                                                        <p className="text-xs text-slate-400 mt-0.5">{v.definition}</p>
                                                                    </div>
                                                                    {onSaveVocab && (
                                                                        <button onClick={() => onSaveVocab(v.word, v.definition, v.example)} className="shrink-0 text-amber-400 hover:text-amber-300 transition-colors" title="Save">
                                                                            <BookOpen size={14} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {thisKmData.expressions?.length > 0 && (
                                                        <div>
                                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Expressions</p>
                                                            {thisKmData.expressions.map((e, i) => (
                                                                <p key={i} className="text-xs text-slate-300 py-1"><span className="text-blue-400 font-bold">"{e.phrase}"</span> — {e.meaning}</p>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {thisKmData.grammar?.pattern && (
                                                        <div>
                                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Grammar</p>
                                                            <p className="text-xs font-bold text-white">{thisKmData.grammar.pattern}</p>
                                                            <p className="text-xs text-slate-400 mt-0.5">{thisKmData.grammar.explanation}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {isAsking && <div className="text-slate-500 italic text-sm px-4">The witness is thinking...</div>}
                    <div ref={messagesEndRef} />
                </div>

                {/* Bottom bar */}
                {showInquiry ? (
                    <div className="p-4 bg-slate-900 border-t border-white/10 shrink-0">
                        <div className="flex items-center bg-black/50 border border-slate-700 rounded-full p-1.5 gap-2">
                            <button onClick={startVoiceInput} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-blue-400 hover:bg-white/20 shrink-0">
                                <Mic size={18} />
                            </button>
                            <input type="text" value={inquiryText} onChange={e => setInquiryText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInquirySubmit()} placeholder="Ask a Yes/No question..." className="flex-1 bg-transparent border-none text-white outline-none px-2 text-sm disabled:opacity-50" disabled={isAsking} autoFocus />
                            <button onClick={handleInquirySubmit} disabled={!inquiryText.trim() || isAsking} className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-500 shrink-0 disabled:opacity-40">
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="h-20 bg-black border-t border-white/10 flex items-center justify-between px-5 shrink-0 gap-3">
                        <button onClick={() => { stopSpeaking(); setCurrentView('suspect-hub'); }} className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                            <LogOut size={18} className="rotate-180" />
                        </button>
                        <button onClick={nextMessage} disabled={!!hasActiveQuiz} className="flex-1 h-12 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white rounded-full font-black text-sm transition-colors">
                            {getActionVerb()}
                        </button>
                        <button onClick={() => setShowInquiry(true)} className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                            <Mic size={18} />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // SCREEN 2 — SUSPECT HUB
    // ════════════════════════════════════════════════════════════════════════
    if (currentView === 'suspect-hub' && playingEpisode) {
        const suspects = playingEpisode.suspects || [];
        const clues = playingEpisode.availableClues || [];
        const p = progress || loadProgress(playingEpisode.id);
        const allInterviewed = suspects.length > 0 && suspects.every(s => p.interviewedSuspects.includes(s.name));

        const getSuspectStars = (name: string): number => {
            if (!p.interviewedSuspects.includes(name)) return 0;
            const suspectDialogues = playingEpisode.scenes.flatMap(s => s.dialogues.filter(d => d.character === name));
            const cluesFound = suspectDialogues.filter(d => d.isHiddenClue && p.collectedClueIds.some(cid => cid === d.id || true)).length;
            if (cluesFound > 0) return 3;
            return 1;
        };

        return (
            <div className="min-h-screen bg-black text-white flex flex-col font-sans">
                {/* Case header */}
                <div className="relative h-48 bg-slate-900 shrink-0 overflow-hidden rounded-b-3xl">
                    <img src={playingEpisode.coverImageUrl || 'https://images.unsplash.com/photo-1542204637-e67bc7d41e48?auto=format&fit=crop&w=800&q=80'} className="absolute inset-0 w-full h-full object-cover opacity-40" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                        <div className="bg-black/70 backdrop-blur-md rounded-2xl p-3 border border-white/10 flex items-center justify-between">
                            <div className="flex-1">
                                <h2 className="text-lg font-bold leading-tight">{playingEpisode.title}</h2>
                                <div className="flex items-center gap-3 mt-2">
                                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(p.interviewedSuspects.length / Math.max(suspects.length, 1)) * 100}%` }} />
                                    </div>
                                    <span className="text-xs text-slate-400 font-bold whitespace-nowrap">{p.interviewedSuspects.length}/{suspects.length} witnesses</span>
                                </div>
                            </div>
                            <button onClick={() => setShowNotebook(true)} className="ml-3 w-10 h-10 bg-white text-black rounded-full flex items-center justify-center shrink-0 hover:scale-105 transition-transform">
                                <FileText size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col items-center pt-6 px-6">
                    <h3 className="text-xl font-black mb-1">Interview Witness</h3>
                    <p className="text-blue-400 font-bold text-base mb-8 h-7">{selectedSuspect?.name || ''}</p>

                    <div className="grid grid-cols-3 gap-6 max-w-xs w-full justify-items-center">
                        {suspects.map(s => {
                            const sts = getSuspectStars(s.name);
                            const done = p.interviewedSuspects.includes(s.name);
                            return (
                                <button key={s.name} onClick={() => setSelectedSuspect(s)} className={`relative group transition-all duration-300 ${selectedSuspect?.name === s.name ? 'scale-110' : 'opacity-60 hover:opacity-100 grayscale hover:grayscale-0'}`}>
                                    <div className={`w-18 h-18 rounded-full overflow-hidden border-2 shadow-2xl ${selectedSuspect?.name === s.name ? 'border-blue-500' : 'border-transparent'}`} style={{ width: 68, height: 68 }}>
                                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${s.avatarSeed}&backgroundColor=1e293b`} className="w-full h-full object-cover" alt={s.name} />
                                    </div>
                                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-0.5">
                                        {[1, 2, 3].map(n => <Star key={n} size={9} className={sts >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-600 fill-slate-600'} />)}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="h-28 pb-6 px-6 flex items-center gap-4 shrink-0 max-w-sm w-full mx-auto">
                    <button onClick={() => setCurrentView('library')} className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 shrink-0 transition-colors">
                        <LogOut size={22} className="rotate-180" />
                    </button>
                    <button onClick={startInterview} disabled={!selectedSuspect} className="flex-1 h-14 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white rounded-full font-black text-lg transition-colors">
                        Interview
                    </button>
                    {allInterviewed && (
                        <button onClick={() => setCurrentView('verdict')} className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shrink-0 transition-colors">
                            <Trophy size={22} />
                        </button>
                    )}
                </div>

                {/* Clue notebook modal */}
                {showNotebook && (
                    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur flex flex-col animate-in fade-in">
                        <div className="p-5 flex items-center justify-between border-b border-white/10">
                            <h2 className="text-lg font-black">📋 Case File</h2>
                            <button onClick={() => setShowNotebook(false)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><X size={16} /></button>
                        </div>
                        <div className="p-5 flex-1 overflow-y-auto">
                            {p.collectedClueIds.length === 0 ? (
                                <p className="text-slate-500 text-center mt-10 text-sm">You haven't found any clues yet. Listen closely.</p>
                            ) : (
                                <div className="space-y-3">
                                    {clues.filter(c => p.collectedClueIds.includes(c.id)).map(c => (
                                        <div key={c.id} className="bg-slate-900 rounded-2xl p-4 border border-white/5">
                                            <p className="font-bold text-sm">{c.name}</p>
                                            <p className="text-xs text-slate-400 mt-1">{c.description}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    // SCREEN 1 — CASE LIBRARY
    // ════════════════════════════════════════════════════════════════════════
    const today = getTodayStr();
    const dailyCase = episodes.find(e => e.isDailyCase && e.dailyDate === today);
    const grouped = episodes.reduce((acc, ep) => {
        const group = getLevelGroup(ep.level);
        if (!acc[group]) acc[group] = [];
        acc[group].push(ep);
        return acc;
    }, {} as Record<string, StoryEpisode[]>);

    return (
        <div className="min-h-screen bg-black text-white font-sans">
            {/* Header */}
            <div className="bg-gradient-to-br from-purple-700 via-purple-600 to-indigo-700 px-6 pt-10 pb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-20" style={{ background: 'radial-gradient(circle, white, transparent)' }} />
                <button onClick={onBack} className="absolute top-5 right-5 w-9 h-9 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                    <X size={16} />
                </button>
                <h1 className="text-3xl font-black tracking-tight">Detective Stories</h1>
                <p className="text-purple-200 text-sm mt-1">Select a case and improve your skills</p>
            </div>

            <div className="px-5 pb-24 space-y-8 mt-4">
                {/* Daily case */}
                {dailyCase && (
                    <div onClick={() => handleSelectCase(dailyCase)} className="cursor-pointer bg-gradient-to-r from-amber-900/40 to-orange-900/40 border border-amber-500/30 rounded-3xl p-5 flex items-center gap-4 hover:border-amber-500/60 transition-colors">
                        <div className="text-3xl">⭐</div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-amber-400 uppercase tracking-widest">DAILY MYSTERY</p>
                            <p className="font-black text-base truncate">{dailyCase.title}</p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">{dailyCase.description}</p>
                        </div>
                        <ChevronRight size={20} className="text-amber-400 shrink-0" />
                    </div>
                )}

                {/* Grouped case grid */}
                {(Object.entries(grouped) as [string, StoryEpisode[]][]).map(([group, eps]: [string, StoryEpisode[]]) => {
                    const solved = eps.filter(ep => loadProgress(ep.id).verdictSubmitted).length;
                    return (
                        <section key={group}>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h2 className="text-lg font-black">{group}</h2>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">CASES SOLVED {solved}/{eps.length}</p>
                                </div>
                                <span className={`text-xs font-black px-2 py-1 rounded-lg text-white ${getLevelBadgeColor(eps[0].level)}`}>
                                    {getLevelBadgeLabel(eps[0].level)}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {eps.map(ep => {
                                    const isUnlocked = getLevelWeight(userLevel) >= getLevelWeight(ep.level);
                                    const epProgress = loadProgress(ep.id);
                                    const stars = epProgress.starsEarned;
                                    return (
                                        <div
                                            key={ep.id}
                                            onClick={() => isUnlocked && handleSelectCase(ep)}
                                            className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all ${!isUnlocked ? 'opacity-40 grayscale cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                                        >
                                            {ep.coverImageUrl ? (
                                                <img src={ep.coverImageUrl} className="w-full h-full object-cover" alt={ep.title} />
                                            ) : (
                                                <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                                                    <FileText size={32} className="text-slate-600" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                                            {!isUnlocked && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Lock size={24} className="text-white/60" />
                                                </div>
                                            )}
                                            {stars > 0 && (
                                                <div className="absolute top-2 right-2 flex gap-0.5">
                                                    {[1, 2, 3].map(n => <Star key={n} size={8} className={stars >= n ? 'text-amber-400 fill-amber-400' : 'text-white/30 fill-white/30'} />)}
                                                </div>
                                            )}
                                            <p className="absolute bottom-2 left-2 right-2 text-[10px] font-black leading-tight text-white line-clamp-2">{ep.title}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}

                {episodes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                        <AlertCircle size={48} className="mb-4 opacity-40" />
                        <p className="font-bold text-center">No hay casos disponibles.<br />El archivo está clasificado.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DetectiveStories;
