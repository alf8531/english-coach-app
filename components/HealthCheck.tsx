import { useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from "@google/genai";

/**
 * HealthCheck — Mount-Once Status Popup
 *
 * Architecture rules:
 * 1. Both useEffects use [] (empty deps) — fire exactly once on mount.
 * 2. A hasMounted ref prevents any double-fire from StrictMode.
 * 3. Error display is always sanitized — never renders raw objects or massive strings.
 * 4. Auto-hides after 4 seconds regardless of API result.
 * 5. 429 / quota errors get a dedicated user-friendly message.
 */
export const HealthCheck = () => {
    const [status, setStatus] = useState<string>('Checking API…');
    const [isVisible, setIsVisible] = useState<boolean>(true);
    const [isError, setIsError] = useState<boolean>(false);

    // Strict guard: prevents React StrictMode double-invocation from firing twice
    const hasMounted = useRef(false);

    // Rule 1: Auto-hide timer — mount-once
    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(false), 4000);
        return () => clearTimeout(timer);
    }, []);

    // Rule 2: API check — mount-once with hasMounted guard
    useEffect(() => {
        if (hasMounted.current) return;
        hasMounted.current = true;

        const checkAPI = async () => {
            // Serve from session cache if we already know it works
            const cached = sessionStorage.getItem('health_check_ok');
            if (cached === 'true') {
                setStatus('✅ API Connected');
                setIsError(false);
                return;
            }

            try {
                const key = import.meta.env.VITE_GEMINI_API_KEY;
                if (!key || key === "YOUR_API_KEY_HERE" || key === "PLACEHOLDER_API_KEY") {
                    setStatus('❌ API Key Missing');
                    setIsError(true);
                    return;
                }

                const ai = new GoogleGenAI({ apiKey: key as string });
                const res = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: 'Say exactly: OK'
                });

                if (res.text?.includes("OK")) {
                    sessionStorage.setItem('health_check_ok', 'true');
                    setStatus('✅ API Connected');
                    setIsError(false);
                } else {
                    setStatus('⚠️ Unexpected API response');
                    setIsError(true);
                }
            } catch (err: any) {
                setIsError(true);

                // Sanitize: detect 429 / rate limit first
                const msg: string = typeof err?.message === 'string' ? err.message : '';
                const isRateLimit =
                    err?.status === 429 ||
                    msg.toLowerCase().includes('429') ||
                    msg.toLowerCase().includes('quota') ||
                    msg.toLowerCase().includes('rate limit') ||
                    msg.toLowerCase().includes('resource_exhausted') ||
                    msg.toLowerCase().includes('too many requests');

                if (isRateLimit) {
                    setStatus('⏳ AI rate limited — wait 60s');
                } else if (msg && msg.length > 0) {
                    // Cap at 80 chars; never render JSON blobs or stack traces
                    const safe = msg.startsWith('{') || msg.startsWith('[')
                        ? 'API connection error'
                        : msg.substring(0, 80) + (msg.length > 80 ? '…' : '');
                    setStatus(`❌ ${safe}`);
                } else {
                    setStatus('❌ API connection error');
                }
            }
        };

        checkAPI();
    }, []);

    if (!isVisible) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                background: isError ? '#1a1a1a' : '#0f172a',
                color: isError ? '#fca5a5' : '#94a3b8',
                padding: '10px 14px',
                zIndex: 9999,
                borderRadius: 10,
                fontSize: '13px',
                maxWidth: 320,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                border: isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
                fontFamily: 'monospace',
                lineHeight: 1.5,
            }}
        >
            <div style={{ color: isError ? '#f87171' : '#e2e8f0', fontWeight: 'bold', marginBottom: 2 }}>
                {status}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.5 }}>
                {window.location.hostname}
            </div>
        </div>
    );
};
