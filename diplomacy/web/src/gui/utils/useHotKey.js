import { useEffect, useRef } from "react";
import PropTypes from "prop-types";

export function useHotKey(keys, onKeysCoincide) {
    const cbRef = useRef(onKeysCoincide);
    cbRef.current = onKeysCoincide;

    const keyStr = Array.isArray(keys) ? keys.join(",").toLowerCase() : "";

    useEffect(() => {
        if (!keyStr) return undefined;
        const targets = keyStr.split(",");
        const handler = (e) => {
            if (e.key && targets.includes(e.key.toLowerCase())) {
                cbRef.current(e);
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [keyStr]);
}

export function HotKey({ keys, onKeysCoincide }) {
    useHotKey(keys, onKeysCoincide);
    return null;
}

HotKey.propTypes = {
    keys: PropTypes.arrayOf(PropTypes.string).isRequired,
    onKeysCoincide: PropTypes.func.isRequired,
};
