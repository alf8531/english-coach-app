import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Firestore } from '@google-cloud/firestore';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' }));

// Initialize Firestore
// Parse credentials from Render environment variables since we are not on Cloud Run
const firestoreOptions = process.env.FIRESTORE_CREDENTIALS 
    ? { credentials: JSON.parse(process.env.FIRESTORE_CREDENTIALS) } 
    : {};
const firestore = new Firestore(firestoreOptions);
const STORIES_COLLECTION = 'stories';

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// YouTube Transcript Proxy API (Replicated from vite.config.ts)
app.get('/api/transcript', async (req, res) => {
    const videoId = req.query.v;

    if (!videoId) {
        return res.status(400).json({ error: 'Missing video ID' });
    }

    try {
        const tmpDir = os.tmpdir();
        const outTemplate = path.join(tmpDir, `yt_${videoId}`);

        console.log(`[transcript-proxy] Fetching captions for ${videoId} via yt-dlp...`);

        try {
            // In the Docker container, we'll ensure python3 and yt-dlp are installed
            await execFileAsync('python3', [
                '-m', 'yt_dlp',
                '--write-auto-sub',
                '--write-sub',
                '--sub-lang', 'en',
                '--skip-download',
                '--no-warnings',
                '--convert-subs', 'vtt',
                '-o', outTemplate,
                `https://www.youtube.com/watch?v=${videoId}`,
            ], { timeout: 30000 });
        } catch (dlErr) {
            console.error('[transcript-proxy] yt-dlp failed:', dlErr.stderr || dlErr.message);
            return res.status(404).json({ error: 'No captions found for this video.' });
        }

        // Find the downloaded .vtt file
        let vttContent = '';
        const allFiles = fs.readdirSync(tmpDir);
        const vttFile = allFiles.find(f => f.startsWith(`yt_${videoId}`) && f.endsWith('.vtt'));

        if (vttFile) {
            const fullPath = path.join(tmpDir, vttFile);
            vttContent = fs.readFileSync(fullPath, 'utf-8');
            try { fs.unlinkSync(fullPath); } catch (_) { }
        }

        if (!vttContent) {
            return res.status(404).json({ error: 'Captions were not available for this video.' });
        }

        // Parse WebVTT (using the logic from vite.config.ts)
        const lines = [];
        const blocks = vttContent.split(/\n\n+/);

        for (const block of blocks) {
            const rows = block.trim().split('\n');
            const tsRow = rows.find(r => r.includes('-->'));
            if (!tsRow) continue;

            const m = tsRow.match(/(\d+):(\d+):(\d+)[.,](\d+)\s*-->\s*(\d+):(\d+):(\d+)[.,](\d+)/);
            if (!m) continue;

            const startTime = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
            const endTime = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
            const dur = Math.max(endTime - startTime, 0.5);

            const tsIdx = rows.indexOf(tsRow);
            const rawText = rows.slice(tsIdx + 1)
                .join(' ')
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/\s+/g, ' ')
                .trim();

            if (!rawText) continue;

            if (lines.length > 0 &&
                lines[lines.length - 1].text === rawText &&
                Math.abs(lines[lines.length - 1].startTime - startTime) < 1) {
                continue;
            }

            const wordStrs = rawText.split(/\s+/).filter(Boolean);
            const tpw = dur / Math.max(wordStrs.length, 1);

            lines.push({
                text: rawText,
                startTime,
                endTime,
                words: wordStrs.map((w, i) => ({
                    word: w,
                    startTime: startTime + i * tpw,
                    endTime: startTime + (i + 1) * tpw,
                })),
            });
        }

        res.json(lines);
    } catch (err) {
        console.error('[transcript-proxy] Error:', err);
        res.status(500).json({ error: err.message || 'Unknown proxy error' });
    }
});

// Stories API with Firestore
app.get('/api/stories', async (req, res) => {
    try {
        const snapshot = await firestore.collection(STORIES_COLLECTION).orderBy('ts', 'desc').get();
        const stories = [];
        snapshot.forEach(doc => {
            stories.push({ id: doc.id, ...doc.data() });
        });
        res.json(stories);
    } catch (err) {
        console.error('Firestore Read Error:', err);
        res.status(500).json({ error: 'Failed to load stories from database.' });
    }
});

app.post('/api/stories', async (req, res) => {
    try {
        const stories = req.body; // Expecting an array of StoryEpisode
        if (!Array.isArray(stories)) {
            return res.status(400).json({ error: 'Invalid data format. Expected an array.' });
        }

        const batch = firestore.batch();

        // In a real app, we might want to sync exactly what changed, 
        // but for simplicity mirroring the CMS logic, we'll overwrite.
        // First, we should probably delete existing or just update by ID.
        for (const story of stories) {
            const docRef = firestore.collection(STORIES_COLLECTION).doc(story.id);
            batch.set(docRef, story, { merge: true });
        }

        await batch.commit();
        res.json({ success: true });
    } catch (err) {
        console.error('Firestore Write Error:', err);
        res.status(500).json({ error: 'Failed to save stories to database.' });
    }
});

// Fallback to index.html for SPA routing
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
