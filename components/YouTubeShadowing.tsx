import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Mic, Square, BookmarkPlus, ChevronRight, Loader2, Volume2, Waves, Star, X, Upload, AlertCircle } from 'lucide-react';
import type { YouTubeTranscriptLine, ShadowingResult, AccentPreference } from '../types';
import { analyzeShadowing, generateYouTubeTranscript, translateText } from '../services/geminiService';
import { blobToBase64 } from '../services/audioUtils';
import { useXP } from '../hooks/useXP';
import { useStreak } from '../hooks/useStreak';
import { useVocabDeck } from '../hooks/useVocabDeck';

interface Props {
    onBack: () => void;
    accentPreference: AccentPreference;
}

declare global {
    interface Window {
        YT: {
            Player: new (el: string | HTMLElement, opts: object) => YouTubePlayer;
            PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
        };
        onYouTubeIframeAPIReady: () => void;
    }
}

interface YouTubePlayer {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    destroy(): void;
    loadVideoById(videoId: string): void;
}

function extractVideoId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

function formatTimestamp(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
    const r = 28, circ = 2 * Math.PI * r;
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative w-16 h-16">
                <svg width={64} height={64} className="absolute inset-0 -rotate-90">
                    <circle cx={32} cy={32} r={r} fill="none" stroke="#1e293b" strokeWidth={6} />
                    <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={6}
                        strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">{score}</span>
                </div>
            </div>
            <span className="text-slate-400 text-xs text-center">{label}</span>
        </div>
    );
}

// ─── Language Reactor-style transcript line ───────────────────────────────────
function TranscriptLine({
    line, isActive, currentTime, onWordClick, onLineClick
}: {
    line: YouTubeTranscriptLine;
    isActive: boolean;
    currentTime: number;
    onWordClick: (word: string, contextSentence: string) => void;
    onLineClick: (line: YouTubeTranscriptLine) => void;
}) {
    return (
        <div
            onClick={() => onLineClick(line)}
            className={`group flex gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${isActive
                ? 'bg-blue-500/12 border-l-2 border-blue-400'
                : 'border-l-2 border-transparent hover:bg-white/5'
                }`}
        >
            {/* Timestamp pill */}
            <span className={`mt-0.5 shrink-0 text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${isActive ? 'text-blue-300 bg-blue-500/20' : 'text-slate-600 group-hover:text-slate-400'
                }`}>
                {formatTimestamp(line.startTime)}
            </span>

            {/* Words */}
            <div className="flex flex-wrap gap-x-1 gap-y-0.5 leading-relaxed">
                {line.words.map((w, i) => {
                    const isWordActive = isActive && currentTime >= w.startTime && currentTime <= w.endTime;
                    return (
                        <motion.span
                            key={i}
                            animate={{
                                color: isWordActive ? '#93c5fd' : isActive ? '#e2e8f0' : '#64748b',
                            }}
                            transition={{ duration: 0.08 }}
                            className={`text-sm cursor-pointer hover:text-blue-300 transition-colors ${isWordActive ? 'font-semibold underline decoration-blue-400 decoration-2 underline-offset-2' : ''
                                }`}
                            onClick={e => { e.stopPropagation(); onWordClick(w.word, line.text); }}
                        >
                            {w.word}
                        </motion.span>
                    );
                })}
            </div>
        </div>
    );
}

