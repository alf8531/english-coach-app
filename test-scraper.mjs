import https from "https";

const videoId = "iCvmsMzlF7o";
const url = `https://www.youtube.com/watch?v=${videoId}`;

https.get(url, (res) => {
    let data = "";
    res.on("data", chunk => data += chunk);
    res.on("end", () => {
        const match = data.match(/"captionTracks":(\[.*?\])/);
        if (match) {
            console.log("Caption Tracks Found!", match[1].substring(0, 100) + "...");
            const tracks = JSON.parse(match[1]);
            console.log(tracks.map(t => t.languageCode + " " + t.name.simpleText));
        } else {
            console.log("No caption tracks found in HTML.");
        }
    });
}).on("error", (e) => {
    console.error(e);
});
