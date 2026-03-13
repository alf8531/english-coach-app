
import React, { useState, useEffect, useRef } from 'react';
import { ProficiencyLevel, TextSample, AnalysisResult, VocabItem, ChatMessage, HighlightedPhrase } from './types';
import { generateTextSampleStream, processCustomText, analyzeReading, chatWithThinking, generateNativeAudio, translateText, searchWeb } from './services/geminiService';
import { blobToBase64, stopGlobalAudio } from './services/audioUtils';
import AnalysisView from './components/AnalysisView';
import LiveCoach from './components/LiveCoach';
import FlashcardsView from './components/FlashcardsView';
import SelectionMenu from './components/SelectionMenu';
import VoiceAskOverlay from './components/VoiceAskOverlay';
import ListeningLab from './components/ListeningLab';
import WritingWorkshop from './components/WritingWorkshop';
import DeepChat from './components/DeepChat';
import YouTubeShadowing from './components/YouTubeShadowing';
import DetectiveStories from './components/DetectiveStories';
import { HealthCheck } from './components/HealthCheck';

const TOPICS = ["Business", "Lifestyle", "Personal Growth", "Nature & Science", "Custom Topic"];
const FORMATS = ["Article", "Podcast Script", "Video Script", "Book Chapter", "Song Lyrics", "Custom Format"];

