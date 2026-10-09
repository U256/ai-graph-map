import { useCallback, useEffect, useState } from 'react';

type SetValue<T> = (value: T | ((prev: T) => T)) => void;

function getQueryValue(key: string): string | null {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get(key);
}

function setQueryValue(key: string, value: string | null) {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);

    if (value === null) {
        params.delete(key);
    } else {
        params.set(key, value);
    }

    const search = params.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;

    window.history.replaceState(window.history.state, '', url);
}

// @ts-ignore
export function useUrlQuery(key: string, defaultValue: string): [string, SetValue<string>];
export function useUrlQuery(key: string, defaultValue?: string): [string | undefined, SetValue<string | undefined>];
export function useUrlQuery(key: string, defaultValue?: string): [string | undefined, SetValue<string | undefined>] {
    const [value, setValueState] = useState<string | undefined>(() => {
        const fromUrl = getQueryValue(key);
        return fromUrl !== null ? fromUrl : defaultValue;
    });

    // Синхронизация при изменениях в URL (кнопки назад/вперёд, ручные правки)
    useEffect(() => {
        const handleChange = () => {
            const fromUrl = getQueryValue(key);
            setValueState(fromUrl !== null ? fromUrl : defaultValue);
        };

        window.addEventListener('popstate', handleChange);
        return () => window.removeEventListener('popstate', handleChange);
    }, [key, defaultValue]);

    const setValue = useCallback<SetValue<string | undefined>>(
        (next) => {
            setValueState((prev) => {
                const resolved =
                    typeof next === 'function' ? (next as (p: string | undefined) => string | undefined)(prev) : next;

                // undefined => удаляем параметр
                setQueryValue(key, resolved === undefined ? null : resolved);
                return resolved;
            });
        },
        [key],
    );

    return [value, setValue];
}
