import { YoutubeTranscript } from 'youtube-transcript';

async function run() {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript('n4NVe5_eLPI');
        console.log(transcript.slice(0, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
