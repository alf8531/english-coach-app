import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ProficiencyLevel, AnalysisResult, CoachFeedback, TextSample, ChatMessage, HighlightedPhrase, ScriptLine, DictationChallenge, WritingChallenge, WritingFeedback, ImageDescriptionFeedback, SprintAnalysis, YouTubeTranscriptLine, PronunciationAnalysis, RoleplayAnalysis, NativeScene, SceneScriptPart } from "../types";

import { decode, decodeAudioData } from "./audioUtils";

// ==========================================
// CENTRAL CONFIGURATION (STRICT)
// ==========================================
// Using gemini-2.5-flash for all text/multimodal tasks.
// This is the quota-friendly stable model.
// gemini-2.5-flash-preview-tts is kept only for TTS tasks.
const CURRENT_MODEL_NAME = "gemini-2.5-flash";

// ==========================================
// GLOBAL ERROR HANDLING
// ==========================================

/** User-facing rate limit message shown across all components */
export const RATE_LIMIT_MESSAGE = "The AI is currently busy or rate-limited. Please wait 60 seconds and try again.";

/**
 * Custom API error that always has a clean, human-readable message.
 * Never exposes raw JSON objects or internal stack traces.
 */
export class GeminiApiError extends Error {
  readonly statusCode: number;
  readonly isRateLimit: boolean;

  constructor(message: string, statusCode: number = 0) {
    // Sanitize: if message looks like a JSON object or is too long, replace it
    const safeMessage = (() => {
      if (!message || typeof message !== 'string') return 'An unexpected API error occurred.';
      if (message.startsWith('{') || message.startsWith('[')) return 'An unexpected API error occurred.';
      if (message.length > 200) return message.substring(0, 200) + '...';
      return message;
    })();
    super(safeMessage);
    this.name = 'GeminiApiError';
    this.statusCode = statusCode;
    this.isRateLimit = statusCode === 429 || message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('resource_exhausted');
  }
}

/**
 * Detects whether an error is a 429 / quota exhaustion.
 * Works across different error shapes the Gemini SDK may throw.
 */
function isRateLimitError(error: any): boolean {
  if (!error) return false;
  const status = error?.status ?? error?.code ?? error?.statusCode ?? 0;
  if (status === 429) return true;
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted') || msg.includes('too many requests');
}

// ==========================================
// REQUEST TRACING
// ==========================================
let _reqCounter = 0;

/** Logs a timestamped, unique request ID before every API call for debugging. */
export function traceRequest(label: string): string {
  const id = `REQ-${++_reqCounter}-${Date.now()}`;
  console.log(`[GEMINI TRACE] ${new Date().toISOString()} | ${id} | ${label}`);
  return id;
}

/**
 * Zero-retry wrapper. Catches errors and wraps them in GeminiApiError.
 * NO automatic retries — a single failure is surfaced immediately to the UI.
 * This prevents the app from silently spamming the Gemini API.
 */
async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (isRateLimitError(error)) {
      throw new GeminiApiError(RATE_LIMIT_MESSAGE, 429);
    }
    throw new GeminiApiError(error?.message || 'API call failed.', error?.status ?? 0);
  }
}

const getApiKey = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) {
    console.error("CRITICAL ERROR: VITE_GEMINI_API_KEY is missing from the environment variables. The API cannot be initialized.");
  } else if (key === "YOUR_API_KEY_HERE" || key === "PLACEHOLDER_API_KEY") {
    console.error("CRITICAL ERROR: VITE_GEMINI_API_KEY is using a placeholder. Please provide a valid key.");
  }
  return key as string;
};

const getAI = () => new GoogleGenAI({ apiKey: getApiKey() });

// ==========================================
// CORE AUDIO ANALYSIS ENGINE (SHARED)
// ==========================================
const ANALYSIS_SYSTEM_PROMPT = `
[ROLE]
You are an elite Dialect Coach. Your job is to analyze the user's raw audio for pronunciation, flow, and clarity.

[NEGATIVE CONSTRAINTS - DO NOT IGNORE]
NO Stereotypes: Do not list 'common mistakes' for their region. Only list mistakes actually present in the audio.
NO IPA Symbols: Never use phonetic symbols. Use Simple Spelling (e.g., write 'Sheep' vs 'Ship' or 'Bed' vs 'Bad').
NO Generalities: If you don't hear a mistake, do not invent one.

[REQUIRED OUTPUT FORMAT]
You must output the feedback in this exact JSON structure:
{
  "accent_vibe": {
     "origin_guess": "Hints of Brazilian Portuguese / Strong French influence / etc",
     "energy": "Choppy / Melodic / Robot-like / Rushed"
  },
  "specific_sounds": [
    {
      "quote": "Exact sentence where it happened",
      "target_word": "The word they tried to say",
      "sounded_like": "Simple spelling representation"
    }
  ],
  "flow_music": {
    "word_stress": "You said pho-TOG-raphy, but it should be PHO-to-graphy",
    "rhythm": "Natural vs Machine Gun",
    "tone": "Rising/falling intonation issues"
  },
  "the_fix": ["Drill 1: Drop jaw", "Drill 2: Tongue position", "Drill 3..."]
}
`;

