import React from "react";
import PropTypes from "prop-types";
import "./chat.css";

import AUS from "../../assets/AUS.png";
import ENG from "../../assets/ENG.png";
import FRA from "../../assets/FRA.png";
import GER from "../../assets/GER.png";
import ITA from "../../assets/ITA.png";
import RUS from "../../assets/RUS.png";
import TUR from "../../assets/TUR.png";
import GLOBAL from "../../assets/GLOBAL.png";

export const POWER_ICONS = {
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

// Distance (px) from the bottom within which the list keeps sticking to new messages.
const STICK_THRESHOLD = 40;

const joinClasses = (...classes) => classes.filter(Boolean).join(" ");

/**
 * Bordered chat box: optional header bar, optional left sidebar, main content and footer.
 */
export const ChatShell = ({ header, sidebar, footer, height, className, style, children }) => (
    <div className={joinClasses("chat-shell", className)} style={{ height, ...style }}>
        {header && <div className="chat-header">{header}</div>}
        <div className="chat-body">
            {sidebar && <div className="chat-sidebar">{sidebar}</div>}
            <div className="chat-main">{children}</div>
        </div>
        {footer && <div className="chat-footer">{footer}</div>}
    </div>
);

ChatShell.propTypes = {
    header: PropTypes.node,
    sidebar: PropTypes.node,
    footer: PropTypes.node,
    height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    className: PropTypes.string,
    style: PropTypes.object,
    children: PropTypes.node,
};

export const ConversationList = ({ children }) => (
    <div className="list-group list-group-flush chat-conversation-list">{children}</div>
);

ConversationList.propTypes = {
    children: PropTypes.node,
};

export const ConversationItem = ({ name, info, avatar, active, unreadCnt, unreadDot, onClick }) => (
    <button
        type="button"
        className={joinClasses("list-group-item list-group-item-action chat-conversation", active && "active")}
        onClick={onClick}
    >
        {avatar && <img className="chat-avatar" src={avatar} alt={name} />}
        <span className="chat-conversation-text">
            <span className="chat-conversation-name">{name}</span>
            {info && <small className="chat-conversation-info">{info}</small>}
        </span>
        {unreadDot && <span className="badge badge-danger chat-unread-dot" title="Unread advice" />}
        {unreadCnt > 0 && <span className="badge badge-pill badge-primary">{unreadCnt}</span>}
    </button>
);

ConversationItem.propTypes = {
    name: PropTypes.string.isRequired,
    info: PropTypes.node,
    avatar: PropTypes.string,
    active: PropTypes.bool,
    unreadCnt: PropTypes.number,
    unreadDot: PropTypes.bool,
    onClick: PropTypes.func,
};

/**
 * Natively scrolling message list. Wheel/touch events are left to the browser, so scrolling
 * chains to the page once the list reaches its edge. Sticks to the bottom when new content
 * arrives, unless the user has scrolled up.
 */
export const MessageList = ({ autoScroll = true, className, children }) => {
    const listRef = React.useRef(null);
    const nearBottomRef = React.useRef(true);

    const handleScroll = () => {
        const el = listRef.current;
        nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD;
    };

    React.useLayoutEffect(() => {
        const el = listRef.current;
        if (autoScroll && el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
    });

    return (
        <div ref={listRef} className={joinClasses("chat-message-list", className)} onScroll={handleScroll}>
            {children}
        </div>
    );
};

MessageList.propTypes = {
    autoScroll: PropTypes.bool,
    className: PropTypes.string,
    children: PropTypes.node,
};

export const MessageSeparator = ({ children }) => <div className="chat-separator">{children}</div>;

MessageSeparator.propTypes = {
    children: PropTypes.node,
};

/**
 * A single message bubble. Content is rendered as text (never as HTML).
 */
export const ChatMessage = ({ direction = "incoming", sender, avatar, blurred, fill, className, children }) => (
    <div className={joinClasses("chat-message", `chat-message--${direction}`, fill && "chat-message--fill", className)}>
        {avatar && <img className="chat-avatar" src={avatar} alt={sender || ""} title={sender} />}
        <div className={joinClasses("chat-bubble", blurred && "blurred")}>{children}</div>
    </div>
);

ChatMessage.propTypes = {
    direction: PropTypes.oneOf(["incoming", "outgoing"]),
    sender: PropTypes.string,
    avatar: PropTypes.string,
    blurred: PropTypes.bool,
    fill: PropTypes.bool,
    className: PropTypes.string,
    children: PropTypes.node,
};

/**
 * Textarea with a Send button. Enter sends, Shift+Enter inserts a newline.
 */
export const ChatInput = ({ placeholder, disabled, onSend }) => {
    const [value, setValue] = React.useState("");

    const handleSend = () => {
        if (!value.trim()) return;
        onSend(value);
        setValue("");
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="input-group chat-input">
            <textarea
                className="form-control"
                rows={1}
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
            />
            <div className="input-group-append">
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={disabled || !value.trim()}
                    onClick={handleSend}
                >
                    Send
                </button>
            </div>
        </div>
    );
};

ChatInput.propTypes = {
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    onSend: PropTypes.func.isRequired,
};
