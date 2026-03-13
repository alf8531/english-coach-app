import { GoogleGenAI } from "@google/genai";
import fs from "fs";

// Read from .env.local manually
const envFile = fs.readFileSync(".env.local", "utf-8");
const keyMatch = envFile.match(/VITE_GEMINI_API_KEY=(.*)/);
const apiKey = keyMatch ? keyMatch[1] : "";

const ai = new GoogleGenAI({ apiKey });

async function run() {
    try {
        const res = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: "Please transcribe the first 20 seconds of this video, with timestamps: https://www.youtube.com/watch?v=iCvmsMzlF7o"
        });
        console.log(res.text);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
