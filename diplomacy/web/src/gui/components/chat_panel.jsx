// ==============================================================================
// Copyright (C) 2019 - Philip Paquette, Steven Bocco
//
//  This program is free software: you can redistribute it and/or modify it under
//  the terms of the GNU Affero General Public License as published by the Free
//  Software Foundation, either version 3 of the License, or (at your option) any
//  later version.
//
//  This program is distributed in the hope that it will be useful, but WITHOUT
//  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
//  FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
//  details.
//
//  You should have received a copy of the GNU Affero General Public License along
//  with this program.  If not, see <https://www.gnu.org/licenses/>.
// ==============================================================================
import React from "react";
import PropTypes from "prop-types";
import { Col } from "./layouts";
import { MessageInputArea } from "./MessageInputArea";
import {
    POWER_ICONS,
    ChatShell,
    ConversationList,
    ConversationItem,
    MessageList,
    MessageSeparator,
    ChatMessage,
} from "./chat";

/**
 * ChatPanel renders the conversation list sidebar and message history for
 * both current and past phases.
 */
export const ChatPanel = React.forwardRef(function ChatPanel(
    {
        engine,
        role,
        isWide,
        isCurrent,
        currentPowerName,
        // Message state
        tabCurrentMessages,
        tabPastMessages,
        annotatedMessages,
        hasInitialOrders,
        // eslint-disable-next-line no-unused-vars
        messageHighlights, // passed in from content_game; reserved for future badge highlighting
        // Callbacks
        onChangeTabCurrentMessages,
        onChangeTabPastMessages,
        sendMessage,
        handleRecipientAnnotation,
        // Helpers
        blurMessages,
        countUnreadMessages,
        hasUnreadAdvice,
        getOrders,
    },
    messageInputRef
) {
    const isAdmin =
        engine.role === "omniscient_type" ||
        engine.role === "master_type" ||
        engine.role === "observer_type";

    const messageChannels = engine.getMessageChannels(role, true);
    const filteredMessageChannels = blurMessages(engine, messageChannels);

    const tabNames = [];
    for (let powerName of Object.keys(engine.powers))
        if (powerName !== role) tabNames.push(powerName);
    tabNames.sort();

    const currentTabId = isCurrent
        ? tabCurrentMessages || tabNames[0]
        : tabPastMessages || tabNames[0];

    const onChangeTab = isCurrent
        ? onChangeTabCurrentMessages
        : onChangeTabPastMessages;

    const conversationList = (
        <ConversationList>
            {tabNames.map((protagonist) => (
                <ConversationItem
                    key={protagonist}
                    name={protagonist}
                    avatar={POWER_ICONS[protagonist]}
                    info={
                        isCurrent && isAdmin && protagonist !== "GLOBAL"
                            ? engine.powers[protagonist].getController()
                            : undefined
                    }
                    active={protagonist === currentTabId}
                    onClick={() => onChangeTab(protagonist)}
                    unreadCnt={countUnreadMessages(engine, role, protagonist)}
                    unreadDot={hasUnreadAdvice(engine, role, protagonist)}
                />
            ))}
        </ConversationList>
    );

    // Build messages
    const renderedMessages = [];
    let protagonist = currentTabId;
    let msgs = filteredMessageChannels[protagonist];
    let sender = "";
    let rec = "";
    let dir = "";
    let curPhase = "";
    let prevPhase = "";

    for (let m in msgs) {
        let msg = msgs[m];
        sender = msg.sender;
        rec = msg.recipient;
        curPhase = msg.phase;

        if (curPhase !== prevPhase) {
            renderedMessages.push(
                <MessageSeparator key={`sep-${msg.phase}-${m}`}>
                    {curPhase}
                </MessageSeparator>
            );
            prevPhase = curPhase;
        }

        if (role === sender) dir = "outgoing";
        if (role === rec) dir = "incoming";

        renderedMessages.push(
            <ChatMessage
                key={`${sender}-${rec}-${m}`}
                direction={dir}
                sender={sender}
                avatar={POWER_ICONS[sender]}
                blurred={msg.hide}
            >
                {msg.message}
            </ChatMessage>
        );

        // Deception annotation for incoming messages (current phase only)
        if (isCurrent && dir === "incoming") {
            let messageId = msg.sender + "-" + msg.time_sent.toString();
            renderedMessages.push(
                <div
                    key={`ann-${messageId}`}
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                    }}
                >
                    Is the above message deceptive?
                    <div id={messageId}>
                        <Col>
                            <input
                                type="radio"
                                value="yes"
                                name={messageId}
                                checked={
                                    Object.prototype.hasOwnProperty.call(
                                        annotatedMessages,
                                        msg.time_sent
                                    ) &&
                                    annotatedMessages[msg.time_sent] === "yes"
                                }
                                onChange={() =>
                                    handleRecipientAnnotation(
                                        msg.time_sent,
                                        "yes"
                                    )
                                }
                                disabled={isAdmin}
                            />
                            yes&nbsp;
                            <input
                                type="radio"
                                value="none"
                                name={messageId}
                                checked={
                                    Object.prototype.hasOwnProperty.call(
                                        annotatedMessages,
                                        msg.time_sent
                                    ) &&
                                    annotatedMessages[msg.time_sent] === "None"
                                }
                                onChange={() =>
                                    handleRecipientAnnotation(
                                        msg.time_sent,
                                        "None"
                                    )
                                }
                                disabled={isAdmin}
                            />
                            no
                        </Col>
                    </div>
                </div>
            );
        }
    }

    const phaseType = engine.getPhaseType();

    if (isCurrent) {
        // Current phase: card layout with message input
        const orders = getOrders(engine);
        return (
            <div className={isWide ? "col-12 mb-4" : "col-6 mb-4"}>
                <ChatShell
                    height="550px"
                    sidebar={conversationList}
                    footer={
                        engine.isPlayerGame() && (
                            <MessageInputArea
                                ref={messageInputRef}
                                sendMessage={sendMessage}
                                networkGame={engine.client}
                                currentTabId={currentTabId}
                                disabled={
                                    phaseType === "M" &&
                                    (!hasInitialOrders ||
                                        (orders[currentPowerName] &&
                                            Object.keys(
                                                orders[currentPowerName]
                                            ).length <
                                                engine.orderableLocations[
                                                    currentPowerName
                                                ].length))
                                }
                                hasInitialOrders={hasInitialOrders}
                            />
                        )
                    }
                >
                    <MessageList key={currentTabId}>{renderedMessages}</MessageList>
                </ChatShell>
            </div>
        );
    }

    // Past phase: simpler layout without message input
    return (
        <div className={isWide ? "col-12" : "col-6"}>
            <ChatShell height="500px" sidebar={conversationList}>
                <MessageList key={currentTabId}>{renderedMessages}</MessageList>
            </ChatShell>
        </div>
    );
});

ChatPanel.propTypes = {
    engine: PropTypes.object.isRequired,
    role: PropTypes.string.isRequired,
    isWide: PropTypes.bool.isRequired,
    isCurrent: PropTypes.bool.isRequired,
    currentPowerName: PropTypes.string,
    tabCurrentMessages: PropTypes.string,
    tabPastMessages: PropTypes.string,
    annotatedMessages: PropTypes.object.isRequired,
    hasInitialOrders: PropTypes.bool.isRequired,
    messageHighlights: PropTypes.object,
    onChangeTabCurrentMessages: PropTypes.func.isRequired,
    onChangeTabPastMessages: PropTypes.func.isRequired,
    sendMessage: PropTypes.func.isRequired,
    handleRecipientAnnotation: PropTypes.func.isRequired,
    blurMessages: PropTypes.func.isRequired,
    countUnreadMessages: PropTypes.func.isRequired,
    hasUnreadAdvice: PropTypes.func.isRequired,
    getOrders: PropTypes.func.isRequired,
};
