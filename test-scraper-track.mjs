import https from "https";

const videoId = "iCvmsMzlF7o";
const url = `https://www.youtube.com/watch?v=${videoId}`;

https.get(url, (res) => {
    let data = "";
    res.on("data", chunk => data += chunk);
    res.on("end", () => {
        const match = data.match(/"captionTracks":(\[.*?\])/);
        if (match) {
            const tracks = JSON.parse(match[1]);
            const enTrack = tracks.find(t => t.languageCode === 'en' || (t.name && t.name.simpleText.includes('English')));
            console.log("Base URL:", enTrack.baseUrl);
        } else {
            console.log("No caption tracks found in HTML.");
        }
    });
});
