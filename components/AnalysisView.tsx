
import React, { useState, useEffect } from 'react';
import { AnalysisResult, TextSample, HighlightedPhrase } from '../types';
import { generateNativeAudio } from '../services/geminiService';

interface AnalysisViewProps {
  result: AnalysisResult | null;
  isLoading: boolean;
  targetSample: TextSample;
  userAudioUrl: string | null;
  onRetry: () => void;
  onNew: () => void;
  onHearCoach: () => void;
  onAskCoach: () => void;
  onSaveTerm: (term: HighlightedPhrase) => void;
}

// Fix: Use React.FC to allow reserved props like 'key' when mapping over components
const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`}></div>
);

const AnalysisView: React.FC<AnalysisViewProps> = ({
  result,
  isLoading,
  targetSample,
  userAudioUrl,
  onRetry,
  onNew,
  onHearCoach,
  onAskCoach,
  onSaveTerm
}) => {
  const [isPlayingNative, setIsPlayingNative] = useState(false);
  const [nativeAudio, setNativeAudio] = useState<AudioBuffer | null>(null);
  const [playingDrillIndex, setPlayingDrillIndex] = useState<number | null>(null);

  const playDrill = async (text: string, index: number) => {
    if (playingDrillIndex !== null) return;
    setPlayingDrillIndex(index);
    try {
      const buffer = await generateNativeAudio(text);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setPlayingDrillIndex(null);
      source.start(0);
    } catch (e) {
      console.error(e);
      setPlayingDrillIndex(null);
    }
  };

  useEffect(() => {
    generateNativeAudio(targetSample.content).then(setNativeAudio).catch(console.error);
  }, [targetSample]);

  const playNative = async () => {
    if (!nativeAudio) return;
    setIsPlayingNative(true);
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = ctx.createBufferSource();
    source.buffer = nativeAudio;
    source.connect(ctx.destination);
    source.onended = () => setIsPlayingNative(false);
    source.start(0);
  };

  const playUser = () => {
    if (!userAudioUrl) return;
    const audio = new Audio(userAudioUrl);
    audio.play();
  };

  const detailed = result?.detailedAnalysis;

  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-10 md:pb-20">
      {/* Header Scoring Card */}
      <div className="bg-white rounded-[1.5rem] md:rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-8">
        <div className="relative w-24 h-24 md:w-32 md:h-32 flex items-center justify-center shrink-0">
          {isLoading ? (
            <div className="w-full h-full rounded-full border-8 border-slate-100 border-t-indigo-600 animate-spin"></div>
          ) : result ? (
            <>
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="50%" cy="50%" r="42%" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                <circle cx="50%" cy="50%" r="42%" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="264" strokeDashoffset={264 - (264 * result.accuracyScore) / 100} className="text-indigo-600 transition-all duration-1000 ease-out" />
              </svg>
              <span className="absolute text-xl md:text-3xl font-black text-indigo-700">{Math.round(result.accuracyScore)}%</span>
            </>
          ) : null}
        </div>
        <div className="flex-1 text-center md:text-left">
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-48 mb-4 mx-auto md:mx-0" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </>
          ) : result ? (
            <>
              <h2 className="text-xl md:text-3xl font-black text-slate-900 mb-2">Fluency Report</h2>
              <p className="text-sm md:text-lg text-slate-600 leading-relaxed font-medium">{result.overallFeedback}</p>
              {detailed && (
                <div className="mt-4 flex gap-3 justify-center md:justify-start">
                  <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase border border-indigo-100">
                    Vibe: {detailed.accent_vibe.energy}
                  </span>
                  <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase border border-amber-100">
                    Guess: {detailed.accent_vibe.origin_guess}
                  </span>
                </div>
              )}
            </>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 md:gap-3 w-full md:w-64 shrink-0">
          <button onClick={playNative} disabled={!nativeAudio || isPlayingNative || isLoading} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/10">
            {isPlayingNative ? 'Playing...' : 'Native Version'}
          </button>
          <button onClick={playUser} disabled={!userAudioUrl || isLoading} className="w-full flex items-center justify-center gap-2 px-6 py-4 border-2 border-slate-200 text-slate-700 rounded-xl font-black hover:bg-slate-50 disabled:opacity-50 transition-all active:scale-[0.98]">
            Play Original
          </button>
          <button onClick={onHearCoach} disabled={isLoading || !result} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-amber-500 text-white rounded-xl font-black hover:bg-amber-600 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/10 disabled:opacity-50">
            Hear Coach
          </button>
        </div>
      </div>

      {/* NEW: Detailed Coach Breakdown (The Deep Analysis) */}
      {!isLoading && detailed && (
        <section className="bg-slate-900 text-white rounded-[1.5rem] md:rounded-2xl shadow-xl p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-indigo-600 rounded-full blur-[100px] opacity-20 -translate-y-1/2 translate-x-1/2"></div>

          <h3 className="text-xl font-black mb-6 flex items-center gap-2 relative z-10">
            <span className="bg-indigo-500 w-2 h-8 rounded-full"></span>
            Elite Dialect Coach Feedback
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
            {/* Specific Sounds */}
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Specific Sound Corrections</h4>
              <div className="space-y-3">
                {detailed.specific_sounds.length > 0 ? detailed.specific_sounds.map((item, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-slate-400 text-xs italic mb-2">"{item.quote}"</p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-white">{item.target_word}</span>
                      <span className="text-white/50 text-xs">sounded like</span>
                      <span className="font-bold text-red-300">{item.sounded_like}</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-green-400 font-bold">No specific pronunciation errors detected!</p>
                )}
              </div>
            </div>

            {/* The Fix & Flow */}
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Flow & Music</h4>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
                  <p className="text-sm"><span className="text-indigo-300 font-bold">Stress:</span> {detailed.flow_music.word_stress}</p>
                  <p className="text-sm"><span className="text-indigo-300 font-bold">Rhythm:</span> {detailed.flow_music.rhythm}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-green-400 uppercase tracking-widest mb-4">The Fix (Drills)</h4>
                <ul className="space-y-2">
                  {detailed.the_fix.map((drill, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm font-medium">
                      <button
                        onClick={() => playDrill(drill, i)}
                        disabled={playingDrillIndex !== null && playingDrillIndex !== i}
                        className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xs transition-all ${playingDrillIndex === i ? 'bg-indigo-600 text-white animate-pulse shadow-lg' : 'bg-green-500/20 text-green-500 hover:bg-green-500 hover:text-white'}`}
                      >
                        {playingDrillIndex === i ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                      <span className="mt-1 leading-relaxed text-slate-200">{drill}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Legacy/Fast Analysis Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {/* Phoneme Accuracy (Legacy Visuals) */}
        <section className="bg-white rounded-[1.5rem] md:rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
          <h3 className="text-base md:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
            Standard Phoneme Check
          </h3>
          <div className="space-y-3 md:space-y-4">
            {isLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex justify-between mb-2">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                </div>
              ))
            ) : result?.phonemeIssues.map((issue, idx) => (
              <div key={idx} className="p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-start mb-1 md:mb-2">
                  <span className="font-bold text-indigo-700 text-base md:text-lg">/{issue.ipaSymbol}/</span>
                  <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Mispronounced</span>
                </div>
                <p className="text-xs md:text-sm text-slate-800 font-medium mb-1">In word: <span className="underline decoration-red-300">{issue.originalWord}</span></p>
                <p className="text-xs md:text-sm text-slate-600 italic">Tip: {issue.fixTip}</p>
              </div>
            ))}
            {!isLoading && result?.phonemeIssues.length === 0 && <p className="text-xs md:text-sm text-green-600">Excellent phoneme accuracy! No specific errors found in standard check.</p>}
          </div>
        </section>

        {/* Linking & Flow (Legacy) */}
        <section className="bg-white rounded-[1.5rem] md:rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
          <h3 className="text-base md:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Linking Suggestions
          </h3>
          <div className="space-y-3 md:space-y-4">
            {isLoading ? (
              [1, 2].map(i => (
                <div key={i} className="p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <Skeleton className="h-4 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))
            ) : result?.linkingIssues.map((issue, idx) => (
              <div key={idx} className="p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs md:text-sm font-bold text-slate-800 mb-1 md:mb-2">Target Phrase: "{issue.phrase}"</p>
                <p className="text-xs md:text-sm text-slate-600 leading-relaxed">{issue.tip}</p>
              </div>
            ))}
            {!isLoading && result?.linkingIssues.length === 0 && <p className="text-xs md:text-sm text-green-600">Smooth flow and natural word linking detected!</p>}
          </div>
        </section>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <button
          onClick={onAskCoach}
          disabled={isLoading || !result}
          className="flex-1 py-8 bg-slate-900 text-white rounded-3xl font-black text-xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-4 shadow-2xl disabled:opacity-50"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
          Ask Coach Follow-up Questions
        </button>
      </div>

      {/* Practice Dashboard Footer */}
      <div className="bg-slate-900 text-white rounded-[1.5rem] md:rounded-2xl p-6 md:p-8">
        <h3 className="text-lg md:text-xl font-bold mb-4 md:mb-6">Practice Dashboard</h3>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8">
          <div className="flex-1">
            <p className="text-slate-400 text-[10px] mb-3 font-semibold uppercase tracking-wider">Problem Words</p>
            <div className="flex flex-wrap gap-2">
              {isLoading ? (
                [1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-16 bg-slate-800" />)
              ) : result?.problemWords.map((word, idx) => (
                <span key={idx} className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium">
                  {word}
                </span>
              ))}
              {!isLoading && result?.problemWords.length === 0 && <span className="text-slate-500 text-xs italic">None identified!</span>}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch justify-end gap-3 shrink-0">
            <button onClick={onRetry} disabled={isLoading} className="px-6 md:px-8 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl font-semibold hover:bg-slate-700 transition-colors text-sm disabled:opacity-50">
              Retry Challenge
            </button>
            <button onClick={onNew} disabled={isLoading} className="px-6 md:px-8 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-400 transition-colors shadow-lg shadow-indigo-500/20 text-sm disabled:opacity-50">
              New Challenge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisView;
