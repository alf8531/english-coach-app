
import React, { useEffect, useState, useRef } from 'react';

interface SelectionMenuProps {
  onTranslate: (text: string) => void;
  onAskCoach: (text: string) => void;
  onAddToDeck: (text: string) => void;
  onSearch: (text: string) => void;
}

const SelectionMenu: React.FC<SelectionMenuProps> = ({ onTranslate, onAskCoach, onAddToDeck, onSearch }) => {
  const [position, setPosition] = useState<{ x: number, y: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Prevent dismissing the menu if we're clicking inside it
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim();
      
      if (text && text.length > 1) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        if (rect) {
          setSelectedText(text);
          setPosition({
            x: rect.left + window.scrollX + (rect.width / 2),
            y: rect.top + window.scrollY - 55
          });
        }
      } else {
        // Delayed dismissal to ensure click handlers on the menu itself can fire
        setTimeout(() => {
          const updatedSelection = window.getSelection()?.toString().trim();
          if (!updatedSelection) {
            setPosition(null);
          }
        }, 150);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  if (!position) return null;

  return (
    <div 
      ref={menuRef}
      className="fixed z-[110] bg-slate-900 text-white rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.3)] flex items-center p-1.5 gap-1 -translate-x-1/2 animate-in zoom-in-95 fade-in duration-200"
      style={{ left: position.x, top: position.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button 
        onClick={() => { onTranslate(selectedText); setPosition(null); }}
        className="px-4 py-2 text-xs font-black hover:bg-slate-800 rounded-full transition-all flex items-center gap-2"
      >
        <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path></svg>
        Translate
      </button>
      <div className="w-px h-4 bg-slate-700 mx-1" />
      <button 
        onClick={() => { onSearch(selectedText); setPosition(null); }}
        className="px-4 py-2 text-xs font-black hover:bg-slate-800 rounded-full transition-all flex items-center gap-2"
      >
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        Search
      </button>
      <div className="w-px h-4 bg-slate-700 mx-1" />
      <button 
        onClick={() => { onAskCoach(selectedText); setPosition(null); }}
        className="px-4 py-2 text-xs font-black bg-indigo-600 hover:bg-indigo-500 rounded-full transition-all flex items-center gap-2 shadow-lg"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        Ask Coach
      </button>
      <div className="w-px h-4 bg-slate-700 mx-1" />
      <button 
        onClick={() => { onAddToDeck(selectedText); setPosition(null); }}
        className="px-4 py-2 text-xs font-black hover:bg-green-600 rounded-full transition-all flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
        Add
      </button>
    </div>
  );
};

export default SelectionMenu;
