/**
 * Hook for managing stored identity in localStorage
 */
import { useState, useCallback, useEffect } from 'react';
const STORAGE_KEY_IDENTITY = 'swimchain-identity';
export function useStoredIdentity() {
    const [identity, setIdentityState] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    // Load identity from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_IDENTITY);
            if (stored) {
                const parsed = JSON.parse(stored);
                setIdentityState(parsed);
            }
        }
        catch (error) {
            console.error('Failed to load identity:', error);
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    const setIdentity = useCallback((newIdentity) => {
        try {
            localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(newIdentity));
            setIdentityState(newIdentity);
        }
        catch (error) {
            console.error('Failed to save identity:', error);
        }
    }, []);
    const clearIdentity = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY_IDENTITY);
            setIdentityState(null);
        }
        catch (error) {
            console.error('Failed to clear identity:', error);
        }
    }, []);
    return {
        identity,
        setIdentity,
        clearIdentity,
        isLoading,
    };
}
//# sourceMappingURL=useStoredIdentity.js.map