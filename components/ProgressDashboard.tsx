import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flame, Star, TrendingUp, BookOpen, Zap, Brain, Headphones, Pen } from 'lucide-react';
import { useXP, levelFromXP, getWeeklyXP } from '../hooks/useXP';
import { useStreak } from '../hooks/useStreak';
import { useScoreHistory } from '../hooks/useScoreHistory';
import { useVocabDeck } from '../hooks/useVocabDeck';

interface Props {
    onBack: () => void;
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
    reading: <BookOpen size={14} />,
    writing: <Pen size={14} />,
    listening: <Headphones size={14} />,
    deepchat: <Zap size={14} />,
    youtube: <Brain size={14} />,
    mystery: <Star size={14} />,
};

const MODULE_COLORS: Record<string, string> = {
    reading: '#6366f1',
    writing: '#8b5cf6',
    listening: '#06b6d4',
    deepchat: '#f59e0b',
    youtube: '#ef4444',
    mystery: '#10b981',
};

// Pure SVG weekly bar chart
function WeeklyBarChart({ data }: { data: { day: string; xp: number }[] }) {
    const max = Math.max(...data.map(d => d.xp), 1);
    const barWidth = 32;
    const barGap = 10;
    const chartH = 100;
    const totalW = data.length * (barWidth + barGap);

    return (
        <svg width={totalW} height={chartH + 30} className="overflow-visible">
            {data.map((d, i) => {
                const barH = Math.max(4, (d.xp / max) * chartH);
                const x = i * (barWidth + barGap);
                const y = chartH - barH;
                return (
                    <g key={d.day}>
                        <rect x={x} y={y} width={barWidth} height={barH} rx={6}
                            fill={d.xp > 0 ? '#6366f1' : '#1e293b'} />
                        {d.xp > 0 && (
                            <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="#a5b4fc">
                                {d.xp}
                            </text>
                        )}
                        <text x={x + barWidth / 2} y={chartH + 18} textAnchor="middle" fontSize={11} fill="#64748b">
                            {d.day}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// Pure SVG score line chart
function ScoreLineChart({ data, color }: { data: { score: number; ts: number }[]; color: string }) {
    if (data.length < 2) {
        return (
            <div className="flex items-center justify-center h-20 text-slate-500 text-sm">
                Complete more sessions to see trends
            </div>
        );
    }

    const W = 280, H = 80, PAD = 10;
    const scores = data.map(d => d.score);
    const minS = Math.min(...scores);
    const maxS = Math.max(...scores, minS + 1);

    const points = data.map((d, i) => ({
        x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
        y: H - PAD - ((d.score - minS) / (maxS - minS)) * (H - PAD * 2),
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const last = points[points.length - 1];

    return (
        <svg width={W} height={H} className="overflow-visible w-full">
            <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={`${pathD} V${H} H${PAD} Z`} fill="url(#lineGrad)" />
            <path d={pathD} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={last.x} cy={last.y} r={4} fill={color} />
        </svg>
    );
}

// XP Ring
function XPRing({ xpInLevel, xpToNext, level }: { xpInLevel: number; xpToNext: number; level: number }) {
    const pct = xpInLevel / xpToNext;
    const r = 52, cx = 64, cy = 64;
    const circ = 2 * Math.PI * r;
    const dash = pct * circ;

    return (
        <div className="relative w-32 h-32 flex items-center justify-center">
            <svg width={128} height={128} className="absolute inset-0 -rotate-90">
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6366f1" strokeWidth={10}
                    strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.6s ease' }}
                />
            </svg>
            <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-white">{level}</span>
                <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">Level</span>
            </div>
        </div>
    );
}

export const ProgressDashboard: React.FC<Props> = ({ onBack }) => {
    const { totalXP, levelInfo, weeklyXP, log } = useXP();
    const { streak, modulesCompletedToday } = useStreak();
    const { getHistory, getRecentAverage } = useScoreHistory();
    const { deck, dueCount } = useVocabDeck();

    const readingHistory = useMemo(() => getHistory('reading').slice(-20), [getHistory]);
    const readingAvg = getRecentAverage('reading');
    const masteredWords = deck.filter(d => d.srsLevel === 'mastered').length;

    const stats = [
        { label: 'Day Streak', value: streak, icon: <Flame size={18} className="text-orange-400" />, color: 'from-orange-500/20 to-orange-500/5' },
        { label: 'Total XP', value: totalXP.toLocaleString(), icon: <Zap size={18} className="text-indigo-400" />, color: 'from-indigo-500/20 to-indigo-500/5' },
        { label: 'Vocab Mastered', value: masteredWords, icon: <BookOpen size={18} className="text-emerald-400" />, color: 'from-emerald-500/20 to-emerald-500/5' },
        { label: 'Due for Review', value: dueCount, icon: <Brain size={18} className="text-amber-400" />, color: 'from-amber-500/20 to-amber-500/5' },
        { label: 'Reading Avg', value: readingAvg ? `${readingAvg}%` : '—', icon: <TrendingUp size={18} className="text-cyan-400" />, color: 'from-cyan-500/20 to-cyan-500/5' },
    ];

    const recentXP = log.slice(-5).reverse();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button onClick={onBack}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
                        ←
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Progress Dashboard</h1>
                        <p className="text-slate-400 text-sm">Your learning journey at a glance</p>
                    </div>
                </div>

                {/* Level + XP Section */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-slate-800/80 to-indigo-900/40 rounded-2xl p-6 mb-6 border border-indigo-500/20 flex items-center gap-6">
                    <XPRing xpInLevel={levelInfo.xpInLevel} xpToNext={levelInfo.xpToNext} level={levelInfo.level} />
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl font-bold text-white">{levelInfo.label}</span>
                            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full border border-indigo-500/30">
                                Level {levelInfo.level}
                            </span>
                        </div>
                        <div className="text-slate-400 text-sm mb-3">
                            {levelInfo.xpInLevel} / {levelInfo.xpToNext} XP to next level
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                            <motion.div className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${(levelInfo.xpInLevel / levelInfo.xpToNext) * 100}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                            <Flame size={16} className="text-orange-400" />
                            <span className="text-white font-semibold">{streak} day streak</span>
                            {modulesCompletedToday.length > 0 && (
                                <span className="text-slate-400 text-xs">· {modulesCompletedToday.join(', ')} today</span>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                    {stats.map((s, i) => (
                        <motion.div key={s.label}
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.07 }}
                            className={`bg-gradient-to-br ${s.color} border border-white/5 rounded-2xl p-4`}>
                            <div className="flex items-center gap-2 mb-2">{s.icon}</div>
                            <div className="text-xl font-bold text-white">{s.value}</div>
                            <div className="text-slate-400 text-xs mt-1">{s.label}</div>
                        </motion.div>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Weekly XP Chart */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        className="bg-slate-800/60 border border-white/5 rounded-2xl p-6">
                        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                            <Zap size={16} className="text-indigo-400" /> Weekly XP
                        </h3>
                        <WeeklyBarChart data={weeklyXP} />
                    </motion.div>

                    {/* Reading Score Trend */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                        className="bg-slate-800/60 border border-white/5 rounded-2xl p-6">
                        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                            <TrendingUp size={16} className="text-cyan-400" /> Reading Score Trend
                        </h3>
                        <ScoreLineChart data={readingHistory} color="#06b6d4" />
                    </motion.div>

                    {/* Recent XP Activity */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                        className="bg-slate-800/60 border border-white/5 rounded-2xl p-6 md:col-span-2">
                        <h3 className="text-white font-semibold mb-4">Recent Activity</h3>
                        {recentXP.length === 0 ? (
                            <p className="text-slate-500 text-sm">Complete modules to see activity here.</p>
                        ) : (
                            <div className="space-y-2">
                                {recentXP.map((entry, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-700/40 rounded-xl">
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center"
                                            style={{ background: `${MODULE_COLORS[entry.module]}22` }}>
                                            {MODULE_ICONS[entry.module]}
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-white text-sm capitalize">{entry.module}</span>
                                            <span className="text-slate-500 text-xs ml-2">
                                                {new Date(entry.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <span className="text-indigo-400 font-bold text-sm">+{entry.amount} XP</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default ProgressDashboard;
