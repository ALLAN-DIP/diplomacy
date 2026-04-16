/**
 * Hook that provides class-component-like setState that returns a Promise.
 * Resolves after the component has re-rendered with the new state.
 *
 * Also provides a forceUpdate() that returns a Promise.
 *
 * Usage:
 *   const { state, setState, stateRef, forceUpdate } = usePromiseState(initialState);
 *   // setState returns a Promise, like class component's:
 *   //   this.setState(update, callback) => new Promise(resolve => super.setState(update, resolve))
 *   // stateRef.current always has the latest state (useful in async callbacks).
 */
import { useState, useRef, useCallback, useEffect } from "react";

export function usePromiseState(initialState) {
    const [state, setStateRaw] = useState(initialState);
    const [forceUpdateTick, setForceUpdateTick] = useState(0);
    const stateRef = useRef(state);
    const pendingResolvers = useRef([]);

    // Keep ref in sync with latest state on every render.
    stateRef.current = state;

    // After each render, resolve any pending promises.
    useEffect(() => {
        const resolvers = pendingResolvers.current.splice(0);
        resolvers.forEach((r) => r());
    });

    const setState = useCallback((update) => {
        return new Promise((resolve) => {
            pendingResolvers.current.push(resolve);
            setStateRaw((prev) => {
                const next = typeof update === "function" ? update(prev) : { ...prev, ...update };
                stateRef.current = next;
                return next;
            });
        });
    }, []);

    const forceUpdate = useCallback(() => {
        return new Promise((resolve) => {
            pendingResolvers.current.push(resolve);
            setForceUpdateTick((c) => c + 1);
        });
    }, []);

    return { state, setState, stateRef, forceUpdate, forceUpdateTick };
}
