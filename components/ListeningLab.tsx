
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProficiencyLevel, NativeScene, RoleplayAnalysis, DictationChallenge } from '../types';
import { generateNativeScene, generateSceneImage, generateMultiSpeakerAudio, analyzeRoleplayLine, coachSceneQuestion, generateDictationChallenge, generateNativeAudio } from '../services/geminiService';
import { blobToBase64 } from '../services/audioUtils';

const PRESET_SCENARIOS = [
  "New York Coffee Shop Rush",
  "Silicon Valley Stand-up Meeting",
  "Texas Backyard BBQ Grill-off",
  "Hollywood Red Carpet Interview",
  "San Francisco Tech Support Call"
];

const ListeningLab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'simulator' | 'dictation'>('simulator');

  // ================= SCENE SIMULATOR STATE =================
  const [stage, setStage] = useState<'selection' | 'generating' | 'simulation'>('selection');
  const [selectedLevel, setSelectedLevel] = useState<ProficiencyLevel>(ProficiencyLevel.Intermediate);
  const [customScenario, setCustomScenario] = useState("");
  const [scene, setScene] = useState<NativeScene | null>(null);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [mode, setMode] = useState<'watch' | 'roleplay'>('watch');
  const [showCoachOverlay, setShowCoachOverlay] = useState(false);
  const [isCoaching, setIsCoaching] = useState(false);
  const [coachResponse, setCoachResponse] = useState<string | null>(null);
  const [genStep, setGenStep] = useState("Scripting dialogue...");
  const [isRecording, setIsRecording] = useState(false);
  const [analysis, setAnalysis] = useState<RoleplayAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showExplanation, setShowExplanation] = useState<number | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  // ================= DICTATION LAB STATE =================
  const [dictationLevel, setDictationLevel] = useState<string>("B1");
  const [dictationChallenge, setDictationChallenge] = useState<DictationChallenge | null>(null);
  const [dictationAudio, setDictationAudio] = useState<AudioBuffer | null>(null);
  const [dictationStatus, setDictationStatus] = useState<'idle' | 'loading' | 'active' | 'review'>('idle');
  const [isPlayingDictation, setIsPlayingDictation] = useState(false);
  const [currentPlaybackWordIndex, setCurrentPlaybackWordIndex] = useState<number | null>(null);
  const playbackAnimationRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null);
  const durationRef = useRef<number | null>(null);

  // New Dictation Input Logic
  const [cursorIndex, setCursorIndex] = useState(0); // Index in the clean (no space) string
  const [shakeIndex, setShakeIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // --- Shared Audio Logic ---
  const getContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    return audioContextRef.current;
  };

  // --- Scene Simulator Functions ---
  const handleSurpriseMe = () => {
    const random = PRESET_SCENARIOS[Math.floor(Math.random() * PRESET_SCENARIOS.length)];
    setCustomScenario(random);
  };

  const handleStartScene = async (scenarioOverride?: string) => {
    const scenario = scenarioOverride || customScenario || "Casual interaction at a grocery store";
    setStage('generating');
    try {
      setGenStep("Scripting American dialogue...");
      const newScene = await generateNativeScene(scenario, selectedLevel);

      setGenStep("Preparing environment and voices...");
      const [audioBuffers, imageUrl] = await Promise.all([
        generateMultiSpeakerAudio(newScene.script, selectedLevel),
        generateSceneImage(newScene.imagePrompt)
      ]);

      newScene.script = newScene.script.map((p, i) => ({ ...p, audioBuffer: audioBuffers[i] }));
      newScene.imagePrompt = imageUrl;

      setScene(newScene);
      setStage('simulation');
      setCurrentPartIndex(0);
    } catch (err) {
      console.error(err);
      alert("Simulation engine failed. Latency or API limits may be reached.");
      setStage('selection');
    }
  };

  const playPartAudio = (index: number) => {
    const buffer = scene?.script[index]?.audioBuffer;
    if (!buffer) return;

    if (currentAudioSourceRef.current) {
      try { currentAudioSourceRef.current.stop(); } catch (e) { }
    }

    const ctx = getContext();
    setPlayingIndex(index);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => setPlayingIndex(prev => prev === index ? null : prev);
    source.start(0);
    currentAudioSourceRef.current = source;
  };

  const startRecording = async (index: number) => {
    audioChunksRef.current = [];
    setCurrentPartIndex(index);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const base64 = await blobToBase64(blob);
        performRoleplayAnalysis(base64, mimeType, index);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setAnalysis(null);
    } catch (err) { alert("Mic required for roleplay."); }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const performRoleplayAnalysis = async (base64: string, mimeType: string, index: number) => {
    if (!scene) return;
    setIsAnalyzing(true);
    try {
      const target = scene.script[index].text;
      const result = await analyzeRoleplayLine(target, base64, mimeType);
      setAnalysis(result);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const askCoachAboutScene = async (q: string) => {
    if (!scene) return;
    setIsCoaching(true);
    try {
      const { text, audio } = await coachSceneQuestion(q, scene);
      setCoachResponse(text);
      const ctx = getContext();
      const source = ctx.createBufferSource();
      source.buffer = audio;
      source.connect(ctx.destination);
      source.start(0);
    } finally {
      setIsCoaching(false);
    }
  };

  // --- Dictation Lab Functions ---
  const startNewDictation = async () => {
    setDictationStatus('loading');
    setDictationAudio(null);
    setDictationChallenge(null);
    setCursorIndex(0);
    setShakeIndex(null);

    try {
      const challenge = await generateDictationChallenge(dictationLevel);
      setDictationChallenge(challenge);
      const audio = await generateNativeAudio(challenge.script);
      setDictationAudio(audio);
      setDictationStatus('active');
    } catch (e) {
      console.error(e);
      setDictationStatus('idle');
      alert("Failed to create dictation challenge.");
    }
  };

  const playDictationAudio = (slow: boolean = false) => {
    if (!dictationAudio) return;
    const ctx = getContext();
    if (currentAudioSourceRef.current) try { currentAudioSourceRef.current.stop(); } catch (e) { }
    if (playbackAnimationRef.current) cancelAnimationFrame(playbackAnimationRef.current);

    setIsPlayingDictation(true);
    const source = ctx.createBufferSource();
    source.buffer = dictationAudio;
    const rate = slow ? 0.75 : 1.0;
    source.playbackRate.value = rate;
    source.connect(ctx.destination);

    source.onended = () => {
      setIsPlayingDictation(false);
      setCurrentPlaybackWordIndex(null);
      if (playbackAnimationRef.current) cancelAnimationFrame(playbackAnimationRef.current);
    };

    source.start(0);
    currentAudioSourceRef.current = source;

    playbackStartTimeRef.current = ctx.currentTime;
    durationRef.current = dictationAudio.duration / rate;

    const totalWords = dictationWords.length;

    const updateHighlight = () => {
      if (!playbackStartTimeRef.current || !durationRef.current) return;
      const elapsed = ctx.currentTime - playbackStartTimeRef.current;
      const progress = elapsed / durationRef.current;

      if (progress >= 1) {
        setCurrentPlaybackWordIndex(null);
        return;
      }

      const wordIndex = Math.floor(progress * totalWords);
      setCurrentPlaybackWordIndex(wordIndex);
      playbackAnimationRef.current = requestAnimationFrame(updateHighlight);
    };

    playbackAnimationRef.current = requestAnimationFrame(updateHighlight);
  };

  // --- Dictation UI Logic ---

  // Derived state for the grid
  const dictationWords = useMemo(() => {
    if (!dictationChallenge) return [];
    return dictationChallenge.script.trim().split(/\s+/);
  }, [dictationChallenge]);

  // A string of all valid characters (no spaces)
  const dictationCleanTarget = useMemo(() => {
    if (!dictationChallenge) return "";
    return dictationChallenge.script.replace(/\s+/g, '');
  }, [dictationChallenge]);

  // Focus management
  useEffect(() => {
    if (dictationStatus === 'active' && inputRefs.current[cursorIndex]) {
      inputRefs.current[cursorIndex]?.focus();
    }
  }, [cursorIndex, dictationStatus]);

  const handleCharInput = (e: React.ChangeEvent<HTMLInputElement>, globalIndex: number, targetChar: string) => {
    const val = e.target.value;
    if (!val) return;

    const char = val.slice(-1); // Take last char if they managed to paste or type fast

    // Case insensitive check
    if (char.toLowerCase() === targetChar.toLowerCase()) {
      setCursorIndex(prev => prev + 1);
    } else {
      // Error
      setShakeIndex(globalIndex);
      setTimeout(() => setShakeIndex(null), 400);
      e.target.value = ""; // Clear input
    }
  };

  const handleRevealNextWord = () => {
    if (!dictationCleanTarget) return;

    // Find current word index in the word list based on character count
    let charCount = 0;
    let wordFoundIndex = -1;

    for (let i = 0; i < dictationWords.length; i++) {
      const wLen = dictationWords[i].length;
      if (cursorIndex < charCount + wLen) {
        wordFoundIndex = i;
        break;
      }
      charCount += wLen;
    }

    if (wordFoundIndex !== -1) {
      // Advance cursor to the end of this word
      const charsInCurrentWord = dictationWords[wordFoundIndex].length;
      const startOfCurrentWord = charCount;
      setCursorIndex(startOfCurrentWord + charsInCurrentWord);
    } else if (cursorIndex < dictationCleanTarget.length) {
      // Edge case: if somehow between words or at end
      setCursorIndex(dictationCleanTarget.length);
    }
  };

  // Check completion
  useEffect(() => {
    if (dictationCleanTarget && cursorIndex === dictationCleanTarget.length && dictationCleanTarget.length > 0) {
      // Small delay to show the last letter filling in before "winning"
      setTimeout(() => setDictationStatus('review'), 500);
    }
  }, [cursorIndex, dictationCleanTarget]);


  useEffect(() => {
    return () => {
      if (currentAudioSourceRef.current) currentAudioSourceRef.current.stop();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 px-4">
      <header className="text-center">
        <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter mb-4">Listening Lab</h1>
        <p className="text-xl text-slate-500 font-medium">Train your ear with authentic American scenarios and dictation.</p>
      </header>

      {/* Lab Switcher */}
      <div className="flex justify-center mb-8">
        <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 inline-flex">
          <button
            onClick={() => { setActiveTab('simulator'); }}
            className={`px-6 py-3 rounded-xl font-black text-sm transition-all ${activeTab === 'simulator' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Scene Simulator
          </button>
          <button
            onClick={() => { setActiveTab('dictation'); }}
            className={`px-6 py-3 rounded-xl font-black text-sm transition-all ${activeTab === 'dictation' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Dictation Mastery
          </button>
        </div>
      </div>

      {/* ===================== DICTATION MASTERY TAB ===================== */}
      {activeTab === 'dictation' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
          {dictationStatus === 'idle' && (
            <div className="bg-white rounded-[3rem] p-12 text-center shadow-xl border border-slate-100 max-w-3xl mx-auto">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-600">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path></svg>
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-2">Dictation Challenge</h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto font-medium">Select your proficiency level, and I'll generate a unique audio challenge.</p>

              <div className="max-w-sm mx-auto mb-8">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-3">Proficiency Level</label>
                <select
                  value={dictationLevel}
                  onChange={(e) => setDictationLevel(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-lg outline-none focus:ring-4 focus:ring-indigo-100 appearance-none text-center cursor-pointer"
                >
                  {['A1', 'A2', 'B1', 'B2', 'C1'].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <button onClick={startNewDictation} className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all active:scale-95">Start Challenge</button>
            </div>
          )}

          {dictationStatus === 'loading' && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-6"></div>
              <p className="font-black text-indigo-600 uppercase tracking-widest animate-pulse">Designing {dictationLevel} Audio Script...</p>
            </div>
          )}

          {(dictationStatus === 'active' || dictationStatus === 'review') && dictationChallenge && (
            <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl border border-slate-100 space-y-10">
              {/* Header Info */}
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black uppercase text-slate-500 tracking-widest">{dictationChallenge.topic}</span>
                <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black uppercase text-slate-500 tracking-widest">{dictationChallenge.tone}</span>
                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest">{dictationLevel}</span>
              </div>

              {/* Audio Controls */}
              <div className="flex justify-center gap-4">
                <button onClick={() => playDictationAudio(false)} disabled={isPlayingDictation} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-xl ${isPlayingDictation ? 'bg-indigo-500 scale-110' : 'bg-indigo-600 hover:bg-indigo-700'} text-white`}>
                  {isPlayingDictation ? (
                    <div className="flex gap-1 h-6 items-end"><div className="w-1.5 bg-white h-full animate-bounce"></div><div className="w-1.5 bg-white h-2/3 animate-bounce delay-75"></div><div className="w-1.5 bg-white h-full animate-bounce delay-150"></div></div>
                  ) : (
                    <svg className="w-10 h-10 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
                <button onClick={() => playDictationAudio(true)} disabled={isPlayingDictation} className="w-20 h-20 rounded-full bg-amber-100 text-amber-600 flex flex-col items-center justify-center transition-all hover:bg-amber-200 font-black text-xs">
                  <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  0.75x
                </button>
              </div>

              {/* SQUARES UI INPUT AREA */}
              <div className="bg-slate-50 rounded-[2rem] p-8 border border-slate-200 min-h-[150px] flex flex-col justify-center">
                {dictationStatus === 'active' ? (
                  <div className="flex flex-wrap gap-y-6 gap-x-8 justify-center items-start content-start">
                    {(() => {
                      let globalCharIndex = 0;
                      return dictationWords.map((word, wordIndex) => (
                        <div key={wordIndex} className="flex gap-1.5">
                          {word.split('').map((char, charIndex) => {
                            const currentIndex = globalCharIndex;
                            globalCharIndex++;

                            const isCompleted = currentIndex < cursorIndex;
                            const isActive = currentIndex === cursorIndex;
                            const isError = shakeIndex === currentIndex;

                            return (
                              <input
                                key={`${wordIndex}-${charIndex}`}
                                ref={(el) => { inputRefs.current[currentIndex] = el; }}
                                type="text"
                                maxLength={1}
                                value={isCompleted ? char : ""} // Auto-fill if completed
                                readOnly={!isActive} // Only allow typing in active slot
                                onChange={(e) => handleCharInput(e, currentIndex, char)}
                                onKeyDown={(e) => {
                                  // Prevent backspace moving back for linear progression, or allow simple backspace? 
                                  // Prompt says "Linear progression", user cannot skip ahead. 
                                  // Usually strictly forward means strictly forward.
                                }}
                                className={`w-8 h-10 md:w-10 md:h-12 rounded-lg text-center font-black text-lg md:text-xl border-2 transition-all outline-none uppercase shadow-sm
                                        ${isError ? 'animate-[shake_0.4s_cubic-bezier(.36,.07,.19,.97)_both] border-red-500 bg-red-50 text-red-600' : ''}
                                        ${isCompleted ? 'bg-green-100 border-green-500 text-green-700' : ''}
                                        ${isActive ? 'bg-white border-indigo-600 ring-4 ring-indigo-100 text-slate-900 z-10 scale-110' : ''}
                                        ${!isActive && !isCompleted ? 'bg-white border-slate-200 text-transparent' : ''}
                                     `}
                              />
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className="text-center">
                    {isPlayingDictation && currentPlaybackWordIndex !== null ? (
                      <div className="text-2xl md:text-3xl font-black text-slate-900 mb-6 max-w-2xl mx-auto leading-relaxed flex flex-wrap justify-center gap-x-2 gap-y-3">
                        {dictationWords.map((word, i) => (
                          <span key={i} className={`transition-colors duration-100 ${i === currentPlaybackWordIndex ? 'bg-indigo-600 text-white px-2 rounded-lg scale-110 shadow-lg' : i < currentPlaybackWordIndex ? 'text-indigo-400' : 'text-slate-300'}`}>
                            {word}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="inline-block p-4 bg-green-100 rounded-full text-green-600 mb-4 animate-bounce">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Perfect Score!</h3>
                        <p className="text-slate-600 font-medium italic">"{dictationChallenge.script}"</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <style>
                {`
                  @keyframes shake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                  }
                `}
              </style>

              {/* Action Buttons */}
              <div className="flex flex-col md:flex-row gap-4 items-center">
                {dictationStatus === 'active' && (
                  <button
                    onClick={handleRevealNextWord}
                    className="px-6 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    Reveal Next Word
                  </button>
                )}
                {dictationStatus === 'review' && (
                  <button onClick={startNewDictation} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl">Next Challenge</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== SCENE SIMULATOR TAB ===================== */}
      {activeTab === 'simulator' && (
        <>
          {stage === 'selection' && (
            <div className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100 max-w-2xl mx-auto space-y-10">
              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest text-center block">Select Mastery Level</label>
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  {Object.values(ProficiencyLevel).map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setSelectedLevel(lvl)}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${selectedLevel === lvl ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200/50'}`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Describe any scenario</label>
                  <button onClick={handleSurpriseMe} className="text-xs font-black text-indigo-600 hover:underline">Surprise Me!</button>
                </div>
                <textarea
                  value={customScenario}
                  onChange={e => setCustomScenario(e.target.value)}
                  placeholder="e.g. Asking for a promotion in a high-rise office..."
                  className="w-full h-32 p-6 bg-slate-50 border border-slate-200 rounded-3xl font-medium text-lg outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-none"
                />
              </div>

              <button
                onClick={() => handleStartScene()}
                disabled={!customScenario.trim()}
                className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-xl hover:bg-indigo-600 shadow-xl transition-all disabled:opacity-50"
              >
                Generate Simulation
              </button>
            </div>
          )}

          {stage === 'generating' && (
            <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-8 text-center">
              <div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin shadow-2xl"></div>
              <div>
                <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Simulating Environment</h2>
                <p className="text-xl text-indigo-600 font-bold animate-pulse">{genStep}</p>
              </div>
            </div>
          )}

          {stage === 'simulation' && scene && (
            <div className="space-y-8 animate-in zoom-in-95 duration-500">
              <div className="relative rounded-[3rem] overflow-hidden shadow-2xl aspect-video bg-slate-900 border-8 border-white group">
                <img src={scene.imagePrompt} className="absolute inset-0 w-full h-full object-cover opacity-60 transition-transform duration-[10s] group-hover:scale-110" alt="Scene Context" />

                <div className="absolute inset-0 p-8 flex flex-col justify-end bg-gradient-to-t from-black/90 via-transparent to-transparent">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="bg-indigo-600 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Active Scene: {scene.title}</span>
                      <span className="bg-white/20 text-white backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Level: {selectedLevel}</span>
                    </div>
                    <p className="text-white/90 text-lg font-medium max-w-2xl">{scene.description}</p>
                  </div>
                </div>

                <div className="absolute top-8 right-8 flex gap-3">
                  <button
                    onClick={() => {
                      setMode(mode === 'watch' ? 'roleplay' : 'watch');
                      setAnalysis(null);
                      if (currentAudioSourceRef.current) currentAudioSourceRef.current.stop();
                      setPlayingIndex(null);
                    }}
                    className={`px-6 py-3 rounded-full font-black text-xs transition-all shadow-xl ${mode === 'roleplay' ? 'bg-amber-500 text-slate-900' : 'bg-white/20 text-white backdrop-blur-md hover:bg-white/40'}`}
                  >
                    {mode === 'roleplay' ? 'Roleplay: Active' : 'Enter Roleplay Mode'}
                  </button>
                  <button
                    onClick={() => setShowCoachOverlay(true)}
                    className="p-3 bg-white text-slate-900 rounded-full shadow-xl hover:bg-indigo-50 transition-all flex items-center justify-center"
                    title="Ask Coach about this Scene"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl space-y-10 relative">
                <div className="flex flex-col space-y-8">
                  {scene.script.map((p, idx) => {
                    const isCurrentlyPlaying = playingIndex === idx;

                    return (
                      <div
                        key={idx}
                        className={`flex flex-col gap-2 transition-all duration-300 ${isCurrentlyPlaying ? 'bg-indigo-50/50 p-4 -m-4 rounded-3xl border border-indigo-100 shadow-sm' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Speaker {p.speaker}</span>
                          {p.isNativeMoment && (
                            <button
                              onClick={() => setShowExplanation(showExplanation === idx ? null : idx)}
                              className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-full hover:bg-amber-200"
                            >
                              Linguistic Detail
                            </button>
                          )}
                        </div>
                        <div className="flex gap-4 items-start">
                          <button
                            onClick={() => playPartAudio(idx)}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all shadow-sm ${isCurrentlyPlaying ? 'bg-indigo-600 text-white shadow-indigo-200/50' : 'bg-slate-900 text-white hover:bg-indigo-500'}`}
                          >
                            {isCurrentlyPlaying ? (
                              <div className="flex gap-0.5 items-end h-6">
                                <div className="w-1 bg-white animate-[bounce_0.6s_infinite_alternate]"></div>
                                <div className="w-1 bg-white animate-[bounce_0.8s_infinite_alternate]"></div>
                                <div className="w-1 bg-white animate-[bounce_0.5s_infinite_alternate]"></div>
                              </div>
                            ) : (
                              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            )}
                          </button>
                          <div className="flex-1">
                            <p className={`text-xl md:text-3xl font-black leading-tight text-slate-900`}>
                              {p.text}
                            </p>
                            {showExplanation === idx && (
                              <div className="mt-4 p-5 bg-amber-50 rounded-2xl border border-amber-100 animate-in slide-in-from-top-2">
                                <h5 className="text-[10px] font-black text-amber-600 uppercase mb-1">Nuance Breakdown</h5>
                                <p className="text-sm text-amber-900 font-bold italic">"{p.momentExplanation}"</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {mode === 'roleplay' && (
                          <div className="ml-16 mt-4 p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 animate-in fade-in">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex-1">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Interactive Practice</h4>
                                <p className="text-slate-600 text-sm font-medium">Record this specific line.</p>
                              </div>
                              {isRecording && currentPartIndex === idx ? (
                                <button onClick={stopRecording} className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center animate-pulse shadow-xl shadow-red-200">
                                  <div className="w-4 h-4 bg-white rounded-sm"></div>
                                </button>
                              ) : (
                                <button onClick={() => startRecording(idx)} className="w-12 h-12 bg-slate-900 text-white rounded-full flex items-center justify-center hover:bg-indigo-600 transition-all shadow-md">
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
                                </button>
                              )}
                            </div>

                            {isAnalyzing && currentPartIndex === idx && (
                              <div className="mt-4 text-[10px] font-black text-indigo-600 animate-pulse flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                Pinpointing Word-Level Errors...
                              </div>
                            )}

                            {analysis && currentPartIndex === idx && (
                              <div className="mt-6 p-8 bg-white rounded-3xl shadow-xl border border-slate-100 space-y-6 animate-in slide-in-from-bottom-2">
                                <div className="flex items-center justify-between border-b pb-4">
                                  <div className="flex items-center gap-4">
                                    <div className="text-5xl font-black text-indigo-600 leading-none">{analysis.score}%</div>
                                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none">Accuracy<br />Score</div>
                                  </div>
                                  {analysis.score > 85 && <div className="text-3xl">🎯</div>}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div>
                                    <h5 className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">Missed Words</h5>
                                    <div className="flex flex-wrap gap-2">
                                      {analysis.missed_words.length > 0 ? (
                                        analysis.missed_words.map((w, i) => (
                                          <span key={i} className="px-3 py-1 bg-red-50 text-red-700 rounded-lg text-sm font-bold border border-red-100">{w}</span>
                                        ))
                                      ) : (
                                        <span className="text-sm text-green-600 font-bold">Perfect word accuracy!</span>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <h5 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3">Linking Notes</h5>
                                    <div className="space-y-2">
                                      {analysis.linking_notes.length > 0 ? (
                                        analysis.linking_notes.map((n, i) => (
                                          <div key={i} className="text-sm text-slate-700 font-medium flex items-start gap-2 italic">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0"></div>
                                            "{n}"
                                          </div>
                                        ))
                                      ) : (
                                        <span className="text-sm text-green-600 font-bold">Natural linking detected.</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                  <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Improvement Tip</h5>
                                  <p className="text-slate-800 text-sm font-bold leading-relaxed italic">"{analysis.improvement_tip}"</p>
                                </div>

                                <div className="flex gap-4 pt-2">
                                  <button onClick={() => { setAnalysis(null); }} className="flex-1 py-3 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600 transition-colors">Dismiss</button>
                                  <button onClick={() => { setAnalysis(null); if (currentPartIndex < scene.script.length - 1) setCurrentPartIndex(currentPartIndex + 1); }} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-md transition-all active:scale-95">Proceed</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-10 border-t flex flex-col md:flex-row gap-4">
                  <button
                    onClick={() => {
                      if (currentAudioSourceRef.current) currentAudioSourceRef.current.stop();
                      setStage('selection');
                    }}
                    className="flex-1 py-6 bg-slate-900 text-white rounded-3xl font-black text-lg hover:bg-indigo-600 shadow-xl active:scale-95 transition-all"
                  >
                    Reset & New Scenario
                  </button>
                  <button
                    onClick={() => {
                      if (currentAudioSourceRef.current) currentAudioSourceRef.current.stop();
                      setStage('selection');
                    }}
                    className="px-10 py-6 text-slate-400 font-black hover:text-slate-900 transition-all"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Contextual Coach Overlay (Existing for Simulator) */}
      {showCoachOverlay && scene && activeTab === 'simulator' && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="p-10 bg-indigo-600 text-white relative">
              <button onClick={() => { setShowCoachOverlay(false); setCoachResponse(null); }} className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
              <h3 className="text-2xl font-black tracking-tight mb-2">Scene Context Coach</h3>
              <p className="text-indigo-100 text-sm font-medium opacity-80">Ask me anything about the dialogue or cultural subtext in this scene.</p>
            </div>

            <div className="p-10 space-y-8 flex-1 overflow-y-auto min-h-[15rem]">
              {coachResponse ? (
                <div className="animate-in fade-in slide-in-from-bottom-4">
                  <p className="text-slate-900 text-xl font-bold italic leading-relaxed">"{coachResponse}"</p>
                  <button onClick={() => setCoachResponse(null)} className="mt-8 text-indigo-600 font-black text-xs uppercase tracking-widest hover:underline">Ask another question</button>
                </div>
              ) : isCoaching ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-indigo-600 font-black text-xs uppercase tracking-widest animate-pulse">Consulting Native Context...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Recommended Questions</p>
                  <div className="grid grid-cols-1 gap-3">
                    {["Why did they use that specific phrasal verb?", "What is the cultural subtext here?", "Is this formal or informal?", "How should I pronounce the reductions in line 3?"].map(q => (
                      <button
                        key={q}
                        onClick={() => askCoachAboutScene(q)}
                        className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left text-sm font-bold text-slate-700 hover:border-indigo-400 hover:bg-white transition-all shadow-sm"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="pt-4">
                    <input
                      type="text"
                      placeholder="Type your own question..."
                      className="w-full p-4 bg-slate-100 rounded-2xl border-none outline-none focus:ring-2 focus:ring-indigo-600 font-bold"
                      onKeyDown={e => {
                        if (e.key === 'Enter') askCoachAboutScene((e.target as HTMLInputElement).value);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 border-t bg-slate-50">
              <button onClick={() => setShowCoachOverlay(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl">Close Coach</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListeningLab;
