import { useEffect, useRef, useState } from 'react';

/**
 * HealthCheck — Mount-Once Status Popup (Passive Mode)
 *
 * Architecture rules:
 * 1. NO live API calls. The previous implementation fired generateContent("Say OK") on
 *    every page load, burning one precious quota slot before the user even clicks anything.
 * 2. Only checks for API key presence — a passive check with zero network cost.
 * 3. Both useEffects use [] (mount-once). hasMounted ref prevents StrictMode double-fire.
 * 4. Auto-hides after 4 seconds, always.
 * 5. sessionStorage caches the result for 30 minutes so even the key check doesn't flash on
 *    every navigation within a session.
 */
export const HealthCheck = () => {
    const [status, setStatus] = useState<string>('Checking API…');
    const [isVisible, setIsVisible] = useState<boolean>(true);
    const [isError, setIsError] = useState<boolean>(false);

    // Prevents React StrictMode double-invocation
    const hasMounted = useRef(false);

    // Auto-hide timer — mount-once
    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(false), 4000);
        return () => clearTimeout(timer);
    }, []);

    // Passive API key check — mount-once, ZERO network requests
    useEffect(() => {
        if (hasMounted.current) return;
        hasMounted.current = true;

        const check = () => {
            // 30-minute session cache — don't even flash on navigation
            const cached = sessionStorage.getItem('health_ts');
            if (cached && Date.now() - parseInt(cached, 10) < 30 * 60 * 1000) {
                setStatus('✅ API Ready');
                setIsError(false);
                return;
            }

            const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

            if (!key || key === 'YOUR_API_KEY_HERE' || key === 'PLACEHOLDER_API_KEY' || key.length < 10) {
                setStatus('❌ API Key Missing');
                setIsError(true);
                return;
            }

            // Key is present — mark as OK without a network call
            sessionStorage.setItem('health_ts', String(Date.now()));
            setStatus('✅ API Ready');
            setIsError(false);
        };

        check();
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
