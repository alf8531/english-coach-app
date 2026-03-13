import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

async function run() {
    const envContent = fs.readFileSync(".env.local", "utf8");
    const match = envContent.match(/VITE_GEMINI_API_KEY=(.*)/);
    if (!match) {
        console.error("VITE_GEMINI_API_KEY not found in .env.local");
        process.exit(1);
    }
    const apiKey = match[1].split(' ')[0].trim(); // just in case there's a comment
    const ai = new GoogleGenAI({ apiKey });

    console.log("Sending Hello to gemini-2.5-flash...");
    const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Hello"
    });
    console.log("Response:", res.text);
}

run().catch(console.error);
