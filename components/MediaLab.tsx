
import React, { useState, useRef } from 'react';
import { generateHighQualityImage, generateVideoWithVeo, analyzeMedia } from '../services/geminiService';
import { blobToBase64 } from '../services/audioUtils';

const MediaLab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'generate' | 'analyze'>('generate');
  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageSize, setImageSize] = useState('1K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  // Analyze state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkKey = async () => {
    if (!await window.aistudio.hasSelectedApiKey()) {
      await window.aistudio.openSelectKey();
      return true;
    }
    return true;
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    await checkKey();
    setIsGenerating(true);
    setResultUrl(null);
    try {
      if (mode === 'image') {
        setStatus("Creating high-fidelity imagery...");
        const url = await generateHighQualityImage(prompt, aspectRatio, imageSize);
        setResultUrl(url);
      } else {
        setStatus("Veo is rendering your vision. This may take a minute...");
        const url = await generateVideoWithVeo(prompt, aspectRatio as any);
        setResultUrl(url);
      }
    } catch (e: any) {
      alert("Media generation failed. Please check your project billing or API quota.");
    } finally {
      setIsGenerating(false);
      setStatus("");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setFilePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || !prompt) return;
    setIsAnalyzing(true);
    try {
      const base64 = await blobToBase64(selectedFile);
      const res = await analyzeMedia(prompt, { data: base64, mimeType: selectedFile.type });
      setAnalysisResult(res);
    } catch (e) {
      alert("Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-500 pb-24 px-4">
      <header className="text-center">
        <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter mb-4">Visual Lab</h1>
        <p className="text-xl text-slate-500 font-medium">Generate cinematic visuals or analyze media for deep context.</p>
      </header>

      <div className="flex bg-slate-100 p-1.5 rounded-3xl w-fit mx-auto border border-slate-200 mb-8">
        <button onClick={() => setActiveTab('generate')} className={`px-8 py-3 rounded-2xl font-bold text-sm transition-all ${activeTab === 'generate' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Content Creator</button>
        <button onClick={() => setActiveTab('analyze')} className={`px-8 py-3 rounded-2xl font-bold text-sm transition-all ${activeTab === 'analyze' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Media Analyzer</button>
      </div>

      {activeTab === 'generate' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="bg-white rounded-[3rem] p-10 shadow-2xl space-y-8 border border-slate-100">
            <div className="space-y-4">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Generation Mode</label>
              <div className="flex gap-4">
                <button onClick={() => setMode('image')} className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all ${mode === 'image' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 text-slate-400'}`}>Nano Banana Image</button>
                <button onClick={() => setMode('video')} className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all ${mode === 'video' ? 'border-amber-500 bg-amber-50 text-amber-500' : 'border-slate-100 text-slate-400'}`}>Veo Video (Fast)</button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Visual Prompt</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the scene you want to master..." className="w-full h-32 p-6 bg-slate-50 border border-slate-200 rounded-3xl font-medium text-lg outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Aspect Ratio</label>
                <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none">
                  {['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {mode === 'image' && (
                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Resolution</label>
                  <select value={imageSize} onChange={e => setImageSize(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none">
                    {['1K', '2K', '4K'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            <button onClick={handleGenerate} disabled={isGenerating || !prompt} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-xl hover:bg-indigo-600 transition-all shadow-xl disabled:opacity-50">
              {isGenerating ? "Processing..." : `Generate ${mode === 'image' ? 'Masterpiece' : 'Cinema'}`}
            </button>
          </div>

          <div className="bg-slate-900 rounded-[3rem] p-4 flex items-center justify-center relative overflow-hidden min-h-[400px]">
             {isGenerating ? (
               <div className="text-center space-y-6">
                 <div className="w-16 h-16 border-8 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                 <p className="text-indigo-200 font-bold animate-pulse">{status}</p>
               </div>
             ) : resultUrl ? (
               mode === 'image' ? (
                 <img src={resultUrl} className="w-full h-full object-contain rounded-2xl animate-in zoom-in-95" alt="Generated" />
               ) : (
                 <video src={resultUrl} className="w-full h-full object-contain rounded-2xl" controls autoPlay loop />
               )
             ) : (
               <div className="text-slate-700 font-black text-4xl text-center uppercase tracking-tighter opacity-20">Preview Frame</div>
             )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in duration-300">
           <div className="bg-white rounded-[3rem] p-10 shadow-2xl space-y-8 border border-slate-100">
              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Select Media</label>
                <div onClick={() => fileInputRef.current?.click()} className="w-full h-48 border-4 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all group overflow-hidden relative">
                   {filePreview ? (
                     <img src={filePreview} className="absolute inset-0 w-full h-full object-cover group-hover:opacity-40" />
                   ) : (
                     <>
                      <svg className="w-12 h-12 text-slate-300 group-hover:text-indigo-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                      <p className="text-sm font-bold text-slate-400">Click to upload photo/video</p>
                     </>
                   )}
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*" onChange={handleFileChange} />
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Analysis Prompt</label>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Analyze this for native expressions..." className="w-full h-32 p-6 bg-slate-50 border border-slate-200 rounded-3xl font-medium text-lg outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-none" />
              </div>

              <button onClick={handleAnalyze} disabled={isAnalyzing || !selectedFile} className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-xl hover:bg-indigo-600 transition-all shadow-xl">
                 {isAnalyzing ? "Deep Media Insight..." : "Analyze Media"}
              </button>
           </div>

           <div className="bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100 overflow-y-auto max-h-[600px] prose prose-slate">
              <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-4">Master Intelligence Analysis</h3>
              {analysisResult ? (
                <div className="font-medium text-slate-700 leading-relaxed whitespace-pre-wrap animate-in slide-in-from-bottom-4">{analysisResult}</div>
              ) : (
                <p className="text-slate-300 italic">Select media and describe your mastery goal to receive an AI analysis.</p>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export default MediaLab;
