
import React, { useState } from 'react';
import { TextSample, HighlightedPhrase } from '../types';

interface TextCardProps {
  sample: TextSample;
  onSelect: (sample: TextSample) => void;
}

const TextCard: React.FC<TextCardProps> = ({ sample, onSelect }) => {
  // Fix: Use HighlightedPhrase type instead of TargetPhrase (not exported from types.ts)
  const [selectedPhrase, setSelectedPhrase] = useState<HighlightedPhrase | null>(null);

  const highlightContent = (content: string, phrases: HighlightedPhrase[]) => {
    let result: React.ReactNode[] = [content];
    
    phrases.forEach(p => {
      const newResult: React.ReactNode[] = [];
      result.forEach(part => {
        if (typeof part === 'string') {
          const split = part.split(new RegExp(`(${p.phrase})`, 'gi'));
          split.forEach((s, i) => {
            if (s.toLowerCase() === p.phrase.toLowerCase()) {
              newResult.push(
                <button
                  key={`${p.phrase}-${i}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPhrase(p);
                  }}
                  className="bg-yellow-100 text-yellow-800 font-medium px-1 rounded border-b-2 border-yellow-400 hover:bg-yellow-200 transition-colors"
                >
                  {s}
                </button>
              );
            } else {
              newResult.push(s);
            }
          });
        } else {
          newResult.push(part);
        }
      });
      result = newResult;
    });
    return result;
  };

  return (
    <div 
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer relative"
      onClick={() => onSelect(sample)}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-slate-800">{sample.title}</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          sample.level === 'Beginner' ? 'bg-green-100 text-green-700' :
          sample.level === 'Intermediate' ? 'bg-blue-100 text-blue-700' :
          'bg-purple-100 text-purple-700'
        }`}>
          {sample.level}
        </span>
      </div>
      
      <p className="text-slate-600 line-clamp-3 mb-4 leading-relaxed">
        {/* Fix: Use highlightedPhrases instead of targetPhrases (not in TextSample) */}
        {highlightContent(sample.content, sample.highlightedPhrases)}
      </p>

      <div className="flex gap-2 flex-wrap">
        {/* Fix: Use highlightedPhrases instead of targetPhrases */}
        {sample.highlightedPhrases.map((tp, idx) => (
          <span key={idx} className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">
            {tp.phrase}
          </span>
        ))}
      </div>

      {selectedPhrase && (
        <div className="absolute inset-0 bg-white/95 z-10 p-6 rounded-xl flex flex-col justify-center animate-in fade-in zoom-in duration-200">
          <button 
            onClick={(e) => { e.stopPropagation(); setSelectedPhrase(null); }}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
          <h4 className="text-lg font-bold text-yellow-700 mb-1">{selectedPhrase.phrase}</h4>
          <p className="text-sm text-slate-700 mb-4">{selectedPhrase.definition}</p>
          <div className="bg-slate-50 p-3 rounded italic text-sm text-slate-600">
            {/* Fix: Use examples[0] instead of example */}
            "{selectedPhrase.examples[0]}"
          </div>
        </div>
      )}
    </div>
  );
};

export default TextCard;