// ─── No-caption graceful fallback ─────────────────────────────────────────────
function NoTranscriptPanel({ onSrtUpload }: { onSrtUpload: (lines: YouTubeTranscriptLine[]) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);

    const parseSrt = (text: string): YouTubeTranscriptLine[] => {
        const blocks = text.trim().split(/\n\s*\n/);
        const lines: YouTubeTranscriptLine[] = [];
        for (const block of blocks) {
            const rows = block.trim().split('\n');
            if (rows.length < 3) continue;
            const timeRow = rows[1];
            const m = timeRow.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
            if (!m) continue;
            const startTime = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
            const endTime = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
            const text = rows.slice(2).join(' ').replace(/<[^>]+>/g, '').trim();
            if (!text) continue;
            const wordStrs = text.split(/\s+/).filter(Boolean);
            const tpw = (endTime - startTime) / Math.max(wordStrs.length, 1);
            lines.push({
                text,
                startTime,
                endTime,
                words: wordStrs.map((w, i) => ({ word: w, startTime: startTime + i * tpw, endTime: startTime + (i + 1) * tpw }))
            });
        }
        return lines;
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const text = ev.target?.result as string;
            const lines = parseSrt(text);
            if (lines.length > 0) onSrtUpload(lines);
            else alert('Could not parse the file. Make sure it is a valid .SRT file.');
        };
        reader.readAsText(file);
    };

    return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertCircle size={20} className="text-amber-400" />
            </div>
            <div>
                <p className="text-white font-semibold mb-1">No captions found</p>
                <p className="text-slate-400 text-sm leading-relaxed">
                    YouTube hasn't generated auto-captions for this video, or they're disabled.
                </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
                <button
                    onClick={() => inputRef.current?.click()}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-sm font-semibold transition-all"
                >
                    <Upload size={14} /> Upload .SRT or .VTT file
                </button>
                <input ref={inputRef} type="file" accept=".srt,.vtt,.txt" className="hidden" onChange={handleFile} />
                <p className="text-slate-600 text-xs">
                    Download subtitles from YouTube Studio or DownSub.com
                </p>
            </div>
        </div>
    );
}

