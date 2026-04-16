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
import { AdminPowersInfoTable } from "./admin_powers_info_table";
import { PowerView } from "../utils/power_view";
import {
    MainContainer,
    ChatContainer,
    MessageList,
    MessageSeparator,
    MessageInput,
    ConversationHeader,
    Message as ChatMessage,
} from "@chatscope/chat-ui-kit-react";

/**
 * StatsPanel renders the admin power info table and captain's log for
 * admin/observer roles.
 */

// Column definitions for the power info table
const TABLE_POWER_VIEW = {
    name: ["Power", 0],
    controller: ["Controller", 1],
    order_is_set: ["With orders", 2],
    wait: ["Ready", 3],
    comm_status: ["Comm. Status", 4],
};

export function PowerInfoPanel({ engine, currentPowerName }) {
    const isAdminRole =
        engine.role === "omniscient_type" ||
        engine.role === "observer_type" ||
        engine.role === "master_type";

    if (!isAdminRole) return <div></div>;

    const powerNames = Object.keys(engine.powers);

    function isNotSelf(power) {
        return engine.role !== power;
    }

    const filteredPowerNames = powerNames.filter(isNotSelf);
    const filteredPowers = filteredPowerNames.map((pn) => engine.powers[pn]);

    powerNames.sort();
    filteredPowerNames.sort();

    return (
        <div className={"col-lg-6 col-md-12"}>
            <div className={"table-responsive"}>
                <AdminPowersInfoTable
                    className={"table table-striped table-sm"}
                    caption={"Powers info"}
                    columns={TABLE_POWER_VIEW}
                    data={filteredPowers}
                    wrapper={PowerView.wrap}
                    countries={filteredPowerNames}
                    player={currentPowerName}
                />
            </div>
        </div>
    );
}

PowerInfoPanel.propTypes = {
    engine: PropTypes.object.isRequired,
    currentPowerName: PropTypes.string,
};

export function LogsPanel({
    engine,
    role,
    logData,
    setLogDataInputValue,
    sendLogData,
}) {
    const curController = engine.powers[role].getController();

    const powerLogs = engine.getLogsForPower(role, true);
    let renderedLogs = [];
    let curPhase = "";
    let prevPhase = "";
    powerLogs.forEach((log) => {
        if (log.phase !== prevPhase) {
            curPhase = log.phase;
            renderedLogs.push(
                <MessageSeparator key={`log-sep-${curPhase}`}>
                    {curPhase}
                </MessageSeparator>
            );
            prevPhase = curPhase;
        }

        renderedLogs.push(
            <ChatMessage
                key={`log-${log.time_sent}`}
                model={{
                    message: log.message,
                    sent: log.time_sent,
                    sender: role,
                    direction: "outgoing",
                    position: "single",
                }}
            ></ChatMessage>
        );
    });

    return (
        <div style={{ height: "500px" }}>
            <MainContainer responsive>
                <ChatContainer>
                    <ConversationHeader>
                        <ConversationHeader.Content userName={curController} />
                    </ConversationHeader>
                    <MessageList>{renderedLogs}</MessageList>
                    {engine.isPlayerGame() && (
                        <MessageInput
                            attachButton={false}
                            onChange={(val) => setLogDataInputValue(val)}
                            onSend={() => {
                                sendLogData(engine.client, logData);
                            }}
                        />
                    )}
                </ChatContainer>
            </MainContainer>
        </div>
    );
}

LogsPanel.propTypes = {
    engine: PropTypes.object.isRequired,
    role: PropTypes.string.isRequired,
    logData: PropTypes.string.isRequired,
    setLogDataInputValue: PropTypes.func.isRequired,
    sendLogData: PropTypes.func.isRequired,
};
