import { useEffect, useState } from 'react';
import { GoogleGenAI } from "@google/genai";

export const HealthCheck = () => {
    const [status, setStatus] = useState<string>('Checking...');
    const [isVisible, setIsVisible] = useState<boolean>(true);

    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(false), 4000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const checkAPI = async () => {
            const cached = sessionStorage.getItem('health_check_ok');
            if (cached === 'true') {
                setStatus('✅ API Key is visible and working correctly! (Cached)');
                return;
            }

            try {
                const key = import.meta.env.VITE_GEMINI_API_KEY;
                if (!key || key === "YOUR_API_KEY_HERE" || key === "PLACEHOLDER_API_KEY") {
                    setStatus(`❌ Missing or Invalid Key. Value is: ${key ? '[Exists but Invalid]' : 'Undefined'}`);
                    return;
                }

                const ai = new GoogleGenAI({ apiKey: key as string });
                const res = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: 'Say exactly: OK'
                });

                if (res.text?.includes("OK")) {
                    sessionStorage.setItem('health_check_ok', 'true');
                    setStatus('✅ API Key is visible and working correctly!');
                } else {
                    setStatus('❓ API reached but unexpected response.');
                }

            } catch (err: any) {
                setStatus(`❌ API Error: ${err.message}`);
            }
        };

        checkAPI();
    }, []);

    if (!isVisible) return null;

    return (
        <div style={{ position: 'fixed', bottom: 10, right: 10, background: 'black', color: 'white', padding: '10px 15px', zIndex: 9999, borderRadius: 8, fontSize: '14px', maxWidth: '400px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ marginBottom: 4 }}><strong>Status:</strong> {status}</div>
            <div style={{ fontSize: '11px', color: '#aaa', wordBreak: 'break-all' }}>
                <strong>URL:</strong> {window.location.href}<br />
                <strong>Dir:</strong> {window.location.pathname}
            </div>
        </div>
    );
};
