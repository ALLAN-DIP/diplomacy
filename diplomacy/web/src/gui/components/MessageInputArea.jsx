import React from "react";
import PropTypes from "prop-types";

/**
 * Controlled message draft textarea with Truth/Lie send buttons.
 *
 * Manages its own draft state so that per-keystroke updates never propagate
 * to the parent (ContentGame). The ref exposes setValue(text) so that the
 * advice panel's "add to textbox" button can set the draft imperatively
 * without lifting the state back up to ContentGame.
 */
export const MessageInputArea = React.forwardRef(function MessageInputArea(
    { sendMessage, networkGame, currentTabId, disabled, hasInitialOrders },
    ref,
) {
    const [value, setValue] = React.useState("");

    React.useImperativeHandle(ref, () => ({
        setValue(text) {
            setValue(text);
        },
    }));

    function handleSend(tone) {
        sendMessage(networkGame, currentTabId, value, tone, null);
        setValue("");
    }

    return (
        <div className="input-group chat-input">
            <textarea
                className="form-control"
                rows={1}
                onChange={(e) => setValue(e.target.value)}
                value={value}
                disabled={disabled}
                placeholder={disabled ? "You need to set orders for all units before sending messages." : ""}
            />
            <div className="input-group-append">
                <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleSend("Truth")}
                    disabled={!hasInitialOrders}
                >
                    Truth
                </button>
                <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleSend("Lie")}
                    disabled={!hasInitialOrders}
                >
                    Lie
                </button>
            </div>
        </div>
    );
});

MessageInputArea.propTypes = {
    sendMessage: PropTypes.func.isRequired,
    networkGame: PropTypes.object.isRequired,
    currentTabId: PropTypes.string,
    disabled: PropTypes.bool.isRequired,
    hasInitialOrders: PropTypes.bool.isRequired,
};
