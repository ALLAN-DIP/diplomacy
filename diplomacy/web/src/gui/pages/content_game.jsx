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
import React, { useContext, useRef, useEffect, useCallback, useMemo } from "react";
import { SelectLocationForm } from "../forms/select_location_form";
import { SelectViaForm } from "../forms/select_via_form";
import { Order } from "../utils/order";
import { Row } from "../components/layouts";
import { extendOrderBuilding, ORDER_BUILDER, POSSIBLE_ORDERS } from "../utils/order_building";
import { UTILS } from "../../diplomacy/utils/utils";
import { Message } from "../../diplomacy/engine/message";
import { STRINGS } from "../../diplomacy/utils/strings";
import { Diplog } from "../../diplomacy/utils/diplog";
import { DipStorage } from "../utils/dipStorage";
import Helmet from "react-helmet";
import { Navigation } from "../components/navigation";
import { PageContext } from "../components/page_context";
import PropTypes from "prop-types";
import { Help } from "../components/help";
import { Tab } from "../components/tab";
import { Button } from "../components/button";
import { saveGameToDisk } from "../utils/saveGameToDisk";
import { Game } from "../../diplomacy/engine/game";
import { Queue } from "../../diplomacy/utils/queue";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import "./content_game.css";
import { default as Tabs2 } from "@mui/material/Tabs";
import { default as Tab2 } from "@mui/material/Tab";
import Box from "@mui/material/Box";
import Badge from "@mui/material/Badge";
import Grid from "@mui/material/Grid";
import {
    MainContainer,
    ChatContainer,
    MessageList,
    MessageSeparator,
    MessageInput,
    ConversationHeader,
    Message as ChatMessage,
} from "@chatscope/chat-ui-kit-react";

// Subcomponents
import { MapContainer } from "../components/map_container";
import { OrderPanel } from "../components/order_panel";
import { ChatPanel } from "../components/chat_panel";
import { PowerInfoPanel, LogsPanel } from "../components/stats_panel";
import { usePromiseState } from "../utils/usePromiseState";

const HotKey = require("react-shortcut");

/* Order management in game page.
 * When editing orders locally, we have to compare it to server orders
 * to determine when we need to update orders on server side. There are
 * 9 comparison cases, depending on orders:
 * SERVER    LOCAL      DECISION
 * null      null       0 (same)
 * null      {}         1 (different, user wants to send "no orders" on server)
 * null      {orders}   1 (different, user defines new orders locally)
 * {}        null       0 (assumed same: user is not allowed to "delete" a "no orders": he can only add new orders)
 * {}        {}         0 (same)
 * {}        {orders}   1 (different, user defines new orders locally and wants to overwrite the "no-orders" on server)
 * {orders}  null       1 (different, user wants to delete all server orders, will result to "no-orders")
 * {orders}  {}         1 (different, user wants to delete all server orders, will result to "no-orders")
 * {orders}  {orders}   same if we have exactly same orders on both server and local
 * */

function noPromise() {
    return new Promise((resolve) => resolve());
}

function buildInitialState(data) {
    // Load local orders from local storage (if available).
    const savedOrders = data.client
        ? DipStorage.getUserGameOrders(
            data.client.channel.username,
            data.game_id,
            data.phase,
        )
        : null;

    let orders = null;
    if (savedOrders) {
        orders = {};
        for (let entry of Object.entries(savedOrders)) {
            let powerOrders = null;
            const powerName = entry[0];
            if (entry[1]) {
                powerOrders = {};
                for (let orderString of entry[1]) {
                    const order = new Order(orderString, true);
                    powerOrders[order.loc] = order;
                }
            }
            orders[powerName] = powerOrders;
        }
    }

    return {
        tabMain: null,
        tabPastMessages: null,
        tabCurrentMessages: null,
        messageHighlights: {},
        historyPhaseIndex: null,
        historyShowOrders: true,
        historyCurrentLoc: null,
        historyCurrentOrders: null,
        displayVisualAdvice: null,
        orderDistribution: [], // [{ power: str, distribution: {order => {opacity: float, rank: int, pred_prob: float},...} },...]
        hoverDistributionOrder: [], // [ { order: str, power: str },... ]
        visibleDistributionOrder: [],
        orders: orders, // {power name => {loc => {local: bool, order: str}}}
        power: null,
        orderBuildingType: null,
        orderBuildingPath: [],
        showAbbreviations: true,
        mapSize: 6,
        logData: "",
        hasInitialOrders: data.getInitialOrders(data.role),
        annotatedMessages: data.getAnnotatedMessages(),
        stances: data.stances[data.role] || {},
        isBot: data.is_bot[data.role] || {
            AUSTRIA: false,
            ENGLAND: false,
            FRANCE: false,
            GERMANY: false,
            ITALY: false,
            RUSSIA: false,
            TURKEY: false,
        },
        hoverOrders: [],
        tabVal: STRINGS.MESSAGES,
        numAllCommentary: 0,
        numReadCommentary: 0,
        showBadge: false,
        commentaryProtagonist: null,
        lastSwitchPanelTime: Date.now(),
        commentaryTimeSpent: data.commentary_durations[data.role] || [],
        stanceChanged: false,
        visibleMoveSuggestions: {},
    };
}

function gameTitle(game) {
    let title = `${game.game_id} | `;
    const players = game.status === "active" ? game.status : `${game.countControlledPowers()} / 7 |`;
    title += players;
    const remainingTime = game.deadline_timer;
    const remainingHour = Math.floor(remainingTime / 3600);
    const remainingMinute = Math.floor((remainingTime - remainingHour * 3600) / 60);
    const remainingSecond = remainingTime - remainingHour * 3600 - remainingMinute * 60;

    if (remainingTime === undefined) {
        title += ` (deadline: ${game.deadline} sec)`;
    } else {
        title += " (remaining ";
        if (remainingHour > 0) {
            title += `${remainingHour}h `;
        }
        if (remainingMinute > 0) {
            title += `${remainingMinute}m `;
        }
        title += `${remainingSecond}s)`;
    }
    return title;
}

function getServerWaitFlags(engine) {
    const wait = {};
    const controllablePowers = engine.getControllablePowers();
    for (let powerName of controllablePowers) {
        wait[powerName] = engine.powers[powerName].wait;
    }
    return wait;
}

function getOrderBuilding(powerName, orderType, orderPath) {
    return {
        type: orderType,
        path: orderPath,
        power: powerName,
        builder: orderType && ORDER_BUILDER[orderType],
    };
}

