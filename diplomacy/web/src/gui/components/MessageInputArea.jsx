import React from "react";
import PropTypes from "prop-types";
import { Row } from "./layouts";
import { Button } from "./button";

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
        <Row>
            <textarea
                style={{ resize: "both" }}
                cols={30}
                onChange={(e) => setValue(e.target.value)}
                value={value}
                disabled={disabled}
                placeholder={disabled ? "You need to set orders for all units before sending messages." : ""}
            />
            <Button
                key="t"
                pickEvent={true}
                title="Truth"
                color="success"
                onClick={() => handleSend("Truth")}
                disabled={!hasInitialOrders}
            />
            <Button
                key="f"
                pickEvent={true}
                title="Lie"
                color="danger"
                onClick={() => handleSend("Lie")}
                disabled={!hasInitialOrders}
            />
        </Row>
    );
});

MessageInputArea.propTypes = {
    sendMessage: PropTypes.func.isRequired,
    networkGame: PropTypes.object.isRequired,
    currentTabId: PropTypes.string,
    disabled: PropTypes.bool.isRequired,
    hasInitialOrders: PropTypes.bool.isRequired,
};
