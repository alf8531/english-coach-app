
import React, { useEffect, useState, useRef } from 'react';
import { AnalysisResult } from '../types';
import { generateCoachSummaryAudio } from '../services/geminiService';

interface LiveCoachProps {
  analysis: AnalysisResult;
  onClose: () => void;
}

const LiveCoach: React.FC<LiveCoachProps> = ({ analysis, onClose }) => {
  const [transcript, setTranscript] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Handle Escape key dismissal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const fetchAndPlay = async () => {
      try {
        const { audio, transcript: text } = await generateCoachSummaryAudio(analysis);
        setTranscript(text);
        setIsLoading(false);
        setIsPlaying(true);

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRef.current = ctx;
        const source = ctx.createBufferSource();
        source.buffer = audio;
        source.connect(ctx.destination);
        source.onended = () => setIsPlaying(false);
        source.start(0);
        sourceRef.current = source;
      } catch (err) {
        console.error(err);
        setIsLoading(false);
      }
    };

    fetchAndPlay();

    return () => {
      if (sourceRef.current) sourceRef.current.stop();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [analysis]);

  return (
    <div 
      className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-lg rounded-[2.5rem] md:rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 md:p-10 text-white text-center relative shrink-0 z-20">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 md:top-6 md:right-6 p-2 hover:bg-white/20 rounded-full transition-colors z-30"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
          
          <div className="flex justify-center mb-4 md:mb-6">
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/20 border-4 border-white/40 flex items-center justify-center transition-all ${isPlaying ? 'scale-110 shadow-2xl ring-8 ring-white/10' : ''}`}>
              <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full bg-white flex items-center justify-center ${isPlaying ? 'animate-pulse' : ''}`}>
                <svg className="w-6 h-6 md:w-8 md:h-8 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </div>
            </div>
          </div>

          <h2 className="text-xl md:text-2xl font-black mb-1 tracking-tight">Post-Analysis Spoken Report</h2>
          <p className="text-amber-100 text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-80">
            {isLoading ? "Consulting with Coach..." : isPlaying ? "Coach is giving feedback" : "Summary finished"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 md:p-10 bg-slate-50 min-h-[12rem] scrollbar-thin">
          <style>
            {`
              .scrollbar-thin::-webkit-scrollbar {
                width: 6px;
              }
              .scrollbar-thin::-webkit-scrollbar-track {
                background: transparent;
              }
              .scrollbar-thin::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 10px;
              }
              .scrollbar-thin::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
              }
            `}
          </style>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-10">
              <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 font-bold text-sm">Synthesizing Feedback...</p>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 text-center">
              <p className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed italic">"{transcript}"</p>
            </div>
          )}
        </div>

        <div className="p-6 md:p-8 border-t bg-white shrink-0">
          <button 
            onClick={onClose}
            className="w-full py-4 md:py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg md:text-xl hover:bg-amber-600 transition-all shadow-xl active:scale-95"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveCoach;