export const ContentGame = ({ data }) => {
    const page = useContext(PageContext);
    const { state, setState, stateRef, forceUpdate, forceUpdateTick } = usePromiseState(buildInitialState(data));
    const scheduleTimeoutRef = useRef(null);
    const messageInputRef = useRef(null);

    // [ Methods used to handle current map.

    const clearOrderBuildingPath = useCallback(() => {
        return setState({
            orderBuildingPath: [],
        });
    }, []);

    const setSelectedLocation = useCallback((location, powerName, orderType, orderPath) => {
        if (!location) return;
        extendOrderBuilding(
            powerName,
            orderType,
            orderPath,
            location,
            onOrderBuilding,
            onOrderBuilt,
            page.error,
        );
    }, []);

    const setSelectedVia = useCallback((moveType, powerName, orderPath, location) => {
        if (!moveType || !["M", "V"].includes(moveType)) return;
        extendOrderBuilding(
            powerName,
            moveType,
            orderPath,
            location,
            onOrderBuilding,
            onOrderBuilt,
            page.error,
        );
    }, []);

    const onSelectLocation = useCallback((possibleLocations, powerName, orderType, orderPath) => {
        page.dialog((onClose) => (
            <SelectLocationForm
                path={orderPath}
                locations={possibleLocations}
                onSelect={(location) => {
                    setSelectedLocation(location, powerName, orderType, orderPath);
                    onClose();
                }}
                onClose={() => {
                    clearOrderBuildingPath();
                    onClose();
                }}
            />
        ));
    }, []);

    const onSelectVia = useCallback((location, powerName, orderPath) => {
        page.dialog((onClose) => (
            <SelectViaForm
                path={orderPath}
                onSelect={(moveType) => {
                    setTimeout(() => {
                        setSelectedVia(moveType, powerName, orderPath, location);
                        onClose();
                    }, 0);
                }}
                onClose={() => {
                    clearOrderBuildingPath();
                    onClose();
                }}
            />
        ));
    }, []);

    // ]

    const getMapInfo = () => {
        return page.availableMaps[data.map_name];
    };

    const clearScheduleTimeout = () => {
        if (scheduleTimeoutRef.current) {
            clearInterval(scheduleTimeoutRef.current);
            scheduleTimeoutRef.current = null;
        }
    };

    const updateDeadlineTimer = () => {
        const engine = data;
        --engine.deadline_timer;
        if (engine.deadline_timer <= 0) {
            engine.deadline_timer = 0;
            clearScheduleTimeout();
        }
        if (networkGameIsDisplayed(engine.client)) forceUpdate();
    };

    const reloadDeadlineTimer = (networkGame) => {
        networkGame
            .querySchedule()
            .then((dataSchedule) => {
                const schedule = dataSchedule.schedule;
                const server_current = schedule.current_time;
                const server_end = schedule.time_added + schedule.delay;
                const server_remaining = server_end - server_current;
                data.deadline_timer = server_remaining * schedule.time_unit;
                if (!scheduleTimeoutRef.current)
                    scheduleTimeoutRef.current = setInterval(updateDeadlineTimer, schedule.time_unit * 1000);
            })
            .catch(() => {
                if (Object.prototype.hasOwnProperty.call(data, "deadline_timer")) delete data.deadline_timer;
                clearScheduleTimeout();
            });
    };

    // [ Network game notifications.

    const networkGameIsDisplayed = (networkGame) => {
        return page.getName() === `game: ${networkGame.local.game_id}`;
    };

    const notifiedNetworkGame = (networkGame, notification) => {
        if (networkGameIsDisplayed(networkGame)) {
            const msg = `Game (${networkGame.local.game_id}) received notification ${notification.name}.`;
            reloadDeadlineTimer(networkGame);
            return forceUpdate().then(() => page.info(msg));
        }
        return noPromise();
    };

    const notifiedPowersControllers = (networkGame, notification) => {
        if (
            networkGame.local.isPlayerGame() &&
            (!Object.prototype.hasOwnProperty.call(networkGame.channel.game_id_to_instances, networkGame.local.game_id) ||
                !networkGame.channel.game_id_to_instances[networkGame.local.game_id].has(networkGame.local.role))
        ) {
            // This power game is now invalid.
            return page
                .disconnectGame(networkGame.local.game_id)
                .then(() => {
                    if (networkGameIsDisplayed(networkGame)) {
                        return page.loadGames({
                            error: `${networkGame.local.game_id}/${networkGame.local.role} was kicked. Deadline over?`,
                        });
                    }
                });
        } else {
            return notifiedNetworkGame(networkGame, notification);
        }
    };

    const notifiedGamePhaseUpdated = (networkGame, notification) => {
        return networkGame
            .getAllPossibleOrders()
            .then((allPossibleOrders) => {
                networkGame.local.setPossibleOrders(allPossibleOrders);
                if (networkGameIsDisplayed(networkGame)) {
                    __store_orders(null);
                    reloadDeadlineTimer(networkGame);
                    return setState({
                        orders: null,
                        messageHighlights: {},
                        orderBuildingPath: [],
                        orderDistribution: [],
                        hoverDistributionOrder: [],
                        visibleDistributionOrder: [],
                        hasInitialOrders: false,
                        hoverOrders: [],
                    }).then(() =>
                        page.info(`Game update (${notification.name}) to ${networkGame.local.phase}.`),
                    );
                }
            })
            .catch((error) => page.error("Error when updating possible orders: " + error.toString()));
    };

    const notifiedLocalStateChange = (networkGame, notification) => {
        return networkGame
            .getAllPossibleOrders()
            .then((allPossibleOrders) => {
                networkGame.local.setPossibleOrders(allPossibleOrders);
                if (networkGameIsDisplayed(networkGame)) {
                    reloadDeadlineTimer(networkGame);
                    let result = null;
                    if (notification.power_name) {
                        result = reloadPowerServerOrders(notification.power_name);
                    } else {
                        result = forceUpdate();
                    }
                    return result.then(() => page.info(`Possible orders re-loaded.`));
                }
            })
            .catch((error) => page.error("Error when updating possible orders: " + error.toString()));
    };

    const notifiedNewGameMessage = (networkGame, notification) => {
        let protagonist = notification.message.sender;
        if (notification.message.recipient === "GLOBAL") protagonist = notification.message.recipient;
        const messageHighlights = Object.assign({}, stateRef.current.messageHighlights);
        if (!Object.prototype.hasOwnProperty.call(messageHighlights, protagonist)) {
            messageHighlights[protagonist] = 1;
        } else {
            ++messageHighlights[protagonist];
        }
        if (!Object.prototype.hasOwnProperty.call(messageHighlights, "messages")) {
            messageHighlights["messages"] = 1;
        } else {
            ++messageHighlights["messages"];
        }
        return setState({ messageHighlights: messageHighlights }).then(() =>
            notifiedNetworkGame(networkGame, notification),
        );
    };

    const bindCallbacks = (networkGame) => {
        const collector = (game, notification) => {
            game.queue.append(notification);
        };
        const consumer = (notification) => {
            switch (notification.name) {
                case "powers_controllers":
                    return notifiedPowersControllers(networkGame, notification);
                case "game_message_received":
                    return notifiedNewGameMessage(networkGame, notification);
                case "log_received":
                    return notifiedNewGameMessage(networkGame, notification);
                case "recipients_annotation_received":
                    return notifiedNewGameMessage(networkGame, notification);
                case "game_processed":
                case "game_phase_update":
                    return notifiedGamePhaseUpdated(networkGame, notification);
                case "cleared_centers":
                case "cleared_orders":
                case "cleared_units":
                case "power_orders_update":
                case "power_orders_flag":
                case "game_status_update":
                case "omniscient_updated":
                case "power_vote_updated":
                case "power_wait_flag":
                case "power_comm_status_update":
                case "vote_count_updated":
                case "vote_updated":
                    return notifiedNetworkGame(networkGame, notification);
                default:
                    throw new Error(`Unhandled notification: ${notification.name}`);
            }
        };
        if (!networkGame.callbacksBound) {
            networkGame.queue = new Queue();
            networkGame.addOnClearedCenters(collector);
            networkGame.addOnClearedOrders(collector);
            networkGame.addOnClearedUnits(collector);
            networkGame.addOnPowerOrdersUpdate(collector);
            networkGame.addOnPowerOrdersFlag(collector);
            networkGame.addOnPowersControllers(collector);
            networkGame.addOnGameMessageReceived(collector);
            networkGame.addOnLogReceived(collector);
            networkGame.addOnGameProcessed(collector);
            networkGame.addOnGamePhaseUpdate(collector);
            networkGame.addOnGameStatusUpdate(collector);
            networkGame.addOnOmniscientUpdated(collector);
            networkGame.addOnPowerVoteUpdated(collector);
            networkGame.addOnPowerWaitFlag(collector);
            networkGame.addOnCommStatusUpdate(collector);
            networkGame.addOnVoteCountUpdated(collector);
            networkGame.addOnVoteUpdated(collector);
            networkGame.callbacksBound = true;
            networkGame.local.markAllMessagesRead();
            networkGame.queue.consumeAsync(consumer);
        }
    };

    // ]

    const onChangeOrderDistribution = useCallback((requestedPower, requestedProvince, provinceController) => {
        if (stateRef.current.displayVisualAdvice === null || stateRef.current.displayVisualAdvice === undefined) {
            return;
        }
        if (requestedProvince === undefined || requestedProvince === null) {
            return;
        }

        const engine = data;
        const messageChannels = engine.getMessageChannels(requestedPower, true);
        const suggestionMessages = getSuggestionMessages(requestedPower, messageChannels, engine);
        const provinceOrderDistributions = suggestionMessages.filter(
            (msg) =>
                msg.type === STRINGS.SUGGESTED_MOVE_DISTRIBUTION && msg.parsed.payload.province === requestedProvince,
        );
        if (provinceOrderDistributions.length === 0) {
            return;
        }
        const provinceOrderDistribution = provinceOrderDistributions[0].parsed.payload;

        // successfully retrieves and updates order distribution
        if (!stateRef.current.displayVisualAdvice) {
            setState({
                orderDistribution: [
                    {
                        power: provinceController,
                        distribution: provinceOrderDistribution.predicted_orders,
                        province: requestedProvince,
                    },
                ],
            });
        } else {
            let prevOrderDistribution = stateRef.current.orderDistribution;
            let updatedOrderDistribution = [];
            for (var orderDist of prevOrderDistribution) {
                if (orderDist.province !== requestedProvince) {
                    updatedOrderDistribution.push(orderDist);
                }
            }
            updatedOrderDistribution.push({
                power: provinceController,
                distribution: provinceOrderDistribution.predicted_orders,
                province: requestedProvince,
            });
            setState({ orderDistribution: updatedOrderDistribution });
        }
    }, []);

    const includeOrder = (orderArr, order) => {
        for (var orderObj of orderArr) {
            if (orderObj.order === order) {
                return true;
            }
        }
        return false;
    };

    const onChangeCurrentPower = (event) => {
        return setState({
            power: event.target.value,
            tabPastMessages: null,
            tabCurrentMessages: null,
            distributionAdviceSetting: null,
            orderDistribution: [],
            hoverDistributionOrder: [],
            visibleDistributionOrder: [],
        });
    };

    const onChangeMainTab = (tab) => {
        return setState({ tabMain: tab });
    };

    const onChangeTabCurrentMessages = (tab) => {
        return setState({ tabCurrentMessages: tab });
    };

    const onChangeTabPastMessages = (tab) => {
        return setState({ tabPastMessages: tab });
    };

    const setMessageInputValue = (val) => {
        if (messageInputRef.current) messageInputRef.current.setValue(val);
    };

    const setlogDataInputValue = (val) => {
        return setState({ logData: val });
    };

    const sendOrderLog = (networkGame, logType, order) => {
        const engine = networkGame.local;
        let message = null;

        switch (logType) {
            case "add":
                message = `${engine.role} added: ${order}`;
                break;
            case "remove":
                message = `${engine.role} removed: ${order}`;
                break;
            case "update":
                message = `${engine.role} updated its orders:`;
                break;
            case "clear":
                message = `${engine.role} removed its orders:`;
                break;
            default:
                return;
        }
        networkGame.sendOrderLog({ log: message });
    };

    const handleRecipientAnnotation = (message_time_sent, annotation) => {
        const engine = data;
        const newAnnotatedMessages = {
            ...stateRef.current.annotatedMessages,
            // Server ensures that `Message.time_sent` is unique
            [message_time_sent]: annotation,
        };
        setState({ annotatedMessages: newAnnotatedMessages });

        sendRecipientAnnotation(engine.client, message_time_sent, annotation);
    };

    const toggleMoveSuggestionCollapse = (message_time_sent) => {
        setState((prevState) => {
            let value = false;
            if (Object.prototype.hasOwnProperty.call(prevState.visibleMoveSuggestions, message_time_sent)) {
                value = !prevState.visibleMoveSuggestions[message_time_sent];
            }
            const newVisibleMoveSuggestions = {
                ...prevState.visibleMoveSuggestions,
                // Server ensures that `Message.time_sent` is unique
                [message_time_sent]: value,
            };
            return { visibleMoveSuggestions: newVisibleMoveSuggestions };
        });
    };

    const updateTabVal = (event, value) => {
        const now = Date.now();

        if (value === STRINGS.MESSAGES) {
            // track time spent on commentary
            const timeDiff = now - stateRef.current.lastSwitchPanelTime;

            const newTimeSpent = [...stateRef.current.commentaryTimeSpent, timeDiff];
            setState({
                commentaryTimeSpent: newTimeSpent,
            });

            sendCommentaryDurations(data.client, data.role, timeDiff);

            return setState({
                tabVal: value,
                commentaryTimeSpent: newTimeSpent,
            });
        }
        return setState({ tabVal: value, lastSwitchPanelTime: now });
    };

    const updateReadCommentary = () => {
        const numAllCommentary = stateRef.current.numAllCommentary;
        return setState({
            numReadCommentary: numAllCommentary,
            showBadge: false,
        }); // sync numReadCommentary with numAllCommentary and hide badge
    };

    const sendRecipientAnnotation = (networkGame, time_sent, annotation) => {
        const info = { time_sent: time_sent, annotation: annotation };

        networkGame
            .sendRecipientAnnotation({ annotation: info })
            .then(() => {
                page.load(`game: ${networkGame.local.game_id}`, <ContentGame data={networkGame.local} />, {
                    success: `Annotation sent: ${JSON.stringify(info)}`,
                });
            })
            .catch((error) => {
                page.error(error.toString());
            });
    };

    const sendGameStance = (networkGame, powerName, stance) => {
        const info = {
            power_name: powerName,
            stance: stance,
        };
        networkGame.sendStance({ stance: info });
    };

    const sendIsBot = (networkGame, powerName, isBot) => {
        const info = {
            power_name: powerName,
            is_bot: isBot,
        };
        networkGame.sendIsBot({ is_bot: info });
    };

    const sendDeceiving = (networkGame, controlledPower, targetPower, deceiving) => {
        const info = {
            controlled_power: controlledPower,
            target_power: targetPower,
            deceiving: deceiving,
        };
        networkGame.sendDeceiving({ info: info });
    };

    const sendMessage = (networkGame, recipient, body, deception, messageType) => {
        // make sure the message is not empty
        if (/\S/.test(body)) {
            const engine = networkGame.local;

            const message = new Message({
                phase: engine.phase,
                sender: engine.role,
                recipient: recipient,
                message: body,
                truth: deception,
                type: messageType,
            });
            networkGame
                .sendGameMessage({ message: message })
                .then(() => {
                    page.load(`game: ${engine.game_id}`, <ContentGame data={engine} />, {
                        success: `Message sent: ${JSON.stringify(message)}`,
                    });
                })
                .catch((error) => page.error(error.toString()));
        } else {
            page.error("Message cannot be empty.");
        }
    };

    const sendLogData = (networkGame, body) => {
        const engine = networkGame.local;
        const message = new Message({
            phase: engine.phase,
            sender: engine.role,
            recipient: "OMNISCIENT",
            message: body,
        });
        networkGame
            .sendLogData({ log: message })
            .then(() => {
                page.load(`game: ${engine.game_id}`, <ContentGame data={engine} />, {
                    success: `Log sent: ${JSON.stringify(message)}`,
                });
            })
            .catch((error) => {
                page.error(error.toString());
            });
    };

    const sendCommentaryDurations = (networkGame, powerName, durations) => {
        if (
            data.role === "omniscient_type" ||
            data.role === "observer_type" ||
            data.role === "master_type"
        ) {
            return;
        }

        const info = {
            power_name: powerName,
            durations: durations,
        };
        networkGame.sendCommentaryDurations({ durations: info });
    };

    const handleExit = () => {
        // Send the commentary durations to the server on exit
        if (stateRef.current.tabVal === STRINGS.MESSAGES) {
            return;
        }
        const now = Date.now();
        const timeSpent = now - stateRef.current.lastSwitchPanelTime;
        const newTimeSpent = [...stateRef.current.commentaryTimeSpent, timeSpent];
        setState({
            lastSwitchPanelTime: now,
            commentaryTimeSpent: newTimeSpent,
        });
        const engine = data;

        sendCommentaryDurations(engine.client, engine.role, timeSpent);
    };

    const handleFocus = () => {
        setState({ lastSwitchPanelTime: Date.now() });
    };

    const handleBlur = () => {
        handleExit();
    };

    const onProcessGame = useCallback(() => {
        data.client
            .process()
            .then(() => {
                page.success("Game processed.");
                data.clearInitialOrders();
                return setState({ hasInitialOrders: false, hoverOrders: [] });
            })
            .catch((err) => {
                page.error(err.toString());
            });
    }, []);

    const getCurrentPowerName = () => {
        const engine = data;
        const controllablePowers = engine.getControllablePowers();
        return stateRef.current.power || (controllablePowers.length && controllablePowers[0]);
    };

    // [ Methods involved in orders management.

    const __get_orders = (engine) => {
        const orders = engine.getServerOrders();
        if (stateRef.current.orders) {
            for (let powerName of Object.keys(orders)) {
                const serverPowerOrders = orders[powerName];
                const localPowerOrders = stateRef.current.orders[powerName];
                if (localPowerOrders) {
                    for (let localOrder of Object.values(localPowerOrders)) {
                        localOrder.local =
                            !serverPowerOrders ||
                            !Object.prototype.hasOwnProperty.call(serverPowerOrders, localOrder.loc) ||
                            serverPowerOrders[localOrder.loc].order !== localOrder.order;
                    }
                }
                orders[powerName] = localPowerOrders;
            }
        }
        return orders;
    };

    const __store_orders = (orders) => {
        const username = data.client.channel.username;
        const gameID = data.game_id;
        const gamePhase = data.phase;
        if (!orders) return DipStorage.clearUserGameOrders(username, gameID);
        for (let entry of Object.entries(orders)) {
            const powerName = entry[0];
            let powerOrdersList = null;
            if (entry[1]) powerOrdersList = Object.values(entry[1]).map((order) => order.order);
            DipStorage.clearUserGameOrders(username, gameID, powerName);
            DipStorage.addUserGameOrders(username, gameID, gamePhase, powerName, powerOrdersList);
        }
    };

    const reloadPowerServerOrders = useCallback((powerName) => {
        const serverOrders = data.getServerOrders();
        const engine = data;
        const allOrders = __get_orders(engine);
        if (!Object.prototype.hasOwnProperty.call(allOrders, powerName)) {
            return page.error(`Unknown power ${powerName}.`);
        }
        allOrders[powerName] = serverOrders[powerName];
        __store_orders(allOrders);
        return setState({ orders: allOrders });
    }, []);

    const reloadServerOrders = useCallback(() => {
        setState({ orderBuildingPath: [] }).then(() => {
            const currentPowerName = getCurrentPowerName();
            if (currentPowerName) {
                reloadPowerServerOrders(currentPowerName);
            }
        });
    }, []);

    const onRemoveOrder = useCallback(async (powerName, order) => {
        const orders = __get_orders(data);
        if (
            Object.prototype.hasOwnProperty.call(orders, powerName) &&
            Object.prototype.hasOwnProperty.call(orders[powerName], order.loc) &&
            orders[powerName][order.loc].order === order.order
        ) {
            sendOrderLog(data.client, "remove", order.order);

            delete orders[powerName][order.loc];
            if (!UTILS.javascript.count(orders[powerName])) orders[powerName] = null;
            __store_orders(orders);
            await setState({ orders: orders, hoverOrders: [] });
        }
        setOrders();
    }, []);

    const onRemoveAllCurrentPowerOrders = useCallback(async () => {
        const currentPowerName = getCurrentPowerName();
        if (currentPowerName) {
            const engine = data;
            const allOrders = __get_orders(engine);
            if (!Object.prototype.hasOwnProperty.call(allOrders, currentPowerName)) {
                page.error(`Unknown power ${currentPowerName}.`);
                return;
            }
            sendOrderLog(engine.client, "clear", null);
            allOrders[currentPowerName] = null;
            __store_orders(allOrders);
            await setState({ orders: allOrders });
        }
        setOrders();
    }, []);

    const onSetEmptyOrdersSet = useCallback((powerName) => {
        const orders = __get_orders(data);
        orders[powerName] = {};
        __store_orders(orders);
        setOrders();
        return setState({ orders: orders, hoverOrders: [] });
    }, []);

    const setOrders = useCallback(() => {
        const serverOrders = data.getServerOrders();
        const orders = __get_orders(data);

        for (let entry of Object.entries(orders)) {
            const powerName = entry[0];
            const localPowerOrders = entry[1] ? Object.values(entry[1]).map((orderEntry) => orderEntry.order) : null;
            const serverPowerOrders = serverOrders[powerName]
                ? Object.values(serverOrders[powerName]).map((orderEntry) => orderEntry.order)
                : null;
            let same = false;

            if (serverPowerOrders === null) {
                // No orders set on server.
                same = localPowerOrders === null;
                // Otherwise, we have local orders set (even empty local orders).
            } else if (serverPowerOrders.length === 0) {
                // Empty orders set on server.
                // If we have empty orders set locally, then it's same thing.
                same = localPowerOrders && localPowerOrders.length === 0;
                // Otherwise, we have either local non-empty orders set or local null order.
            } else {
                // Orders set on server. Identical to local orders only if we have exactly same orders on server and locally.
                if (localPowerOrders && localPowerOrders.length === serverPowerOrders.length) {
                    localPowerOrders.sort();
                    serverPowerOrders.sort();
                    same = true;
                    for (let i = 0; i < localPowerOrders.length; ++i) {
                        if (localPowerOrders[i] !== serverPowerOrders[i]) {
                            same = false;
                            break;
                        }
                    }
                }
            }

            if (same) {
                Diplog.warn(`Orders not changed for ${powerName}.`);
                continue;
            }

            Diplog.info(
                `Sending orders for ${powerName}: ${localPowerOrders ? JSON.stringify(localPowerOrders) : null}`,
            );
            let requestCall = null;
            if (localPowerOrders) {
                requestCall = data.client.setOrders({
                    power_name: powerName,
                    orders: localPowerOrders,
                });
            } else {
                requestCall = data.client.clearOrders({
                    power_name: powerName,
                });
            }
            requestCall
                .then(() => {
                    page.success("Orders sent.");
                })
                .catch((err) => {
                    page.error(err.toString());
                })
                .then(() => {
                    reloadServerOrders();
                });
        }
    }, []);

    // ]

    const onOrderBuilding = useCallback((powerName, path) => {
        const pathToSave = path.slice(1);
        return setState({ orderBuildingPath: pathToSave }).then(() =>
            page.success(`Building order ${pathToSave.join(" ")} ...`),
        );
    }, []);

    const onOrderBuilt = useCallback((powerName, orderString) => {
        let state = Object.assign({}, stateRef.current);
        state.orderBuildingPath = [];
        if (!orderString) {
            Diplog.warn("No order built.");
            return setState(state);
        }
        const engine = data;
        const localOrder = new Order(orderString, true);
        let allOrders = __get_orders(engine);
        if (!Object.prototype.hasOwnProperty.call(allOrders, powerName)) {
            Diplog.warn(`Unknown power ${powerName}.`);
            return setState(state);
        }

        sendOrderLog(engine.client, "add", orderString);

        if (!allOrders[powerName]) allOrders[powerName] = {};
        allOrders[powerName][localOrder.loc] = localOrder;
        state.orders = allOrders;
        page.success(`Built order: ${orderString}`);

        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = stateRef.current.power || (controllablePowers.length ? controllablePowers[0] : null);
        const orderableUnits = engine.orderableLocations[currentPowerName].length;
        const serverOrderLength = Object.keys(allOrders[powerName]).length;

        if (serverOrderLength == orderableUnits) {
            engine.setInitialOrders(engine.role);
            state.hasInitialOrders = true;
        }

        setState(state).then(() => {
            __store_orders(allOrders);
            setOrders();
        });
    }, []);

    const onChangeOrderType = useCallback((form) => {
        return setState({
            orderBuildingType: form.order_type,
            orderBuildingPath: [],
            hoverOrders: [],
        });
    }, []);

    const vote = useCallback((decision) => {
        const engine = data;
        const networkGame = engine.client;
        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = stateRef.current.power || (controllablePowers.length ? controllablePowers[0] : null);
        if (!currentPowerName) throw new Error(`Internal error: unable to detect current selected power name.`);
        networkGame
            .vote({ power_name: currentPowerName, vote: decision })
            .then(() => page.success(`Vote set to ${decision} for ${currentPowerName}`))
            .catch((error) => {
                Diplog.error(error.stack);
                page.error(`Error while setting vote for ${currentPowerName}: ${error.toString()}`);
            });
    }, []);

    const setCommStatus = (commStatus) => {
        let newCommStatus = commStatus === STRINGS.READY ? STRINGS.READY : STRINGS.READY;
        const engine = data;
        const networkGame = engine.client;
        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = stateRef.current.power || (controllablePowers.length ? controllablePowers[0] : null);
        if (!currentPowerName) throw new Error(`Internal error: unable to detect current selected power name.`);
        networkGame
            .setCommStatus({
                comm_status: newCommStatus,
                power_name: currentPowerName,
            })
            .then(() => {
                forceUpdate(() =>
                    page.success(`Comm. status set to ${newCommStatus} for ${currentPowerName}`),
                );
            })
            .catch((error) => {
                Diplog.error(error.stack);
                page.error(`Error while setting comm. status for ${currentPowerName}: ${error.toString()}`);
            });
    };

    const setWaitFlag = useCallback((waitFlag) => {
        const engine = data;
        const networkGame = engine.client;
        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = stateRef.current.power || (controllablePowers.length ? controllablePowers[0] : null);
        if (!currentPowerName) throw new Error(`Internal error: unable to detect current selected power name.`);
        networkGame
            .setWait(waitFlag, { power_name: currentPowerName })
            .then(() => {
                forceUpdate(() => page.success(`Wait flag set to ${waitFlag} for ${currentPowerName}`));
            })
            .catch((error) => {
                Diplog.error(error.stack);
                page.error(`Error while setting wait flag for ${currentPowerName}: ${error.toString()}`);
            });
    }, []);

    const __change_past_phase = (newPhaseIndex) => {
        return setState({
            historyPhaseIndex: newPhaseIndex,
            historyCurrentLoc: null,
            historyCurrentOrders: null,
            hoverOrders: [],
        });
    };

    const onChangePastPhase = (event) => {
        __change_past_phase(event.target.value);
    };

    const onChangePastPhaseIndex = (increment) => {
        const selectObject = document.getElementById("select-past-phase");
        if (selectObject) {
            // Let's simply increase or decrease index of showed past phase.
            const index = selectObject.selectedIndex;
            const newIndex = index + (increment ? 1 : -1);
            if (newIndex >= 0 && newIndex < selectObject.length) {
                selectObject.selectedIndex = newIndex;
                __change_past_phase(parseInt(selectObject.options[newIndex].value, 10), increment ? 0 : 1);
            }
        }
    };

    const onIncrementPastPhase = (event) => {
        onChangePastPhaseIndex(true);
        if (event && event.preventDefault) event.preventDefault();
    };

    const onDecrementPastPhase = (event) => {
        onChangePastPhaseIndex(false);
        if (event && event.preventDefault) event.preventDefault();
    };

    const displayFirstPastPhase = () => {
        __change_past_phase(0, 0);
    };

    const displayLastPastPhase = () => {
        __change_past_phase(-1, 1);
    };

    const onChangeShowPastOrders = (event) => {
        return setState({ historyShowOrders: event.target.checked });
    };

    const onChangeShowAbbreviations = (event) => {
        return setState({ showAbbreviations: event.target.checked });
    };

    const onClickMessage = (message) => {
        if (!message.read) {
            message.read = true;
            let protagonist = message.sender;
            if (message.recipient === "GLOBAL") protagonist = message.recipient;
            page.load(`game: ${data.game_id}`, <ContentGame data={data} />);
            if (
                Object.prototype.hasOwnProperty.call(stateRef.current.messageHighlights, protagonist) &&
                stateRef.current.messageHighlights[protagonist] > 0
            ) {
                const messageHighlights = Object.assign({}, stateRef.current.messageHighlights);
                --messageHighlights[protagonist];
                --messageHighlights["messages"];
                setState({ messageHighlights: messageHighlights });
            }
        }
    };

    const displayLocationOrders = useCallback((loc, orders) => {
        return setState({
            historyCurrentLoc: loc || null,
            historyCurrentOrders: orders && orders.length ? orders : null,
        });
    }, []);

    // [ Rendering methods.

    const blurMessages = (engine, messageChannels) => {
        /* add a *hide* key to decide whether to blur a message */
        if (engine.role === "omniscient_type" || engine.role === "observer_type" || engine.role === "master_type")
            return messageChannels;

        let blurredMessageChannels = {};
        const controlledPower = getCurrentPowerName();

        for (const [powerName, messages] of Object.entries(messageChannels)) {
            if (powerName === "GLOBAL") {
                blurredMessageChannels[powerName] = messages;
            } else {
                let blurredMessages = [];
                let hideMessage = false;

                for (let idx in messages) {
                    const currentMessage = messages[idx];

                    // if the message is from self or is annotated, don't blur
                    if (
                        currentMessage.sender === controlledPower ||
                        Object.prototype.hasOwnProperty.call(stateRef.current.annotatedMessages, currentMessage.time_sent)
                    ) {
                        blurredMessages.push(currentMessage);
                    } else {
                        // show only the first unannotated message
                        if (!hideMessage) {
                            blurredMessages.push(currentMessage);
                        } else {
                            const toShow = { hide: hideMessage };
                            const newMessage = Object.assign(toShow, currentMessage);
                            blurredMessages.push(newMessage);
                        }

                        if (
                            currentMessage.sender !== controlledPower &&
                            !Object.prototype.hasOwnProperty.call(stateRef.current.annotatedMessages, currentMessage.time_sent)
                        ) {
                            hideMessage = true;
                        }
                    }
                }
                // reconstruct message channels with unannotated "hide" key
                blurredMessageChannels[powerName] = blurredMessages;
            }
        }
        return blurredMessageChannels;
    };

    const renderChatPanel = (engine, role, isWide, isCurrent) => {
        const currentPowerName = getCurrentPowerName();
        return (
            <ChatPanel
                ref={messageInputRef}
                engine={engine}
                role={role}
                isWide={isWide}
                isCurrent={isCurrent}
                currentPowerName={currentPowerName}
                tabCurrentMessages={state.tabCurrentMessages}
                tabPastMessages={state.tabPastMessages}
                annotatedMessages={state.annotatedMessages}
                hasInitialOrders={state.hasInitialOrders}
                messageHighlights={state.messageHighlights}
                onChangeTabCurrentMessages={onChangeTabCurrentMessages}
                onChangeTabPastMessages={onChangeTabPastMessages}
                sendMessage={sendMessage}
                handleRecipientAnnotation={handleRecipientAnnotation}
                blurMessages={blurMessages}
                countUnreadMessages={countUnreadMessages}
                hasUnreadAdvice={hasUnreadAdvice}
                getOrders={__get_orders}
            />
        );
    };

    const hasUnreadAdvice = (engine, role, protagonist) => {
        const isAdmin =
            engine.role === "omniscient_type" || engine.role === "master_type" || engine.role === "observer_type";
        if (isAdmin) {
            return false;
        }

        let messageChannels = engine.getMessageChannels(role, true);
        const controlledPower = getCurrentPowerName();

        const suggestionMessages = getSuggestionMessages(controlledPower, messageChannels, engine);

        const suggestedMessagesForCurrentPower = getSuggestedMessages(
            controlledPower,
            protagonist,
            isAdmin,
            engine,
            suggestionMessages,
        );

        return suggestedMessagesForCurrentPower.length > 0;
    };

    const countUnreadMessages = (engine, role, protagonist) => {
        let messageChannels = engine.getMessageChannels(role, true);
        if (engine.role === "omniscient_type" || engine.role === "observer_type" || engine.role === "master_type")
            return 0;

        const controlledPower = getCurrentPowerName();
        let count = 0;

        for (const [, messages] of Object.entries(messageChannels)) {
            for (let idx in messages) {
                const message = messages[idx];

                if (
                    message.sender === protagonist &&
                    message.recipient === controlledPower &&
                    !message.recipient_annotation &&
                    !Object.prototype.hasOwnProperty.call(stateRef.current.annotatedMessages, message.time_sent)
                ) {
                    count++;
                }
            }
        }
        return count;
    };

    const getSuggestionMessages = (currentPowerName, messageChannels, engine) => {
        const globalMessages = messageChannels["GLOBAL"] || [];

        const suggestionMessageTypes = [
            STRINGS.HAS_SUGGESTIONS,
            STRINGS.SUGGESTED_COMMENTARY,
            STRINGS.SUGGESTED_MESSAGE,
            STRINGS.SUGGESTED_MOVE_DISTRIBUTION,
            STRINGS.SUGGESTED_MOVE_FULL,
            STRINGS.SUGGESTED_MOVE_OPPONENTS,
            STRINGS.SUGGESTED_MOVE_PARTIAL,
        ];

        // For `Array.flatMap()` explanation, see
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap#for_adding_and_removing_items_during_a_map
        const suggestionMessages = globalMessages.flatMap((msg) => {
            if (!suggestionMessageTypes.includes(msg.type) || msg.phase !== engine.phase) {
                return [];
            }
            const parsed = JSON.parse(msg.message);
            if (parsed.recipient !== currentPowerName) {
                return [];
            }
            msg.parsed = parsed;
            return [msg];
        });

        return suggestionMessages;
    };

    const hasSuggestionType = (suggestionTypeValue, suggestionTypeToMatch) => {
        return suggestionTypeValue !== null && (suggestionTypeValue & suggestionTypeToMatch) === suggestionTypeToMatch;
    };

    const getSuggestionType = (currentPowerName, engine, globalMessages) => {
        let suggestionType = UTILS.SuggestionType.NONE;

        const powerSuggestions = globalMessages.filter((msg) => msg.type === STRINGS.HAS_SUGGESTIONS);
        powerSuggestions.forEach((msg) => {
            suggestionType |= msg.parsed.payload;
        });

        if (powerSuggestions.length > 0) {
            return suggestionType;
        } else {
            return null;
        }
    };

    const getSuggestedMoves = (currentPowerName, engine, globalMessages) => {
        const receivedSuggestions = globalMessages.filter(
            (msg) => msg.type === STRINGS.SUGGESTED_MOVE_FULL || msg.type === STRINGS.SUGGESTED_MOVE_PARTIAL,
        );

        return receivedSuggestions;
    };

    const getLatestSuggestedMoves = (receivedSuggestions, suggestionType) => {
        let latestMoveSuggestion = null;
        for (const msg of receivedSuggestions) {
            if (msg.type === suggestionType) {
                if (!latestMoveSuggestion || msg.time_sent > latestMoveSuggestion.time_sent) latestMoveSuggestion = msg;
            }
        }

        // do not display if player dismissed the suggestion
        if (latestMoveSuggestion) {
            const sent_time = latestMoveSuggestion.time_sent;
            if (
                Object.prototype.hasOwnProperty.call(stateRef.current.annotatedMessages, sent_time) &&
                (stateRef.current.annotatedMessages[sent_time] === "reject" ||
                    stateRef.current.annotatedMessages[sent_time] === "replace")
            ) {
                latestMoveSuggestion = null;
            }
        }

        if (latestMoveSuggestion === null) {
            return null;
        }

        const suggestion = {
            moves: latestMoveSuggestion.parsed.payload.suggested_orders,
            sender: latestMoveSuggestion.sender,
            time_sent: latestMoveSuggestion.time_sent,
        };
        if (suggestionType === STRINGS.SUGGESTED_MOVE_PARTIAL) {
            suggestion.givenMoves = latestMoveSuggestion.parsed.payload.player_orders;
        }
        suggestion.visible =
            !Object.prototype.hasOwnProperty.call(stateRef.current.visibleMoveSuggestions, suggestion.time_sent) ||
            stateRef.current.visibleMoveSuggestions[suggestion.time_sent];
        return suggestion;
    };

    const getSuggestedMessages = (currentPowerName, protagonist, isAdmin, engine, globalMessages) => {
        const receivedSuggestions = globalMessages.filter(
            (msg) =>
                msg.type === STRINGS.SUGGESTED_MESSAGE &&
                msg.parsed.payload.recipient === protagonist &&
                (isAdmin || !Object.prototype.hasOwnProperty.call(stateRef.current.annotatedMessages, msg.time_sent)),
        );

        const suggestedMessages = receivedSuggestions.map((msg) => {
            return {
                message: msg.parsed.payload.message,
                sender: msg.sender,
                time_sent: msg.time_sent,
            };
        });

        return suggestedMessages;
    };

    const getSuggestedCommentary = (currentPowerName, protagonist, isAdmin, engine, globalMessages) => {
        let suggestionType = getSuggestionType(currentPowerName, engine, globalMessages);

        if (!hasSuggestionType(suggestionType, UTILS.SuggestionType.COMMENTARY)) {
            return null;
        }

        const receivedSuggestions = globalMessages.filter(
            (msg) =>
                msg.type === STRINGS.SUGGESTED_COMMENTARY &&
                msg.parsed.payload.recipient === protagonist &&
                (isAdmin || !Object.prototype.hasOwnProperty.call(stateRef.current.annotatedMessages, msg.time_sent)),
        );

        return receivedSuggestions;
    };

    const getSuggestedMoveList = (currentPowerName, protagonist, isAdmin, engine, messageChannels, suggestionType) => {
        let globalMessages = messageChannels["GLOBAL"] || [];
        const receivedSuggestions = getSuggestedMoves(currentPowerName, engine, globalMessages);

        if (suggestionType === null) {
            return null;
        }

        const latestMoveSuggestion = getLatestSuggestedMoves(receivedSuggestions, suggestionType);

        return latestMoveSuggestion;
    };

    const __get_engine_to_display = (initialEngine) => {
        const pastPhases = initialEngine.state_history.values().map((state) => state.name);
        pastPhases.push(initialEngine.phase);
        let phaseIndex = 0;
        if (initialEngine.displayed) {
            if (stateRef.current.historyPhaseIndex === null || stateRef.current.historyPhaseIndex >= pastPhases.length) {
                phaseIndex = pastPhases.length - 1;
            } else if (stateRef.current.historyPhaseIndex < 0) {
                phaseIndex = pastPhases.length + stateRef.current.historyPhaseIndex;
            } else {
                phaseIndex = stateRef.current.historyPhaseIndex;
            }
        }
        const engine = pastPhases[phaseIndex] === initialEngine.phase
            ? initialEngine
            : initialEngine.cloneAt(pastPhases[phaseIndex]);
        return { engine, pastPhases, phaseIndex };
    };

    const __form_phases = (pastPhases, phaseIndex) => {
        return (
            <form key={1} className="form-inline">
                <div className="custom-control-inline">
                    <Button title={UTILS.html.UNICODE_LEFT_ARROW} onClick={onDecrementPastPhase} pickEvent={true} disabled={phaseIndex === 0} />
                </div>
                <div className="custom-control-inline">
                    <select className="custom-select" id="select-past-phase" value={phaseIndex} onChange={onChangePastPhase}>
                        {pastPhases.map((phaseName, index) => (
                            <option key={index} value={index}>{phaseName}</option>
                        ))}
                    </select>
                </div>
                <div className="custom-control-inline">
                    <Button title={UTILS.html.UNICODE_RIGHT_ARROW} onClick={onIncrementPastPhase} pickEvent={true} disabled={phaseIndex === pastPhases.length - 1} />
                </div>
            </form>
        );
    };

    const renderTabResults = (toDisplay, initialEngine) => {
        const { engine } = __get_engine_to_display(initialEngine);
        let orders = {};
        let orderResult = null;
        if (engine.order_history.contains(engine.phase)) orders = engine.order_history.get(engine.phase);
        if (engine.result_history.contains(engine.phase)) orderResult = engine.result_history.get(engine.phase);
        let countOrders = 0;
        for (let powerOrders of Object.values(orders)) {
            if (powerOrders) countOrders += powerOrders.length;
        }
        const powerNames = Object.keys(orders);
        powerNames.sort();

        const getOrderResult = (order) => {
            if (orderResult) {
                const pieces = order.split(/ +/);
                const unit = `${pieces[0]} ${pieces[1]}`;
                if (Object.prototype.hasOwnProperty.call(orderResult, unit)) {
                    const resultsToParse = orderResult[unit];
                    if (!resultsToParse.length) resultsToParse.push("");
                    const results = [];
                    for (let r of resultsToParse) {
                        if (results.length) results.push(", ");
                        results.push(
                            <span key={results.length} className={r || "success"}>
                                {r || "OK"}
                            </span>,
                        );
                    }
                    return <span className={"order-result"}> ({results})</span>;
                }
            }
            return "";
        };

        const orderView = [
            (countOrders && (
                <div key={2} className={"past-orders container"}>
                    {powerNames.map((powerName) =>
                        !orders[powerName] || !orders[powerName].length ? (
                            ""
                        ) : (
                            <div key={powerName} className={"row"}>
                                <div className={"past-power-name col-sm-2"}>{powerName}</div>
                                <div className={"past-power-orders col-sm-10"}>
                                    {orders[powerName].map((order, index) => (
                                        <div key={index}>
                                            {order}
                                            {getOrderResult(order)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ),
                    )}
                </div>
            )) || (
                <div key={2} className={"no-orders"}>
                    No orders for this phase!
                </div>
            ),
        ];

        return (
            <Tab id={"tab-phase-history"} display={toDisplay}>
                <Row>
                    <div className={"col-6"}>
                        {state.historyCurrentOrders && (
                            <div className={"history-current-orders"}>{state.historyCurrentOrders.join(", ")}</div>
                        )}
                        <MapContainer
                            mode="results"
                            gameEngine={engine}
                            mapInfo={mapInfo}
                            showAbbreviations={state.showAbbreviations}
                            onError={page.error}
                            showOrders={state.historyShowOrders}
                            onHover={displayLocationOrders}
                            onSelectVia={onSelectVia}
                        />
                    </div>
                    <div className={"col-4"}>{orderView}</div>
                </Row>
                {toDisplay && <HotKey keys={["arrowleft"]} onKeysCoincide={onDecrementPastPhase} />}
                {toDisplay && <HotKey keys={["arrowright"]} onKeysCoincide={onIncrementPastPhase} />}
                {toDisplay && <HotKey keys={["home"]} onKeysCoincide={displayFirstPastPhase} />}
                {toDisplay && <HotKey keys={["end"]} onKeysCoincide={displayLastPastPhase} />}
            </Tab>
        );
    };

    const renderCurrentMessageAdvice = (engine, role, isCurrent) => {
        const isAdmin =
            engine.role === "omniscient_type" || engine.role === "master_type" || engine.role === "observer_type";

        // for filtering message suggestions based on the current power talking to
        const tabNames = [];
        for (let powerName of Object.keys(engine.powers)) if (powerName !== role) tabNames.push(powerName);
        tabNames.sort();
        let protagonist;

        if (isCurrent && state.tabCurrentMessages) {
            protagonist = state.tabCurrentMessages;
        } else if (!isCurrent && state.tabPastMessages) {
            protagonist = state.tabPastMessages;
        } else {
            protagonist = tabNames[0];
        }

        const powerLogs = engine.getLogsForPower(role, true);
        let renderedLogs = [];
        let curPhase = "";
        let prevPhase = "";

        powerLogs.forEach((log) => {
            if (log.phase !== prevPhase) {
                curPhase = log.phase;
                renderedLogs.push(<MessageSeparator>{curPhase}</MessageSeparator>);

                prevPhase = curPhase;
            }

            renderedLogs.push(
                // eslint-disable-next-line react/jsx-key
                <ChatMessage
                    model={{
                        message: log.message,
                        sent: log.time_sent,
                        sender: role,
                        direction: "outgoing",
                        position: "single",
                    }}
                ></ChatMessage>,
            );
        });

        const currentPowerName = getCurrentPowerName();

        const messageChannels = engine.getMessageChannels(currentPowerName, true);
        const suggestionMessages = getSuggestionMessages(currentPowerName, messageChannels, engine);

        const suggestionType = getSuggestionType(currentPowerName, engine, suggestionMessages);

        const suggestedMessagesForCurrentPower = getSuggestedMessages(
            currentPowerName,
            protagonist,
            isAdmin,
            engine,
            suggestionMessages,
        );
        const suggestedCommentaryForCurrentPower = getSuggestedCommentary(
            currentPowerName,
            protagonist,
            isAdmin,
            engine,
            suggestionMessages,
        );
        const curController = engine.powers[role].getController();

        // Use computed property names because there is no other way to use constants as object literal keys
        // Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer#computed_property_names
        const displayTab = {
            [STRINGS.MESSAGES]: hasSuggestionType(suggestionType, UTILS.SuggestionType.MESSAGE),
            [STRINGS.COMMENTARY]: hasSuggestionType(suggestionType, UTILS.SuggestionType.COMMENTARY),
            [STRINGS.INTENT_LOG]: isAdmin,
        };

        // If tab is disabled, choose the first displayed tab
        if (displayTab[stateRef.current.tabVal] === false) {
            for (const [key, value] of Object.entries(displayTab)) {
                if (value === true) {
                    setState({ tabVal: key });
                    break;
                }
            }
        }

        return (
            <Box className={"col-6 mb-4"}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sx={{ height: "100%" }}>
                        <Box sx={{ width: "100%", height: "550px" }}>
                            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                                <Tabs2
                                    value={state.tabVal}
                                    onChange={updateTabVal}
                                    aria-label="basic tabs example"
                                >
                                    {displayTab[STRINGS.MESSAGES] && (
                                        <Tab2 label="Message Advice" value={STRINGS.MESSAGES} />
                                    )}
                                    {displayTab[STRINGS.COMMENTARY] && (
                                        <Tab2
                                            label={
                                                <span
                                                    style={{
                                                        marginRight: "8px",
                                                    }}
                                                >
                                                    Commentary
                                                    {state.showBadge && (
                                                        <>
                                                            {" "}
                                                            <Badge variant="dot" color="warning"></Badge>
                                                        </>
                                                    )}
                                                </span>
                                            }
                                            value={STRINGS.COMMENTARY}
                                            onClick={() => {
                                                if (isCurrent) {
                                                    setState({
                                                        tabCurrentMessages: state.commentaryProtagonist,
                                                        lastSwitchPanelTime: Date.now(),
                                                    });
                                                } // make sure commentary tab is selected for the correct conversation
                                                updateReadCommentary();
                                            }}
                                        />
                                    )}
                                    {displayTab[STRINGS.INTENT_LOG] && (
                                        <Tab2 label="Captain's Log" value={STRINGS.INTENT_LOG} />
                                    )}
                                </Tabs2>
                            </Box>
                            {state.tabVal === STRINGS.MESSAGES && (
                                <ChatContainer
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        flexGrow: 1,
                                        border: "1px solid black",
                                        boxSizing: "border-box",
                                        marginTop: "10px",
                                    }}
                                >
                                    <ConversationHeader>
                                        <ConversationHeader.Content userName={`Messages Advice to ${protagonist}`} />
                                    </ConversationHeader>

                                    {state.hasInitialOrders && (
                                        <MessageList>
                                            {suggestedMessagesForCurrentPower.map((msg, msgIndex) => {
                                                return (
                                                    <div
                                                        key={msgIndex}
                                                        style={{
                                                            alignItems: "flex-end",
                                                            display: !Object.prototype.hasOwnProperty.call(state.annotatedMessages,
                                                                msg.time_sent,
                                                            )
                                                                ? "flex"
                                                                : "none",
                                                            marginBottom: "2px",
                                                        }}
                                                    >
                                                        <ChatMessage
                                                            style={{
                                                                flexGrow: 1,
                                                            }}
                                                            model={{
                                                                message: msg.message,
                                                                sent: msg.time_sent,
                                                                sender: msg.sender,
                                                                direction: "outgoing",
                                                                position: "single",
                                                            }}
                                                            avatarPosition={"tl"}
                                                        ></ChatMessage>
                                                        <div
                                                            style={{
                                                                flexDirection: "column",
                                                                flexGrow: 0,
                                                                flexShrink: 0,
                                                                display: "flex",
                                                                alignItems: "flex-end",
                                                            }}
                                                        >
                                                            <Button
                                                                key={"a"}
                                                                pickEvent={true}
                                                                title={"add to textbox"}
                                                                color={"success"}
                                                                onClick={() => {
                                                                    setMessageInputValue(msg.message);

                                                                    handleRecipientAnnotation(
                                                                        msg.time_sent,
                                                                        "accept",
                                                                    );
                                                                }}
                                                                disabled={!state.hasInitialOrders}
                                                                invisible={!(isCurrent && !isAdmin)}
                                                            ></Button>
                                                            <Button
                                                                key={"r"}
                                                                pickEvent={true}
                                                                title={"✕"}
                                                                color={"danger"}
                                                                onClick={() => {
                                                                    handleRecipientAnnotation(
                                                                        msg.time_sent,
                                                                        "reject",
                                                                    );
                                                                }}
                                                                disabled={!state.hasInitialOrders}
                                                                invisible={!(isCurrent && !isAdmin)}
                                                            ></Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </MessageList>
                                    )}
                                </ChatContainer>
                            )}

                            {state.tabVal === STRINGS.COMMENTARY && (
                                <MainContainer responsive>
                                    <ChatContainer>
                                        <ConversationHeader>
                                            <ConversationHeader.Content userName={"Commentary"} />
                                        </ConversationHeader>
                                        <MessageList>
                                            {suggestedCommentaryForCurrentPower.map((com, comIndex) => {
                                                const html = !state.hasInitialOrders
                                                    ? `<div class="blurred">${com.commentary}</div>`
                                                    : com.commentary;
                                                return (
                                                    <div
                                                        key={comIndex}
                                                        style={{
                                                            alignItems: "flex-end",
                                                            display: !Object.prototype.hasOwnProperty.call(state.annotatedMessages,
                                                                com.time_sent,
                                                            )
                                                                ? "flex"
                                                                : "none",
                                                        }}
                                                    >
                                                        <ChatMessage
                                                            style={{
                                                                flexGrow: 1,
                                                            }}
                                                            model={{
                                                                sent: com.time_sent,
                                                                sender: com.sender,
                                                                direction: "incoming",
                                                                position: "single",
                                                            }}
                                                            avatarPosition={"tl"}
                                                        >
                                                            <ChatMessage.HtmlContent html={html} />
                                                        </ChatMessage>
                                                    </div>
                                                );
                                            })}
                                        </MessageList>
                                        { }
                                    </ChatContainer>
                                </MainContainer>
                            )}

                            {state.tabVal === STRINGS.INTENT_LOG && (
                                <MainContainer responsive>
                                    <ChatContainer>
                                        <ConversationHeader>
                                            <ConversationHeader.Content
                                                userName={
                                                    role.toString() + " (" + curController + ")" + ": Captain's Log"
                                                }
                                            />
                                        </ConversationHeader>
                                        <MessageList>{renderedLogs}</MessageList>
                                        {engine.isPlayerGame() && (
                                            <MessageInput
                                                attachButton={false}
                                                onChange={(val) => setlogDataInputValue(val)}
                                                onSend={() => {
                                                    sendLogData(engine.client, state.logData);
                                                }}
                                            />
                                        )}
                                    </ChatContainer>
                                </MainContainer>
                            )}
                        </Box>
                    </Grid>
                </Grid>
            </Box>
        );
    };

    const renderCurrentMoveAdvice = (engine, role, isCurrent) => {
        const isAdmin =
            engine.role === "omniscient_type" || engine.role === "master_type" || engine.role === "observer_type";

        // for filtering message suggestions based on the current power talking to
        const tabNames = [];
        for (let powerName of Object.keys(engine.powers)) if (powerName !== role) tabNames.push(powerName);
        tabNames.sort();

        const currentPowerName = getCurrentPowerName();

        const messageChannels = engine.getMessageChannels(currentPowerName, true);
        const suggestionMessages = getSuggestionMessages(currentPowerName, messageChannels, engine);

        const suggestionType = getSuggestionType(currentPowerName, engine, suggestionMessages);

        const moveSuggestionForCurrentPower = getSuggestedMoves(currentPowerName, engine, suggestionMessages);

        // display only the latest to avoid cluttering textbox
        let latestMoveSuggestionFull = getLatestSuggestedMoves(
            moveSuggestionForCurrentPower,
            STRINGS.SUGGESTED_MOVE_FULL,
        );
        let latestMoveSuggestionPartial = getLatestSuggestedMoves(
            moveSuggestionForCurrentPower,
            STRINGS.SUGGESTED_MOVE_PARTIAL,
        );
        // Don't display partial order advice if full order advice is newer
        if (
            latestMoveSuggestionFull !== null &&
            latestMoveSuggestionPartial !== null &&
            latestMoveSuggestionFull.time_sent > latestMoveSuggestionPartial.time_sent
        ) {
            latestMoveSuggestionPartial = null;
        }

        let fullSuggestionComponent = null;
        let partialSuggestionComponent = null;
        let distributionSuggestionComponent = null;

        if (latestMoveSuggestionFull) {
            const fullSuggestionMessages = latestMoveSuggestionFull.moves.map((move, moveIndex) => {
                return (
                    <div
                        key={moveIndex}
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                        }}
                        onMouseEnter={() => {
                            let newMoves = [move];
                            setState({ hoverOrders: newMoves });
                        }}
                        onMouseLeave={() => {
                            setState({ hoverOrders: [] });
                        }}
                    >
                        <ChatMessage
                            style={{ flexGrow: 1 }}
                            model={{
                                message: move,
                                sent: latestMoveSuggestionFull.time_sent,
                                sender: latestMoveSuggestionFull.sender,
                                direction: "incoming",
                                position: "single",
                            }}
                            avatarPosition={"tl"}
                        ></ChatMessage>
                        <div
                            style={{
                                flexGrow: 0,
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "flex-end",
                            }}
                        >
                            <Button
                                key={"a"}
                                pickEvent={true}
                                title={"+"}
                                color={"success"}
                                onClick={() => {
                                    onOrderBuilt(currentPowerName, move);

                                    handleRecipientAnnotation(
                                        latestMoveSuggestionFull.time_sent,
                                        `accept ${move}`,
                                    );
                                }}
                                invisible={!(isCurrent && !isAdmin)}
                            ></Button>
                        </div>
                    </div>
                );
            });

            fullSuggestionComponent = (
                <div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                        }}
                        onMouseEnter={() => {
                            let newMoves = [];
                            for (let move of latestMoveSuggestionFull.moves) {
                                newMoves.push(move);
                            }
                            setState({ hoverOrders: newMoves });
                        }}
                        onMouseLeave={() => {
                            setState({ hoverOrders: [] });
                        }}
                    >
                        <ChatMessage
                            style={{ flexGrow: 1 }}
                            model={{
                                message: "Full Set:",
                                sent: latestMoveSuggestionFull.time_sent,
                                sender: latestMoveSuggestionFull.sender,
                                direction: "incoming",
                                position: "single",
                            }}
                            avatarPosition={"tl"}
                        ></ChatMessage>
                        <div
                            style={{
                                flexGrow: 0,
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "flex-end",
                            }}
                        >
                            <Button
                                key={"a"}
                                pickEvent={true}
                                title={"+all"}
                                color={"success"}
                                onClick={async () => {
                                    for (let move of latestMoveSuggestionFull.moves) {
                                        await onOrderBuilt(currentPowerName, move);
                                    }

                                    handleRecipientAnnotation(latestMoveSuggestionFull.time_sent, "accept all");
                                }}
                                invisible={!(isCurrent && !isAdmin)}
                            ></Button>
                            <Button
                                key={"r"}
                                pickEvent={true}
                                title={"-"}
                                color={"secondary"} // Dark gray
                                onClick={() => {
                                    setState({
                                        hoverOrders: [],
                                    });
                                    toggleMoveSuggestionCollapse(latestMoveSuggestionFull.time_sent);
                                }}
                                invisible={!(isCurrent && !isAdmin)}
                            ></Button>
                        </div>
                    </div>
                    {latestMoveSuggestionFull.visible && fullSuggestionMessages}
                </div>
            );
        }

        if (latestMoveSuggestionPartial) {
            const partialSuggestionMessages = latestMoveSuggestionPartial.moves.map((move, moveIndex) => {
                return (
                    <div
                        key={moveIndex}
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                        }}
                        onMouseEnter={() => {
                            let newMoves = [move];
                            setState({ hoverOrders: newMoves });
                        }}
                        onMouseLeave={() => {
                            setState({ hoverOrders: [] });
                        }}
                    >
                        <ChatMessage
                            style={{ flexGrow: 1 }}
                            model={{
                                message: move,
                                sent: latestMoveSuggestionPartial.time_sent,
                                sender: latestMoveSuggestionPartial.sender,
                                direction: "incoming",
                                position: "single",
                            }}
                            avatarPosition={"tl"}
                        ></ChatMessage>
                        <div
                            style={{
                                flexGrow: 0,
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "flex-end",
                            }}
                        >
                            <Button
                                key={"a"}
                                pickEvent={true}
                                title={"+"}
                                color={"success"}
                                onClick={() => {
                                    onOrderBuilt(currentPowerName, move);

                                    handleRecipientAnnotation(
                                        latestMoveSuggestionPartial.time_sent,
                                        `accept ${move}`,
                                    );
                                }}
                                invisible={!(isCurrent && !isAdmin)}
                            ></Button>
                        </div>
                    </div>
                );
            });

            partialSuggestionComponent = (
                <div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                        }}
                        onMouseEnter={() => {
                            let newMoves = [];
                            for (let move of latestMoveSuggestionPartial.moves) {
                                newMoves.push(move);
                            }
                            setState({ hoverOrders: newMoves });
                        }}
                        onMouseLeave={() => {
                            setState({ hoverOrders: [] });
                        }}
                    >
                        <ChatMessage
                            style={{ flexGrow: 1 }}
                            model={{
                                message: `Advice based on ${latestMoveSuggestionPartial.givenMoves.join(", ")}:`,
                                sent: latestMoveSuggestionPartial.time_sent,
                                sender: latestMoveSuggestionPartial.sender,
                                direction: "incoming",
                                position: "single",
                            }}
                            avatarPosition={"tl"}
                        ></ChatMessage>
                        <div
                            style={{
                                flexGrow: 0,
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "flex-end",
                            }}
                        >
                            <Button
                                key={"a"}
                                pickEvent={true}
                                title={"+all"}
                                color={"success"}
                                onClick={async () => {
                                    for (let move of latestMoveSuggestionPartial.moves) {
                                        await onOrderBuilt(currentPowerName, move);
                                    }

                                    handleRecipientAnnotation(latestMoveSuggestionPartial.time_sent, "accept all");
                                }}
                                invisible={!(isCurrent && !isAdmin)}
                            ></Button>
                            <Button
                                key={"r"}
                                pickEvent={true}
                                title={"-"}
                                color={"secondary"} // Dark gray
                                onClick={() => {
                                    toggleMoveSuggestionCollapse(latestMoveSuggestionPartial.time_sent);
                                }}
                                invisible={!(isCurrent && !isAdmin)}
                            ></Button>
                        </div>
                    </div>
                    {latestMoveSuggestionPartial.visible && partialSuggestionMessages}
                </div>
            );
        }

        if (
            hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE_DISTRIBUTION_TEXTUAL) &&
            state.orderDistribution.length > 0
        ) {
            /** render messages that outlines the probability of all possible orders for a selected province*/
            var orderDistribution = state.orderDistribution[0];
            var distributionMoves = new Array(Object.keys(orderDistribution.distribution).length);
            for (var order in orderDistribution.distribution) {
                if (!Object.prototype.hasOwnProperty.call(orderDistribution.distribution, order)) {
                    continue;
                }
                distributionMoves[orderDistribution.distribution[order].rank] =
                    `${order}: ${(orderDistribution.distribution[order].pred_prob * 100.0).toFixed(2)}%`;
            }
            const distributionMessages = distributionMoves.map((move) => {
                return (
                    /** reused the component structure used by the full suggestion/partial suggestion components*/
                    <div
                        key={move}
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                        }}
                        onMouseEnter={() => {
                            let newMove = move.split(":")[0];
                            setState({
                                hoverDistributionOrder: [
                                    { order: newMove, power: state.orderDistribution[0].power },
                                ],
                            });
                        }}
                        onMouseLeave={() => {
                            setState({ hoverDistributionOrder: [] });
                        }}
                    >
                        <ChatMessage
                            style={{ flexGrow: 1 }}
                            model={{
                                message: move,
                                direction: "incoming",
                                position: "single",
                            }}
                        ></ChatMessage>
                        <div
                            style={{
                                flexGrow: 0,
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "flex-end",
                                gap: 3,
                            }}
                        >
                            <Button
                                key={"a"}
                                pickEvent={true}
                                title={"+"}
                                color={"success"}
                                onClick={() => {
                                    if (move.indexOf("NOORDER") === -1) {
                                        onOrderBuilt(currentPowerName, move.split(":")[0]);
                                    }
                                }}
                                invisible={
                                    !(isCurrent && state.orderDistribution[0].power === getCurrentPowerName())
                                }
                            ></Button>

                            <Button
                                key={"v"}
                                pickEvent={true}
                                title={
                                    includeOrder(state.visibleDistributionOrder, move.split(":")[0])
                                        ? "hide"
                                        : "show"
                                }
                                color={
                                    includeOrder(state.visibleDistributionOrder, move.split(":")[0])
                                        ? "secondary"
                                        : "info"
                                }
                                onClick={() => {
                                    const newMove = move.split(":")[0];
                                    var prevVisibleDistributionOrder = state.visibleDistributionOrder;
                                    var newVisibleDistributionOrder = [];
                                    for (var orderObj of prevVisibleDistributionOrder) {
                                        if (orderObj.order !== newMove) {
                                            newVisibleDistributionOrder.push(orderObj);
                                        }
                                    }
                                    if (!includeOrder(prevVisibleDistributionOrder, newMove)) {
                                        newVisibleDistributionOrder.push({
                                            order: newMove,
                                            power: state.orderDistribution[0].power,
                                        });
                                    }
                                    setState({ visibleDistributionOrder: newVisibleDistributionOrder });
                                }}
                                invisible={!isCurrent}
                            ></Button>
                        </div>
                    </div>
                );
            });

            distributionSuggestionComponent = (
                <div>
                    <ChatMessage
                        style={{ flexGrow: 1 }}
                        model={{
                            message: `Order probabilities for ${orderDistribution.province}:`,
                            direction: "incoming",
                            position: "single",
                        }}
                        avatarPosition={"tl"}
                    ></ChatMessage>
                    {distributionMessages}
                </div>
            );
        }

        if (
            !(
                hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE) ||
                hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE_DISTRIBUTION_TEXTUAL)
            )
        ) {
            return null;
        }

        return (
            <div className={"col-2 mb-4"}>
                <ChatContainer
                    style={{
                        display: "flex",
                        border: "1px solid black",
                        boxSizing: "border-box",
                        marginTop: "10px",
                    }}
                >
                    <ConversationHeader>
                        <ConversationHeader.Content userName={`Order Advice`} />
                    </ConversationHeader>

                    {state.hasInitialOrders && (
                        <MessageList className="move-suggestion-list">
                            {fullSuggestionComponent}
                            {partialSuggestionComponent}
                            {distributionSuggestionComponent}
                        </MessageList>
                    )}
                </ChatContainer>
            </div>
        );
    };

    const renderTabCurrentPhase = (
        toDisplay,
        engine,
        powerName,
        orderType,
        orderPath,
        currentPowerName,
        orderPanel,
        moveAdvicePanel,
    ) => {
        return (
            <Tab id={"tab-current-phase"} display={toDisplay}>
                <Row>
                    <div className={`col-${state.mapSize}`}>
                        <MapContainer
                            mode="current"
                            gameEngine={engine}
                            mapInfo={mapInfo}
                            showAbbreviations={state.showAbbreviations}
                            onError={page.error}
                            powerName={powerName}
                            orderType={orderType}
                            orderPath={orderPath}
                            orders={memoizedMapOrders}
                            hoverOrders={state.hoverOrders}
                            shiftKeyPressed={state.shiftKeyPressed}
                            onOrderBuilding={onOrderBuilding}
                            onOrderBuilt={onOrderBuilt}
                            onChangeOrderDistribution={onChangeOrderDistribution}
                            orderDistribution={state.orderDistribution}
                            displayVisualAdvice={state.displayVisualAdvice}
                            visibleDistributionOrder={state.visibleDistributionOrder}
                            hoverDistributionOrder={state.hoverDistributionOrder}
                            onSelectLocation={onSelectLocation}
                            onSelectVia={onSelectVia}
                            getOrderBuilding={getOrderBuilding}
                        />
                    </div>
                    <div className={moveAdvicePanel ? "col-4" : "col-6"}>
                        {/* Orders. */}
                        <div className={"panel-orders mb-4"} style={{ maxHeight: "500px", overflowY: "auto" }}>
                            {orderPanel ? <div className="mb-4">{orderPanel}</div> : ""}
                        </div>
                    </div>
                    {moveAdvicePanel}
                </Row>
            </Tab>
        );
    };

    const renderTabChat = (toDisplay, initialEngine, currentPowerName, isWide) => {
        const { engine, pastPhases, phaseIndex } = __get_engine_to_display(initialEngine);
        const isCurrent = pastPhases[phaseIndex] === initialEngine.phase;
        const displayEngine = isCurrent ? initialEngine : engine;

        return renderChatPanel(displayEngine, currentPowerName, isWide, isCurrent);
    };

    const renderMoveAdviceTab = (toDisplay, initialEngine, role) => {
        const { engine, pastPhases, phaseIndex } = __get_engine_to_display(initialEngine);

        return renderCurrentMoveAdvice(engine, role, pastPhases[phaseIndex] === initialEngine.phase);
    };

    const renderMessageAdviceTab = (toDisplay, initialEngine, role, isWide) => {
        const { engine, pastPhases, phaseIndex } = __get_engine_to_display(initialEngine);

        return renderCurrentMessageAdvice(engine, role, pastPhases[phaseIndex] === initialEngine.phase);
    };

    // componentDidMount + componentWillUnmount
    useEffect(() => {
        window.scrollTo(0, 0);
        if (data.client) reloadDeadlineTimer(data.client);
        data.displayed = true;

        document.onkeydown = (event) => {
            if (event.key === "Shift" && !event.repeat && stateRef.current.hasInitialOrders) {
                setState({
                    shiftKeyPressed: true,
                    orderDistribution: [],
                    hoverDistributionOrder: [],
                    visibleDistributionOrder: [],
                });
            }

            // Try to prevent scrolling when pressing keys Home and End.
            if (["home", "end"].includes(event.key.toLowerCase())) {
                if (Object.prototype.hasOwnProperty.call(event, "cancelBubble")) event.cancelBubble = true;
                if (event.stopPropagation) event.stopPropagation();
                if (event.preventDefault) event.preventDefault();
            }
        };

        document.onkeyup = (event) => {
            if (event.key === "Shift") {
                setState({
                    shiftKeyPressed: false,
                    orderDistribution: [],
                    hoverDistributionOrder: [],
                    visibleDistributionOrder: [],
                });
            }
        };

        window.addEventListener("beforeunload", handleExit);
        window.addEventListener("blur", handleBlur);
        window.addEventListener("focus", handleFocus);
        setState({
            lastSwitchPanelTime: Date.now(),
        });

        return () => {
            clearScheduleTimeout();
            data.displayed = false;
            document.onkeydown = null;
            document.onkeyup = null;

            handleExit();
            window.removeEventListener("beforeunload", handleExit);
            window.removeEventListener("blur", handleBlur);
            window.removeEventListener("focus", handleFocus);
        };
    }, []);

    // componentDidUpdate equivalent
    data.displayed = true;

    // Main render return
    const engine = data;
    const controllablePowers = engine.getControllablePowers();
    const currentPowerName = getCurrentPowerName();

    // Memoize the map info — stable for the lifetime of a game session.
    const mapInfo = useMemo(() => page.availableMaps[data.map_name], []); // eslint-disable-line

    // Memoize the orders passed to the map. Re-derives only when local orders
    // change or a forceUpdate() fires (which covers server-side order updates).
    const memoizedMapOrders = useMemo(
        () => __get_orders(engine),
        [state.orders, forceUpdateTick], // eslint-disable-line
    );

    const serverOrders = __get_orders(engine);
    const powerOrders = serverOrders[currentPowerName] || [];

    const title = gameTitle(engine);
    const navigation = [
        ["Help", () => page.dialog((onClose) => <Help onClose={onClose} />)],
        ["Load a game from disk", page.loadGameFromDisk],
        ["Save game to disk", () => saveGameToDisk(engine, page.error)],
        [`${UTILS.html.UNICODE_SMALL_LEFT_ARROW} Games`, () => page.loadGames()],
        [`${UTILS.html.UNICODE_SMALL_LEFT_ARROW} Leave game`, () => page.leaveGame(engine.game_id)],
        [`${UTILS.html.UNICODE_SMALL_LEFT_ARROW} Logout`, page.logout],
    ];
    const phaseType = engine.getPhaseType();
    if (data.client) bindCallbacks(data.client);

    if (engine.phase === "FORMING")
        return (
            <main>
                <div className={"forming"}>Game not yet started!</div>
            </main>
        );

    const tabNames = [];
    const tabTitles = [];
    let hasTabPhaseHistory = false;
    let hasTabCurrentPhase = false;
    if (engine.state_history.size()) {
        hasTabPhaseHistory = true;
        tabNames.push("phase_history");
        tabTitles.push("Results");
    }
    tabNames.push("messages");
    tabTitles.push("Messages");
    if (controllablePowers.length && phaseType && !engine.isObserverGame()) {
        hasTabCurrentPhase = true;
        tabNames.push("current_phase");
        tabTitles.push("Current");
    }
    if (!tabNames.length) {
        // This should never happen, but let's display this message.
        return (
            <main>
                <div className={"no-data"}>No data in this game!</div>
            </main>
        );
    }

    let currentPower = null;
    let orderTypeToLocs = null;
    let allowedPowerOrderTypes = null;
    let orderBuildingType = null;
    let buildCount = null;
    if (hasTabCurrentPhase) {
        currentPower = engine.getPower(currentPowerName);
        orderTypeToLocs = engine.getOrderTypeToLocs(currentPowerName);
        allowedPowerOrderTypes = Object.keys(orderTypeToLocs);
        if (allowedPowerOrderTypes.length) {
            POSSIBLE_ORDERS.sortOrderTypes(allowedPowerOrderTypes, phaseType);
        }

        const messageChannels = engine.getMessageChannels(currentPowerName, true);
        const suggestionMessages = getSuggestionMessages(currentPowerName, messageChannels, engine);
        const suggestionType = getSuggestionType(currentPowerName, engine, suggestionMessages);
        const displayVisualAdvice = hasSuggestionType(
            suggestionType,
            UTILS.SuggestionType.MOVE_DISTRIBUTION_VISUAL,
        );
        if (displayVisualAdvice !== state.displayVisualAdvice) {
            setState({ displayVisualAdvice: displayVisualAdvice });
        }

        if (allowedPowerOrderTypes.length) {
            if (state.orderBuildingType && allowedPowerOrderTypes.includes(state.orderBuildingType))
                orderBuildingType = state.orderBuildingType;
            else orderBuildingType = allowedPowerOrderTypes[0];
        }
        buildCount = engine.getBuildsCount(currentPowerName);
    }

    const possibleMapSizes = {
        half: 6,
        large: 8,
        full: 12,
    };

    const messageChannels = engine.getMessageChannels(currentPowerName, true);
    const suggestionMessages = getSuggestionMessages(currentPowerName, messageChannels, engine);

    const suggestionType = getSuggestionType(currentPowerName, engine, suggestionMessages);

    const navAfterTitle = (
        <form className="form-inline form-current-power">
            <div className="game-controls-group">
                <div className="custom-control custom-control-inline map-size-control">
                    <label className="control-label" htmlFor="map-size">
                        Map size:
                    </label>
                    <select
                        className="form-control custom-select"
                        id="map-size"
                        value={Object.keys(possibleMapSizes).find(
                            (key) => possibleMapSizes[key] === state.mapSize,
                        )}
                        onChange={(event) => {
                            setState({
                                mapSize: possibleMapSizes[event.target.value],
                            });
                        }}
                    >
                        {Object.keys(possibleMapSizes).map((key) => (
                            <option key={key} value={key}>
                                {key.charAt(0).toUpperCase() + key.slice(1)}
                            </option>
                        ))}
                    </select>
                </div>

                {(controllablePowers.length === 1 && <span className="power-name">{controllablePowers[0]}</span>) || (
                    <div className="custom-control custom-control-inline power-select-control">
                        <label className="sr-only" htmlFor="current-power">
                            power
                        </label>
                        <select
                            className="form-control custom-select"
                            id="current-power"
                            value={currentPowerName}
                            onChange={onChangeCurrentPower}
                        >
                            {controllablePowers.map((powerName) => (
                                <option key={powerName} value={powerName}>
                                    {powerName}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="custom-control custom-control-inline custom-checkbox abbreviations-control">
                    <input
                        className="custom-control-input"
                        id="show-abbreviations"
                        type="checkbox"
                        checked={state.showAbbreviations}
                        onChange={onChangeShowAbbreviations}
                    />
                    <label className="custom-control-label" htmlFor="show-abbreviations">
                        Show abbreviations
                    </label>
                </div>
            </div>
        </form>
    );

    const orderPanelElement = hasTabCurrentPhase && (
        <OrderPanel
            engine={engine}
            currentPowerName={currentPowerName}
            currentPower={currentPower}
            orderBuildingType={orderBuildingType}
            allowedPowerOrderTypes={allowedPowerOrderTypes}
            orderTypeToLocs={orderTypeToLocs}
            phaseType={phaseType}
            buildCount={buildCount}
            suggestionType={suggestionType}
            powerOrders={powerOrders}
            serverOrders={data.getServerOrders()}
            orders={__get_orders(engine)}
            wait={getServerWaitFlags(engine)}
            onChangeOrderType={onChangeOrderType}
            onSetEmptyOrdersSet={onSetEmptyOrdersSet}
            setWaitFlag={setWaitFlag}
            vote={vote}
            onRemoveOrder={onRemoveOrder}
            onReloadServerOrders={reloadServerOrders}
            onRemoveAllCurrentPowerOrders={onRemoveAllCurrentPowerOrders}
            onSetOrders={setOrders}
            onProcessGame={onProcessGame}
            isPlayerGame={data.isPlayerGame()}
            observerLevel={data.observer_level}
        />
    );

    const moveAdvicePanel = renderMoveAdviceTab(true, engine, currentPowerName);

    const { pastPhases, phaseIndex } = __get_engine_to_display(engine);
    let phasePanel;
    if (pastPhases[phaseIndex] === engine.phase) {
        if (hasTabCurrentPhase) {
            phasePanel = renderTabCurrentPhase(
                true,
                engine,
                currentPowerName,
                orderBuildingType,
                state.orderBuildingPath,
                currentPowerName,
                orderPanelElement,
                moveAdvicePanel,
            );
        } else if (hasTabPhaseHistory) {
            phasePanel = renderTabResults(true, engine);
        }
    } else {
        phasePanel = renderTabResults(true, engine);
    }

    const isAdmin = engine.role === "omniscient_type" || engine.role === "master_type";

    const showMessageAdviceTab =
        hasSuggestionType(suggestionType, UTILS.SuggestionType.MESSAGE) ||
        hasSuggestionType(suggestionType, UTILS.SuggestionType.COMMENTARY);
    const gameContent = (
        <div>
            {phasePanel}
            <Row className={"mb-4"}>
                {renderTabChat(true, engine, currentPowerName, !showMessageAdviceTab)}
                {showMessageAdviceTab && renderMessageAdviceTab(true, engine, currentPowerName, false)}
            </Row>
            <Row>
                {!engine.isPlayerGame() && (
                    <PowerInfoPanel engine={engine} currentPowerName={currentPowerName} />
                )}
                {page.channel.username === "admin" && (
                    <LogsPanel
                        engine={engine}
                        role={currentPowerName}
                        logData={state.logData}
                        setLogDataInputValue={setlogDataInputValue}
                        sendLogData={sendLogData}
                    />
                )}
            </Row>
        </div>
    );

    return (
        <main>
            <Helmet>
                <title>{title} | Diplomacy</title>
            </Helmet>
            <Navigation
                title={title}
                afterTitle={navAfterTitle}
                username={page.channel.username}
                phaseSel={__form_phases(pastPhases, phaseIndex)}
                navigation={navigation}
            />
            {gameContent}
        </main>
    );
};

ContentGame.propTypes = {
    data: PropTypes.instanceOf(Game).isRequired,
};

