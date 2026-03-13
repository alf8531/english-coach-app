import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });

async function run() {
    try {
        const res = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "Can you transcribe the first 30 seconds of this YouTube video? https://www.youtube.com/watch?v=iCvmsMzlF7o"
        });
        console.log(res.text);
    } catch (e) {
        console.error(e);
    }
}
run();
