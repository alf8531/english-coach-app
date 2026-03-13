// ============================================================
// V3 Types — American English Mastery & Fluency Coach
// ============================================================

export enum ProficiencyLevel {
  Beginner = 'A1-A2 (Beginner)',
  Intermediate = 'B1-B2 (Intermediate)',
  Advanced = 'C1-C2 (Advanced)',
  Native = 'Native-Like (Mastery)',
}

export type AccentPreference = 'en-US' | 'en-GB' | 'en-AU';

// --- Reading Lab ---
export interface HighlightedPhrase {
  phrase: string;
  phonetic: string;
  definition: string;
  example: string;
}

export interface TextSample {
  title: string;
  content: string;
  highlightedPhrases: HighlightedPhrase[];
}

// --- Analysis ---
export interface PhonemeIssue {
  word: string;
  issue: string;
  tip: string;
}

export interface LinkingIssue {
  context: string;
  issue: string;
  tip: string;
}

export interface CoachFeedback {
  accent_vibe: string;
  specific_sounds: { target_word: string; phonetic_spelling: string; issue: string; fix: string; the_fix: string[] }[];
  flow_and_music: string;
  elite_summary: string;
}

export interface AnalysisResult {
  accuracyScore: number;
  phonemeIssues: PhonemeIssue[];
  linkingIssues: LinkingIssue[];
  coach: CoachFeedback;
  nativeAudioBase64?: string;
}

// --- Chat ---
export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  audioBase64?: string;
  analysis?: CoachFeedback;
}

// --- Vocab / SRS ---
export interface VocabItem {
  id: string;
  word: string;
  phonetic: string;
  definition: string;
  example: string;
  dateAdded: number;
  // SRS (SM-2) fields
  nextReviewAt: number;
  interval: number;        // days until next review
  easeFactor: number;      // default 2.5
  repetitions: number;     // consecutive correct reviews
  srsLevel: 'new' | 'learning' | 'review' | 'mastered';
}

// --- XP & Progress ---
export interface XPEntry {
  module: 'reading' | 'writing' | 'listening' | 'deepchat' | 'flashcards' | 'youtube' | 'mystery';
  amount: number;
  ts: number;
}

export interface ScoreEntry {
  module: 'reading' | 'writing' | 'listening' | 'deepchat' | 'youtube';
  score: number;
  ts: number;
}

// --- Streak ---
export interface StreakData {
  streak: number;
  lastActiveDate: string;      // 'YYYY-MM-DD'
  modulesCompletedToday: string[];
}

// --- Deep Chat ---
export interface RoleplayScenario {
  setting: string;
  userRole: string;
  aiRole: string;
  openingLine: string;
  audioBase64?: string;
}

export interface SprintAnalysis {
  fillerCount: number;
  silenceScore: number;
  paceScore: number;
  relevanceScore: number;
  wordsPerMinute?: number;
  fillerDetails: { filler: string; count: number; nativeSwap: string }[];
  connectorSuggestions: string[];
  vocabUpgrades: { original: string; upgrade: string; context: string }[];
  overallFeedback: string;
}

// --- Listening Lab ---
export interface ScriptLine {
  speaker: string;
  text: string;
  audioBase64?: string;
  wordTimings?: WordTiming[];
}

export interface WordTiming {
  word: string;
  startMs: number;
  durationMs: number;
}

export interface DictationChallenge {
  script: string;
  audioBase64?: string;
  level: ProficiencyLevel;
  topic: string;
  tone: string;
}

export interface DictationResult {
  accuracy: number;
  correctWords: number;
  totalWords: number;
  errors: { expected: string; got: string }[];
}

// --- Writing Workshop ---
export interface WritingChallenge {
  category: 'Persuasion' | 'Narrative' | 'Professional';
  prompt: string;
  constraints: string[];
  timeLimit?: number;
}

export interface WritingFeedback {
  vocabScore: number;
  grammarScore: number;
  toneScore: number;
  overallFeedback: string;
  corrections: { original: string; corrected: string; explanation: string }[];
  nativeSuggestions: { original: string; moreNatural: string; moreProfessional: string }[];
  redlineHtml?: string;
}

export interface ImageDescriptionFeedback {
  missedDetails: string[];
  grammarNotes: string[];
  idealDescription: string;
  score: number;
}