/**
 * Shared Engine: Analyzes audio using Gemini Multimodal capabilities.
 * @param audioBase64 Clean base64 string (no data URI header)
 * @param mimeType The exact MIME type of the audio recording (e.g. 'audio/webm', 'audio/mp4')
 */
export const analyzePronunciation = async (audioBase64: string, mimeType: string, contextText?: string): Promise<PronunciationAnalysis> => {
  const ai = getAI();

  const prompt = contextText
    ? `Analyze this user's pronunciation while reading this text: "${contextText}". Return JSON.`
    : "Analyze this user's speech pronunciation. Return JSON.";

  try {
    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: {
        parts: [
          // Dynamic MIME type is crucial for browser compatibility (Safari vs Chrome)
          { inlineData: { mimeType: mimeType, data: audioBase64 } },
          { text: prompt }
        ]
      },
      config: {
        systemInstruction: ANALYSIS_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    if (!response.text) throw new Error("Empty response from AI model");
    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("Pronunciation Analysis Error:", error);
    throw new Error(`Analysis Failed: ${error.message || "Unknown API error"}`);
  }
};

// ==========================================
// DEEP CHAT FEATURES
// ==========================================

export const initDeepChatScenario = async (mode: 'surprise' | 'custom', customTopic?: string): Promise<{ text: string; audio: AudioBuffer }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = mode === 'surprise'
      ? "Generate a creative, engaging roleplay scenario for an English learner. Think 'A detective interviewing a witness' or 'Two astronauts fixing a leak'. Start the conversation as the character. Do NOT say 'Hello how are you'. Jump into the scene."
      : `Start a roleplay scenario about: "${customTopic}". Jump straight into character.`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: prompt
    });

    const text = response.text || "Let's start the conversation.";
    const audio = await generateNativeAudio(text);
    return { text, audio };
  });
};

export const sendDeepChatMessage = async (
  history: ChatMessage[],
  userAudioBase64: string,
  mimeType: string
): Promise<{
  userText: string;
  modelText: string;
  modelAudio: AudioBuffer;
  analysis: PronunciationAnalysis
}> => {
  const ai = getAI();

  // 1. Transcribe & Chat Response (Parallel with Analysis)
  // We use the audio for the chat model to "hear" the user directly
  const chatPromise = callWithRetry(async () => {
    // Manually construct history for generateContent since chats.create logic with audio can be tricky with types
    const contents: any[] = history.map(h => ({
      role: h.role,
      parts: [{ text: h.content }]
    }));

    // Add current turn
    contents.push({
      role: 'user',
      parts: [
        { inlineData: { mimeType: mimeType, data: userAudioBase64 } },
        { text: "Respond to my spoken audio naturally as the roleplay character. Keep it brief (1 sentence)." }
      ]
    });

    const result = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: contents,
      config: {
        systemInstruction: "You are a roleplay partner. Keep responses concise (1-2 sentences) to keep the flow moving. Stay in character."
      }
    });

    return { modelResponse: result.text };
  });

  // 1b. Transcribe user audio (Helper)
  const transcribePromise = callWithRetry(async () => {
    const res = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: {
        parts: [{ inlineData: { mimeType: mimeType, data: userAudioBase64 } }, { text: "Transcribe exactly what was said." }]
      }
    });
    return res.text || "(Audio)";
  });

  // 2. Audio Analysis (The Engine)
  const analysisPromise = analyzePronunciation(userAudioBase64, mimeType);

  try {
    const [chatRes, transcript, analysis] = await Promise.all([chatPromise, transcribePromise, analysisPromise]);

    // 3. Generate Audio for Model Response
    const audioBuffer = await generateNativeAudio(chatRes.modelResponse || "I didn't catch that.");

    return {
      userText: transcript,
      modelText: chatRes.modelResponse || "",
      modelAudio: audioBuffer,
      analysis
    };
  } catch (error: any) {
    throw new Error(`Deep Chat Failed: ${error.message}`);
  }
};

export const analyzeFluencySprint = async (
  audioBase64: string,
  mimeType: string,
  topic: string,
  targetDurationMin: number
): Promise<SprintAnalysis> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `Analyze this fluency sprint recording.
    TOPIC: "${topic}"
    TARGET DURATION: ${targetDurationMin} minutes.
    
    Tasks:
    1. Transcribe the audio accurately.
    2. Count filler words (um, uh, like, you know, sort of).
    3. Analyze silence/pauses.
    4. Check relevance to the topic.
    5. SUGGEST UPGRADES:
       - If they used fillers, suggest native alternatives.
       - Suggest C1 level vocabulary upgrades for simple words they used.
       - Suggest linking words if sentences were choppy.
    
    Return JSON:
    {
      "transcript": "Full text transcription...",
      "fillerCount": number,
      "fillersUsed": ["um", "like"],
      "silenceScore": number (0-100, 100 is smooth flow),
      "paceFeedback": "Short feedback on their speed/hesitation.",
      "relevanceScore": number (0-100),
      "topicFeedback": "Did they stay on topic?",
      "nativeSwaps": {
         "fillers": [{ "word": "like", "alternatives": ["such as", "for instance"] }], 
         "connectors": ["However", "Therefore", "On the other hand"],
         "vocabUpgrades": [{ "original": "good", "upgrades": ["exceptional", "beneficial"] }]
      }
    }`;

    try {
      const response = await ai.models.generateContent({
        model: CURRENT_MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: audioBase64 } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      return JSON.parse(response.text || "{}");
    } catch (error: any) {
      console.error("Sprint Analysis Failed:", error);
      throw error;
    }
  });
};

// ==========================================
// READING LAB
// ==========================================

export const generateTextSampleStream = async (level: ProficiencyLevel, topic: string, format: string): Promise<TextSample> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `Act as an American English Educator. Create a high-quality ${format} about "${topic}" suitable for a ${level} level student.
    Ensure the vocabulary and sentence structure perfectly match the ${level} proficiency.
    
    Return ONLY a JSON object with this exact structure:
    {
      "title": "A compelling title",
      "content": "A 150-250 word text in the specified format.",
      "highlightedPhrases": [
        {
          "phrase": "A specific 2-4 word idiom, phrasal verb, or advanced phrase from the content above",
          "phoneticSpelling": "/.../",
          "definition": "Clear, contextual meaning of the phrase",
          "examples": ["Sentence using it naturally", "Another sentence"]
        }
      ]
    }
    Include exactly 5 highlightedPhrases. Ensure the 'phrase' exactly matches text within the 'content'.`;

    try {
      console.log("Generating reading with model:", CURRENT_MODEL_NAME);

      const response = await ai.models.generateContent({
        model: CURRENT_MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.7
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      if (!parsed.content) throw new Error("Generated sample is missing content.");

      return {
        ...parsed,
        id: Math.random().toString(36).substr(2, 9),
        level,
        topic,
        format,
        highlightedPhrases: Array.isArray(parsed.highlightedPhrases) ? parsed.highlightedPhrases : []
      };
    } catch (error: any) {
      console.error("Gemini API Error in Reading Lab:", error.message);
      throw error;
    }
  });
};

export const processCustomText = async (content: string): Promise<TextSample> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `Analyze this text for an American English learner: "${content.substring(0, 1000)}"
    Identify the proficiency level (Beginner, Intermediate, Advanced) and 5 useful native phrases.
    
    Return ONLY a JSON object:
    {
      "title": "Title for the text",
      "level": "Intermediate",
      "highlightedPhrases": [
        { "phrase": "string from text", "phoneticSpelling": "/.../", "definition": "...", "examples": ["..."] }
      ]
    }`;

    try {
      const response = await ai.models.generateContent({
        model: CURRENT_MODEL_NAME,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const parsed = JSON.parse(response.text || "{}");
      return {
        ...parsed,
        id: Math.random().toString(36).substr(2, 9),
        content,
        highlightedPhrases: Array.isArray(parsed.highlightedPhrases) ? parsed.highlightedPhrases : []
      };
    } catch (error: any) {
      console.error("Custom Text Processing Failed:", error.message);
      throw error;
    }
  });
};

/**
 * Analyzes a user's reading performance. 
 */
export const analyzeReading = async (targetText: string, audioBase64: string, mimeType: string): Promise<AnalysisResult> => {
  // 1. Scoring and word mapping
  const fastCheckPromise = callWithRetry(async () => {
    const ai = getAI();

    try {
      const response = await ai.models.generateContent({
        model: CURRENT_MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: audioBase64 } },
            {
              text: `Analyze the user's spoken fluency compared to this text: "${targetText}".
            Return ONLY a LIGHTWEIGHT JSON object:
            {
              "accuracyScore": number (0-100),
              "overallFeedback": "short sentence feedback",
              "phonemeIssues": [{ "originalWord": "...", "missedSound": "...", "ipaSymbol": "...", "fixTip": "..." }],
              "linkingIssues": [{ "phrase": "...", "tip": "..." }],
              "problemWords": ["max 3-4 words"]
            }` }
          ]
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      return JSON.parse(response.text || "{}");
    } catch (error: any) {
      console.error("Fast Check Error:", error);
      throw error;
    }
  });

  // 2. New Deep Analysis Engine
  const deepAnalysisPromise = analyzePronunciation(audioBase64, mimeType, targetText);

  try {
    // Execute in parallel
    const [fastRes, deepRes] = await Promise.all([fastCheckPromise, deepAnalysisPromise]);

    return {
      accuracyScore: fastRes.accuracyScore || 0,
      overallFeedback: fastRes.overallFeedback || "Processing complete.",
      phonemeIssues: fastRes.phonemeIssues || [],
      linkingIssues: fastRes.linkingIssues || [],
      problemWords: fastRes.problemWords || [],
      detailedAnalysis: deepRes,
      coach: {} as any
    };
  } catch (error: any) {
    throw new Error(`Analysis failed: ${error.message}`);
  }
};

/**
 * High-precision word-level analysis for Roleplay lines.
 */
export const analyzeRoleplayLine = async (targetLine: string, audioBase64: string, mimeType: string): Promise<RoleplayAnalysis> => {
  return callWithRetry(async () => {
    const ai = getAI();
    try {
      const response = await ai.models.generateContent({
        model: CURRENT_MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: audioBase64 } },
            {
              text: `Compare user audio to this exact line: "${targetLine}".
              Return ONLY a compact JSON structure for high-speed feedback:
              { 
                "score": number (0-100), 
                "missed_words": ["specific mispronounced words"], 
                "linking_notes": ["specific word pairs missed like 'Get out'"], 
                "improvement_tip": "one concrete tip" 
              }` }
          ]
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      const parsed = JSON.parse(response.text || "{}");
      return {
        score: parsed.score || 0,
        missed_words: parsed.missed_words || [],
        linking_notes: parsed.linking_notes || [],
        improvement_tip: parsed.improvement_tip || "Try to record again clearly."
      };
    } catch (error: any) {
      throw new Error(`Roleplay Analysis failed: ${error.message}`);
    }
  });
};

export const generateNativeScene = async (scenario: string, level: ProficiencyLevel): Promise<NativeScene> => {
  return callWithRetry(async () => {
    traceRequest(`generateNativeScene | scenario="${scenario.substring(0, 40)}" | level=${level}`);
    const ai = getAI();
    const levelInstructions: Record<ProficiencyLevel, string> = {
      [ProficiencyLevel.Beginner]: "Simple, literal language. No slang. Slow, clear sentences.",
      [ProficiencyLevel.Intermediate]: "Natural speed. Use common phrasal verbs and standard reductions (wanna, gotta).",
      [ProficiencyLevel.Advanced]: "Native speed. Heavy slang, cultural nuances, and complex phonetic linking.",
      [ProficiencyLevel.Native]: "Hyper-native speed. Dense idioms, strong reductions, connected speech, and colloquial expressions only a true native speaker would use."
    };

    const prompt = `Act as an American English Scriptwriter. Create a native dialogue scene.
    SCENARIO: ${scenario} | LEVEL: ${level} | CONSTRAINTS: ${levelInstructions[level]}
    Return JSON: {
      "title": string,
      "description": string,
      "imagePrompt": string,
      "script": [{ "speaker": string, "text": string, "isNativeMoment": boolean, "momentExplanation": string }]
    }`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      script: data.script || []
    };
  });
};

export const generateSceneImage = async (imagePrompt: string): Promise<string> => {
  return callWithRetry(async () => {
    traceRequest(`generateSceneImage | prompt="${imagePrompt.substring(0, 40)}"`);
    const ai = getAI();
    // Use gemini-2.5-flash-image (Nano Banana) for native image generation.
    // IMPORTANT: This model requires responseModalities: ['IMAGE'] — NOT imageConfig.
    // imageConfig is only for the Imagen3 API (ai.models.generateImages), not generateContent.
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: `Cinematic wide shot, American atmosphere: ${imagePrompt}`,
      config: {
        responseModalities: ['IMAGE'],
      }
    });
    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (part?.inlineData?.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
    // Graceful fallback: image gen failed but we allow the simulation to continue without an image
    console.warn('[generateSceneImage] No image data returned — continuing without scene image.');
    return "";
  });
};

export const generateMultiSpeakerAudio = async (script: SceneScriptPart[], level: ProficiencyLevel): Promise<AudioBuffer[]> => {
  const ai = getAI();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const speed = level === ProficiencyLevel.Beginner ? "slow" : level === ProficiencyLevel.Intermediate ? "natural" : "fast";

  const audioPromises = script.map(async (part, i) => {
    return callWithRetry(async () => {
      const voice = i % 2 === 0 ? 'Kore' : 'Puck';
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say this in a ${speed} American voice: ${part.text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        }
      });
      const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (data) {
        return await decodeAudioData(decode(data), audioContext, 24000, 1);
      }
      throw new Error("TTS generation failed");
    });
  });

  return await Promise.all(audioPromises);
};

/**
 * Sequential TTS generator — avoids concurrent API burst.
 * Generates one audio line at a time with a 200ms gap between requests.
 * Prevents the "6 simultaneous TTS calls" pattern that trips free-tier rate limits.
 */
export const generateMultiSpeakerAudioSequential = async (script: SceneScriptPart[], level: ProficiencyLevel): Promise<AudioBuffer[]> => {
  const ai = getAI();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const speed = level === ProficiencyLevel.Beginner ? "slow" : level === ProficiencyLevel.Intermediate ? "natural" : "fast";
  const results: AudioBuffer[] = [];

  for (let i = 0; i < script.length; i++) {
    const part = script[i];
    const voice = i % 2 === 0 ? 'Kore' : 'Puck';

    const buffer = await callWithRetry(async () => {
      traceRequest(`TTS-sequential | line=${i}/${script.length} | voice=${voice}`);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say this in a ${speed} American voice: ${part.text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        }
      });
      const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (data) return await decodeAudioData(decode(data), audioContext, 24000, 1);
      throw new Error("TTS generation failed for line " + i);
    });

    results.push(buffer);
    // 200ms pause between TTS requests to stay within the per-minute quota window
    if (i < script.length - 1) await new Promise(r => setTimeout(r, 200));
  }

  return results;
};

export const coachSceneQuestion = async (question: string, scene: NativeScene): Promise<{ text: string, audio: AudioBuffer }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: question,
      config: {
        systemInstruction: `Scene Context: ${scene.title}. Script: ${JSON.stringify(scene.script)}. Answer briefly and pedagogically.`
      }
    });
    const text = response.text || "I'm looking into that.";
    const audioRes = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
      }
    });
    const audioBase64 = audioRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    return { text, audio: await decodeAudioData(decode(audioBase64!), ctx, 24000, 1) };
  });
};

export const generateNativeAudio = async (text: string): Promise<AudioBuffer> => {
  return callWithRetry(async () => {
    traceRequest(`generateNativeAudio | text="${text.substring(0, 40)}"`);
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
      },
    });
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    return await decodeAudioData(decode(data!), ctx, 24000, 1);
  });
};

export const translateText = async (text: string, context: string): Promise<{ englishDefinition: string; synonyms: string; spanishTranslation: string }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `Context: "${context}".
    Analyze the term: "${text}".
    
    Return a JSON object with exactly these fields:
    {
      "englishDefinition": "Clear, concise meaning in English. Plain text only, NO markdown.",
      "synonyms": "2-3 common synonyms, comma-separated. Plain text only, NO markdown.",
      "spanishTranslation": "Direct translation to Spanish. Plain text only, NO markdown."
    }`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "{}");
  });
};

export const chatWithThinking = async (message: string, history: ChatMessage[]): Promise<{ text: string, thought?: string }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: message,
      config: {
        systemInstruction: "You are an expert American English Coach. Explain complex nuances clearly."
      }
    });
    return {
      text: response.text || "",
      thought: "Reasoning available in Pro mode."
    };
  });
};

export const searchWeb = async (query: string): Promise<{ text: string, sources: any[] }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: `Search for details about American English usage or cultural context for: "${query}"`,
      config: { tools: [{ googleSearch: {} }] }
    });
    return {
      text: response.text || "",
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  });
};

export const generateCoachSummaryAudio = async (analysis: AnalysisResult): Promise<{ audio: AudioBuffer, transcript: string }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const textResponse = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: `Summarize this analysis: ${JSON.stringify(analysis)}. Max 40 words. Encouraging coach tone.`
    });
    const transcript = textResponse.text || "Keep it up!";
    const audio = await generateNativeAudio(transcript);
    return { audio, transcript };
  });
};

export const generateHighQualityImage = async (prompt: string, aspectRatio: string, imageSize: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    // Use gemini-3-pro-image-preview for high quality image generation
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
          imageSize: imageSize as any
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    if (part?.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("No image was returned from the visual model.");
  });
};

export const generateVideoWithVeo = async (prompt: string, aspectRatio: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const validAspectRatio: '16:9' | '9:16' = (aspectRatio === '9:16' || aspectRatio === '16:9') ? (aspectRatio as '16:9' | '9:16') : '16:9';

    // Use veo-3.1-fast-generate-preview for video tasks
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: validAspectRatio
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video generation failed to return a link.");

    return `${downloadLink}&key=${import.meta.env.VITE_GEMINI_API_KEY}`;
  });
};

export const analyzeMedia = async (prompt: string, media: { data: string, mimeType: string }): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: {
        parts: [
          { inlineData: media },
          { text: prompt }
        ]
      }
    });
    return response.text || "Analysis complete, but no text output was provided.";
  });
};

export const generateDictationChallenge = async (level: string): Promise<DictationChallenge> => {
  const topics = ["History", "Sci-Fi", "Cooking", "Travel", "Office Gossip", "Philosophy"];
  const tones = ["Sarcastic", "Formal", "Excited", "Melancholic", "Urgent"];

  const topic = topics[Math.floor(Math.random() * topics.length)];
  const tone = tones[Math.floor(Math.random() * tones.length)];

  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `You are an expert English dialect coach. 
    Goal: Generate a short, unique dictation script (2-4 sentences).
    Parameters:
    - Topic: ${topic}
    - Tone: ${tone}
    - Proficiency Level: ${level} (Strict adherence to CEFR guidelines)
    
    Return ONLY a JSON object with this exact structure:
    {
      "script": "The actual text for the user to type.",
      "context": "A short setup (e.g., Two friends arguing in a cafe).",
      "difficult_words": ["word1", "word2"],
      "hint_definitions": {"word1": "definition...", "word2": "definition..."}
    }
    DO NOT repeat generic stories. Make it interesting.`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const parsed = JSON.parse(response.text || "{}");
    return {
      ...parsed,
      topic,
      tone,
      complexity: level
    };
  });
};

export const generateWritingChallenge = async (isHardMode: boolean): Promise<WritingChallenge> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `Act as a creative writing coach. Roll a virtual die to pick a category: Persuasion, Narrative, or Professional.
    Generate a unique writing challenge.
    ${isHardMode ? "HARD MODE ENABLED: Pick an obscure or difficult topic." : "Normal difficulty."}

    Return JSON:
    {
      "category": "Persuasion" | "Narrative" | "Professional",
      "prompt": "The specific instruction (e.g., Argue why broccoli is better than chocolate).",
      "constraints": ["Constraint 1", "Constraint 2"]
    }`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "{}");
  });
};

export const evaluateWriting = async (challenge: string, text: string): Promise<WritingFeedback> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `Act as an strict English editor. 
    Challenge: "${challenge}"
    User Text: "${text}"
    
    Evaluate on Vocabulary Variety, Grammar, and Tone Consistency.
    Return JSON:
    {
      "vocabScore": number (0-100),
      "grammarScore": number (0-100),
      "toneScore": number (0-100),
      "feedback": "Overall constructive feedback.",
      "corrections": [{ "original": "text segment", "correction": "fixed segment", "reason": "why" }]
    }`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "{}");
  });
};

export const evaluateImageDescription = async (imageBase64: string, userText: string, mimeType: string = 'image/jpeg'): Promise<ImageDescriptionFeedback> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `I am sending you an image and a user's description of it.
    1. Look at the image yourself.
    2. Compare the user's text to the actual image.
    3. Identify important details they missed.
    4. Correct their grammar.
    5. Generate a C1-level native speaker description (ideal_description).

    User Description: "${userText}"

    Return JSON:
    {
      "missedDetails": ["You missed the red ball", "You didn't mention the weather"],
      "grammarCorrections": [{ "original": "text", "correction": "fixed" }],
      "overallFeedback": "Brief summary of their observation skills.",
      "ideal_description": "Generate a 2-3 sentence paragraph describing this image as if you were a C1-level native English speaker. Use rich vocabulary, correct prepositions, and natural flow. Describe exactly what is visible."
    }`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME, // Supports multimodal input
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: imageBase64 } },
          { text: prompt }
        ]
      },
      config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "{}");
  });
};

// ==========================================
// V3 NEW FUNCTIONS
// ==========================================

/**
 * Generate a Grammar Mystery case with narrative + clues
 */
export const generateGrammarMystery = async (difficulty: ProficiencyLevel, grammarFocus: string): Promise<any> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const caseNum = Math.floor(Math.random() * 999) + 1;
    const prompt = `You are a creative detective story writer AND an English grammar expert.
Generate a Grammar Mystery case for ${difficulty} learners focused on: ${grammarFocus}.

Create a detective story where the grammar error IS the clue that cracks the case.

Return ONLY this JSON (no markdown, no text before or after):
{
  "id": "case_${caseNum}",
  "title": "A short dramatic case title (max 6 words)",
  "caseNumber": "${String(caseNum).padStart(3, '0')}",
  "difficulty": "${difficulty}",
  "grammarFocus": "${grammarFocus}",
  "narrative": "A gripping 2-3 sentence crime scene setup. The investigation centers around suspicious language used in a document/message. The grammar error will reveal the culprit.",
  "clues": [
    {
      "id": "clue_1",
      "text": "A witness reported: 'The suspect were seen leaving the building at midnight.' What is wrong?",
      "errorWord": "were",
      "options": ["'Were' should be 'was' (subject-verb agreement)", "'Suspect' should be 'suspects'", "Nothing is wrong", "'Leaving' should be 'left'"],
      "correctOption": "'Were' should be 'was' (subject-verb agreement)",
      "hint": "Correct! 'The suspect' is singular — it needs 'was', not 'were'.",
      "solved": false
    }
  ],
  "verdict": "One sentence wrapping up the detective narrative.",
  "explanation": "One clear sentence explaining the grammar rule tested."
}

Generate exactly 4 clues, each testing a different aspect of ${grammarFocus}.
Each clue must have exactly 4 options, only one correct.`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: 'application/json' }
    });

    const data = JSON.parse(response.text || '{}');
    // Ensure clues have solved:false
    if (data.clues) data.clues = data.clues.map((c: any) => ({ ...c, solved: false }));
    return data;
  });
};

/**
 * Check a single mystery clue answer (returns true/false + explanation)
 */
export const checkMysteryClue = async (clue: string, userAnswer: string, correctAnswer: string): Promise<{ correct: boolean; explanation: string }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `Grammar Quiz Check:
Clue: "${clue}"
User's answer: "${userAnswer}"
Correct answer: "${correctAnswer}"
Is the user correct? Give a brief 1-sentence encouragement or correction. Return JSON: { "correct": true/false, "explanation": "..." }`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: 'application/json' }
    });

    return JSON.parse(response.text || '{"correct": false, "explanation": "Please try again."}');
  });
};

/**
 * Fetch a time-aligned transcript for a YouTube video.
 *
 * Routes through the Vite dev-server proxy at /api/transcript (vite.config.ts),
 * which fetches caption XML using Node.js — completely bypassing browser CORS.
 * Strictly NO Gemini fallback (Anti-Hallucination Policy).
 */
export const generateYouTubeTranscript = async (videoId: string): Promise<YouTubeTranscriptLine[]> => {
  // Cache key v4: bumped to force re-fetch with improved VTT dedup parser
  const cacheKey = `yt_transcript_v4_${videoId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (_) { /* corrupt cache — fall through to fetch */ }
  }

  let res: Response;
  try {
    res = await fetch(`/api/transcript?v=${encodeURIComponent(videoId)}`);
  } catch (networkErr: any) {
    throw new Error(`Network error reaching transcript proxy: ${networkErr.message}`);
  }

  if (!res.ok) {
    let errMsg = `Proxy returned ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) errMsg = body.error;
    } catch (_) { }
    throw new Error(errMsg);
  }

  const lines: YouTubeTranscriptLine[] = await res.json();

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('No captions found for this video');
  }

  localStorage.setItem(cacheKey, JSON.stringify(lines));
  return lines;
};

/**
 * Analyze a shadowing attempt against the target text for rhythm + pronunciation
 */
export const analyzeShadowing = async (targetText: string, audioBase64: string, mimeType: string, accentPreference: string): Promise<any> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const accentHint = accentPreference === 'en-GB' ? 'British RP' : accentPreference === 'en-AU' ? 'Australian' : 'General American';

    const prompt = `You are an elite pronunciation and rhythm coach specializing in ${accentHint} English.

The learner was shadowing this native speaker line:
"${targetText}"

Listen to their recording and evaluate:
1. RHYTHM SCORE (0-100): Did they match the stress patterns, linking, and natural flow?
2. PRONUNCIATION SCORE (0-100): How accurate were the individual sounds?
3. FEEDBACK: 2-3 sentences of specific, actionable coaching

Return ONLY this JSON:
{
  "rhythmScore": 72,
  "pronunciationScore": 68,
  "feedback": "Your rhythm on 'fascinating' was natural, but watch the linking between 'that's' and 'really' — native speakers blend these into 'thasreally'. Work on reducing the pause before stressed syllables.",
  "coach": {
    "accent_vibe": "Your accent has hints of...",
    "specific_sounds": [{ "target_word": "fascinating", "phonetic_spelling": "FA-sih-nay-ting", "issue": "Stress on wrong syllable", "fix": "Stress the first syllable: FA-sih-nay-ting", "the_fix": ["Drill: say 'fascinating' slowly 5 times", "Tap your finger on the FA syllable"] }],
    "flow_and_music": "Overall rhythm assessment",
    "elite_summary": "One sentence overall assessment"
  }
}`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: prompt }
        ]
      },
      config: { responseMimeType: 'application/json' }
    });

    return JSON.parse(response.text || '{}');
  });
};

/**
 * Generate native TTS audio with accent preference
 */
export const generateNativeAudioWithAccent = async (text: string, accentHint: string): Promise<AudioBuffer> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const { decodeAudioData } = await import('./audioUtils');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: { parts: [{ text: `Say this ${accentHint}: "${text}"` }] },
      config: { responseModalities: [Modality.AUDIO] }
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
    if (!audioPart?.inlineData) throw new Error('No audio returned');
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    return await decodeAudioData(decode(audioPart.inlineData.data), ctx, 24000, 1);
  });
};

// ==========================================
// AI STORY GENERATION (DETECTIVE — MYSTERY FOCUS)
// ==========================================

/**
 * Generate a complete detective mystery episode.
 * Stories are pre-generated by developers/admins via the CMS and stored in the DB.
 * Focuses on deduction-based gameplay (no grammar drills).
 */
export const generateDetectiveStory = async (
  level: ProficiencyLevel,
  mysteryTheme: string,
  existingPlotlines: string[],
  tone: string = 'mysterious'
) => {
  return callWithRetry(async () => {
    const ai = getAI();

    const memoryConstraint = existingPlotlines.length > 0
      ? `CRITICAL: Do NOT reuse any of these existing plots:\n${existingPlotlines.map(p => `- ${p}`).join('\n')}\nInvent a completely original crime, setting, and suspects.`
      : '';

    const cefrGuide: Record<string, string> = {
      'A1-A2 (Beginner)': 'Very short sentences (max 10 words). Simple present/past. Basic vocabulary only. Slow, clear speech rhythm.',
      'B1-B2 (Intermediate)': 'Natural flowing sentences. Mix of tenses. Common idioms, phrasal verbs. Moderate complexity.',
      'C1-C2 (Advanced)': 'Complex sentences. Subtle implications, red herrings. Advanced vocabulary, idioms, implied meaning. Ambiguous clues.',
      'Native-Like (Mastery)': 'Native-speed dialogue. Heavy nuance, cultural references, and sophisticated deduction required.'
    };

    const systemPrompt = `You are a master mystery writer creating content for a language-learning detective app.
Target CEFR Level: ${level}
Language guidelines: ${cefrGuide[level] || cefrGuide['B1-B2 (Intermediate)']}
Tone: ${tone} (make the story feel genuinely ${tone})
Mystery theme: ${mysteryTheme}

${memoryConstraint}

RULES:
1. Create an ORIGINAL mystery with a clear logical solution.
2. Generate 3-4 suspects, each with a unique perspective. ONE of them is the culprit.
3. Each suspect has 4-6 lines of dialogue across scenes. Their testimony has ONE internal contradiction or lie.
4. Mark 1 dialogue per suspect as isHiddenClue:true — it contains the subtle contradiction a sharp listener would notice.
5. Include 2-3 physical evidence clues (availableClues). The key evidence must logically connect to the culprit.
6. Every dialogue line MUST have a "knowMore" object with vocabulary, expressions, and grammar for CEFR-appropriate learning.
7. Logic mini-puzzles (quiz): embed 2-3 quizzes total, type must be "true-false" or "identify-lie".
8. The solution must reference a real suspect name and a real clue id from the data you generate.
9. Organize dialogue into scenes (e.g., "Crime Scene", "Interrogation Room", "Courtyard").`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        suspects: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              avatarSeed: { type: Type.STRING },
              isInitiallyUnlocked: { type: Type.BOOLEAN }
            },
            required: ['name', 'role', 'avatarSeed', 'isInitiallyUnlocked']
          }
        },
        solution: {
          type: Type.OBJECT,
          properties: {
            culpritName: { type: Type.STRING },
            keyEvidenceId: { type: Type.STRING },
            explanation: { type: Type.STRING },
            languageTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['culpritName', 'keyEvidenceId', 'explanation', 'languageTakeaways']
        },
        scenes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              dialogues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    character: { type: Type.STRING },
                    text: { type: Type.STRING },
                    expression: { type: Type.STRING, enum: ['neutral', 'angry', 'surprised', 'happy', 'suspicious'] },
                    isHiddenClue: { type: Type.BOOLEAN },
                    knowMore: {
                      type: Type.OBJECT,
                      nullable: true,
                      properties: {
                        vocabulary: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              word: { type: Type.STRING },
                              ipa: { type: Type.STRING },
                              definition: { type: Type.STRING },
                              example: { type: Type.STRING }
                            },
                            required: ['word', 'ipa', 'definition', 'example']
                          }
                        },
                        expressions: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              phrase: { type: Type.STRING },
                              meaning: { type: Type.STRING }
                            },
                            required: ['phrase', 'meaning']
                          }
                        },
                        grammar: {
                          type: Type.OBJECT,
                          properties: {
                            pattern: { type: Type.STRING },
                            explanation: { type: Type.STRING },
                            examples: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ['pattern', 'explanation', 'examples']
                        }
                      },
                      required: ['vocabulary', 'expressions', 'grammar']
                    },
                    quiz: {
                      type: Type.OBJECT,
                      nullable: true,
                      properties: {
                        type: { type: Type.STRING, enum: ['true-false', 'identify-lie'] },
                        prompt: { type: Type.STRING },
                        sentence: { type: Type.STRING },
                        correctAnswer: { type: Type.STRING },
                        hint: { type: Type.STRING }
                      },
                      required: ['type', 'prompt', 'sentence', 'correctAnswer', 'hint']
                    }
                  },
                  required: ['character', 'text', 'expression', 'isHiddenClue']
                }
              }
            },
            required: ['name', 'dialogues']
          }
        },
        availableClues: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ['id', 'name', 'description']
          }
        }
      },
      required: ['title', 'description', 'suspects', 'solution', 'scenes', 'availableClues']
    };

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: "Generate the mystery detective story JSON now.",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.85
      }
    });

    if (!response.text) throw new Error("AI returned empty story data.");
    return JSON.parse(response.text);
  });
};

/**
 * Lazily generate "Know More" learning content for a single dialogue line.
 * Used as a fallback when a line does not have a pre-generated knowMore block.
 */
export const explainDialogueLine = async (
  text: string,
  level: ProficiencyLevel
): Promise<{ vocabulary: any[]; expressions: any[]; grammar: any }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const prompt = `You are an English language coach for CEFR level ${level}.
Analyze this dialogue line from a detective story: "${text}"

Return JSON with useful learning content for a language learner:
{
  "vocabulary": [{ "word": "...", "ipa": "/.../ ", "definition": "...", "example": "..." }],
  "expressions": [{ "phrase": "...", "meaning": "..." }],
  "grammar": { "pattern": "...", "explanation": "...", "examples": ["...", "..."] }
}
Focus on 1-3 vocabulary items, 0-2 expressions, and 1 grammar pattern actually present in the line.`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.3 }
    });
    return JSON.parse(response.text || '{"vocabulary":[],"expressions":[],"grammar":{"pattern":"","explanation":"","examples":[]}}');
  });
};

// ==========================================
// DETECTIVE STORIES INQUIRY (BLACK STORIES STYLE)
// ==========================================
export const askDetectiveQuestion = async (
  question: string,
  context: string,
  witnessName: string
): Promise<{ answer: "Yes" | "No" | "Irrelevant" | "Elaborate"; explanation: string }> => {
  return callWithRetry(async () => {
    const ai = getAI();

    const systemPrompt = `
You are playing a "Black Stories" style lateral thinking game as the witness/character '${witnessName}'.
The user is a detective asking you a question about the mystery.
Context about the mystery and your knowledge:
${context}

Rules for answering:
1. You can ONLY answer "Yes", "No", "Irrelevant", or "Elaborate" (if the question is too vague).
2. "Yes" means the user's assumption/question is correct.
3. "No" means it is incorrect.
4. "Irrelevant" means the detail does not matter to solving the mystery.
5. Provide a very short, cryptic in-character explanation (max 1 sentence) without giving away the main solution directly unless they explicitly guessed it.

Respond in exact JSON format:
{
  "answer": "Yes" | "No" | "Irrelevant" | "Elaborate",
  "explanation": "Short 1-sentence in-character response."
}
`;

    const response = await ai.models.generateContent({
      model: CURRENT_MODEL_NAME,
      contents: question,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.3
      }
    });

    if (!response.text) throw new Error("AI returned empty judgment data.");
    return JSON.parse(response.text);
  });
};