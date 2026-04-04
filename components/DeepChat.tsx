
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PronunciationAnalysis, SprintAnalysis } from '../types';
import { initDeepChatScenario, sendDeepChatMessage, analyzeFluencySprint } from '../services/geminiService';
import { blobToBase64 } from '../services/audioUtils';

interface DeepChatProps {
    onBack: () => void;
}

// Helper to parse the AI Scenario output
interface ParsedScenario {
    scenario: string;
    setting: string;
    myRole: string;
    openingLine: { speaker: string; text: string; action?: string } | null;
}

const DeepChat: React.FC<DeepChatProps> = ({ onBack }) => {
    // Navigation State
    const [activeMode, setActiveMode] = useState<'roleplay' | 'sprint' | null>(null);

    // Shared State
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null); // Track active source

    // ================= ROLEPLAY STATE =================
    const [rpStage, setRpStage] = useState<'init' | 'chat'>('init');
    const [rpCustomTopic, setRpCustomTopic] = useState("");
    const [rpHistory, setRpHistory] = useState<ChatMessage[]>([]);
    const [scenarioData, setScenarioData] = useState<ParsedScenario | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // ================= SPRINT STATE =================
    const [sprintStage, setSprintStage] = useState<'setup' | 'active' | 'report'>('setup');
    const [sprintTopic, setSprintTopic] = useState("Travel Experiences");
    const [sprintDuration, setSprintDuration] = useState(1); // minutes
    const [sprintTimeLeft, setSprintTimeLeft] = useState(0);
    const [sprintAnalysis, setSprintAnalysis] = useState<SprintAnalysis | null>(null);
    const sprintTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Stop audio when component unmounts
    useEffect(() => {
        return () => {
            if (currentSourceRef.current) {
                try { currentSourceRef.current.stop(); } catch (e) { }
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    // Auto-scroll for Roleplay
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [rpHistory, isLoading]);

    const getAudioContext = () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
        return audioContextRef.current;
    };

    const playAudio = (buffer: AudioBuffer) => {
        // Stop any currently playing audio
        if (currentSourceRef.current) {
            try { currentSourceRef.current.stop(); } catch (e) { }
        }

        const ctx = getAudioContext();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => { currentSourceRef.current = null; };
        source.start(0);
        currentSourceRef.current = source;
    };

    // --- PARSING LOGIC ---
    const parseScenarioText = (rawText: string): ParsedScenario => {
        const scenarioMatch = rawText.match(/\*\*The Scenario:\*\*\s*(.*?)(?=\*\*|$)/s);
        const settingMatch = rawText.match(/\*\*The Setting:\*\*\s*(.*?)(?=\*\*|$)/s);
        const roleMatch = rawText.match(/\*\*My Role:\*\*\s*(.*?)(?=\*\*|$)/s);

        // Find the character dialogue usually at the end
        // Look for **Name:**
        const dialogueRegex = /\*\*([A-Za-z0-9\s]+):\*\*\s*(.*)/s;
        const dialogueMatch = rawText.match(dialogueRegex);

        let openingLine = null;
        if (dialogueMatch) {
            const fullText = dialogueMatch[2];
            const actionMatch = fullText.match(/\*(.*?)\*/);
            openingLine = {
                speaker: dialogueMatch[1].trim(),
                action: actionMatch ? actionMatch[1].trim() : undefined,
                text: fullText.replace(/\*.*?\*/, '').trim().replace(/^"|"$/g, '') // remove actions and quotes
            };
        }

        return {
            scenario: scenarioMatch ? scenarioMatch[1].trim() : "Unknown Scenario",
            setting: settingMatch ? settingMatch[1].trim() : "Unknown Setting",
            myRole: roleMatch ? roleMatch[1].trim() : "Participant",
            openingLine
        };
    };

    const formatMessageText = (text: string) => {
        // Splits text by *actions* to render them differently
        const parts = text.split(/(\*[^*]+\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('*') && part.endsWith('*')) {
                return <span key={index} className="text-slate-400 italic text-sm block my-1">{part.replace(/\*/g, '')}</span>;
            }
            return <span key={index}>{part}</span>;
        });
    };

    // ================= ROLEPLAY LOGIC =================
    const handleStartRoleplay = async (mode: 'surprise' | 'custom') => {
        if (mode === 'custom' && !rpCustomTopic.trim()) return;
        setIsLoading(true);
        try {
            const { text, audio } = await initDeepChatScenario(mode, rpCustomTopic);
            const parsed = parseScenarioText(text);
            setScenarioData(parsed);

            // Store the formatted opening line as the first chat message
            const initialMessage = parsed.openingLine
                ? `${parsed.openingLine.action ? `*${parsed.openingLine.action}* ` : ''}${parsed.openingLine.text}`
                : text; // Fallback to raw text if parsing fails heavily

            // Store cleaned message for display but we keep the structured data for the header
            setRpHistory([{ role: 'model', text: initialMessage }]);
            playAudio(audio);
            setRpStage('chat');
        } catch (e) {
            alert("Failed to start session. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const startRoleplayRecording = async () => {
        audioChunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
            recorder.onstop = async () => {
                const mimeType = recorder.mimeType || 'audio/webm';
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                const base64 = await blobToBase64(blob);
                handleSendRoleplayAudio(base64, mimeType);
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
        } catch (err) { alert("Microphone required."); }
    };

    const handleSendRoleplayAudio = async (base64: string, mimeType: string) => {
        setIsLoading(true);
        try {
            const { userText, modelText, modelAudio, analysis } = await sendDeepChatMessage(rpHistory, base64, mimeType);
            const newHistory: ChatMessage[] = [
                ...rpHistory,
                { role: 'user', text: userText, analysis },
                { role: 'model', text: modelText }
            ];
            setRpHistory(newHistory);
            playAudio(modelAudio);
        } catch (e: any) {
            alert(`Connection failed: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // ================= SPRINT LOGIC =================
    const handleRandomizeTopic = () => {
        const topics = ["Space Travel", "Future of AI", "Best Vacation", "Cooking Failures", "Childhood Memory", "Dream Job", "Climate Change", "Superheroes", "Living Abroad"];
        setSprintTopic(topics[Math.floor(Math.random() * topics.length)]);
    };

    const startSprint = async () => {
        setSprintStage('active');
        setSprintTimeLeft(sprintDuration * 60);
        audioChunksRef.current = [];

        // Start Timer
        if (sprintTimerRef.current) clearInterval(sprintTimerRef.current);
        sprintTimerRef.current = setInterval(() => {
            setSprintTimeLeft(prev => {
                if (prev <= 1) {
                    finishSprint(); // Auto-stop
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // Start Recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
            recorder.onstop = async () => {
                const mimeType = recorder.mimeType || 'audio/webm';
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                const base64 = await blobToBase64(blob);
                analyzeSprint(base64, mimeType);
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
        } catch (err) {
            alert("Microphone required for Sprint.");
            setSprintStage('setup');
            if (sprintTimerRef.current) clearInterval(sprintTimerRef.current);
        }
    };

    const finishSprint = () => {
        if (sprintTimerRef.current) clearInterval(sprintTimerRef.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        setIsLoading(true); // Show loading while processing
    };

    const analyzeSprint = async (base64: string, mimeType: string) => {
        try {
            const result = await analyzeFluencySprint(base64, mimeType, sprintTopic, sprintDuration);
            setSprintAnalysis(result);
            setSprintStage('report');
        } catch (e) {
            alert("Sprint Analysis Failed. Please try again.");
            setSprintStage('setup');
        } finally {
            setIsLoading(false);
        }
    };

    const stopRecordingShared = () => {
        if (activeMode === 'roleplay') {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
        } else if (activeMode === 'sprint') {
            finishSprint(); // Handles logic for sprint stop
        }
    };

    // ================= SHARED RENDERERS =================
    const renderRoleplayAnalysisCard = (analysis: any) => {
        return (
            <div className="mt-4 bg-slate-50 rounded-2xl p-6 border border-slate-200 text-sm animate-in fade-in slide-in-from-top-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    Turn Analysis
                </h4>
                <div className="mb-4 flex gap-4">
                    <div className="flex-1 bg-white p-3 rounded-xl border border-slate-100">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Origin</div>
                        <div className="font-bold text-slate-800">{analysis.accent_vibe.origin_guess}</div>
                    </div>
                    <div className="flex-1 bg-white p-3 rounded-xl border border-slate-100">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Energy</div>
                        <div className="font-bold text-slate-800">{analysis.accent_vibe.energy}</div>
                    </div>
                </div>
                <div className="text-[10px] text-green-600 font-bold uppercase mb-2">Correction</div>
                <ul className="space-y-1">
                    {analysis.the_fix.slice(0, 2).map((drill, i) => (
                        <li key={i} className="flex items-start gap-2 text-slate-700 text-xs"><span className="text-green-500 font-bold">✓</span>{drill}</li>
                    ))}
                </ul>
            </div>
        );
    };

    const renderSprintReport = () => {
        if (!sprintAnalysis) return null;
        return (
            <div className="max-w-2xl mx-auto space-y-8 animate-in zoom-in-95">
                <div className="text-center">
                    <div className="inline-block p-4 rounded-full bg-indigo-100 text-indigo-600 mb-4">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 mb-2">Sprint Complete!</h2>
                    <p className="text-slate-500 font-medium">Here is your flow report for "{sprintTopic}".</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Flow Metrics</h4>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="font-bold text-slate-700">Silence Score</span>
                                    <span className="font-bold text-indigo-600">{sprintAnalysis.silenceScore}/100</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${sprintAnalysis.silenceScore}%` }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="font-bold text-slate-700">Topic Relevance</span>
                                    <span className="font-bold text-emerald-600">{sprintAnalysis.relevanceScore}/100</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${sprintAnalysis.relevanceScore}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Filler Words</h4>
                        <div className="text-5xl font-black text-slate-900 mb-2">{sprintAnalysis.fillerCount}</div>
                        <p className="text-sm text-slate-500 mb-4 font-medium">Fillers detected</p>
                        <div className="flex flex-wrap gap-2">
                            {sprintAnalysis.fillersUsed.length > 0 ? sprintAnalysis.fillersUsed.map((f, i) => (
                                <span key={i} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">{f}</span>
                            )) : <span className="text-green-600 font-bold text-sm">Clean speech!</span>}
                        </div>
                    </div>
                </div>

                {/* NEW: Native Swaps Section */}
                {sprintAnalysis.nativeSwaps && (
                    <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2"></div>
                        <h3 className="text-xl font-black mb-6 flex items-center gap-2 relative z-10">
                            <span className="bg-amber-500 w-2 h-8 rounded-full"></span>
                            Native Swaps & Upgrades
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">

                            {/* Connector Suggestions */}
                            {sprintAnalysis.nativeSwaps.connectors && sprintAnalysis.nativeSwaps.connectors.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Flow Connectors</h4>
                                    <div className="space-y-2">
                                        {sprintAnalysis.nativeSwaps.connectors.map((conn, i) => (
                                            <div key={i} className="bg-white/10 border border-white/10 rounded-xl p-3 text-sm font-medium">
                                                Try using: <span className="text-amber-400 font-bold">"{conn}"</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Vocabulary Upgrades */}
                            {sprintAnalysis.nativeSwaps.vocabUpgrades && sprintAnalysis.nativeSwaps.vocabUpgrades.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Vocab Boost</h4>
                                    <div className="space-y-3">
                                        {sprintAnalysis.nativeSwaps.vocabUpgrades.map((up, i) => (
                                            <div key={i} className="bg-white/10 border border-white/10 rounded-xl p-3 text-sm">
                                                <div className="text-slate-400 text-xs mb-1">Instead of "{up.original}"</div>
                                                <div className="flex gap-2">
                                                    {up.upgrades.map((w, j) => (
                                                        <span key={j} className="text-green-400 font-bold">{w}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Filler Killers */}
                            {sprintAnalysis.nativeSwaps.fillers && sprintAnalysis.nativeSwaps.fillers.length > 0 && (
                                <div className="md:col-span-2">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Filler Alternatives</h4>
                                    <div className="flex flex-wrap gap-4">
                                        {sprintAnalysis.nativeSwaps.fillers.map((f, i) => (
                                            <div key={i} className="bg-white/10 border border-white/10 rounded-xl p-3 text-sm flex items-center gap-3">
                                                <span className="line-through text-red-400 opacity-70">{f.word}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="text-white font-bold">{f.alternatives.join(", ")}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 space-y-6">
                    <div>
                        <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-2">Pace Feedback</h4>
                        <p className="text-indigo-900 font-medium leading-relaxed">"{sprintAnalysis.paceFeedback}"</p>
                    </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Transcript</h4>
                    <p className="text-slate-600 text-sm leading-relaxed italic">"{sprintAnalysis.transcript}"</p>
                </div>

                <button onClick={() => setSprintStage('setup')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-indigo-600 transition-all shadow-xl">Start New Sprint</button>
            </div>
        );
    };

    // ================= MAIN RETURN =================

    // Mode Selection Screen
    if (!activeMode) {
        return (
            <div className="max-w-4xl mx-auto py-10 px-4 animate-in fade-in">
                <header className="text-center mb-12">
                    <button onClick={onBack} className="mb-6 text-slate-400 hover:text-slate-600 font-bold text-sm flex items-center justify-center gap-2 mx-auto">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7 7-7"></path></svg>
                        Back to Menu
                    </button>
                    <h1 className="text-5xl font-black text-slate-900 tracking-tighter mb-4">Deep Chat</h1>
                    <p className="text-xl text-slate-500 font-medium max-w-lg mx-auto">Choose your challenge mode.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <button onClick={() => setActiveMode('roleplay')} className="group relative overflow-hidden bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 hover:border-indigo-500 transition-all text-left">
                        <div className="absolute top-0 right-0 p-32 bg-indigo-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-100 transition-colors"></div>
                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"></path></svg>
                            </div>
                            <h3 className="text-3xl font-black text-slate-900 mb-2">Roleplay</h3>
                            <p className="text-slate-500 font-medium">Immersive scenarios with instant feedback on every turn.</p>
                        </div>
                    </button>

                    <button onClick={() => setActiveMode('sprint')} className="group relative overflow-hidden bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 hover:border-amber-500 transition-all text-left">
                        <div className="absolute top-0 right-0 p-32 bg-amber-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-100 transition-colors"></div>
                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mb-6 group-hover:scale-110 transition-transform">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </div>
                            <h3 className="text-3xl font-black text-slate-900 mb-2">Fluency Sprint</h3>
                            <p className="text-slate-500 font-medium">Speak continuously on a topic against the clock. No interruptions.</p>
                        </div>
                    </button>
                </div>
            </div>
        );
    }

    // Active Views
    return (
        <div className="max-w-3xl mx-auto h-[calc(100vh-2rem)] flex flex-col bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden my-4 relative animate-in fade-in">

            {/* Universal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center z-20">
                <button onClick={() => { setActiveMode(null); setRpStage('init'); setSprintStage('setup'); }} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <h2 className="font-black text-lg tracking-tight">
                    {activeMode === 'roleplay' ? 'Deep Roleplay' : 'Fluency Sprint'}
                </h2>
                <div className="w-10"></div>
            </div>

            {/* ROLEPLAY UI */}
            {activeMode === 'roleplay' && (
                rpStage === 'init' ? (
                    <div className="flex-1 overflow-y-auto p-8 flex flex-col justify-center space-y-8">
                        <button onClick={() => handleStartRoleplay('surprise')} className="w-full py-6 bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-600 rounded-3xl font-black text-xl text-indigo-700 transition-all">Surprise Me</button>
                        <div className="space-y-4">
                            <input
                                value={rpCustomTopic}
                                onChange={e => setRpCustomTopic(e.target.value)}
                                placeholder="Or type a custom scenario..."
                                className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100 font-medium text-lg"
                            />
                            <button onClick={() => handleStartRoleplay('custom')} disabled={isLoading || !rpCustomTopic} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-xl hover:bg-indigo-600 disabled:opacity-50 transition-all">Start Scenario</button>
                        </div>
                        {isLoading && <div className="text-center font-bold text-slate-400 animate-pulse">Initializing...</div>}
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50">
                            {scenarioData && (
                                <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 shadow-sm mb-6 animate-in slide-in-from-top-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="px-2 py-1 bg-indigo-200 text-indigo-800 rounded text-[10px] font-black uppercase tracking-widest">Mission</span>
                                        <h3 className="font-bold text-indigo-900 text-sm uppercase tracking-wide">{scenarioData.scenario}</h3>
                                    </div>
                                    <p className="text-sm text-indigo-800 mb-2"><span className="font-bold">Setting:</span> {scenarioData.setting}</p>
                                    <p className="text-sm text-indigo-800"><span className="font-bold">Your Role:</span> {scenarioData.myRole}</p>
                                </div>
                            )}

                            {rpHistory.map((msg, i) => (
                                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    {msg.role === 'model' && i === 0 && scenarioData?.openingLine?.speaker && (
                                        <span className="text-xs font-bold text-slate-400 ml-4 mb-1">{scenarioData.openingLine.speaker}</span>
                                    )}

                                    <div className={`max-w-[85%] p-5 rounded-[2rem] text-lg font-medium shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                                        {formatMessageText(msg.text)}
                                    </div>
                                    {msg.role === 'user' && msg.analysis && (
                                        <div className="max-w-[85%] w-full">{renderRoleplayAnalysisCard(msg.analysis)}</div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white p-5 rounded-[2rem] rounded-tl-none border border-slate-100 shadow-sm flex items-center gap-3">
                                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Coach Analyzing...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                        <div className="p-8 bg-white border-t border-slate-100 flex justify-center pb-10">
                            <button
                                onMouseDown={startRoleplayRecording}
                                onMouseUp={stopRecordingShared}
                                onMouseLeave={() => isRecording && stopRecordingShared()}
                                onTouchStart={(e) => { e.preventDefault(); startRoleplayRecording(); }}
                                onTouchEnd={(e) => { e.preventDefault(); stopRecordingShared(); }}
                                disabled={isLoading}
                                className={`w-full max-w-sm py-6 rounded-[2.5rem] font-black text-xl transition-all shadow-2xl flex items-center justify-center gap-3 select-none active:scale-95 ${isRecording ? 'bg-red-500 text-white scale-105 ring-8 ring-red-100' : 'bg-slate-900 text-white hover:bg-indigo-600'
                                    }`}
                            >
                                {isRecording ? "Listening..." : "Hold to Speak"}
                            </button>
                        </div>
                    </>
                )
            )}

            {/* SPRINT UI */}
            {activeMode === 'sprint' && (
                sprintStage === 'setup' ? (
                    <div className="flex-1 overflow-y-auto p-8 flex flex-col justify-center space-y-8">
                        <div className="space-y-4">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Sprint Topic</label>
                            <div className="flex gap-2">
                                <input value={sprintTopic} onChange={e => setSprintTopic(e.target.value)} className="flex-1 p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-amber-100 font-bold text-lg" />
                                <button onClick={handleRandomizeTopic} className="px-6 rounded-2xl bg-amber-100 text-amber-700 font-bold hover:bg-amber-200 transition-colors">Randomize</button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Duration</label>
                            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                                {[1, 2, 3, 5, 10].map(d => (
                                    <button key={d} onClick={() => setSprintDuration(d)} className={`flex-1 py-3 rounded-xl font-bold transition-all ${sprintDuration === d ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{d}m</button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 text-amber-900 text-sm font-medium">
                            <span className="font-black uppercase text-xs block mb-1">How it works</span>
                            Once you start, speak continuously about the topic until the timer hits zero. The AI will just listen. Afterward, you'll get a detailed Flow Report.
                        </div>

                        <button onClick={startSprint} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-xl hover:bg-amber-500 transition-all shadow-xl active:scale-95">Start Sprint</button>
                    </div>
                ) : sprintStage === 'active' ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8 relative overflow-hidden">
                        <div className="absolute inset-0 flex items-center justify-center opacity-5">
                            <div className="w-[500px] h-[500px] bg-amber-500 rounded-full blur-[100px] animate-pulse"></div>
                        </div>
                        <h2 className="text-xl font-bold text-slate-500 mb-8 uppercase tracking-widest">{sprintTopic}</h2>
                        <div className="text-[8rem] font-black text-slate-900 tabular-nums leading-none tracking-tighter mb-12">
                            {Math.floor(sprintTimeLeft / 60)}:{(sprintTimeLeft % 60).toString().padStart(2, '0')}
                        </div>
                        <div className="w-full max-w-xs h-2 bg-slate-200 rounded-full mb-12 overflow-hidden">
                            <div className="h-full bg-amber-500 transition-all duration-1000 ease-linear" style={{ width: `${(sprintTimeLeft / (sprintDuration * 60)) * 100}%` }}></div>
                        </div>
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="font-bold text-red-500 uppercase tracking-widest text-sm">Recording Active</span>
                        </div>
                        <button onClick={finishSprint} className="px-10 py-4 bg-white border-2 border-slate-200 hover:border-red-500 hover:text-red-600 rounded-2xl font-black text-slate-400 transition-all">Stop Early</button>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-8">
                        {isLoading ? (
                            <div className="h-full flex flex-col items-center justify-center">
                                <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p className="font-black text-indigo-600 uppercase tracking-widest">Generating Flow Report...</p>
                            </div>
                        ) : (
                            renderSprintReport()
                        )}
                    </div>
                )
            )}

        </div>
    );
};

export default DeepChat;
