import React, { useState, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { blobToBase64, decode, decodeAudioData } from '../services/audioUtils';
import { ChatMessage, AnalysisResult } from '../types';

const COACH_MODEL = "gemini-3-flash-preview";

interface VoiceAskOverlayProps {
  selectedText: string;
  context: string;
  analysis?: AnalysisResult | null;
  onClose: () => void;
}

const VoiceAskOverlay: React.FC<VoiceAskOverlayProps> = ({ selectedText, context, analysis, onClose }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState("");
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize AudioContext lazily but keep it alive to prevent clipping/latency
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      // Create context with standard sample rate for high quality
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    // Always resume suspended context to prevent "first click" lag or cut-off start
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  /**
   * Step 2: Synthesize the generated text into audio using the dedicated TTS model
   */
  const synthesizeAndPlay = async (text: string) => {
    setIsSpeaking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Use the dedicated TTS model which guarantees Audio output support
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        const ctx = getAudioContext();
        const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error("Speech synthesis failed:", err);
      setIsSpeaking(false);
    }
  };

  const handleQuery = async (input: { text?: string; audioBase64?: string; mimeType?: string }) => {
    setIsProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const systemInstruction = `
      You are a fast, direct American English Coach.
      CONTEXT: "${context}"
      FOCUS: "${selectedText}"
      ${analysis ? `USER ISSUES: ${JSON.stringify(analysis.phonemeIssues)}` : ''}
      
      RULES:
      1. Answer ONLY the specific question asked. 
      2. Be extremely concise (maximum 2 sentences).
      3. Do NOT use filler words like "Sure", "Okay", "I can help", "Great question".
      4. Start your answer immediately.
      5. Demonstrate correct pronunciation naturally if relevant.
      `;

      const contents = input.audioBase64 
        ? [
            { inlineData: { mimeType: input.mimeType || 'audio/webm', data: input.audioBase64 } }, 
            { text: "Answer this question about the context." }
          ]
        : [{ text: input.text || "" }];

      // Step 1: Generate Text Response
      // STRICT MODEL USAGE: gemini-3-flash-preview (replaced failing gemini-1.5-flash)
      const response = await ai.models.generateContent({
        model: COACH_MODEL,
        contents,
        config: { 
          systemInstruction,
          temperature: 0.7
        }
      });

      const coachText = response.text || "I'm ready to help you improve.";
      setHistory(prev => [...prev, { role: 'model', text: coachText }]);

      // Step 2: Convert to Audio
      await synthesizeAndPlay(coachText);

    } catch (err: any) {
      console.error("Coach Interaction Error:", err);
      alert(err.message);
      setHistory(prev => [...prev, { role: 'model', text: "I had a connection issue. Let's try that again." }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Voice Input Logic ---
  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true,
          latency: 0
        } as any
      });
      
      const recorder = new MediaRecorder(stream);
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const b64 = await blobToBase64(blob);
        handleQuery({ audioBase64: b64, mimeType });
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access is required for voice coaching.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTextSubmit = () => {
    if (!textInput.trim() || isProcessing) return;
    const text = textInput;
    setTextInput("");
    setHistory(prev => [...prev, { role: 'user', text }]);
    handleQuery({ text });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[130] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-indigo-600 p-8 text-white text-center relative shrink-0">
          <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
          
          <div className="flex justify-center mb-4">
            <div className={`w-20 h-20 rounded-full bg-white flex items-center justify-center transition-all duration-300 ${isSpeaking ? 'scale-110 ring-4 ring-white/30' : ''}`}>
              {isSpeaking ? (
                 <div className="flex gap-1 h-8 items-center">
                    <div className="w-1.5 bg-indigo-600 h-full animate-[bounce_1s_infinite]"></div>
                    <div className="w-1.5 bg-indigo-600 h-2/3 animate-[bounce_1s_infinite_0.2s]"></div>
                    <div className="w-1.5 bg-indigo-600 h-full animate-[bounce_1s_infinite_0.4s]"></div>
                 </div>
              ) : (
                <svg className="w-10 h-10 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
                   <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              )}
            </div>
          </div>
          <h2 className="text-xl font-black">AI Coach</h2>
          <p className="text-indigo-100/70 text-xs font-bold uppercase tracking-widest mt-1 truncate px-8">
            Focus: {selectedText}
          </p>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 scroll-smooth">
          {history.length === 0 && !isProcessing && (
            <div className="text-center py-10">
              <p className="text-slate-400 font-medium">Hold the button to practice pronunciation<br/>or ask about grammar.</p>
            </div>
          )}
          <div className="space-y-4">
            {history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-2xl max-w-[85%] text-sm font-medium shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-center gap-2 text-indigo-600 animate-pulse mt-2">
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-150"></div>
                <span className="text-[10px] font-black uppercase tracking-widest ml-1">Thinking...</span>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="p-6 border-t bg-white space-y-4">
          <button 
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => isRecording && stopRecording()}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            disabled={isProcessing || isSpeaking}
            className={`w-full py-5 rounded-[2rem] font-black text-lg transition-all flex items-center justify-center gap-4 shadow-xl select-none active:scale-95 ${isRecording ? 'bg-red-600 text-white animate-pulse' : isProcessing ? 'bg-slate-200 text-slate-400 cursor-wait' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}
          >
            {isRecording ? "Listening..." : isProcessing ? "Coach is Thinking..." : "Hold to Speak"}
          </button>
          
          <div className="relative">
            <input 
              value={textInput} 
              onChange={e => setTextInput(e.target.value)} 
              onKeyPress={e => e.key === 'Enter' && handleTextSubmit()}
              placeholder="Or type your question..." 
              className="w-full p-4 bg-slate-100 rounded-2xl pr-12 outline-none focus:ring-2 focus:ring-indigo-600 text-sm font-medium transition-shadow" 
            />
            <button onClick={handleTextSubmit} className="absolute right-3 top-3 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceAskOverlay;