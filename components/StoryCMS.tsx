import React, { useState, useEffect } from 'react';
import { StoryEpisode, StoryScene, StoryDialogue, StoryQuiz, StoryClue, ProficiencyLevel } from '../types';
import { Plus, Save, Trash2, Edit, MessageSquare, HelpCircle, Sparkles, Loader2 } from 'lucide-react';
import { generateDetectiveStory } from '../services/geminiService';

interface Props { }

const StoryCMS: React.FC<Props> = () => {
    const [episodes, setEpisodes] = useState<StoryEpisode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiLevel, setAiLevel] = useState<ProficiencyLevel>(ProficiencyLevel.Intermediate);
    const [aiTopic, setAiTopic] = useState('');

    useEffect(() => {
        fetch('/api/stories')
            .then(res => res.json())
            .then(data => {
                setEpisodes(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to load stories:', err);
                setIsLoading(false);
            });
    }, []);

    const handleSave = async () => {
        try {
            const res = await fetch('/api/stories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(episodes)
            });
            if (res.ok) {
                alert('Stories saved successfully.');
            } else {
                alert('Failed to save stories.');
            }
        } catch (err) {
            console.error('Save error:', err);
            alert('Error saving stories.');
        }
    };

    const addEpisode = () => {
        const newEp: StoryEpisode = {
            id: Math.random().toString(36).substr(2, 9),
            title: 'New Investigation',
            description: '',
            level: ProficiencyLevel.Beginner,
            scenes: [],
            availableClues: [],
            isPublished: false,
            ts: Date.now(),
            suspects: [],
            solution: {} as any
        };
        setEpisodes([newEp, ...episodes]);
    };

    const handleGenerateStory = async () => {
        if (!aiTopic.trim()) {
            alert('Please enter a grammar topic.');
            return;
        }

        setIsGenerating(true);
        try {
            // Extract existing plotlines to act as a negative constraint
            const existingPlotlines = episodes.map(e => e.title + ': ' + e.description);
            const rawStory = await generateDetectiveStory(aiLevel, aiTopic, existingPlotlines);

            // Recursively generate unique IDs for the AI's output so React keys work correctly
            const newEpisode: StoryEpisode = {
                id: Math.random().toString(36).substr(2, 9),
                title: rawStory.title || 'Untitled AI Investigation',
                description: rawStory.description || '',
                level: aiLevel, // force the requested level
                isPublished: false,
                ts: Date.now(),
                suspects: [],
                solution: {} as any,
                availableClues: [],
                scenes: (rawStory.scenes || []).map((scene: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    name: scene.name || 'Unknown Location',
                    dialogues: (scene.dialogues || []).map((dialogue: any) => ({
                        id: Math.random().toString(36).substr(2, 9),
                        character: dialogue.character || 'Unknown',
                        text: dialogue.text || '...',
                        expression: dialogue.expression || 'neutral',
                        quiz: dialogue.quiz ? {
                            id: Math.random().toString(36).substr(2, 9),
                            type: dialogue.quiz.type || 'fill-in-the-blank',
                            prompt: dialogue.quiz.prompt || 'Choose the correct word',
                            sentence: dialogue.quiz.sentence || '___',
                            correctAnswer: dialogue.quiz.correctAnswer || 'answer',
                            options: []
                        } : undefined
                    }))
                }))
            };

            setEpisodes([newEpisode, ...episodes]);
            setAiTopic('');

        } catch (error: any) {
            console.error('AI Generation Error:', error);
            alert('Failed to generate story: ' + error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) return <div className="p-12 text-center text-slate-500">Loading CMS...</div>;

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Story CMS</h1>
                    <p className="text-slate-500 font-medium mt-1">Manage Detective Story episodes and language drills.</p>
                </div>
                <button onClick={handleSave} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg">
                    <Save size={18} /> Save All Changes
                </button>
            </div>

            {/* AI Generator Panel */}
            <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl shadow-sm text-indigo-900">
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="text-indigo-600" size={24} />
                    <h2 className="text-xl font-bold text-indigo-900">AI Story Auto-Generator</h2>
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-bold text-indigo-600">Target Level</label>
                        <select
                            value={aiLevel}
                            onChange={e => setAiLevel(e.target.value as ProficiencyLevel)}
                            className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                            {Object.values(ProficiencyLevel).map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <div className="flex-[2] space-y-2">
                        <label className="text-sm font-bold text-indigo-600">Target Grammar Topic</label>
                        <input
                            value={aiTopic}
                            onChange={e => setAiTopic(e.target.value)}
                            placeholder="e.g. Past Perfect, Conditionals, Modal Verbs for Deduction..."
                            className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                            disabled={isGenerating}
                            onKeyDown={e => e.key === 'Enter' && handleGenerateStory()}
                        />
                    </div>
                    <button
                        onClick={handleGenerateStory}
                        disabled={isGenerating || !aiTopic.trim()}
                        className="h-[50px] px-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shrink-0 shadow-md"
                    >
                        {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Generating Script...</> : <><Sparkles size={18} /> Generate Episode</>}
                    </button>
                </div>
                <p className="text-xs text-indigo-500 mt-4">
                    The AI will automatically review your existing episodes to guarantee a unique mystery plotline. Warning: Full generation can take 15-30 seconds.
                </p>
            </div>

            <div className="space-y-4">
                {episodes.map((ep, i) => (
                    <div key={ep.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
                        <div className="flex justify-between items-start">
                            <div className="flex-1 space-y-3">
                                <input
                                    value={ep.title}
                                    onChange={(e) => {
                                        const cloned = [...episodes];
                                        cloned[i].title = e.target.value;
                                        setEpisodes(cloned);
                                    }}
                                    className="w-full text-2xl font-black text-slate-900 bg-transparent border-none outline-none focus:ring-2 focus:ring-indigo-100 rounded-lg"
                                    placeholder="Episode Title"
                                />
                                <div className="flex gap-4">
                                    <select
                                        value={ep.level}
                                        onChange={(e) => {
                                            const cloned = [...episodes];
                                            cloned[i].level = e.target.value as ProficiencyLevel;
                                            setEpisodes(cloned);
                                        }}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-700 outline-none"
                                    >
                                        {Object.values(ProficiencyLevel).map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                    <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                        <input
                                            type="checkbox"
                                            checked={ep.isPublished}
                                            onChange={(e) => {
                                                const cloned = [...episodes];
                                                cloned[i].isPublished = e.target.checked;
                                                setEpisodes(cloned);
                                            }}
                                            className="w-5 h-5 rounded text-indigo-600"
                                        />
                                        Published
                                    </label>
                                </div>
                            </div>
                            <button onClick={() => setEpisodes(episodes.filter(e => e.id !== ep.id))} className="p-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors">
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-6">
                            <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <MessageSquare size={18} className="text-indigo-500" />
                                Scenes & Dialogue
                            </h4>

                            {ep.scenes.map((scene, sIdx) => (
                                <div key={scene.id} className="bg-white p-4 border border-slate-200 rounded-xl space-y-4">
                                    <div className="flex gap-2">
                                        <input
                                            value={scene.name}
                                            onChange={(e) => {
                                                const cloned = [...episodes];
                                                cloned[i].scenes[sIdx].name = e.target.value;
                                                setEpisodes(cloned);
                                            }}
                                            className="flex-1 font-bold text-slate-700 bg-slate-50 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                                            placeholder="Scene Name (e.g. Crime Scene)"
                                        />
                                        <button onClick={() => {
                                            const cloned = [...episodes];
                                            cloned[i].scenes.splice(sIdx, 1);
                                            setEpisodes(cloned);
                                        }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="space-y-3 pl-4 border-l-2 border-indigo-100">
                                        {scene.dialogues.map((dialogue, dIdx) => (
                                            <div key={dialogue.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                                                <div className="flex gap-2">
                                                    <input
                                                        value={dialogue.character}
                                                        onChange={(e) => {
                                                            const cloned = [...episodes];
                                                            cloned[i].scenes[sIdx].dialogues[dIdx].character = e.target.value;
                                                            setEpisodes(cloned);
                                                        }}
                                                        className="w-1/3 font-bold text-sm bg-white px-2 py-1 border border-slate-200 rounded outline-none"
                                                        placeholder="Character Name"
                                                    />
                                                    <input
                                                        value={dialogue.text}
                                                        onChange={(e) => {
                                                            const cloned = [...episodes];
                                                            cloned[i].scenes[sIdx].dialogues[dIdx].text = e.target.value;
                                                            setEpisodes(cloned);
                                                        }}
                                                        className="flex-1 text-sm bg-white px-2 py-1 border border-slate-200 rounded outline-none"
                                                        placeholder="Dialogue text..."
                                                    />
                                                    <button onClick={() => {
                                                        const cloned = [...episodes];
                                                        cloned[i].scenes[sIdx].dialogues.splice(dIdx, 1);
                                                        setEpisodes(cloned);
                                                    }} className="text-red-400 hover:text-red-600">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2 mt-2">
                                                    <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!dialogue.quiz}
                                                            onChange={(e) => {
                                                                const cloned = [...episodes];
                                                                if (e.target.checked) {
                                                                    cloned[i].scenes[sIdx].dialogues[dIdx].quiz = {
                                                                        id: Math.random().toString(36).substr(2, 9),
                                                                        type: 'fill-in-the-blank',
                                                                        prompt: 'Fill in the correct word',
                                                                        correctAnswer: ''
                                                                    };
                                                                } else {
                                                                    delete cloned[i].scenes[sIdx].dialogues[dIdx].quiz;
                                                                }
                                                                setEpisodes(cloned);
                                                            }}
                                                        />
                                                        Add Grammar Drill Here
                                                    </label>
                                                </div>

                                                {dialogue.quiz && (
                                                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                                                        <div className="flex items-center gap-2 mb-2 text-amber-700 font-bold text-xs uppercase tracking-wide">
                                                            <HelpCircle size={14} /> Language Drill
                                                        </div>
                                                        <input
                                                            value={dialogue.quiz.prompt}
                                                            onChange={(e) => {
                                                                const cloned = [...episodes];
                                                                cloned[i].scenes[sIdx].dialogues[dIdx].quiz!.prompt = e.target.value;
                                                                setEpisodes(cloned);
                                                            }}
                                                            className="w-full text-sm bg-white px-2 py-1 border border-amber-200 rounded outline-none"
                                                            placeholder="Prompt (e.g. Choose the correct tense)"
                                                        />
                                                        <div className="flex gap-2">
                                                            <input
                                                                value={dialogue.quiz.sentence || ''}
                                                                onChange={(e) => {
                                                                    const cloned = [...episodes];
                                                                    cloned[i].scenes[sIdx].dialogues[dIdx].quiz!.sentence = e.target.value;
                                                                    setEpisodes(cloned);
                                                                }}
                                                                className="flex-1 text-sm bg-white px-2 py-1 border border-amber-200 rounded outline-none"
                                                                placeholder="Sentence with ___ blank"
                                                            />
                                                            <input
                                                                value={dialogue.quiz.correctAnswer}
                                                                onChange={(e) => {
                                                                    const cloned = [...episodes];
                                                                    cloned[i].scenes[sIdx].dialogues[dIdx].quiz!.correctAnswer = e.target.value;
                                                                    setEpisodes(cloned);
                                                                }}
                                                                className="w-1/3 font-bold text-sm bg-white px-2 py-1 border border-emerald-300 rounded outline-none text-emerald-700"
                                                                placeholder="Correct Answer"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        <button onClick={() => {
                                            const cloned = [...episodes];
                                            cloned[i].scenes[sIdx].dialogues.push({
                                                id: Math.random().toString(36).substr(2, 9),
                                                character: 'Detective',
                                                text: ''
                                            });
                                            setEpisodes(cloned);
                                        }} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-2">
                                            <Plus size={14} /> Add Line of Dialogue
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <button onClick={() => {
                                const cloned = [...episodes];
                                cloned[i].scenes.push({
                                    id: Math.random().toString(36).substr(2, 9),
                                    name: 'New Scene',
                                    dialogues: []
                                });
                                setEpisodes(cloned);
                            }} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:bg-slate-100 hover:text-slate-700 transition-colors flex justify-center items-center gap-2">
                                <Plus size={16} /> Add Scene
                            </button>
                        </div>
                    </div>
                ))}

                <button onClick={addEpisode} className="w-full py-6 border-2 border-dashed border-slate-300 rounded-3xl text-slate-500 font-bold hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
                    <Plus size={20} /> Add New Episode
                </button>
            </div>
        </div>
    );
};

export default StoryCMS;
