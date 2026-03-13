
import React, { useState, useEffect, useRef } from 'react';
import { WritingChallenge, WritingFeedback, ImageDescriptionFeedback } from '../types';
import { generateWritingChallenge, evaluateWriting, evaluateImageDescription } from '../services/geminiService';
import { blobToBase64 } from '../services/audioUtils';

const WritingWorkshop: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'random' | 'image'>('random');
  const [streak, setStreak] = useState(0);
  const [isHardMode, setIsHardMode] = useState(false);
  
  // Random Challenge State
  const [challenge, setChallenge] = useState<WritingChallenge | null>(null);
  const [userText, setUserText] = useState("");
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGrading, setIsGrading] = useState(false);

  // Image Mode State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [imageDescText, setImageDescText] = useState("");
  const [imageFeedback, setImageFeedback] = useState<ImageDescriptionFeedback | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedStreak = localStorage.getItem('writingStreak');
    const lastDate = localStorage.getItem('lastWritingDate');
    
    if (savedStreak) {
      const s = parseInt(savedStreak, 10);
      setStreak(s);
      if (s >= 7) setIsHardMode(true);
    }

    // Reset logic check
    if (lastDate) {
      const diff = Date.now() - parseInt(lastDate, 10);
      const days = diff / (1000 * 60 * 60 * 24);
      if (days > 2) { // Reset if missed more than 1 day (48 hours rough check)
        setStreak(0);
        setIsHardMode(false);
        localStorage.setItem('writingStreak', '0');
      }
    }
  }, []);

  const updateStreak = () => {
    const today = new Date().setHours(0,0,0,0);
    const lastDate = localStorage.getItem('lastWritingDate');
    const last = lastDate ? new Date(parseInt(lastDate)).setHours(0,0,0,0) : 0;

    if (today !== last) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      localStorage.setItem('writingStreak', newStreak.toString());
      localStorage.setItem('lastWritingDate', Date.now().toString());
      if (newStreak >= 7) setIsHardMode(true);
    }
  };

  const handleRollDice = async () => {
    setIsGenerating(true);
    setChallenge(null);
    setFeedback(null);
    setUserText("");
    try {
      const res = await generateWritingChallenge(isHardMode);
      setChallenge(res);
    } catch (e) {
      alert("Failed to roll the dice. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmitWriting = async () => {
    if (!challenge || !userText.trim()) return;
    setIsGrading(true);
    try {
      const res = await evaluateWriting(challenge.prompt, userText);
      setFeedback(res);
      updateStreak();
    } catch (e) {
      alert("Grading failed. Try again.");
    } finally {
      setIsGrading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setGeneratedImage(null);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      setImageFeedback(null);
    }
  };

  const handleGenerateRandomImage = () => {
    setIsGeneratingImage(true);
    setSelectedFile(null);
    setImagePreview(null);
    setGeneratedImage(null);
    setImageFeedback(null);

    // Switch to LoremFlickr to avoid Pollinations rate limits
    const genres = [
      'sci-fi', 'anime', 'cyberpunk', 'fantasy', 'paris', 'office', 'nature', 
      'cat', 'robot', 'city', 'technology', 'space', 'abstract', 'architecture', 
      'business', 'food', 'nightlife', 'people', 'sports', 'transport', 'fashion'
    ];

    const randomGenre = genres[Math.floor(Math.random() * genres.length)];
    const randomLock = Math.floor(Math.random() * 10000);

    // Construct the LoremFlickr URL with lock for consistency/uniqueness
    const url = `https://loremflickr.com/800/600/${randomGenre}?lock=${randomLock}`;
    
    // Set the image
    setTimeout(() => {
      setGeneratedImage(url);
      setImagePreview(url);
      setIsGeneratingImage(false);
    }, 500);
  };

  const handleAnalyzeImage = async () => {
    if ((!selectedFile && !generatedImage) || !imageDescText.trim()) return;
    setIsAnalyzingImage(true);
    try {
      let base64 = "";
      let mimeType = 'image/jpeg';

      if (selectedFile) {
        base64 = await blobToBase64(selectedFile);
        mimeType = selectedFile.type || 'image/jpeg';
      } else if (generatedImage) {
        if (generatedImage.startsWith('http')) {
             // Fetch from URL for analysis
             const response = await fetch(generatedImage);
             const blob = await response.blob();
             base64 = await blobToBase64(blob);
             mimeType = blob.type;
        } else {
             // Fallback for data URLs if any
             base64 = generatedImage.split(',')[1];
             const match = generatedImage.match(/^data:(.*?);base64,/);
             if (match) mimeType = match[1];
        }
      }
      
      const res = await evaluateImageDescription(base64, imageDescText, mimeType);
      setImageFeedback(res);
      updateStreak();
    } catch (e) {
      alert("Analysis failed. Please try again or upload a local image.");
      console.error(e);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 px-4">
      <header className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
        <div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter mb-2">Writing Workshop</h1>
          <p className="text-lg text-slate-500 font-medium">Daily challenges to sharpen your pen and eye.</p>
        </div>
        <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl shadow-lg border-2 ${isHardMode ? 'bg-slate-900 border-amber-500 text-white' : 'bg-white border-slate-100 text-slate-700'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${isHardMode ? 'bg-amber-500 text-slate-900' : 'bg-indigo-100 text-indigo-600'}`}>
            {streak}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest opacity-60">Day Streak</span>
            <span className="font-bold leading-none">{isHardMode ? 'HARD MODE 🔥' : 'Keep going!'}</span>
          </div>
        </div>
      </header>

      {/* Mode Switcher */}
      <div className="flex justify-center mb-8">
        <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 inline-flex">
          <button 
            onClick={() => setActiveTab('random')} 
            className={`px-6 py-3 rounded-xl font-black text-sm transition-all ${activeTab === 'random' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Random Challenge
          </button>
          <button 
            onClick={() => setActiveTab('image')}
            className={`px-6 py-3 rounded-xl font-black text-sm transition-all ${activeTab === 'image' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Describe Image
          </button>
        </div>
      </div>

      {activeTab === 'random' && (
        <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom-4">
          {!challenge ? (
            <div className="bg-white rounded-[3rem] p-12 text-center shadow-xl border border-slate-100">
              <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">🎲</span>
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-4">Ready to Roll?</h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto font-medium">
                I'll generate a unique Persuasion, Narrative, or Professional writing prompt.
                {isHardMode && <span className="block mt-2 text-amber-600 font-bold">Hard Mode Active: Obscure topics only.</span>}
              </p>
              <button 
                onClick={handleRollDice} 
                disabled={isGenerating}
                className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-indigo-600 shadow-xl transition-all active:scale-95 disabled:opacity-50"
              >
                {isGenerating ? "Rolling..." : "Generate Challenge"}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg text-xs font-black uppercase tracking-widest">{challenge.category}</span>
                    <button onClick={handleRollDice} className="text-white/50 hover:text-white text-sm font-bold">Reroll ↻</button>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-black mb-6 leading-tight">"{challenge.prompt}"</h3>
                  <div className="flex gap-2 flex-wrap">
                    {challenge.constraints.map((c, i) => (
                      <span key={i} className="px-3 py-1.5 border border-white/20 rounded-lg text-sm font-medium">{c}</span>
                    ))}
                  </div>
                </div>
              </div>

              {!feedback ? (
                <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 space-y-4">
                  <textarea 
                    value={userText}
                    onChange={e => setUserText(e.target.value)}
                    placeholder="Start writing here..."
                    className="w-full h-64 p-6 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-indigo-600 font-medium text-lg resize-none"
                  />
                  <button 
                    onClick={handleSubmitWriting} 
                    disabled={isGrading || !userText.trim()}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isGrading ? "Grading..." : "Submit for Feedback"}
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100 space-y-8 animate-in zoom-in-95">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-slate-50 rounded-2xl">
                      <div className="text-3xl font-black text-indigo-600">{feedback.vocabScore}</div>
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vocab</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl">
                      <div className="text-3xl font-black text-indigo-600">{feedback.grammarScore}</div>
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grammar</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl">
                      <div className="text-3xl font-black text-indigo-600">{feedback.toneScore}</div>
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tone</div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-black text-slate-900 mb-2">Coach Feedback</h4>
                    <p className="text-slate-600 leading-relaxed">{feedback.feedback}</p>
                  </div>

                  <div>
                    <h4 className="font-black text-slate-900 mb-4">Corrections</h4>
                    <div className="space-y-3">
                      {feedback.corrections.map((c, i) => (
                        <div key={i} className="p-4 bg-red-50 rounded-xl border border-red-100 text-sm">
                          <div className="mb-1 text-red-800 line-through opacity-60">{c.original}</div>
                          <div className="font-bold text-green-700 mb-1">{c.correction}</div>
                          <div className="text-slate-500 text-xs italic">{c.reason}</div>
                        </div>
                      ))}
                      {feedback.corrections.length === 0 && <p className="text-green-600 font-bold text-sm">No major errors found!</p>}
                    </div>
                  </div>
                  <button onClick={handleRollDice} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black">Next Challenge</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'image' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
          <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-colors border-2 border-slate-200"
                    >
                        Upload Photo
                    </button>
                    <button 
                        onClick={handleGenerateRandomImage}
                        disabled={isGeneratingImage}
                        className="flex-1 py-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl font-bold text-sm transition-colors border-2 border-indigo-100 flex items-center justify-center gap-2"
                    >
                        {isGeneratingImage ? (
                            <>
                                <div className="w-4 h-4 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin"></div>
                                Generating...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                                Generate Random Scene
                            </>
                        )}
                    </button>
                </div>

                <div className="aspect-video bg-slate-50 rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center relative group">
                  {imagePreview ? (
                    <img src={imagePreview} className="w-full h-full object-contain rounded-2xl" alt="Preview" />
                  ) : (
                    <div className="text-center p-6 text-slate-400">
                      <div className="w-12 h-12 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      </div>
                      <p className="font-bold">Select an option above to start</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-6 shadow-xl border border-slate-100">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Your Description</h3>
              <textarea 
                value={imageDescText}
                onChange={e => setImageDescText(e.target.value)}
                placeholder="Describe what you see in detail..."
                className="w-full h-40 p-4 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-indigo-600 font-medium text-lg resize-none mb-4"
              />
              <button 
                onClick={handleAnalyzeImage}
                disabled={isAnalyzingImage || (!selectedFile && !generatedImage) || !imageDescText.trim()}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-lg hover:bg-indigo-600 transition-all active:scale-95 disabled:opacity-50"
              >
                {isAnalyzingImage ? "Analyzing Vision..." : "Compare Vision & Text"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 flex flex-col h-full min-h-[500px]">
             <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-6">Visual Intelligence Report</h3>
             
             {imageFeedback ? (
               <div className="space-y-8 overflow-y-auto pr-2 animate-in fade-in">
                 <div>
                   <h4 className="font-black text-slate-900 mb-2">Observation Analysis</h4>
                   <p className="text-slate-700 leading-relaxed italic">"{imageFeedback.overallFeedback}"</p>
                 </div>

                 <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
                   <h4 className="font-black text-amber-800 mb-3 text-sm uppercase tracking-widest flex items-center gap-2">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                     Missed Details
                   </h4>
                   <ul className="space-y-2">
                     {imageFeedback.missedDetails.map((detail, i) => (
                       <li key={i} className="text-amber-900 text-sm font-medium flex items-start gap-2">
                         <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                         {detail}
                       </li>
                     ))}
                   </ul>
                 </div>

                 {/* New Native Description Section */}
                 <div className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                   <h4 className="font-black text-indigo-800 mb-3 text-sm uppercase tracking-widest flex items-center gap-2">
                     ✨ Ideal Native Description
                   </h4>
                   <p className="text-slate-800 text-lg font-medium leading-relaxed italic">
                     "{imageFeedback.ideal_description}"
                   </p>
                 </div>

                 <div>
                    <h4 className="font-black text-slate-900 mb-4">Grammar Check</h4>
                    <div className="space-y-3">
                      {imageFeedback.grammarCorrections.map((c, i) => (
                        <div key={i} className="flex flex-col text-sm border-b pb-2">
                           <span className="text-red-400 line-through mb-1">{c.original}</span>
                           <span className="text-green-600 font-bold">{c.correction}</span>
                        </div>
                      ))}
                      {imageFeedback.grammarCorrections.length === 0 && <p className="text-green-600 font-bold text-sm">Your grammar is spot on!</p>}
                    </div>
                 </div>
               </div>
             ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-40">
                 <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                   <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                 </div>
                 <p className="font-bold text-slate-800">Upload an image or generate a random scene to verify your observational vocabulary.</p>
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WritingWorkshop;
