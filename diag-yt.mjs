// Test YouTube timedtext API (no auth needed)
const videoId = 'iCvmsMzlF7o';

// Strategy 1: YouTube public timedtext API
console.log('=== Testing timedtext API ===');
for (const fmt of ['vtt', 'srv1', 'srv2', 'srv3', 'ttml']) {
    const url = `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=${fmt}`;
    const r = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });
    const txt = await r.text();
    console.log(`fmt=${fmt}: status=${r.status} length=${txt.length}`);
    if (txt.length > 20) console.log('  First 150:', txt.substring(0, 150));
}

// Strategy 2: Use the innertube API 
console.log('\n=== Testing InnerTube API ===');
const innerTubeRes = await fetch('https://www.youtube.com/youtubei/v1/get_transcript', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240101.00.00',
    },
    body: JSON.stringify({
        context: {
            client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en' }
        },
        params: Buffer.from(`\n\x0b${videoId}`).toString('base64')
    })
});
const innerTubeText = await innerTubeRes.text();
console.log('InnerTube status:', innerTubeRes.status, 'length:', innerTubeText.length);
if (innerTubeText.length > 0) console.log('First 300:', innerTubeText.substring(0, 300));