// --- YouTube Shadowing ---
export interface YouTubeTranscriptWord {
  word: string;
  startTime: number;   // seconds
  endTime: number;
}

export interface YouTubeTranscriptLine {
  text: string;
  startTime: number;
  endTime: number;
  words: YouTubeTranscriptWord[];
}

export interface ShadowingResult {
  rhythmScore: number;
  pronunciationScore: number;
  feedback: string;
  coach: CoachFeedback;
}

// --- Grammar Mystery ---
export interface MysteryCase {
  id: string;
  title: string;
  caseNumber: string;
  difficulty: ProficiencyLevel;
  grammarFocus: string;
  narrative: string;
  clues: MysteryClue[];
  verdict: string;
  explanation: string;
}

export interface MysteryClue {
  id: string;
  text: string;          // sentence with grammar error embedded
  errorWord?: string;    // the problematic word/phrase
  options: string[];     // multiple choice
  correctOption: string;
  hint: string;
  solved: boolean;
}

export interface MysteryProgress {
  caseId: string;
  cluesSolved: string[];
  totalClues: number;
  completed: boolean;
  score: number;
  ts: number;
}

// --- Media Lab ---
export interface GeneratedMedia {
  type: 'image' | 'video';
  url?: string;
  base64?: string;
  mimeType: string;
  prompt: string;
  ts: number;
}

// --- Detective Stories (Interactive Visual Novel) ---
export type StoryQuizType = 'true-false' | 'identify-lie' | 'contradiction';
export type StoryTone = 'funny' | 'mysterious' | 'scary' | 'curious' | 'dramatic' | 'suspenseful' | 'imaginative';

// Learning layer shown when user taps "Saber más" on a dialogue line
export interface KnowMoreContent {
  vocabulary: { word: string; ipa: string; definition: string; example: string }[];
  expressions: { phrase: string; meaning: string }[];
  grammar: { pattern: string; explanation: string; examples: string[] };
}

// Suspect profile used in the Suspect Hub grid
export interface SuspectProfile {
  name: string;
  role: string;               // e.g. "A horse trainer"
  avatarSeed: string;         // dicebear seed
  isInitiallyUnlocked: boolean;
}

// Pre-determined solution stored alongside the episode
export interface CaseSolution {
  culpritName: string;
  keyEvidenceId: string;      // must match a StoryClue.id
  explanation: string;        // shown on verdict reveal
  languageTakeaways: string[]; // key expressions learned from this case
}

export interface StoryQuiz {
  id: string;
  type: StoryQuizType;
  prompt: string;
  sentence?: string;
  options?: string[];
  correctAnswer: string;
  hint?: string;
}

export interface StoryDialogue {
  id: string;
  character: string;
  text: string;
  audioUrl?: string;
  ttsVoice?: string;
  expression?: 'neutral' | 'angry' | 'surprised' | 'happy' | 'suspicious';
  isHiddenClue?: boolean;       // subtle contradiction/clue the attentive learner can spot
  knowMore?: KnowMoreContent;   // pre-generated "Saber más" learning layer
  quiz?: StoryQuiz;
}

export interface StoryScene {
  id: string;
  name: string;
  backgroundUrl?: string;
  dialogues: StoryDialogue[];
}

export interface StoryClue {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  discoveredAtDialogueId?: string;
}

export interface StoryEpisode {
  id: string;
  title: string;
  description: string;
  level: ProficiencyLevel;
  tone?: StoryTone;             // e.g. 'funny', 'mysterious', 'scary'
  coverImageUrl?: string;
  suspects: SuspectProfile[];   // AI-generated cast (populated by generator)
  solution: CaseSolution;       // pre-determined answer (populated by generator)
  scenes: StoryScene[];
  availableClues: StoryClue[];
  isDailyCase?: boolean;
  dailyDate?: string;           // 'YYYY-MM-DD'
  isPublished: boolean;
  ts: number;
}

// Per-episode progress stored in localStorage
export interface EpisodeProgress {
  episodeId: string;
  starsEarned: number;          // 0–3
  interviewedSuspects: string[];
  collectedClueIds: string[];
  contradictionsFound: string[];
  quizzesPassed: number;
  totalQuizzes: number;
  verdictSubmitted: boolean;
  verdictCorrect?: boolean;
  completedAt?: number;
}

// Gamification achievements
export interface DetectiveAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;                 // emoji
  unlockedAt?: number;          // timestamp; undefined = locked
}
