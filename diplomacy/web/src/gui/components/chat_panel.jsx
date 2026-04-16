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
    MainContainer,
    ChatContainer,
    MessageList,
    MessageSeparator,
    Sidebar,
    ConversationList,
    Conversation,
    Avatar,
    Message as ChatMessage,
} from "@chatscope/chat-ui-kit-react";

import AUS from "../assets/AUS.png";
import ENG from "../assets/ENG.png";
import FRA from "../assets/FRA.png";
import GER from "../assets/GER.png";
import ITA from "../assets/ITA.png";
import RUS from "../assets/RUS.png";
import TUR from "../assets/TUR.png";
import GLOBAL from "../assets/GLOBAL.png";

const POWER_ICONS = {
    AUSTRIA: AUS,
    ENGLAND: ENG,
    FRANCE: FRA,
    GERMANY: GER,
    ITALY: ITA,
    RUSSIA: RUS,
    TURKEY: TUR,
    Centaur: GLOBAL,
    omniscient_type: GLOBAL,
};

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
        messageHighlights,
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

    // Build conversation list
    const convList = tabNames.map((protagonist) => (
        <Conversation
            style={isCurrent ? { minWidth: "220px" } : undefined}
            info={
                isCurrent && isAdmin && protagonist !== "GLOBAL"
                    ? engine.powers[protagonist].getController()
                    : isCurrent
                    ? undefined
                    : undefined
            }
            className={
                protagonist === currentTabId
                    ? "cs-conversation--active"
                    : null
            }
            onClick={() => onChangeTab(protagonist)}
            key={protagonist}
            name={protagonist}
            unreadCnt={countUnreadMessages(engine, role, protagonist)}
            unreadDot={hasUnreadAdvice(engine, role, protagonist)}
        >
            <Avatar
                src={POWER_ICONS[protagonist]}
                name={protagonist}
                size="sm"
            />
        </Conversation>
    ));

    // Wrap past-mode conversations in a min-width div
    const wrappedConvList = isCurrent
        ? convList
        : convList.map((conv) => (
              <div key={conv.key} style={{ minWidth: "220px" }}>
                  {conv}
              </div>
          ));

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
        const html = msg.hide
            ? `<div class="blurred">${msg.message}</div>`
            : msg.message;

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
                model={{
                    sent: msg.time_sent,
                    sender: sender,
                    direction: dir,
                    position: "single",
                }}
                avatarPosition={dir === "outgoing" ? "tr" : "tl"}
                key={`${sender}-${rec}-${m}`}
            >
                <Avatar
                    src={POWER_ICONS[sender]}
                    name={sender}
                    size="sm"
                />
                <ChatMessage.HtmlContent html={html} />
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
                <div
                    style={{
                        borderRadius: "8px",
                        overflow: "hidden",
                        height: "550px",
                        backgroundColor: "#fff",
                        boxShadow:
                            "0 3px 3px -2px rgba(0,0,0,0.2), 0 3px 4px 0 rgba(0,0,0,0.14), 0 1px 8px 0 rgba(0,0,0,0.12)",
                    }}
                >
                    <div style={{ width: "100%", height: "100%" }}>
                        <MainContainer responsive>
                            <Sidebar position="left" scrollable={true}>
                                <ConversationList>
                                    {wrappedConvList}
                                </ConversationList>
                            </Sidebar>
                            <ChatContainer>
                                <MessageList>{renderedMessages}</MessageList>
                            </ChatContainer>
                        </MainContainer>
                        {engine.isPlayerGame() && (
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
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Past phase: simpler layout without message input
    return (
        <div
            className={isWide ? "col-12" : "col-6"}
            style={{ height: "500px" }}
        >
            <MainContainer responsive>
                <Sidebar
                    style={{ maxWidth: "220px" }}
                    position="left"
                    scrollable={false}
                >
                    <ConversationList>{wrappedConvList}</ConversationList>
                </Sidebar>
                <ChatContainer>
                    <MessageList>{renderedMessages}</MessageList>
                </ChatContainer>
            </MainContainer>
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