export const YouTubeShadowing: React.FC<Props> = ({ onBack, accentPreference }) => {
    const [videoUrl, setVideoUrl] = useState('');
    const [videoId, setVideoId] = useState<string | null>(null);
    const [player, setPlayer] = useState<YouTubePlayer | null>(null);
    const [transcript, setTranscript] = useState<YouTubeTranscriptLine[]>([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
    const [transcriptError, setTranscriptError] = useState<string | null>(null);
    const [activeLineIdx, setActiveLineIdx] = useState(0);
    const [phase, setPhase] = useState<'setup' | 'watch' | 'shadow' | 'result'>('setup');
    const [selectedLine, setSelectedLine] = useState<YouTubeTranscriptLine | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [shadowResult, setShadowResult] = useState<ShadowingResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [translationData, setTranslationData] = useState<{
        word: string; sentence: string; definition?: string; synonyms?: string; translation?: string;
    } | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);

    const playerRef = useRef<HTMLDivElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const rafRef = useRef<number | null>(null);
    const transcriptContainerRef = useRef<HTMLDivElement>(null);
    const activeLineRef = useRef<HTMLDivElement>(null);
    // Use a ref for the active index inside the RAF loop to avoid stale closure
    const activeIdxRef = useRef(0);
    const playClipIntervalRef = useRef<number | null>(null);
    const { addXP } = useXP();
    const { recordActivity } = useStreak();
    const { addWord } = useVocabDeck();

    // Load YouTube IFrame API
    useEffect(() => {
        if (!window.YT && !document.getElementById('youtube-iframe-api')) {
            const script = document.createElement('script');
            script.id = 'youtube-iframe-api';
            script.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(script);
        }
    }, []);

    // ── requestAnimationFrame sync loop — <100ms latency guaranteed ──────────
    useEffect(() => {
        if (phase !== 'watch' || !player || transcript.length === 0) return;

        const updateTime = () => {
            let t = 0;
            try { t = player.getCurrentTime(); } catch (_) {
                rafRef.current = requestAnimationFrame(updateTime);
                return;
            }

            setCurrentTime(t);

            // Binary search → O(log n), avoids full array scan every frame
            let lo = 0, hi = transcript.length - 1, idx = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (transcript[mid].startTime <= t) { idx = mid; lo = mid + 1; }
                else hi = mid - 1;
            }

            if (idx !== -1 && idx !== activeIdxRef.current) {
                activeIdxRef.current = idx;
                setActiveLineIdx(idx);
            }

            rafRef.current = requestAnimationFrame(updateTime);
        };

        rafRef.current = requestAnimationFrame(updateTime);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [phase, player, transcript]);

    // Auto-scroll transcript to keep active line centered
    useEffect(() => {
        if (activeLineRef.current && transcriptContainerRef.current && phase === 'watch' && !isTranslating) {
            activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeLineIdx, phase, isTranslating]);

    const initPlayer = useCallback((id: string) => {
        if (!playerRef.current || !window.YT?.Player) {
            setTimeout(() => initPlayer(id), 500);
            return;
        }
        if (player) { player.loadVideoById(id); return; }
        const p = new window.YT.Player(playerRef.current, {
            videoId: id,
            playerVars: { controls: 1, rel: 0, modestbranding: 1, enablejsapi: 1, origin: window.location.origin },
            events: { onReady: () => { setPlayer(p); p.playVideo(); } },
        });
    }, [player]);

    const handleLoadVideo = useCallback(async () => {
        const id = extractVideoId(videoUrl);
        if (!id) { alert('Invalid YouTube URL or video ID'); return; }
        if (!window.YT) { alert('YouTube API is still loading. Please try again in a moment.'); return; }

        setVideoId(id);
        setIsLoadingTranscript(true);
        setTranscript([]);
        setTranscriptError(null);
        setActiveLineIdx(0);
        activeIdxRef.current = 0;
        setPhase('watch');

        // Init player instantly while transcript loads in background
        setTimeout(() => initPlayer(id), 0);

        try {
            const lines = await generateYouTubeTranscript(id);
            if (lines.length === 0) throw new Error('No captions found for this video');
            setTranscript(lines);
            setActiveLineIdx(0);
            activeIdxRef.current = 0;
        } catch (err: any) {
            console.error('Transcript load failed:', err);
            setTranscriptError(err.message || 'No captions found for this video');
        } finally {
            setIsLoadingTranscript(false);
        }
    }, [videoUrl, initPlayer]);

    const handleSelectLine = useCallback((line: YouTubeTranscriptLine) => {
        setSelectedLine(line);
        player?.seekTo(line.startTime, true);
        player?.pauseVideo();
        setPhase('shadow');
    }, [player]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            chunksRef.current = [];
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                setRecordedBlob(new Blob(chunksRef.current, { type: 'audio/webm' }));
                stream.getTracks().forEach(t => t.stop());
            };
            mr.start();
            mediaRecorderRef.current = mr;
            setIsRecording(true);
        } catch (_) { alert('Microphone access required'); }
    }, []);

    const stopRecording = useCallback(() => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    }, []);

    const analyzeRecording = useCallback(async () => {
        if (!recordedBlob || !selectedLine) return;
        setIsAnalyzing(true);
        try {
            const b64 = await blobToBase64(recordedBlob);
            const result = await analyzeShadowing(selectedLine.text, b64, recordedBlob.type, accentPreference);
            setShadowResult(result);
            setPhase('result');
            addXP('youtube', result.pronunciationScore);
            recordActivity('youtube');
        } catch (err) { console.error(err); }
        finally { setIsAnalyzing(false); }
    }, [recordedBlob, selectedLine, accentPreference, addXP, recordActivity]);

    const handleWordClick = useCallback(async (word: string, contextSentence: string) => {
        player?.pauseVideo();
        setTranslationData({ word, sentence: contextSentence });
        setIsTranslating(true);
        try {
            const result = await translateText(word, contextSentence);
            setTranslationData({ word, sentence: contextSentence, definition: result.englishDefinition, synonyms: result.synonyms, translation: result.spanishTranslation });
        } catch (_) { setTranslationData(null); }
        finally { setIsTranslating(false); }
    }, [player]);

    const handleSaveToVocab = useCallback(() => {
        if (!translationData) return;
        addWord(translationData.word, translationData.definition ? `${translationData.definition} (Synonyms: ${translationData.synonyms})` : '', `From YouTube: ${videoId}`, `"${translationData.sentence}" — ${translationData.translation}`);
        setTranslationData(null);
        player?.playVideo();
    }, [translationData, addWord, videoId, player]);

    const playClip = useCallback(() => {
        if (!player || !selectedLine) return;
        player.seekTo(selectedLine.startTime, true);
        player.playVideo();

        if (playClipIntervalRef.current) window.clearInterval(playClipIntervalRef.current);
        playClipIntervalRef.current = window.setInterval(() => {
            try {
                if (player.getCurrentTime() >= selectedLine.endTime) {
                    player.pauseVideo();
                    if (playClipIntervalRef.current) window.clearInterval(playClipIntervalRef.current);
                }
            } catch (_) { }
        }, 50);
    }, [player, selectedLine]);

    useEffect(() => {
        return () => { if (playClipIntervalRef.current) window.clearInterval(playClipIntervalRef.current); };
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
            {/* Header bar */}
            <div className="flex items-center gap-4 px-4 md:px-8 py-4 border-b border-white/5 shrink-0">
                <button onClick={onBack} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
                    ←
                </button>
                <div className="flex items-center gap-2">
                    <Play size={18} className="text-red-400" fill="currentColor" />
                    <h1 className="text-xl font-bold text-white">YouTube Shadowing</h1>
                    <span className="hidden sm:inline text-slate-500 text-sm">· Language Reactor mode</span>
                </div>

                {/* URL bar (always visible) */}
                <div className="flex-1 flex gap-2 ml-auto max-w-lg">
                    <input
                        value={videoUrl}
                        onChange={e => setVideoUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLoadVideo()}
                        placeholder="Paste YouTube URL or video ID…"
                        className="flex-1 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 text-sm"
                    />
                    <motion.button
                        onClick={handleLoadVideo}
                        disabled={!videoUrl || isLoadingTranscript}
                        whileTap={{ scale: 0.96 }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl disabled:opacity-40 transition-all flex items-center gap-1.5 text-sm"
                    >
                        {isLoadingTranscript ? <Loader2 size={14} className="animate-spin" /> : <><Play size={13} fill="currentColor" /> Load</>}
                    </motion.button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {/* ── SETUP (no video loaded yet) ───────────────────────────────── */}
                {phase === 'setup' && (
                    <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex-1 flex items-center justify-center p-8">
                        <div className="max-w-lg w-full space-y-6">
                            <div className="text-center">
                                <div className="text-5xl mb-4">🎬</div>
                                <h2 className="text-2xl font-bold text-white mb-2">Shadow Native Speakers</h2>
                                <p className="text-slate-400 text-sm">Paste any YouTube URL above and press Load. Real captions sync to the video — no AI hallucination.</p>
                            </div>
                            {/* Quick presets */}
                            <div className="bg-slate-800/40 border border-white/5 rounded-2xl p-5">
                                <h4 className="text-slate-400 text-xs font-semibold mb-3 uppercase tracking-wide">
                                    Quick Start
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {[
                                        { label: 'TED Talk — The Power of Vulnerability', id: 'iCvmsMzlF7o' },
                                        { label: 'Modern American English Pronunciation', id: 'n4NVe5_eLPI' },
                                        { label: 'Obama Speech — Chicago Victory', id: 'K5hYwBKKJBk' },
                                        { label: 'Friends — Central Perk Scene', id: '4kMHopSKOB8' },
                                    ].map(p => (
                                        <button key={p.id} onClick={() => setVideoUrl(p.id)}
                                            className="text-left p-3 bg-slate-700/30 hover:bg-slate-700/60 border border-slate-600/20 hover:border-red-500/30 rounded-xl text-slate-300 text-sm transition-all">
                                            <Play size={11} className="inline mr-1.5 text-red-400" fill="currentColor" />
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── WATCH — Language Reactor layout ──────────────────────────── */}
            {/* Rendered OUTSIDE AnimatePresence to prevent iframe unmounting, hidden via CSS when inactive */}
            <div className={`flex-1 overflow-hidden min-h-0 ${phase === 'watch' && videoId ? 'grid grid-cols-1 lg:grid-cols-[1fr_1fr]' : 'hidden'}`}>

                {/* LEFT: Sticky player column */}
                <div className="flex flex-col p-4 lg:p-6 gap-3">
                    <div className="sticky top-4">
                        {/* Player */}
                        <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/5">
                            <div ref={playerRef} className="w-full h-full" />
                        </div>

                        {/* Hint bar */}
                        <div className="mt-4 bg-slate-800/40 border border-white/5 rounded-xl px-4 py-3 text-slate-400 text-sm flex items-center gap-2">
                            <ChevronRight size={13} className="text-blue-400 shrink-0" />
                            <span>Click any transcript line to enter <strong className="text-white">Shadow Mode</strong> · Click any word to look it up</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Scrollable transcript panel */}
                <div className="flex flex-col border-t lg:border-t-0 lg:border-l border-white/5 h-[calc(100vh-80px)] overflow-hidden">
                    {/* Panel header */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80 backdrop-blur shrink-0">
                        <Volume2 size={13} className="text-blue-400" />
                        <span className="text-white text-sm font-semibold">Transcript</span>
                        {transcript.length > 0 && (
                            <span className="ml-auto text-slate-600 text-xs">{transcript.length} lines</span>
                        )}
                    </div>

                    {/* Scrollable content */}
                    <div ref={transcriptContainerRef} className="flex-1 overflow-y-auto scroll-smooth py-2 px-2">
                        {isLoadingTranscript && (
                            <div className="flex flex-col items-center justify-center h-48 gap-3 opacity-70">
                                <Loader2 size={28} className="text-blue-400 animate-spin" />
                                <p className="text-slate-400 text-sm animate-pulse">Fetching verified captions…</p>
                            </div>
                        )}

                        {!isLoadingTranscript && transcriptError && (
                            <NoTranscriptPanel onSrtUpload={lines => {
                                setTranscript(lines);
                                setTranscriptError(null);
                                setActiveLineIdx(0);
                                activeIdxRef.current = 0;
                            }} />
                        )}

                        {!isLoadingTranscript && !transcriptError && transcript.length > 0 && (
                            <div className="pb-24 pt-1">
                                {transcript.map((line, i) => (
                                    <div key={i} ref={i === activeLineIdx ? activeLineRef : null}>
                                        <TranscriptLine
                                            line={line}
                                            isActive={i === activeLineIdx}
                                            currentTime={currentTime}
                                            onWordClick={handleWordClick}
                                            onLineClick={handleSelectLine}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {/* ── SHADOW MODE ───────────────────────────────────────────────── */}
                {phase === 'shadow' && selectedLine && (
                    <motion.div key="shadow" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex-1 flex items-center justify-center p-6">
                        <div className="bg-gradient-to-br from-slate-800 to-indigo-900/30 border border-indigo-500/20 rounded-2xl p-8 max-w-xl w-full">
                            <div className="text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Waves size={13} /> Shadow This Line
                            </div>
                            <div className="bg-slate-900/60 rounded-xl p-5 mb-6 border border-white/5">
                                <p className="text-white text-lg leading-relaxed font-medium">{selectedLine.text}</p>
                                <p className="text-slate-500 text-xs mt-2 font-mono">
                                    {formatTimestamp(selectedLine.startTime)} → {formatTimestamp(selectedLine.endTime)}
                                </p>
                            </div>
                            <div className="text-slate-400 text-sm mb-6 space-y-1.5">
                                <p>1. Press <span className="text-white font-semibold">Play Clip</span> and listen to the rhythm carefully</p>
                                <p>2. Press <span className="text-red-400 font-semibold">Record</span> and shadow (shadow = immediate repeat)</p>
                                <p>3. Press <span className="text-emerald-400 font-semibold">Analyze</span> for your pronunciation score</p>
                            </div>
                            <div className="flex gap-3 mb-4">
                                <button onClick={playClip}
                                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all">
                                    <Play size={15} fill="currentColor" /> Play Clip
                                </button>
                                {!isRecording ? (
                                    <motion.button onClick={startRecording} whileTap={{ scale: 0.97 }}
                                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all">
                                        <Mic size={15} /> Record Shadow
                                    </motion.button>
                                ) : (
                                    <motion.button onClick={stopRecording} whileTap={{ scale: 0.97 }}
                                        className="flex-1 py-3 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-semibold flex items-center justify-center gap-2 animate-pulse transition-all">
                                        <Square size={15} fill="currentColor" /> Stop
                                    </motion.button>
                                )}
                            </div>
                            {recordedBlob && !isRecording && (
                                <motion.button onClick={analyzeRecording} disabled={isAnalyzing} whileTap={{ scale: 0.97 }}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20">
                                    {isAnalyzing ? <><Loader2 size={17} className="animate-spin" /> Analyzing…</> : <><Star size={17} /> Analyze My Shadow</>}
                                </motion.button>
                            )}
                            <button onClick={() => setPhase('watch')} className="mt-3 w-full py-2 text-slate-500 hover:text-slate-300 text-sm transition-all">
                                ← Back to Transcript
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ── RESULT ────────────────────────────────────────────────────── */}
                {phase === 'result' && shadowResult && selectedLine && (
                    <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="flex-1 flex items-center justify-center p-6">
                        <div className="bg-gradient-to-br from-slate-800 to-indigo-900/30 border border-indigo-500/20 rounded-2xl p-8 max-w-xl w-full">
                            <h2 className="text-2xl font-bold text-white mb-1">Shadow Analysis</h2>
                            <p className="text-slate-400 text-sm mb-6 italic">"{selectedLine.text}"</p>
                            <div className="flex justify-center gap-8 mb-6">
                                <ScoreRing score={shadowResult.rhythmScore} label="Rhythm" color="#6366f1" />
                                <ScoreRing score={shadowResult.pronunciationScore} label="Pronunciation" color="#06b6d4" />
                                <ScoreRing score={Math.round((shadowResult.rhythmScore + shadowResult.pronunciationScore) / 2)} label="Overall" color="#10b981" />
                            </div>
                            <div className="bg-slate-700/40 rounded-xl p-5 mb-6">
                                <h4 className="text-indigo-400 font-semibold text-sm uppercase tracking-wide mb-2">Coach Feedback</h4>
                                <p className="text-slate-200 text-sm leading-relaxed">{shadowResult.feedback}</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => { setRecordedBlob(null); setPhase('shadow'); }}
                                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all">
                                    Try Again
                                </button>
                                <button onClick={() => setPhase('watch')}
                                    className="flex-1 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl font-semibold transition-all">
                                    ← Transcript
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Word Lookup Modal (Lingopie-style) ─────────────────────────── */}
            <AnimatePresence>
                {translationData && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
                        onClick={() => setTranslationData(null)}>
                        <motion.div
                            initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, scale: 0.96 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl p-6 max-w-sm w-full relative">
                            <button onClick={() => setTranslationData(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
                                <X size={18} />
                            </button>
                            <h3 className="text-3xl font-bold text-white mb-4 pr-8">{translationData.word}</h3>
                            {isTranslating ? (
                                <div className="py-8 flex flex-col items-center gap-3">
                                    <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
                                    <p className="text-slate-400 text-sm animate-pulse">Analyzing context…</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                                        <p className="text-white text-sm leading-relaxed">{translationData.definition}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-800/30 rounded-xl p-3 border border-indigo-500/10">
                                            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">Translation</p>
                                            <p className="text-slate-200 text-sm font-medium">{translationData.translation}</p>
                                        </div>
                                        <div className="bg-slate-800/30 rounded-xl p-3 border border-emerald-500/10">
                                            <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">Synonyms</p>
                                            <p className="text-slate-200 text-xs leading-tight">{translationData.synonyms}</p>
                                        </div>
                                    </div>
                                    <p className="text-slate-500 text-xs italic border-l-2 border-slate-700 pl-3">
                                        "{translationData.sentence}"
                                    </p>
                                    <button onClick={handleSaveToVocab}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20">
                                        <BookmarkPlus size={16} /> Save to Vocab Bank
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default YouTubeShadowing;