const App: React.FC = () => {
  const [view, setView] = useState<'library' | 'practice' | 'analysis' | 'quiz' | 'flashcards' | 'chat' | 'listening' | 'writing' | 'deepchat' | 'youtube' | 'stories' | 'storycms'>('library');
  const [level, setLevel] = useState<ProficiencyLevel>(ProficiencyLevel.Intermediate);
  const [topic, setTopic] = useState("Lifestyle");
  const [customTopic, setCustomTopic] = useState("");
  const [format, setFormat] = useState("Article");
  const [customFormat, setCustomFormat] = useState("");
  const [generationMode, setGenerationMode] = useState<'ai' | 'custom'>('ai');
  const [customContent, setCustomContent] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [currentSample, setCurrentSample] = useState<TextSample | null>(null);
  const [deck, setDeck] = useState<VocabItem[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  const [userAudioBase64, setUserAudioBase64] = useState<string | null>(null);
  const [userAudioMimeType, setUserAudioMimeType] = useState<string>('audio/webm');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showLiveCoach, setShowLiveCoach] = useState(false);
  const [voiceAskData, setVoiceAskData] = useState<{ text: string } | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const [activeTooltip, setActiveTooltip] = useState<{
    phrase: HighlightedPhrase;
    x: number;
    y: number;
    sentence: string;
    placement: 'top' | 'bottom';
  } | null>(null);
  const [isTooltipAudioPlaying, setIsTooltipAudioPlaying] = useState(false);
  const [isSlowMode, setIsSlowMode] = useState(false);

  // New Structured Translation State
  const [translationResult, setTranslationResult] = useState<{ englishDefinition: string, synonyms: string, spanishTranslation: string, original: string } | null>(null);
  const [searchResult, setSearchResult] = useState<{ text: string, original: string, sources: any[] } | null>(null);

  const mainContainerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const savedDeck = localStorage.getItem('fluency_lab_deck_v5');
    if (savedDeck) setDeck(JSON.parse(savedDeck));
  }, []);

  useEffect(() => {
    localStorage.setItem('fluency_lab_deck_v5', JSON.stringify(deck));
  }, [deck]);

  // Wrapper for view navigation to handle audio cleanup
  const handleNavigate = (newView: typeof view) => {
    stopGlobalAudio(); // Stop any TTS or playing audio
    setView(newView);
    setIsSidebarOpen(false);
  };

  const handleGenerate = async () => {
    if (generationMode === 'ai' && isSelectionInvalid) return;
    if (generationMode === 'custom' && !customContent.trim()) return;

    setIsGenerating(true);
    setAiError(null);
    setCurrentSample(null); // Clear previous to prevent stale render

    try {
      let sample;
      if (generationMode === 'ai') {
        const finalTopic = topic === "Custom Topic" ? customTopic : topic;
        const finalFormat = format === "Custom Format" ? customFormat : format;
        sample = await generateTextSampleStream(level, finalTopic, finalFormat);
      } else {
        sample = await processCustomText(customContent);
      }

      if (sample && sample.content) {
        setCurrentSample(sample);
        setView('practice');
        setIsSidebarOpen(false);
      } else {
        throw new Error("The AI didn't return a valid text sample. Please try again.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Failed to generate content. Please check your connection and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        // Dynamic MIME type detection
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });

        setUserAudioUrl(URL.createObjectURL(blob));
        setUserAudioBase64(await blobToBase64(blob));
        setUserAudioMimeType(mimeType);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) { alert("Microphone access is required."); }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleAnalysis = async () => {
    if (!currentSample || !userAudioBase64) return;
    setAiError(null);
    setIsAnalyzing(true);
    setView('analysis');

    try {
      // Correctly passing the captured MIME type
      const result = await analyzeReading(currentSample.content, userAudioBase64, userAudioMimeType);
      setAnalysisResult(result);
    } catch (e: any) {
      console.error("Analysis Error", e);
      // Alert explicit error message
      alert(`Analysis Failed: ${e.message}`);
      setAiError(`Analysis failed: ${e.message}`);
      setView('practice');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setAiLoading(true);
    try {
      const res = await chatWithThinking(userMsg, chatHistory);
      setChatHistory(prev => [...prev, { role: 'model', text: res.text, thought: res.thought }]);
    } finally { setAiLoading(false); }
  };

  const handleTranslate = async (text: string) => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await translateText(text, currentSample?.content || "General conversation context");
      setTranslationResult({ ...res, original: text });
    } catch (err: any) {
      setAiError("Translation failed. Please try again.");
    } finally { setAiLoading(false); }
  };

  const handleSearch = async (text: string) => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await searchWeb(text);
      setSearchResult({ text: res.text, original: text, sources: res.sources });
    } catch (err: any) {
      setAiError("Search failed. Please try again.");
    } finally { setAiLoading(false); }
  };

  const handleSaveToDeckFromTooltip = (phrase: HighlightedPhrase, sentence: string) => {
    const newItem: VocabItem = {
      id: Math.random().toString(36).substr(2, 9),
      word: phrase.phrase,
      phonetic: phrase.phonetic,
      definition: phrase.definition,
      example: sentence || phrase.example,
      dateAdded: Date.now(),
      nextReviewAt: 0,
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      srsLevel: 'new'
    };
    setDeck(prev => prev.some(item => item.word.toLowerCase() === phrase.phrase.toLowerCase()) ? prev : [newItem, ...prev]);
    setActiveTooltip(null);
  };

  const playWordAudio = async (word: string, slow: boolean = false) => {
    if (isTooltipAudioPlaying) return;
    setIsTooltipAudioPlaying(true);
    try {
      const buffer = await generateNativeAudio(word);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      if (slow) source.playbackRate.value = 0.75;
      source.connect(ctx.destination);
      source.onended = () => setIsTooltipAudioPlaying(false);
      source.start(0);
    } catch (e) { setIsTooltipAudioPlaying(false); }
  };

  const playPronunciation = (text: string) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const voice = voices.find(v => v.lang === 'en-US')
        || voices.find(v => v.lang === 'en-GB')
        || voices.find(v => v.lang.includes('en'));
      if (voice) utterance.voice = voice;
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      synth.speak(utterance);
    };
    if (synth.getVoices().length > 0) {
      speak();
    } else {
      const onVoicesChanged = () => {
        speak();
        synth.removeEventListener('voiceschanged', onVoicesChanged);
      };
      synth.addEventListener('voiceschanged', onVoicesChanged);
    }
  };

  const updateSRS = (id: string, level: 'new' | 'learning' | 'review' | 'mastered') => {
    setDeck(prev => prev.map(item => item.id === id ? { ...item, srsLevel: level } : item));
  };

  const renderTextWithHighlights = () => {
    if (!currentSample) return null;
    let content = currentSample.content;
    const phraseList = currentSample.highlightedPhrases || [];
    const phrases = [...phraseList].sort((a, b) => b.phrase.length - a.phrase.length);

    if (phrases.length === 0) return content;

    const regexStr = phrases.map(p => p.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${regexStr})`, 'gi');
    const splitContent = content.split(regex);

    return splitContent.map((part, idx) => {
      const matchedPhrase = phrases.find(p => p.phrase.toLowerCase() === part.toLowerCase());
      if (matchedPhrase) {
        return (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              if (!mainContainerRef.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const containerRect = mainContainerRef.current.getBoundingClientRect();
              const tooltipWidth = Math.min(340, window.innerWidth - 40);
              const tooltipHeight = 260;
              const margin = 20;
              let placement: 'top' | 'bottom' = 'top';
              if (rect.top < tooltipHeight + margin) { placement = 'bottom'; }
              let x = rect.left - containerRect.left + rect.width / 2;
              let y = (placement === 'top') ? (rect.top - containerRect.top - 12) : (rect.bottom - containerRect.top + 12);
              const halfWidth = tooltipWidth / 2;
              const availableWidth = window.innerWidth - (window.innerWidth >= 768 ? 256 : 0);
              const clampedX = Math.max(halfWidth + margin, Math.min(x, availableWidth - halfWidth - margin));
              const sentences = content.split(/[.!?]\s+/);
              const containingSentence = sentences.find(s => s.toLowerCase().includes(part.toLowerCase())) || content;
              setActiveTooltip({ phrase: matchedPhrase, x: clampedX, y, sentence: containingSentence, placement });
            }}
            className="bg-indigo-100/60 hover:bg-indigo-200 text-indigo-900 px-1 py-0.5 rounded-md font-semibold transition-colors cursor-pointer"
          >
            {part}
          </button>
        );
      }
      return part;
    });
  };

  const isSelectionInvalid = (topic === "Custom Topic" && !customTopic.trim()) || (format === "Custom Format" && !customFormat.trim());

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row" onClick={() => setActiveTooltip(null)}>
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">FL</div>
          <span className="font-black text-lg tracking-tight">FluencyLab</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); setIsSidebarOpen(!isSidebarOpen); }} className="p-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={isSidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16m-7 6h7"}></path></svg>
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:flex md:flex-col`}>
        <div className="p-8 hidden md:flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 font-black">FL</div>
          <span className="font-black text-xl tracking-tight tracking-tight">FluencyLab</span>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4 md:mt-0 overflow-y-auto">
          <button onClick={() => handleNavigate('library')} className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${view === 'library' || view === 'practice' || view === 'analysis' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800 text-slate-400 font-bold'}`}>Reading Lab</button>
          <button onClick={() => handleNavigate('deepchat')} className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${view === 'deepchat' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800 text-slate-400 font-bold'}`}>Deep Chat <span className="text-[10px] bg-amber-500 text-slate-900 px-1.5 py-0.5 rounded font-black uppercase">New</span></button>
          <button onClick={() => handleNavigate('listening')} className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${view === 'listening' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800 text-slate-400 font-bold'}`}>Scene Simulator</button>
          <button onClick={() => handleNavigate('stories')} className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${view === 'stories' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800 text-slate-400 font-bold'}`}>Detective Stories</button>
          <button onClick={() => handleNavigate('youtube')} className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${view === 'youtube' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800 text-slate-400 font-bold'}`}>YouTube Player <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-black uppercase">V3</span></button>
          <button onClick={() => handleNavigate('writing')} className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${view === 'writing' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800 text-slate-400 font-bold'}`}>Writing Workshop</button>
          <button onClick={() => handleNavigate('flashcards')} className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${view === 'flashcards' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800 text-slate-400 font-bold'}`}>Vocab Bank ({deck.length})</button>
          {/* Story CMS — admin-only, accessed via ?admin=cms URL param */}
          <button onClick={() => handleNavigate('chat')} className={`w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${view === 'chat' ? 'bg-indigo-600 shadow-lg' : 'hover:bg-slate-800 text-slate-400 font-bold'}`}>Deep Think Text</button>
        </nav>
        <div className="p-6 border-t border-slate-800 mt-auto">
          <button onClick={() => { setShowLiveCoach(true); setIsSidebarOpen(false); stopGlobalAudio(); }} className="w-full py-4 bg-amber-500 rounded-2xl text-slate-900 font-black hover:bg-amber-400 shadow-lg active:scale-95 transition-all">Live Voice Coach</button>
        </div>
      </aside>

      {/* Main Content */}
      <main ref={mainContainerRef} className="flex-1 p-4 md:p-12 min-h-screen relative overflow-x-hidden">
        <SelectionMenu
          onTranslate={handleTranslate}
          onAskCoach={t => setVoiceAskData({ text: t })}
          onAddToDeck={(t) => handleSaveToDeckFromTooltip({ phrase: t, phonetic: '...', definition: 'User selected', example: '' }, '')}
          onSearch={handleSearch}
        />

        {aiError && (
          <div className="max-w-4xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-red-800 animate-in slide-in-from-top-2">
            <span className="font-bold flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
              {aiError}
            </span>
            <button onClick={() => setAiError(null)} className="text-red-400 hover:text-red-600 font-black">Dismiss</button>
          </div>
        )}

        {view === 'library' && (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-500">
            <header className="text-center">
              <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter mb-4">Reading Lab</h1>
              <p className="text-xl text-slate-500 font-medium">Generate native-level reading challenges tailored to you.</p>
            </header>

            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl space-y-10 border border-slate-100">
              <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mx-auto border border-slate-200">
                <button onClick={() => setGenerationMode('ai')} className={`px-8 py-3 rounded-[1rem] font-bold text-sm transition-all ${generationMode === 'ai' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>AI Generator</button>
                <button onClick={() => setGenerationMode('custom')} className={`px-8 py-3 rounded-[1rem] font-bold text-sm transition-all ${generationMode === 'custom' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Custom Text</button>
              </div>

              {generationMode === 'ai' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Level</label>
                    <select value={level} onChange={e => setLevel(e.target.value as ProficiencyLevel)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:ring-4 focus:ring-indigo-100 appearance-none">
                      {Object.values(ProficiencyLevel).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Topic</label>
                    <select value={topic} onChange={e => setTopic(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:ring-4 focus:ring-indigo-100">
                      {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {topic === "Custom Topic" && <input value={customTopic} onChange={e => setCustomTopic(e.target.value)} placeholder="Type a topic..." className="w-full p-4 mt-2 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-indigo-100" />}
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Format</label>
                    <select value={format} onChange={e => setFormat(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none focus:ring-4 focus:ring-indigo-100">
                      {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    {format === "Custom Format" && <input value={customFormat} onChange={e => setCustomFormat(e.target.value)} placeholder="Type a format..." className="w-full p-4 mt-2 bg-white border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-indigo-100" />}
                  </div>
                </div>
              ) : (
                <textarea value={customContent} onChange={e => setCustomContent(e.target.value)} placeholder="Paste your practice text here..." className="w-full h-64 p-8 bg-slate-50 border border-slate-200 rounded-3xl font-medium text-lg outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-none" />
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating || (generationMode === 'ai' ? isSelectionInvalid : !customContent.trim())}
                className="w-full py-8 bg-slate-900 text-white rounded-3xl font-black text-2xl hover:bg-indigo-600 shadow-xl transition-all disabled:opacity-50 active:scale-95"
              >
                {isGenerating ? "Preparing Lab..." : "Generate Session"}
              </button>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in">
            <div className="w-20 h-20 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mb-6"></div>
            <p className="text-2xl font-black text-indigo-600 animate-pulse uppercase tracking-widest">Consulting Fluency Engine...</p>
          </div>
        )}

        {view === 'practice' && currentSample && !isGenerating && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
            <div className="bg-white rounded-[3rem] p-10 md:p-16 shadow-2xl relative border border-slate-100">
              <div className="flex justify-between items-center mb-10 border-b pb-8">
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{currentSample.title}</h2>
                <button onClick={async () => { setAiLoading(true); try { await playWordAudio(currentSample.content); } finally { setAiLoading(false); } }} className="p-4 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all font-black flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                  Hear Coach
                </button>
              </div>
              <div className="text-2xl md:text-3xl leading-[1.6] text-slate-700 select-text font-medium relative whitespace-pre-wrap">{renderTextWithHighlights()}</div>
              <div className="mt-20 flex flex-col items-center pt-16 border-t">
                {isRecording ? (
                  <button onClick={stopRecording} className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center shadow-2xl animate-pulse ring-8 ring-red-50"><div className="w-8 h-8 bg-white rounded-sm"></div></button>
                ) : (
                  <button onClick={startRecording} className="w-full py-8 bg-slate-900 text-white rounded-3xl font-black text-2xl hover:bg-indigo-600 transition-all shadow-xl">Record Your Reading</button>
                )}
                {userAudioUrl && !isRecording && (
                  <div className="w-full mt-10 space-y-6">
                    <audio src={userAudioUrl} controls className="w-full rounded-2xl" />
                    <button onClick={handleAnalysis} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black text-xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95">Analyze My Performance</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'analysis' && currentSample && <AnalysisView result={analysisResult} isLoading={isAnalyzing} targetSample={currentSample} userAudioUrl={userAudioUrl} onRetry={() => { setView('practice'); setUserAudioUrl(null); }} onNew={() => setView('library')} onHearCoach={() => setShowLiveCoach(true)} onAskCoach={() => setVoiceAskData({ text: currentSample.title })} onSaveTerm={t => handleSaveToDeckFromTooltip(t, '')} />}
        {view === 'listening' && <ListeningLab />}
        {view === 'writing' && <WritingWorkshop />}
        {view === 'flashcards' && <FlashcardsView deck={deck} onUpdateSRS={updateSRS} />}
        {view === 'deepchat' && <DeepChat onBack={() => handleNavigate('library')} />}
        {view === 'youtube' && <YouTubeShadowing onBack={() => handleNavigate('library')} accentPreference="US" />}
        {view === 'stories' && <DetectiveStories onBack={() => handleNavigate('library')} userLevel={level} onSaveVocab={(word, definition, example) => {
          const newItem: VocabItem = {
            id: Math.random().toString(36).substr(2, 9),
            word, phonetic: '', definition, example,
            dateAdded: Date.now(), nextReviewAt: 0, interval: 0, easeFactor: 2.5, repetitions: 0, srsLevel: 'new'
          };
          setDeck(prev => prev.some(item => item.word.toLowerCase() === word.toLowerCase()) ? prev : [newItem, ...prev]);
        }} />}

        {view === 'chat' && (
          <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50/30">
              {chatHistory.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 text-slate-400">
                  <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center text-indigo-500 mb-6"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg></div>
                  <h3 className="text-2xl font-black text-slate-800 mb-2">Deep Think Coach (Text)</h3>
                  <p className="font-medium max-w-sm">Ask complex linguistic questions. The coach will use deep reasoning to provide detailed answers.</p>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.thought && (
                    <details className="mb-2 text-[10px] font-black uppercase text-indigo-400 opacity-60 cursor-pointer hover:opacity-100 transition-opacity">
                      <summary>View Reasoning Process</summary>
                      <div className="p-4 mt-2 bg-indigo-50/50 rounded-xl border border-indigo-100 normal-case font-medium">{msg.thought}</div>
                    </details>
                  )}
                  <div className={`max-w-[85%] p-6 rounded-[2rem] text-lg font-medium shadow-sm border ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border-slate-200'}`}>{msg.text}</div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex flex-col items-start">
                  <div className="p-6 bg-white border border-slate-200 rounded-[2rem] rounded-tl-none animate-pulse flex items-center gap-4">
                    <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-black text-indigo-600 text-xs uppercase tracking-widest">Coach is Thinking...</span>
                  </div>
                </div>
              )}
            </div>
            <div className="p-8 border-t bg-white flex gap-4">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleChat()} placeholder="Ask anything about American English..." className="flex-1 bg-slate-100 rounded-2xl px-8 py-5 outline-none focus:ring-4 focus:ring-indigo-600/10 text-lg font-medium" />
              <button onClick={handleChat} disabled={aiLoading} className="bg-slate-900 text-white p-5 rounded-[1.5rem] hover:bg-indigo-600 shadow-xl transition-all active:scale-90"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg></button>
            </div>
          </div>
        )}

        {/* Highlight Tooltip */}
        {activeTooltip && (
          <div className="absolute z-[120] bg-white text-slate-900 p-8 rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.3)] w-[340px] animate-in fade-in zoom-in-95 duration-200 border border-slate-100 origin-center" style={{ left: activeTooltip.x, top: activeTooltip.y, transform: `translateX(-50%) ${activeTooltip.placement === 'top' ? 'translateY(-100%)' : 'translateY(0%)'}` }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveTooltip(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-2"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            <div className="flex justify-between items-start mb-4 pr-6">
              <h4 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{activeTooltip.phrase.phrase}</h4>
              <div className="flex items-center gap-2">
                <button onClick={e => { e.stopPropagation(); setIsSlowMode(!isSlowMode); }} className={`text-[9px] px-2 py-0.5 rounded-full font-black border ${isSlowMode ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>0.75x</button>
                <button onClick={e => { e.stopPropagation(); playWordAudio(activeTooltip.phrase.phrase, isSlowMode); }} disabled={isTooltipAudioPlaying} className={`p-2 rounded-full ${isTooltipAudioPlaying ? 'bg-indigo-600 text-white animate-pulse' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg></button>
              </div>
            </div>
            <p className="text-indigo-600 font-black mb-4 text-sm tracking-widest uppercase">{activeTooltip.phrase.phoneticSpelling}</p>
            <div className="w-full h-px bg-slate-100 mb-6" />
            <p className="text-base text-slate-600 leading-relaxed italic mb-8 font-medium">"{activeTooltip.phrase.definition}"</p>
            <button onClick={() => handleSaveToDeckFromTooltip(activeTooltip.phrase, activeTooltip.sentence)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-indigo-600 shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>Add to Bank</button>
          </div>
        )}
      </main>

      {/* Overlays */}
      {showLiveCoach && analysisResult && <LiveCoach analysis={analysisResult} onClose={() => setShowLiveCoach(false)} />}
      {voiceAskData && <VoiceAskOverlay selectedText={voiceAskData.text} context={currentSample?.content || ""} analysis={analysisResult} onClose={() => setVoiceAskData(null)} />}

      {translationResult && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setTranslationResult(null)}>
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 md:p-10 shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header / Original Term */}
            <div className="text-center mb-8">
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Translation & Context</p>
              <div className="flex items-center justify-center gap-3">
                <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">"{translationResult.original}"</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playPronunciation(translationResult.original);
                  }}
                  className="p-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-all"
                  title="Listen"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                </button>
              </div>
            </div>

            {/* English Definition */}
            <div className="mb-6">
              <p className="text-xl font-bold text-slate-800 leading-relaxed text-center">
                {translationResult.englishDefinition}
              </p>
              <p className="text-center text-slate-500 font-medium mt-2">
                {translationResult.synonyms}
              </p>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-slate-100 my-6"></div>

            {/* Spanish Translation */}
            <div className="text-center">
              <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black uppercase tracking-widest mb-3">
                🇪🇸 Spanish
              </span>
              <p className="text-2xl font-bold text-slate-900">
                {translationResult.spanishTranslation}
              </p>
            </div>

            <button onClick={() => setTranslationResult(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black mt-8 text-lg shadow-xl active:scale-95 transition-all hover:bg-indigo-600">Got it!</button>
          </div>
        </div>
      )}

      {searchResult && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setSearchResult(null)}>
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-12 shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Google Search Grounding</p>
            <h3 className="text-2xl font-black mb-6 text-slate-900 leading-tight">"{searchResult.original}"</h3>
            <div className="overflow-y-auto flex-1 mb-8 pr-2 text-slate-700 leading-relaxed text-lg font-medium">{searchResult.text}</div>
            {searchResult.sources && searchResult.sources.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Sources</p>
                <div className="flex flex-col gap-2">
                  {searchResult.sources.map((chunk, idx) => chunk.web && (
                    <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-2">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                      {chunk.web.title || chunk.web.uri}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setSearchResult(null)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg mt-6 active:scale-95 transition-all">Close</button>
          </div>
        </div>
      )}

      {aiLoading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[200] flex items-center justify-center animate-in fade-in">
          <div className="flex flex-col items-center gap-6 p-10 text-center">
            <div className="w-20 h-20 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-black text-indigo-600 text-2xl tracking-tight">AI Coach Processing...</p>
          </div>
        </div>
      )}
      <HealthCheck />
    </div>
  );
};

export default App;
