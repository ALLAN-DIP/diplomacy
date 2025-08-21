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
import { SelectLocationForm } from "../forms/select_location_form";
import { SelectViaForm } from "../forms/select_via_form";
import { Order } from "../utils/order";
import { Row, Col } from "../components/layouts";
import { extendOrderBuilding, ORDER_BUILDER, POSSIBLE_ORDERS } from "../utils/order_building";
import { PowerOrderCreationForm } from "../forms/power_order_creation_form";
import { UTILS } from "../../diplomacy/utils/utils";
import { Message } from "../../diplomacy/engine/message";
import { PowerOrders } from "../components/power_orders";
import { STRINGS } from "../../diplomacy/utils/strings";
import { Diplog } from "../../diplomacy/utils/diplog";
import { AdminPowersInfoTable } from "../components/admin_powers_info_table";
import { PowerView } from "../utils/power_view";
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
import { PowerOrdersActionBar } from "../components/power_orders_actions_bar";
import { SvgStandard } from "../maps/standard/SvgStandard";
import { SvgAncMed } from "../maps/ancmed/SvgAncMed";
import { SvgModern } from "../maps/modern/SvgModern";
import { SvgPure } from "../maps/pure/SvgPure";
import { MapData } from "../utils/map_data";
import { Queue } from "../../diplomacy/utils/queue";
import styles from "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import { default as Tabs2 } from "@mui/material/Tabs";
import { default as Tab2 } from "@mui/material/Tab";
import Box from "@mui/material/Box";
import Badge from "@mui/material/Badge";
import Switch from "@mui/material/Switch";

import {
    MainContainer,
    ChatContainer,
    MessageList,
    MessageSeparator,
    MessageInput,
    Sidebar,
    ConversationList,
    Conversation,
    ConversationHeader,
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
import Grid from "@mui/material/Grid";
import { Tooltip } from "@mui/material";
import Octicon, { Question } from "@primer/octicons-react";

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

const TABLE_POWER_VIEW = {
    name: ["Power", 0],
    controller: ["Controller", 1],
    order_is_set: ["With orders", 2],
    wait: ["Ready", 3],
    comm_status: ["Comm. Status", 4],
};

const PRETTY_ROLES = {
    [STRINGS.OMNISCIENT_TYPE]: "Omnicient",
    [STRINGS.OBSERVER_TYPE]: "Observer",
};

const MAP_COMPONENTS = {
    ancmed: SvgAncMed,
    standard: SvgStandard,
    modern: SvgModern,
    pure: SvgPure,
};

function getMapComponent(mapName) {
    for (let rootMap of Object.keys(MAP_COMPONENTS)) {
        if (mapName.indexOf(rootMap) === 0) return MAP_COMPONENTS[rootMap];
    }
    throw new Error(`Un-implemented map: ${mapName}`);
}

function noPromise() {
    return new Promise((resolve) => resolve());
}

export class ContentGame extends React.Component {
    constructor(props) {
        super(props);
        // Load local orders from local storage (if available).
        const savedOrders = this.props.data.client
            ? DipStorage.getUserGameOrders(
                  this.props.data.client.channel.username,
                  this.props.data.game_id,
                  this.props.data.phase,
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
        this.schedule_timeout_id = null;

        this.state = {
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
            message: "",
            logData: "",
            hasInitialOrders: this.props.data.getInitialOrders(this.props.data.role),
            annotatedMessages: this.props.data.getAnnotatedMessages(),
            stances: this.props.data.stances[this.props.data.role] || {},
            isBot: this.props.data.is_bot[this.props.data.role] || {
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
            commentaryTimeSpent: this.props.data.commentary_durations[this.props.data.role] || [],
            stanceChanged: false,
            visibleMoveSuggestions: {},
        };

        // Bind some class methods to this instance.
        this.onChangeOrderDistribution = this.onChangeOrderDistribution.bind(this);
        this.clearOrderBuildingPath = this.clearOrderBuildingPath.bind(this);
        this.displayFirstPastPhase = this.displayFirstPastPhase.bind(this);
        this.displayLastPastPhase = this.displayLastPastPhase.bind(this);
        this.displayLocationOrders = this.displayLocationOrders.bind(this);
        this.getMapInfo = this.getMapInfo.bind(this);
        this.notifiedGamePhaseUpdated = this.notifiedGamePhaseUpdated.bind(this);
        this.notifiedLocalStateChange = this.notifiedLocalStateChange.bind(this);
        this.notifiedNetworkGame = this.notifiedNetworkGame.bind(this);
        this.notifiedNewGameMessage = this.notifiedNewGameMessage.bind(this);
        this.notifiedPowersControllers = this.notifiedPowersControllers.bind(this);
        this.onChangeCurrentPower = this.onChangeCurrentPower.bind(this);
        this.onChangeMainTab = this.onChangeMainTab.bind(this);
        this.onChangeOrderType = this.onChangeOrderType.bind(this);
        this.onChangePastPhase = this.onChangePastPhase.bind(this);
        this.onChangePastPhaseIndex = this.onChangePastPhaseIndex.bind(this);
        this.onChangeShowPastOrders = this.onChangeShowPastOrders.bind(this);
        this.onChangeShowAbbreviations = this.onChangeShowAbbreviations.bind(this);
        this.onChangeTabCurrentMessages = this.onChangeTabCurrentMessages.bind(this);
        this.onChangeTabPastMessages = this.onChangeTabPastMessages.bind(this);
        this.onClickMessage = this.onClickMessage.bind(this);
        this.onDecrementPastPhase = this.onDecrementPastPhase.bind(this);
        this.onIncrementPastPhase = this.onIncrementPastPhase.bind(this);
        this.onOrderBuilding = this.onOrderBuilding.bind(this);
        this.onOrderBuilt = this.onOrderBuilt.bind(this);
        this.onProcessGame = this.onProcessGame.bind(this);
        this.onRemoveAllCurrentPowerOrders = this.onRemoveAllCurrentPowerOrders.bind(this);
        this.onRemoveOrder = this.onRemoveOrder.bind(this);
        this.onSelectLocation = this.onSelectLocation.bind(this);
        this.onSelectVia = this.onSelectVia.bind(this);
        this.onSetEmptyOrdersSet = this.onSetEmptyOrdersSet.bind(this);
        this.reloadServerOrders = this.reloadServerOrders.bind(this);
        this.renderOrders = this.renderOrders.bind(this);
        this.sendMessage = this.sendMessage.bind(this);
        this.sendLogData = this.sendLogData.bind(this);
        this.sendOrderLog = this.sendOrderLog.bind(this);
        this.sendGameStance = this.sendGameStance.bind(this);
        this.sendIsBot = this.sendIsBot.bind(this);
        this.sendDeceiving = this.sendDeceiving.bind(this);
        this.sendRecipientAnnotation = this.sendRecipientAnnotation.bind(this);
        this.setOrders = this.setOrders.bind(this);
        this.setSelectedLocation = this.setSelectedLocation.bind(this);
        this.setSelectedVia = this.setSelectedVia.bind(this);
        this.setWaitFlag = this.setWaitFlag.bind(this);
        this.setCommStatus = this.setCommStatus.bind(this);
        this.vote = this.vote.bind(this);
        this.updateDeadlineTimer = this.updateDeadlineTimer.bind(this);
        this.updateTabVal = this.updateTabVal.bind(this);
        this.updateReadCommentary = this.updateReadCommentary.bind(this);
    }

    static gameTitle(game) {
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

    static getServerWaitFlags(engine) {
        const wait = {};
        const controllablePowers = engine.getControllablePowers();
        for (let powerName of controllablePowers) {
            wait[powerName] = engine.powers[powerName].wait;
        }
        return wait;
    }

    static getOrderBuilding(powerName, orderType, orderPath) {
        return {
            type: orderType,
            path: orderPath,
            power: powerName,
            builder: orderType && ORDER_BUILDER[orderType],
        };
    }

    setState(state) {
        return new Promise((resolve) => super.setState(state, resolve));
    }

    forceUpdate() {
        return new Promise((resolve) => super.forceUpdate(resolve));
    }

    /**
     * Return current page object displaying this content.
     * @returns {Page}
     */
    getPage() {
        return this.context;
    }

    clearOrderBuildingPath() {
        return this.setState({
            orderBuildingPath: [],
        });
    }

    // [ Methods used to handle current map.

    setSelectedLocation(location, powerName, orderType, orderPath) {
        if (!location) return;
        extendOrderBuilding(
            powerName,
            orderType,
            orderPath,
            location,
            this.onOrderBuilding,
            this.onOrderBuilt,
            this.getPage().error,
        );
    }

    setSelectedVia(moveType, powerName, orderPath, location) {
        if (!moveType || !["M", "V"].includes(moveType)) return;
        extendOrderBuilding(
            powerName,
            moveType,
            orderPath,
            location,
            this.onOrderBuilding,
            this.onOrderBuilt,
            this.getPage().error,
        );
    }

    onSelectLocation(possibleLocations, powerName, orderType, orderPath) {
        this.getPage().dialog((onClose) => (
            <SelectLocationForm
                path={orderPath}
                locations={possibleLocations}
                onSelect={(location) => {
                    this.setSelectedLocation(location, powerName, orderType, orderPath);
                    onClose();
                }}
                onClose={() => {
                    this.clearOrderBuildingPath();
                    onClose();
                }}
            />
        ));
    }

    onSelectVia(location, powerName, orderPath) {
        this.getPage().dialog((onClose) => (
            <SelectViaForm
                path={orderPath}
                onSelect={(moveType) => {
                    setTimeout(() => {
                        this.setSelectedVia(moveType, powerName, orderPath, location);
                        onClose();
                    }, 0);
                }}
                onClose={() => {
                    this.clearOrderBuildingPath();
                    onClose();
                }}
            />
        ));
    }

    // ]

    getMapInfo() {
        return this.getPage().availableMaps[this.props.data.map_name];
    }

    clearScheduleTimeout() {
        if (this.schedule_timeout_id) {
            clearInterval(this.schedule_timeout_id);
            this.schedule_timeout_id = null;
        }
    }

    updateDeadlineTimer() {
        const engine = this.props.data;
        --engine.deadline_timer;
        if (engine.deadline_timer <= 0) {
            engine.deadline_timer = 0;
            this.clearScheduleTimeout();
        }
        if (this.networkGameIsDisplayed(engine.client)) this.forceUpdate();
    }

    reloadDeadlineTimer(networkGame) {
        networkGame
            .querySchedule()
            .then((dataSchedule) => {
                const schedule = dataSchedule.schedule;
                const server_current = schedule.current_time;
                const server_end = schedule.time_added + schedule.delay;
                const server_remaining = server_end - server_current;
                this.props.data.deadline_timer = server_remaining * schedule.time_unit;
                if (!this.schedule_timeout_id)
                    this.schedule_timeout_id = setInterval(this.updateDeadlineTimer, schedule.time_unit * 1000);
            })
            .catch(() => {
                if (this.props.data.hasOwnProperty("deadline_timer")) delete this.props.data.deadline_timer;
                this.clearScheduleTimeout();
            });
    }

    // [ Network game notifications.

    /**
     * Return True if given network game is the game currently displayed on the interface.
     * @param {NetworkGame} networkGame - network game to check
     * @returns {boolean}
     */
    networkGameIsDisplayed(networkGame) {
        return this.getPage().getName() === `game: ${networkGame.local.game_id}`;
    }

    notifiedNetworkGame(networkGame, notification) {
        if (this.networkGameIsDisplayed(networkGame)) {
            const msg = `Game (${networkGame.local.game_id}) received notification ${notification.name}.`;
            this.reloadDeadlineTimer(networkGame);
            return this.forceUpdate().then(() => this.getPage().info(msg));
        }
        return noPromise();
    }

    notifiedPowersControllers(networkGame, notification) {
        if (
            networkGame.local.isPlayerGame() &&
            (!networkGame.channel.game_id_to_instances.hasOwnProperty(networkGame.local.game_id) ||
                !networkGame.channel.game_id_to_instances[networkGame.local.game_id].has(networkGame.local.role))
        ) {
            // This power game is now invalid.
            return this.getPage()
                .disconnectGame(networkGame.local.game_id)
                .then(() => {
                    if (this.networkGameIsDisplayed(networkGame)) {
                        return this.getPage().loadGames({
                            error: `${networkGame.local.game_id}/${networkGame.local.role} was kicked. Deadline over?`,
                        });
                    }
                });
        } else {
            return this.notifiedNetworkGame(networkGame, notification);
        }
    }

    notifiedGamePhaseUpdated(networkGame, notification) {
        return networkGame
            .getAllPossibleOrders()
            .then((allPossibleOrders) => {
                networkGame.local.setPossibleOrders(allPossibleOrders);
                if (this.networkGameIsDisplayed(networkGame)) {
                    this.__store_orders(null);
                    this.reloadDeadlineTimer(networkGame);
                    return this.setState({
                        orders: null,
                        messageHighlights: {},
                        orderBuildingPath: [],
                        orderDistribution: [],
                        hoverDistributionOrder: [],
                        visibleDistributionOrder: [],
                        hasInitialOrders: false,
                        hoverOrders: [],
                    }).then(() =>
                        this.getPage().info(`Game update (${notification.name}) to ${networkGame.local.phase}.`),
                    );
                }
            })
            .catch((error) => this.getPage().error("Error when updating possible orders: " + error.toString()));
    }

    notifiedLocalStateChange(networkGame, notification) {
        return networkGame
            .getAllPossibleOrders()
            .then((allPossibleOrders) => {
                networkGame.local.setPossibleOrders(allPossibleOrders);
                if (this.networkGameIsDisplayed(networkGame)) {
                    this.reloadDeadlineTimer(networkGame);
                    let result = null;
                    if (notification.power_name) {
                        result = this.reloadPowerServerOrders(notification.power_name);
                    } else {
                        result = this.forceUpdate();
                    }
                    return result.then(() => this.getPage().info(`Possible orders re-loaded.`));
                }
            })
            .catch((error) => this.getPage().error("Error when updating possible orders: " + error.toString()));
    }

    notifiedNewGameMessage(networkGame, notification) {
        let protagonist = notification.message.sender;
        if (notification.message.recipient === "GLOBAL") protagonist = notification.message.recipient;
        const messageHighlights = Object.assign({}, this.state.messageHighlights);
        if (!messageHighlights.hasOwnProperty(protagonist)) {
            messageHighlights[protagonist] = 1;
        } else {
            ++messageHighlights[protagonist];
        }
        if (!messageHighlights.hasOwnProperty("messages")) {
            messageHighlights["messages"] = 1;
        } else {
            ++messageHighlights["messages"];
        }
        return this.setState({ messageHighlights: messageHighlights }).then(() =>
            this.notifiedNetworkGame(networkGame, notification),
        );
    }

    bindCallbacks(networkGame) {
        const collector = (game, notification) => {
            game.queue.append(notification);
        };
        const consumer = (notification) => {
            switch (notification.name) {
                case "powers_controllers":
                    return this.notifiedPowersControllers(networkGame, notification);
                case "game_message_received":
                    return this.notifiedNewGameMessage(networkGame, notification);
                case "log_received":
                    return this.notifiedNewGameMessage(networkGame, notification);
                case "recipients_annotation_received":
                    return this.notifiedNewGameMessage(networkGame, notification);
                case "game_processed":
                case "game_phase_update":
                    return this.notifiedGamePhaseUpdated(networkGame, notification);
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
                    return this.notifiedNetworkGame(networkGame, notification);
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
    }

    // ]

    /**
     * Handler to retrieve model prediction and update current state distribution advice
     * @param {string} requestedPower  - power requesting the advice
     * @param {string} requestedProvince - province to get advice for
     */
    onChangeOrderDistribution(requestedPower, requestedProvince, provinceController) {
        if (this.state.displayVisualAdvice === null || this.state.displayVisualAdvice === undefined) {
            return;
        }
        if (requestedProvince === undefined || requestedProvince === null) {
            return;
        }

        const engine = this.props.data;
        const messageChannels = engine.getMessageChannels(requestedPower, true);
        const suggestionMessages = this.getSuggestionMessages(requestedPower, messageChannels, engine);
        const provinceOrderDistributions = suggestionMessages.filter(
            (msg) =>
                msg.type === STRINGS.SUGGESTED_MOVE_DISTRIBUTION && msg.parsed.payload.province === requestedProvince,
        );
        if (provinceOrderDistributions.length === 0) {
            return;
        }
        const provinceOrderDistribution = provinceOrderDistributions[0].parsed.payload;

        // successfully retrieves and updates order distribution
        if (!this.state.displayVisualAdvice) {
            this.setState({
                orderDistribution: [
                    {
                        power: provinceController,
                        distribution: provinceOrderDistribution.predicted_orders,
                        province: requestedProvince,
                    },
                ],
            });
        } else {
            let prevOrderDistribution = this.state.orderDistribution;
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
            this.setState({ orderDistribution: updatedOrderDistribution });
        }
    }

    /**
     * Search for order in a json object order list
     * @param {array} orderArr  - [ { order: str, power: str },... ]
     * @param {string} order - order
     */
    includeOrder(orderArr, order) {
        for (var orderObj of orderArr) {
            if (orderObj.order === order) {
                return true;
            }
        }
        return false;
    }

    onChangeCurrentPower(event) {
        return this.setState({
            power: event.target.value,
            tabPastMessages: null,
            tabCurrentMessages: null,
            distributionAdviceSetting: null,
            orderDistribution: [],
            hoverDistributionOrder: [],
            visibleDistributionOrder: [],
        });
    }

    onChangeMainTab(tab) {
        return this.setState({ tabMain: tab });
    }

    onChangeTabCurrentMessages(tab) {
        return this.setState({ tabCurrentMessages: tab });
    }

    onChangeTabPastMessages(tab) {
        return this.setState({ tabPastMessages: tab });
    }

    setMessageInputValue(val) {
        return this.setState({ message: val });
    }

    setlogDataInputValue(val) {
        return this.setState({ logData: val });
    }

    sendOrderLog(networkGame, logType, order) {
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
    }

    handleRecipientAnnotation(message_time_sent, annotation) {
        const engine = this.props.data;
        const newAnnotatedMessages = {
            ...this.state.annotatedMessages,
            // Server ensures that `Message.time_sent` is unique
            [message_time_sent]: annotation,
        };
        this.setState({ annotatedMessages: newAnnotatedMessages });

        this.sendRecipientAnnotation(engine.client, message_time_sent, annotation);
    }

    toggleMoveSuggestionCollapse(message_time_sent) {
        this.setState((prevState) => {
            let value = false;
            if (prevState.visibleMoveSuggestions.hasOwnProperty(message_time_sent)) {
                value = !prevState.visibleMoveSuggestions[message_time_sent];
            }
            const newVisibleMoveSuggestions = {
                ...prevState.visibleMoveSuggestions,
                // Server ensures that `Message.time_sent` is unique
                [message_time_sent]: value,
            };
            return { visibleMoveSuggestions: newVisibleMoveSuggestions };
        });
    }

    updateTabVal(event, value) {
        const now = Date.now();

        if (value === STRINGS.MESSAGES) {
            // track time spent on commentary
            const timeDiff = now - this.state.lastSwitchPanelTime;

            const newTimeSpent = [...this.state.commentaryTimeSpent, timeDiff];
            this.setState({
                commentaryTimeSpent: newTimeSpent,
            });

            this.sendCommentaryDurations(this.props.data.client, this.props.data.role, timeDiff);

            return this.setState({
                tabVal: value,
                commentaryTimeSpent: newTimeSpent,
            });
        }
        return this.setState({ tabVal: value, lastSwitchPanelTime: now });
    }

    updateReadCommentary(event) {
        const numAllCommentary = this.state.numAllCommentary;
        return this.setState({
            numReadCommentary: numAllCommentary,
            showBadge: false,
        }); // sync numReadCommentary with numAllCommentary and hide badge
    }

    sendRecipientAnnotation(networkGame, time_sent, annotation) {
        const page = this.getPage();
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
    }

    sendGameStance(networkGame, powerName, stance) {
        const info = {
            power_name: powerName,
            stance: stance,
        };
        networkGame.sendStance({ stance: info });
    }

    sendIsBot(networkGame, powerName, isBot) {
        const info = {
            power_name: powerName,
            is_bot: isBot,
        };
        networkGame.sendIsBot({ is_bot: info });
    }

    sendDeceiving(networkGame, controlledPower, targetPower, deceiving) {
        const info = {
            controlled_power: controlledPower,
            target_power: targetPower,
            deceiving: deceiving,
        };
        networkGame.sendDeceiving({ info: info });
    }

    sendMessage(networkGame, recipient, body, deception, messageType) {
        const page = this.getPage();

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
    }

    sendLogData(networkGame, body) {
        const engine = networkGame.local;
        const message = new Message({
            phase: engine.phase,
            sender: engine.role,
            recipient: "OMNISCIENT",
            message: body,
        });
        const page = this.getPage();
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
    }

    sendCommentaryDurations(networkGame, powerName, durations) {
        if (
            this.props.data.role === "omniscient_type" ||
            this.props.data.role === "observer_type" ||
            this.props.data.role === "master_type"
        ) {
            return;
        }

        const info = {
            power_name: powerName,
            durations: durations,
        };
        networkGame.sendCommentaryDurations({ durations: info });
    }

    handleExit = () => {
        // Send the commentary durations to the server on exit
        if (this.state.tabVal === STRINGS.MESSAGES) {
            return;
        }
        const now = Date.now();
        const timeSpent = now - this.state.lastSwitchPanelTime;
        const newTimeSpent = [...this.state.commentaryTimeSpent, timeSpent];
        this.setState({
            lastSwitchPanelTime: now,
            commentaryTimeSpent: newTimeSpent,
        });
        const engine = this.props.data;

        this.sendCommentaryDurations(engine.client, engine.role, timeSpent);
    };

    handleFocus = () => {
        this.setState({ lastSwitchPanelTime: Date.now() });
    };

    handleBlur = () => {
        this.handleExit();
    };

    onProcessGame() {
        const page = this.getPage();
        this.props.data.client
            .process()
            .then(() => {
                page.success("Game processed.");
                this.props.data.clearInitialOrders();
                return this.setState({ hasInitialOrders: false, hoverOrders: [] });
            })
            .catch((err) => {
                page.error(err.toString());
            });
    }

    /**
     * Get name of current power selected on the game page.
     * @returns {null|string}
     */
    getCurrentPowerName() {
        const engine = this.props.data;
        const controllablePowers = engine.getControllablePowers();
        return this.state.power || (controllablePowers.length && controllablePowers[0]);
    }

    // [ Methods involved in orders management.

    /**
     * Return a dictionary of local orders for given game engine.
     * Returned dictionary maps each power name to either:
     * - a dictionary of orders, mapping a location to an Order object with boolean flag `local` correctly set
     *   to determine if that order is a new local order or is a copy of an existing server order for this power.
     * - null or empty dictionary, if there are no local orders defined for this power.
     * @param {Game} engine - game engine from which we must get local orders
     * @returns {{}}
     * @private
     */
    __get_orders(engine) {
        const orders = engine.getServerOrders();
        if (this.state.orders) {
            for (let powerName of Object.keys(orders)) {
                const serverPowerOrders = orders[powerName];
                const localPowerOrders = this.state.orders[powerName];
                if (localPowerOrders) {
                    for (let localOrder of Object.values(localPowerOrders)) {
                        localOrder.local =
                            !serverPowerOrders ||
                            !serverPowerOrders.hasOwnProperty(localOrder.loc) ||
                            serverPowerOrders[localOrder.loc].order !== localOrder.order;
                    }
                }
                orders[powerName] = localPowerOrders;
            }
        }
        return orders;
    }

    /**
     * Save given orders into local storage.
     * @param orders - orders to save
     * @private
     */
    __store_orders(orders) {
        const username = this.props.data.client.channel.username;
        const gameID = this.props.data.game_id;
        const gamePhase = this.props.data.phase;
        if (!orders) return DipStorage.clearUserGameOrders(username, gameID);
        for (let entry of Object.entries(orders)) {
            const powerName = entry[0];
            let powerOrdersList = null;
            if (entry[1]) powerOrdersList = Object.values(entry[1]).map((order) => order.order);
            DipStorage.clearUserGameOrders(username, gameID, powerName);
            DipStorage.addUserGameOrders(username, gameID, gamePhase, powerName, powerOrdersList);
        }
    }

    /**
     * Reset local orders and replace them with current server orders for given power.
     * @param {string} powerName - name of power to update
     */
    reloadPowerServerOrders(powerName) {
        const serverOrders = this.props.data.getServerOrders();
        const engine = this.props.data;
        const allOrders = this.__get_orders(engine);
        if (!allOrders.hasOwnProperty(powerName)) {
            return this.getPage().error(`Unknown power ${powerName}.`);
        }
        allOrders[powerName] = serverOrders[powerName];
        this.__store_orders(allOrders);
        return this.setState({ orders: allOrders });
    }

    /**
     * Reset local orders and replace them with current server orders for current selected power.
     */
    reloadServerOrders() {
        this.setState({ orderBuildingPath: [] }).then(() => {
            const currentPowerName = this.getCurrentPowerName();
            if (currentPowerName) {
                this.reloadPowerServerOrders(currentPowerName);
            }
        });
    }

    /**
     * Remove given order from local orders of given power name.
     * @param {string} powerName - power name
     * @param {Order} order - order to remove
     */
    async onRemoveOrder(powerName, order) {
        const orders = this.__get_orders(this.props.data);
        if (
            orders.hasOwnProperty(powerName) &&
            orders[powerName].hasOwnProperty(order.loc) &&
            orders[powerName][order.loc].order === order.order
        ) {
            this.sendOrderLog(this.props.data.client, "remove", order.order);

            delete orders[powerName][order.loc];
            if (!UTILS.javascript.count(orders[powerName])) orders[powerName] = null;
            this.__store_orders(orders);
            await this.setState({ orders: orders, hoverOrders: [] });
        }
        this.setOrders();
    }

    /**
     * Remove all local orders for current selected power, including empty orders set.
     * Equivalent request is clearOrders().
     */
    async onRemoveAllCurrentPowerOrders() {
        const currentPowerName = this.getCurrentPowerName();
        if (currentPowerName) {
            const engine = this.props.data;
            const allOrders = this.__get_orders(engine);
            if (!allOrders.hasOwnProperty(currentPowerName)) {
                this.getPage().error(`Unknown power ${currentPowerName}.`);
                return;
            }
            this.sendOrderLog(engine.client, "clear", null);
            allOrders[currentPowerName] = null;
            this.__store_orders(allOrders);
            await this.setState({ orders: allOrders });
        }
        this.setOrders();
    }

    /**
     * Set an empty local orders set for given power name.
     * @param {string} powerName - power name
     */
    onSetEmptyOrdersSet(powerName) {
        const orders = this.__get_orders(this.props.data);
        orders[powerName] = {};
        this.__store_orders(orders);
        this.setOrders();
        return this.setState({ orders: orders, hoverOrders: [] });
    }

    /**
     * Send local orders to server.
     */
    setOrders() {
        const serverOrders = this.props.data.getServerOrders();
        const orders = this.__get_orders(this.props.data);

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
                requestCall = this.props.data.client.setOrders({
                    power_name: powerName,
                    orders: localPowerOrders,
                });
            } else {
                requestCall = this.props.data.client.clearOrders({
                    power_name: powerName,
                });
            }
            requestCall
                .then(() => {
                    this.getPage().success("Orders sent.");
                })
                .catch((err) => {
                    this.getPage().error(err.toString());
                })
                .then(() => {
                    this.reloadServerOrders();
                });
        }
    }

    // ]

    onOrderBuilding(powerName, path) {
        const pathToSave = path.slice(1);
        return this.setState({ orderBuildingPath: pathToSave }).then(() =>
            this.getPage().success(`Building order ${pathToSave.join(" ")} ...`),
        );
    }

    onOrderBuilt(powerName, orderString) {
        let state = Object.assign({}, this.state);
        state.orderBuildingPath = [];
        if (!orderString) {
            Diplog.warn("No order built.");
            return this.setState(state);
        }
        const engine = this.props.data;
        const localOrder = new Order(orderString, true);
        let allOrders = this.__get_orders(engine);
        if (!allOrders.hasOwnProperty(powerName)) {
            Diplog.warn(`Unknown power ${powerName}.`);
            return this.setState(state);
        }

        this.sendOrderLog(engine.client, "add", orderString);

        if (!allOrders[powerName]) allOrders[powerName] = {};
        allOrders[powerName][localOrder.loc] = localOrder;
        state.orders = allOrders;
        this.getPage().success(`Built order: ${orderString}`);

        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = this.state.power || (controllablePowers.length ? controllablePowers[0] : null);
        const orderableUnits = engine.orderableLocations[currentPowerName].length;
        const serverOrderLength = Object.keys(allOrders[powerName]).length;

        if (serverOrderLength == orderableUnits) {
            engine.setInitialOrders(engine.role);
            state.hasInitialOrders = true;
        }

        this.setState(state).then(() => {
            this.__store_orders(allOrders);
            this.setOrders();
        });
    }

    onChangeOrderType(form) {
        return this.setState({
            orderBuildingType: form.order_type,
            orderBuildingPath: [],
            hoverOrders: [],
        });
    }

    vote(decision) {
        const engine = this.props.data;
        const networkGame = engine.client;
        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = this.state.power || (controllablePowers.length ? controllablePowers[0] : null);
        if (!currentPowerName) throw new Error(`Internal error: unable to detect current selected power name.`);
        networkGame
            .vote({ power_name: currentPowerName, vote: decision })
            .then(() => this.getPage().success(`Vote set to ${decision} for ${currentPowerName}`))
            .catch((error) => {
                Diplog.error(error.stack);
                this.getPage().error(`Error while setting vote for ${currentPowerName}: ${error.toString()}`);
            });
    }

    setCommStatus(commStatus) {
        let newCommStatus = commStatus === STRINGS.READY ? STRINGS.READY : STRINGS.READY;
        const engine = this.props.data;
        const networkGame = engine.client;
        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = this.state.power || (controllablePowers.length ? controllablePowers[0] : null);
        if (!currentPowerName) throw new Error(`Internal error: unable to detect current selected power name.`);
        networkGame
            .setCommStatus({
                comm_status: newCommStatus,
                power_name: currentPowerName,
            })
            .then(() => {
                this.forceUpdate(() =>
                    this.getPage().success(`Comm. status set to ${newCommStatus} for ${currentPowerName}`),
                );
            })
            .catch((error) => {
                Diplog.error(error.stack);
                this.getPage().error(`Error while setting comm. status for ${currentPowerName}: ${error.toString()}`);
            });
    }

    setWaitFlag(waitFlag) {
        const engine = this.props.data;
        const networkGame = engine.client;
        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = this.state.power || (controllablePowers.length ? controllablePowers[0] : null);
        if (!currentPowerName) throw new Error(`Internal error: unable to detect current selected power name.`);
        networkGame
            .setWait(waitFlag, { power_name: currentPowerName })
            .then(() => {
                this.forceUpdate(() => this.getPage().success(`Wait flag set to ${waitFlag} for ${currentPowerName}`));
            })
            .catch((error) => {
                Diplog.error(error.stack);
                this.getPage().error(`Error while setting wait flag for ${currentPowerName}: ${error.toString()}`);
            });
    }

    __change_past_phase(newPhaseIndex) {
        return this.setState({
            historyPhaseIndex: newPhaseIndex,
            historyCurrentLoc: null,
            historyCurrentOrders: null,
            hoverOrders: [],
        });
    }

    onChangePastPhase(event) {
        this.__change_past_phase(event.target.value);
    }

    onChangePastPhaseIndex(increment) {
        const selectObject = document.getElementById("select-past-phase");
        if (selectObject) {
            // Let's simply increase or decrease index of showed past phase.
            const index = selectObject.selectedIndex;
            const newIndex = index + (increment ? 1 : -1);
            if (newIndex >= 0 && newIndex < selectObject.length) {
                selectObject.selectedIndex = newIndex;
                this.__change_past_phase(parseInt(selectObject.options[newIndex].value, 10), increment ? 0 : 1);
            }
        }
    }

    onIncrementPastPhase(event) {
        this.onChangePastPhaseIndex(true);
        if (event && event.preventDefault) event.preventDefault();
    }

    onDecrementPastPhase(event) {
        this.onChangePastPhaseIndex(false);
        if (event && event.preventDefault) event.preventDefault();
    }

    displayFirstPastPhase() {
        this.__change_past_phase(0, 0);
    }

    displayLastPastPhase() {
        this.__change_past_phase(-1, 1);
    }

    onChangeShowPastOrders(event) {
        return this.setState({ historyShowOrders: event.target.checked });
    }

    onChangeShowAbbreviations(event) {
        return this.setState({ showAbbreviations: event.target.checked });
    }

    onClickMessage(message) {
        if (!message.read) {
            message.read = true;
            let protagonist = message.sender;
            if (message.recipient === "GLOBAL") protagonist = message.recipient;
            this.getPage().load(`game: ${this.props.data.game_id}`, <ContentGame data={this.props.data} />);
            if (
                this.state.messageHighlights.hasOwnProperty(protagonist) &&
                this.state.messageHighlights[protagonist] > 0
            ) {
                const messageHighlights = Object.assign({}, this.state.messageHighlights);
                --messageHighlights[protagonist];
                --messageHighlights["messages"];
                this.setState({ messageHighlights: messageHighlights });
            }
        }
    }

    displayLocationOrders(loc, orders) {
        return this.setState({
            historyCurrentLoc: loc || null,
            historyCurrentOrders: orders && orders.length ? orders : null,
        });
    }

    // [ Rendering methods.
    renderOrders(engine, currentPowerName) {
        const serverOrders = this.props.data.getServerOrders();
        const orders = this.__get_orders(engine);
        const wait = ContentGame.getServerWaitFlags(engine);

        const render = [];
        render.push(
            <PowerOrders
                key={currentPowerName}
                name={currentPowerName}
                wait={wait[currentPowerName]}
                orders={orders[currentPowerName]}
                serverCount={
                    serverOrders[currentPowerName] ? UTILS.javascript.count(serverOrders[currentPowerName]) : -1
                }
                onRemove={this.onRemoveOrder}
            />,
        );
        return render;
    }

    blurMessages(engine, messageChannels) {
        /* add a *hide* key to decide whether to blur a message */
        if (engine.role === "omniscient_type" || engine.role === "observer_type" || engine.role === "master_type")
            return messageChannels;

        let blurredMessageChannels = {};
        const controlledPower = this.getCurrentPowerName();

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
                        this.state.annotatedMessages.hasOwnProperty(currentMessage.time_sent)
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
                            !this.state.annotatedMessages.hasOwnProperty(currentMessage.time_sent)
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
    }

    renderPastMessages(engine, role, isWide) {
        const messageChannels = engine.getMessageChannels(role, true);
        const filteredMessageChannels = this.blurMessages(engine, messageChannels);
        const tabNames = [];
        for (let powerName of Object.keys(engine.powers)) if (powerName !== role) tabNames.push(powerName);
        tabNames.sort();
        const currentTabId = this.state.tabPastMessages || tabNames[0];

        const convList = tabNames.map((protagonist) => (
            <div style={{ minWidth: "220px" }}>
                <Conversation
                    className={protagonist === currentTabId ? "cs-conversation--active" : null}
                    onClick={() => {
                        this.onChangeTabPastMessages(protagonist);
                    }}
                    key={protagonist}
                    name={protagonist}
                    unreadCnt={this.countUnreadMessages(engine, role, protagonist)}
                    unreadDot={this.hasUnreadAdvice(engine, role, protagonist)}
                >
                    <Avatar src={POWER_ICONS[protagonist]} name={protagonist} size="sm" />
                </Conversation>
            </div>
        ));

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
                renderedMessages.push(<MessageSeparator>{curPhase}</MessageSeparator>);
                prevPhase = curPhase;
            }

            if (role === sender) dir = "outgoing";
            if (role === rec) dir = "incoming";
            const html = msg.hide ? `<div class="blurred">${msg.message}</div>` : msg.message;
            renderedMessages.push(
                <ChatMessage
                    model={{
                        sent: msg.time_sent,
                        sender: sender,
                        direction: dir,
                        position: "single",
                    }}
                    avatarPosition={dir === "outgoing" ? "tr" : "tl"}
                >
                    <Avatar src={POWER_ICONS[sender]} name={sender} size="sm" />
                    <ChatMessage.HtmlContent html={html} />
                </ChatMessage>,
            );
        }

        return (
            <div className={isWide ? "col-12" : "col-6"} style={{ height: "500px" }}>
                <MainContainer responsive>
                    <Sidebar style={{ maxWidth: "220px" }} position="left" scrollable={false}>
                        <ConversationList>{convList}</ConversationList>
                    </Sidebar>
                    <ChatContainer>
                        <MessageList>{renderedMessages}</MessageList>
                    </ChatContainer>
                </MainContainer>
            </div>
        );
    }

    hasUnreadAdvice(engine, role, protagonist) {
        const isAdmin =
            engine.role === "omniscient_type" || engine.role === "master_type" || engine.role === "observer_type";
        if (isAdmin) {
            return false;
        }

        let messageChannels = engine.getMessageChannels(role, true);
        const controlledPower = this.getCurrentPowerName();

        const suggestionMessages = this.getSuggestionMessages(controlledPower, messageChannels, engine);

        const suggestedMessagesForCurrentPower = this.getSuggestedMessages(
            controlledPower,
            protagonist,
            isAdmin,
            engine,
            suggestionMessages,
        );

        return suggestedMessagesForCurrentPower.length > 0;
    }

    countUnreadMessages(engine, role, protagonist) {
        let messageChannels = engine.getMessageChannels(role, true);
        if (engine.role === "omniscient_type" || engine.role === "observer_type" || engine.role === "master_type")
            return 0;

        const controlledPower = this.getCurrentPowerName();
        let count = 0;

        for (const [_, messages] of Object.entries(messageChannels)) {
            for (let idx in messages) {
                const message = messages[idx];

                if (
                    message.sender === protagonist &&
                    message.recipient === controlledPower &&
                    !message.recipient_annotation &&
                    !this.state.annotatedMessages.hasOwnProperty(message.time_sent)
                ) {
                    count++;
                }
            }
        }
        return count;
    }

    getSuggestionMessages(currentPowerName, messageChannels, engine) {
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
    }

    hasSuggestionType(suggestionTypeValue, suggestionTypeToMatch) {
        return suggestionTypeValue !== null && (suggestionTypeValue & suggestionTypeToMatch) === suggestionTypeToMatch;
    }

    getSuggestionType(currentPowerName, engine, globalMessages) {
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
    }

    getSuggestedMoves(currentPowerName, engine, globalMessages) {
        const receivedSuggestions = globalMessages.filter(
            (msg) => msg.type === STRINGS.SUGGESTED_MOVE_FULL || msg.type === STRINGS.SUGGESTED_MOVE_PARTIAL,
        );

        return receivedSuggestions;
    }

    getLatestSuggestedMoves(receivedSuggestions, suggestionType) {
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
                this.state.annotatedMessages.hasOwnProperty(sent_time) &&
                (this.state.annotatedMessages[sent_time] === "reject" ||
                    this.state.annotatedMessages[sent_time] === "replace")
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
            !this.state.visibleMoveSuggestions.hasOwnProperty(suggestion.time_sent) ||
            this.state.visibleMoveSuggestions[suggestion.time_sent];
        return suggestion;
    }

    getSuggestedMessages(currentPowerName, protagonist, isAdmin, engine, globalMessages) {
        const receivedSuggestions = globalMessages.filter(
            (msg) =>
                msg.type === STRINGS.SUGGESTED_MESSAGE &&
                msg.parsed.payload.recipient === protagonist &&
                (isAdmin || !this.state.annotatedMessages.hasOwnProperty(msg.time_sent)),
        );

        const suggestedMessages = receivedSuggestions.map((msg) => {
            return {
                message: msg.parsed.payload.message,
                sender: msg.sender,
                time_sent: msg.time_sent,
            };
        });

        return suggestedMessages;
    }

    getSuggestedCommentary(currentPowerName, protagonist, isAdmin, engine, globalMessages) {
        const receivedSuggestions = globalMessages.filter(
            (msg) =>
                msg.type === STRINGS.SUGGESTED_COMMENTARY &&
                (isAdmin || !this.state.annotatedMessages.hasOwnProperty(msg.time_sent)),
        );

        const suggestedCommentary = receivedSuggestions.map((msg) => {
            return {
                commentary: msg.parsed.payload.commentary,
                sender: msg.sender,
                time_sent: msg.time_sent,
            };
        });

        const numCommentary = suggestedCommentary.length;

        if (numCommentary > this.state.numAllCommentary) {
            this.setState({
                numAllCommentary: numCommentary,
                showBadge: true,
            });
        } // update numAllCommentary and show badge if new commentary is received

        return suggestedCommentary;
    }

    renderCurrentMessages(engine, role, isWide) {
        const isAdmin =
            engine.role === "omniscient_type" || engine.role === "master_type" || engine.role === "observer_type";

        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = this.state.power || (controllablePowers.length ? controllablePowers[0] : null);

        const messageChannels = engine.getMessageChannels(role, true);

        const filteredMessageChannels = this.blurMessages(engine, messageChannels);
        const tabNames = [];
        for (let powerName of Object.keys(engine.powers)) if (powerName !== role) tabNames.push(powerName);
        tabNames.sort();
        const currentTabId = this.state.tabCurrentMessages || tabNames[0];

        const convList = tabNames.map((protagonist) => (
            <Conversation
                style={{ minWidth: "220px" }}
                info={isAdmin && protagonist !== "GLOBAL" ? engine.powers[protagonist].getController() : <></>}
                className={protagonist === currentTabId ? "cs-conversation--active" : null}
                onClick={() => {
                    this.onChangeTabCurrentMessages(protagonist);
                }}
                key={protagonist}
                name={protagonist}
                unreadCnt={this.countUnreadMessages(engine, role, protagonist)}
                unreadDot={this.hasUnreadAdvice(engine, role, protagonist)}
            >
                <Avatar src={POWER_ICONS[protagonist]} name={protagonist} size="sm" />
            </Conversation>
        ));

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
            const html = msg.hide ? `<div class="blurred">${msg.message}</div>` : msg.message;

            if (curPhase !== prevPhase) {
                renderedMessages.push(<MessageSeparator key={msg.phase}>{curPhase}</MessageSeparator>);
                prevPhase = curPhase;
            }
            let messageId = msg.sender + "-" + msg.time_sent.toString();

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
                    <Avatar src={POWER_ICONS[sender]} name={sender} size="sm" />
                    <ChatMessage.HtmlContent html={html} />
                </ChatMessage>,
            );

            if (dir === "incoming") {
                renderedMessages.push(
                    <div
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
                                        this.state.annotatedMessages.hasOwnProperty(msg.time_sent) &&
                                        this.state.annotatedMessages[msg.time_sent] === "yes"
                                    }
                                    onChange={() => {
                                        this.handleRecipientAnnotation(msg.time_sent, "yes");
                                    }}
                                    disabled={
                                        engine.role === "omniscient_type" ||
                                        engine.role === "observer_type" ||
                                        engine.role === "master_type"
                                    }
                                />
                                yes&nbsp;
                                <input
                                    type="radio"
                                    value="none"
                                    name={messageId}
                                    checked={
                                        this.state.annotatedMessages.hasOwnProperty(msg.time_sent) &&
                                        this.state.annotatedMessages[msg.time_sent] === "None"
                                    }
                                    onChange={() => this.handleRecipientAnnotation(msg.time_sent, "None")}
                                    disabled={
                                        engine.role === "omniscient_type" ||
                                        engine.role === "observer_type" ||
                                        engine.role === "master_type"
                                    }
                                />
                                no
                            </Col>
                        </div>
                    </div>,
                );
            }
        }

        const phaseType = engine.getPhaseType();

        return (
            <Box className={isWide ? "col-12 mb-4" : "col-6 mb-4"} style={{ height: "500px" }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sx={{ height: "100%" }}>
                        <Box sx={{ width: "100%", height: "550px" }}>
                            <MainContainer responsive>
                                <Sidebar position="left" scrollable={true}>
                                    <ConversationList>{convList}</ConversationList>
                                </Sidebar>
                                <ChatContainer>
                                    <MessageList>{renderedMessages}</MessageList>
                                </ChatContainer>
                            </MainContainer>
                            {engine.isPlayerGame() && (
                                <Row>
                                    <textarea
                                        style={{ resize: "both" }}
                                        cols={30}
                                        onChange={(val) => this.setMessageInputValue(val.target.value)}
                                        value={this.state.message}
                                        disabled={
                                            phaseType === "M" &&
                                            (!this.state.hasInitialOrders ||
                                                (this.__get_orders(engine)[currentPowerName] &&
                                                    Object.keys(this.__get_orders(engine)[currentPowerName]).length <
                                                        engine.orderableLocations[currentPowerName].length))
                                        }
                                        placeholder={
                                            phaseType === "M" &&
                                            (!this.state.hasInitialOrders ||
                                                (this.__get_orders(engine)[currentPowerName] &&
                                                    Object.keys(this.__get_orders(engine)[currentPowerName]).length <
                                                        engine.orderableLocations[currentPowerName].length))
                                                ? "You need to set orders for all units before sending messages."
                                                : ""
                                        }
                                    />
                                    <Button
                                        key={"t"}
                                        pickEvent={true}
                                        title={"Truth"}
                                        color={"success"}
                                        onClick={() => {
                                            this.sendMessage(
                                                engine.client,
                                                currentTabId,
                                                this.state.message,
                                                "Truth",
                                                null,
                                            );
                                            this.setMessageInputValue("");
                                        }}
                                        disabled={!this.state.hasInitialOrders}
                                    ></Button>
                                    <Button
                                        key={"f"}
                                        pickEvent={true}
                                        title={"Lie"}
                                        color={"danger"}
                                        onClick={() => {
                                            this.sendMessage(
                                                engine.client,
                                                currentTabId,
                                                this.state.message,
                                                "Lie",
                                                null,
                                            );
                                            this.setMessageInputValue("");
                                        }}
                                        disabled={!this.state.hasInitialOrders}
                                    ></Button>
                                </Row>
                            )}
                        </Box>
                    </Grid>
                </Grid>
            </Box>
        );
    }

    renderMapForResults(gameEngine, showOrders) {
        const Map = getMapComponent(gameEngine.map_name);
        return (
            <div id="past-map" key="past-map">
                <Map
                    game={gameEngine}
                    showAbbreviations={this.state.showAbbreviations}
                    mapData={new MapData(this.getMapInfo(gameEngine.map_name), gameEngine)}
                    onError={this.getPage().error}
                    orders={
                        (showOrders &&
                            gameEngine.order_history.contains(gameEngine.phase) &&
                            gameEngine.order_history.get(gameEngine.phase)) ||
                        null
                    }
                    onHover={showOrders ? this.displayLocationOrders : null}
                    onSelectVia={this.onSelectVia}
                />
            </div>
        );
    }

    renderMapForCurrent(gameEngine, powerName, orderType, orderPath) {
        const Map = getMapComponent(gameEngine.map_name);
        const rawOrders = this.__get_orders(gameEngine);
        const orders = {};
        for (let entry of Object.entries(rawOrders)) {
            orders[entry[0]] = [];
            if (entry[1]) {
                for (let orderObject of Object.values(entry[1])) orders[entry[0]].push(orderObject.order);
            }
        }
        for (let oo of this.state.hoverOrders) {
            orders[powerName].push(oo);
        }

        return (
            <div id="current-map" key="current-map">
                <Map
                    game={gameEngine}
                    showAbbreviations={this.state.showAbbreviations}
                    mapData={new MapData(this.getMapInfo(gameEngine.map_name), gameEngine)}
                    onError={this.getPage().error}
                    orderBuilding={ContentGame.getOrderBuilding(powerName, orderType, orderPath)}
                    onOrderBuilding={this.onOrderBuilding}
                    onOrderBuilt={this.onOrderBuilt}
                    orders={orders}
                    shiftKeyPressed={this.state.shiftKeyPressed}
                    onChangeOrderDistribution={this.onChangeOrderDistribution}
                    orderDistribution={this.state.orderDistribution}
                    displayVisualAdvice={this.state.displayVisualAdvice}
                    visibleDistributionOrder={this.state.visibleDistributionOrder}
                    hoverDistributionOrder={this.state.hoverDistributionOrder}
                    onSelectLocation={this.onSelectLocation}
                    onSelectVia={this.onSelectVia}
                />
            </div>
        );
    }

    __get_engine_to_display(initialEngine) {
        const pastPhases = initialEngine.state_history.values().map((state) => state.name);
        pastPhases.push(initialEngine.phase);
        let phaseIndex = 0;
        if (initialEngine.displayed) {
            if (this.state.historyPhaseIndex === null || this.state.historyPhaseIndex >= pastPhases.length) {
                phaseIndex = pastPhases.length - 1;
            } else if (this.state.historyPhaseIndex < 0) {
                phaseIndex = pastPhases.length + this.state.historyPhaseIndex;
            } else {
                phaseIndex = this.state.historyPhaseIndex;
            }
        }
        const engine =
            pastPhases[phaseIndex] === initialEngine.phase
                ? initialEngine
                : initialEngine.cloneAt(pastPhases[phaseIndex]);
        return { engine, pastPhases, phaseIndex };
    }

    __form_phases(pastPhases, phaseIndex) {
        return (
            <form key={1} className="form-inline">
                <div className="custom-control-inline">
                    <Button
                        title={UTILS.html.UNICODE_LEFT_ARROW}
                        onClick={this.onDecrementPastPhase}
                        pickEvent={true}
                        disabled={phaseIndex === 0}
                    />
                </div>
                <div className="custom-control-inline">
                    <select
                        className="custom-select"
                        id="select-past-phase"
                        value={phaseIndex}
                        onChange={this.onChangePastPhase}
                    >
                        {pastPhases.map((phaseName, index) => (
                            <option key={index} value={index}>
                                {phaseName}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="custom-control-inline">
                    <Button
                        title={UTILS.html.UNICODE_RIGHT_ARROW}
                        onClick={this.onIncrementPastPhase}
                        pickEvent={true}
                        disabled={phaseIndex === pastPhases.length - 1}
                    />
                </div>
            </form>
        );
    }

    renderTabResults(toDisplay, initialEngine) {
        const { engine, pastPhases, phaseIndex } = this.__get_engine_to_display(initialEngine);
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
                if (orderResult.hasOwnProperty(unit)) {
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
                        {this.state.historyCurrentOrders && (
                            <div className={"history-current-orders"}>{this.state.historyCurrentOrders.join(", ")}</div>
                        )}
                        {this.renderMapForResults(engine, this.state.historyShowOrders)}
                    </div>
                    <div className={"col-4"}>{orderView}</div>
                </Row>
                {toDisplay && <HotKey keys={["arrowleft"]} onKeysCoincide={this.onDecrementPastPhase} />}
                {toDisplay && <HotKey keys={["arrowright"]} onKeysCoincide={this.onIncrementPastPhase} />}
                {toDisplay && <HotKey keys={["home"]} onKeysCoincide={this.displayFirstPastPhase} />}
                {toDisplay && <HotKey keys={["end"]} onKeysCoincide={this.displayLastPastPhase} />}
            </Tab>
        );
    }

    renderCurrentMessageAdvice(engine, role, isCurrent, isWide) {
        const isAdmin =
            engine.role === "omniscient_type" || engine.role === "master_type" || engine.role === "observer_type";

        // for filtering message suggestions based on the current power talking to
        const tabNames = [];
        for (let powerName of Object.keys(engine.powers)) if (powerName !== role) tabNames.push(powerName);
        tabNames.sort();
        let protagonist;

        if (isCurrent && this.state.tabCurrentMessages) {
            protagonist = this.state.tabCurrentMessages;
        } else if (!isCurrent && this.state.tabPastMessages) {
            protagonist = this.state.tabPastMessages;
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

        const currentPowerName =
            this.state.power || (engine.getControllablePowers().length && engine.getControllablePowers()[0]);

        const messageChannels = engine.getMessageChannels(currentPowerName, true);
        const suggestionMessages = this.getSuggestionMessages(currentPowerName, messageChannels, engine);

        const suggestionType = this.getSuggestionType(currentPowerName, engine, suggestionMessages);

        const suggestedMessagesForCurrentPower = this.getSuggestedMessages(
            currentPowerName,
            protagonist,
            isAdmin,
            engine,
            suggestionMessages,
        );
        const suggestedCommentaryForCurrentPower = this.getSuggestedCommentary(
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
            [STRINGS.MESSAGES]: this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MESSAGE),
            [STRINGS.COMMENTARY]: this.hasSuggestionType(suggestionType, UTILS.SuggestionType.COMMENTARY),
            [STRINGS.INTENT_LOG]: isAdmin,
        };

        // If tab is disabled, choose the first displayed tab
        if (displayTab[this.state.tabVal] === false) {
            for (const [key, value] of Object.entries(displayTab)) {
                if (value === true) {
                    this.setState({ tabVal: key });
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
                                    value={this.state.tabVal}
                                    onChange={this.updateTabVal}
                                    aria-label="basic tabs example"
                                >
                                    {displayTab[STRINGS.MESSAGES] && (
                                        <Tab2 label="Message Advice" value={STRINGS.MESSAGES} />
                                    )}
                                    {displayTab[STRINGS.COMMENTARY] && (
                                        <Tab2
                                            label={
                                                <span
                                                    sx={{
                                                        marginRight: "8px",
                                                    }}
                                                >
                                                    Commentary
                                                    {this.state.showBadge && (
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
                                                    this.setState({
                                                        tabCurrentMessages: this.state.commentaryProtagonist,
                                                        lastSwitchPanelTime: Date.now(),
                                                    });
                                                } // make sure commentary tab is selected for the correct conversation
                                                this.updateReadCommentary();
                                            }}
                                        />
                                    )}
                                    {displayTab[STRINGS.INTENT_LOG] && (
                                        <Tab2 label="Captain's Log" value={STRINGS.INTENT_LOG} />
                                    )}
                                </Tabs2>
                            </Box>
                            {this.state.tabVal === STRINGS.MESSAGES && (
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

                                    {this.state.hasInitialOrders && (
                                        <MessageList>
                                            {suggestedMessagesForCurrentPower.map((msg, i) => {
                                                return (
                                                    <div
                                                        style={{
                                                            alignItems: "flex-end",
                                                            display: !this.state.annotatedMessages.hasOwnProperty(
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
                                                                    this.setMessageInputValue(msg.message);

                                                                    this.handleRecipientAnnotation(
                                                                        msg.time_sent,
                                                                        "accept",
                                                                    );
                                                                }}
                                                                disabled={!this.state.hasInitialOrders}
                                                                invisible={!(isCurrent && !isAdmin)}
                                                            ></Button>
                                                            <Button
                                                                key={"r"}
                                                                pickEvent={true}
                                                                title={"✕"}
                                                                color={"danger"}
                                                                onClick={() => {
                                                                    this.handleRecipientAnnotation(
                                                                        msg.time_sent,
                                                                        "reject",
                                                                    );
                                                                }}
                                                                disabled={!this.state.hasInitialOrders}
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

                            {this.state.tabVal === STRINGS.COMMENTARY && (
                                <MainContainer responsive>
                                    <ChatContainer>
                                        <ConversationHeader>
                                            <ConversationHeader.Content userName={"Commentary"} />
                                        </ConversationHeader>
                                        <MessageList>
                                            {suggestedCommentaryForCurrentPower.map((com, i) => {
                                                const html = !this.state.hasInitialOrders
                                                    ? `<div class="blurred">${com.commentary}</div>`
                                                    : com.commentary;
                                                return (
                                                    <div
                                                        style={{
                                                            alignItems: "flex-end",
                                                            display: !this.state.annotatedMessages.hasOwnProperty(
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
                                        {}
                                    </ChatContainer>
                                </MainContainer>
                            )}

                            {this.state.tabVal === STRINGS.INTENT_LOG && (
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
                                                onChange={(val) => this.setlogDataInputValue(val)}
                                                onSend={() => {
                                                    this.sendLogData(engine.client, this.state.logData);
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
    }

    renderCurrentMoveAdvice(engine, role, isCurrent) {
        const isAdmin =
            engine.role === "omniscient_type" || engine.role === "master_type" || engine.role === "observer_type";

        // for filtering message suggestions based on the current power talking to
        const tabNames = [];
        for (let powerName of Object.keys(engine.powers)) if (powerName !== role) tabNames.push(powerName);
        tabNames.sort();

        const currentPowerName =
            this.state.power || (engine.getControllablePowers().length && engine.getControllablePowers()[0]);

        const messageChannels = engine.getMessageChannels(currentPowerName, true);
        const suggestionMessages = this.getSuggestionMessages(currentPowerName, messageChannels, engine);

        const suggestionType = this.getSuggestionType(currentPowerName, engine, suggestionMessages);

        const moveSuggestionForCurrentPower = this.getSuggestedMoves(currentPowerName, engine, suggestionMessages);

        // display only the latest to avoid cluttering textbox
        let latestMoveSuggestionFull = this.getLatestSuggestedMoves(
            moveSuggestionForCurrentPower,
            STRINGS.SUGGESTED_MOVE_FULL,
        );
        let latestMoveSuggestionPartial = this.getLatestSuggestedMoves(
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
            const fullSuggestionMessages = latestMoveSuggestionFull.moves.map((move, index) => {
                return (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                        }}
                        onMouseEnter={() => {
                            let newMoves = [move];
                            this.setState({ hoverOrders: newMoves });
                        }}
                        onMouseLeave={() => {
                            this.setState({ hoverOrders: [] });
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
                                    this.onOrderBuilt(currentPowerName, move);

                                    this.handleRecipientAnnotation(
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
                            this.setState({ hoverOrders: newMoves });
                        }}
                        onMouseLeave={() => {
                            this.setState({ hoverOrders: [] });
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
                                        await this.onOrderBuilt(currentPowerName, move);
                                    }

                                    this.handleRecipientAnnotation(latestMoveSuggestionFull.time_sent, "accept all");
                                }}
                                invisible={!(isCurrent && !isAdmin)}
                            ></Button>
                            <Button
                                key={"r"}
                                pickEvent={true}
                                title={"-"}
                                color={"secondary"} // Dark gray
                                onClick={() => {
                                    this.setState({
                                        hoverOrders: [],
                                    });
                                    this.toggleMoveSuggestionCollapse(latestMoveSuggestionFull.time_sent);
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
            const partialSuggestionMessages = latestMoveSuggestionPartial.moves.map((move, index) => {
                return (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                        }}
                        onMouseEnter={() => {
                            let newMoves = [move];
                            this.setState({ hoverOrders: newMoves });
                        }}
                        onMouseLeave={() => {
                            this.setState({ hoverOrders: [] });
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
                                    this.onOrderBuilt(currentPowerName, move);

                                    this.handleRecipientAnnotation(
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
                            this.setState({ hoverOrders: newMoves });
                        }}
                        onMouseLeave={() => {
                            this.setState({ hoverOrders: [] });
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
                                        await this.onOrderBuilt(currentPowerName, move);
                                    }

                                    this.handleRecipientAnnotation(latestMoveSuggestionPartial.time_sent, "accept all");
                                }}
                                invisible={!(isCurrent && !isAdmin)}
                            ></Button>
                            <Button
                                key={"r"}
                                pickEvent={true}
                                title={"-"}
                                color={"secondary"} // Dark gray
                                onClick={() => {
                                    this.toggleMoveSuggestionCollapse(latestMoveSuggestionPartial.time_sent);
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
            this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE_DISTRIBUTION_TEXTUAL) &&
            this.state.orderDistribution.length > 0
        ) {
            /** render messages that outlines the probability of all possible orders for a selected province*/
            var orderDistribution = this.state.orderDistribution[0];
            var distributionMoves = new Array(Object.keys(orderDistribution.distribution).length);
            for (var order in orderDistribution.distribution) {
                if (!orderDistribution.distribution.hasOwnProperty(order)) {
                    continue;
                }
                distributionMoves[orderDistribution.distribution[order].rank] =
                    `${order}: ${(orderDistribution.distribution[order].pred_prob * 100.0).toFixed(2)}%`;
            }
            const distributionMessages = distributionMoves.map((move) => {
                return (
                    /** reused the component structure used by the full suggestion/partial suggestion components*/
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                        }}
                        onMouseEnter={() => {
                            let newMove = move.split(":")[0];
                            this.setState({
                                hoverDistributionOrder: [
                                    { order: newMove, power: this.state.orderDistribution[0].power },
                                ],
                            });
                        }}
                        onMouseLeave={() => {
                            this.setState({ hoverDistributionOrder: [] });
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
                                        this.onOrderBuilt(currentPowerName, move.split(":")[0]);
                                    }
                                }}
                                invisible={
                                    !(isCurrent && this.state.orderDistribution[0].power === this.getCurrentPowerName())
                                }
                            ></Button>

                            <Button
                                key={"v"}
                                pickEvent={true}
                                title={
                                    this.includeOrder(this.state.visibleDistributionOrder, move.split(":")[0])
                                        ? "hide"
                                        : "show"
                                }
                                color={
                                    this.includeOrder(this.state.visibleDistributionOrder, move.split(":")[0])
                                        ? "secondary"
                                        : "info"
                                }
                                onClick={() => {
                                    const newMove = move.split(":")[0];
                                    var prevVisibleDistributionOrder = this.state.visibleDistributionOrder;
                                    var newVisibleDistributionOrder = [];
                                    for (var orderObj of prevVisibleDistributionOrder) {
                                        if (orderObj.order !== newMove) {
                                            newVisibleDistributionOrder.push(orderObj);
                                        }
                                    }
                                    if (!this.includeOrder(prevVisibleDistributionOrder, newMove)) {
                                        newVisibleDistributionOrder.push({
                                            order: newMove,
                                            power: this.state.orderDistribution[0].power,
                                        });
                                    }
                                    this.setState({ visibleDistributionOrder: newVisibleDistributionOrder });
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
                this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE) ||
                this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE_DISTRIBUTION_TEXTUAL)
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

                    {this.state.hasInitialOrders && (
                        <MessageList className="move-suggestion-list">
                            {fullSuggestionComponent}
                            {partialSuggestionComponent}
                            {distributionSuggestionComponent}
                        </MessageList>
                    )}
                </ChatContainer>
            </div>
        );
    }

    renderPowerInfo(engine) {
        const powerNames = Object.keys(engine.powers);

        function isNotSelf(power) {
            return engine.role !== power;
        }

        const filteredPowerNames = powerNames.filter(isNotSelf);
        const filteredPowers = filteredPowerNames.map((pn) => engine.powers[pn]);

        powerNames.sort();
        filteredPowerNames.sort();

        const currentPowerName =
            this.state.power || (engine.getControllablePowers().length && engine.getControllablePowers()[0]);

        return engine.role === "omniscient_type" || engine.role === "observer_type" || engine.role === "master_type" ? (
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
        ) : (
            <div></div>
        );
    }

    renderLogs(engine, role) {
        const curController = engine.powers[role].getController();

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

        return (
            <div style={{ height: "500px" }}>
                <MainContainer responsive>
                    <ChatContainer>
                        <ConversationHeader>
                            <ConversationHeader.Content userName={curController} />
                        </ConversationHeader>
                        <MessageList>{renderedLogs}</MessageList>
                    </ChatContainer>
                </MainContainer>
            </div>
        );
    }

    renderTabCurrentPhase(
        toDisplay,
        engine,
        powerName,
        orderType,
        orderPath,
        currentPowerName,
        currentTabOrderCreation,
        moveAdvicePanel,
    ) {
        const powerNames = Object.keys(engine.powers);
        powerNames.sort();

        return (
            <Tab id={"tab-current-phase"} display={toDisplay}>
                <Row>
                    <div className={`col-${this.state.mapSize}`}>
                        {this.renderMapForCurrent(engine, powerName, orderType, orderPath)}
                    </div>
                    <div className={moveAdvicePanel ? "col-4" : "col-6"}>
                        {/* Orders. */}
                        <div className={"panel-orders mb-4"} style={{ maxHeight: "500px", overflowY: "auto" }}>
                            {currentTabOrderCreation ? <div className="mb-4">{currentTabOrderCreation}</div> : ""}
                            <PowerOrdersActionBar
                                onReset={this.reloadServerOrders}
                                onDeleteAll={this.onRemoveAllCurrentPowerOrders}
                                onUpdate={this.setOrders}
                                onProcess={
                                    !this.props.data.isPlayerGame() &&
                                    this.props.data.observer_level === STRINGS.MASTER_TYPE
                                        ? this.onProcessGame
                                        : null
                                }
                            />
                            <div className={"orders"}>{this.renderOrders(this.props.data, powerName)}</div>
                        </div>
                    </div>
                    {moveAdvicePanel}
                </Row>
            </Tab>
        );
    }

    renderTabChat(toDisplay, initialEngine, currentPowerName, isWide) {
        const { engine, pastPhases, phaseIndex } = this.__get_engine_to_display(initialEngine);

        return pastPhases[phaseIndex] === initialEngine.phase
            ? this.renderCurrentMessages(initialEngine, currentPowerName, isWide)
            : this.renderPastMessages(engine, currentPowerName, isWide);
    }

    renderMoveAdviceTab(toDisplay, initialEngine, role) {
        const { engine, pastPhases, phaseIndex } = this.__get_engine_to_display(initialEngine);

        return this.renderCurrentMoveAdvice(engine, role, pastPhases[phaseIndex] === initialEngine.phase);
    }

    renderMessageAdviceTab(toDisplay, initialEngine, role, isWide) {
        const { engine, pastPhases, phaseIndex } = this.__get_engine_to_display(initialEngine);

        return this.renderCurrentMessageAdvice(engine, role, pastPhases[phaseIndex] === initialEngine.phase, isWide);
    }

    render() {
        const engine = this.props.data;
        const controllablePowers = engine.getControllablePowers();
        const currentPowerName = this.state.power || (controllablePowers.length && controllablePowers[0]);
        const serverOrders = this.__get_orders(engine);
        const powerOrders = serverOrders[currentPowerName] || [];

        this.props.data.displayed = true;
        const page = this.context;
        const title = ContentGame.gameTitle(engine);
        const navigation = [
            ["Help", () => page.dialog((onClose) => <Help onClose={onClose} />)],
            ["Load a game from disk", page.loadGameFromDisk],
            ["Save game to disk", () => saveGameToDisk(engine, page.error)],
            [`${UTILS.html.UNICODE_SMALL_LEFT_ARROW} Games`, () => page.loadGames()],
            [`${UTILS.html.UNICODE_SMALL_LEFT_ARROW} Leave game`, () => page.leaveGame(engine.game_id)],
            [`${UTILS.html.UNICODE_SMALL_LEFT_ARROW} Logout`, page.logout],
        ];
        const phaseType = engine.getPhaseType();
        if (this.props.data.client) this.bindCallbacks(this.props.data.client);

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
            const suggestionMessages = this.getSuggestionMessages(currentPowerName, messageChannels, engine);
            const suggestionType = this.getSuggestionType(currentPowerName, engine, suggestionMessages);
            const displayVisualAdvice = this.hasSuggestionType(
                suggestionType,
                UTILS.SuggestionType.MOVE_DISTRIBUTION_VISUAL,
            );
            if (displayVisualAdvice !== this.state.displayVisualAdvice) {
                this.setState({ displayVisualAdvice: displayVisualAdvice });
            }

            if (allowedPowerOrderTypes.length) {
                if (this.state.orderBuildingType && allowedPowerOrderTypes.includes(this.state.orderBuildingType))
                    orderBuildingType = this.state.orderBuildingType;
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
        const suggestionMessages = this.getSuggestionMessages(currentPowerName, messageChannels, engine);

        const suggestionType = this.getSuggestionType(currentPowerName, engine, suggestionMessages);

        // orderable locations and units with no orders
        let numOrderText = "";

        if (phaseType === "M" && orderTypeToLocs) {
            const merged = new Set(Object.values(orderTypeToLocs).flat());
            const unitsWithoutOrders = new Set([...merged].filter((x) => !Object.keys(powerOrders).includes(x)));
            if (unitsWithoutOrders.size === 0 || merged.size === unitsWithoutOrders.size) {
                numOrderText = `[${Object.keys(powerOrders).length}/${
                    engine.orderableLocations[currentPowerName].length
                }] set.`;
            } else {
                const unitsWithoutOrdersArray = Array.from(unitsWithoutOrders);
                numOrderText = `[${Object.keys(powerOrders).length}/${
                    engine.orderableLocations[currentPowerName].length
                }] set. Need: ${unitsWithoutOrdersArray.join(", ")}`;
            }
        }

        const navAfterTitle = (
            <form className="form-inline form-current-power">
                <div className="custom-control custom-control-inline">
                    Map size:
                    <label className="sr-only" htmlFor="map-size">
                        map size
                    </label>
                    <select
                        className="form-control custom-select custom-control-inline"
                        id="map-size"
                        value={Object.keys(possibleMapSizes).find(
                            (key) => possibleMapSizes[key] === this.state.mapSize,
                        )}
                        onChange={(event) => {
                            this.setState({
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
                    <div className="custom-control custom-control-inline">
                        <label className="sr-only" htmlFor="current-power">
                            power
                        </label>
                        <select
                            className="form-control custom-select custom-control-inline"
                            id="current-power"
                            value={currentPowerName}
                            onChange={this.onChangeCurrentPower}
                        >
                            {controllablePowers.map((powerName) => (
                                <option key={powerName} value={powerName}>
                                    {powerName}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <div className="custom-control custom-control-inline custom-checkbox">
                    <input
                        className="custom-control-input"
                        id="show-abbreviations"
                        type="checkbox"
                        checked={this.state.showAbbreviations}
                        onChange={this.onChangeShowAbbreviations}
                    />
                    <label className="custom-control-label" htmlFor="show-abbreviations">
                        Show abbreviations
                    </label>
                </div>
            </form>
        );

        const suggestionTypeDisplay = [];
        if (this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MESSAGE)) suggestionTypeDisplay.push("message");
        if (this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE)) suggestionTypeDisplay.push("order");
        if (this.hasSuggestionType(suggestionType, UTILS.SuggestionType.COMMENTARY))
            suggestionTypeDisplay.push("commentary");
        if (
            this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE_DISTRIBUTION_TEXTUAL) ||
            this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE_DISTRIBUTION_VISUAL)
        )
            suggestionTypeDisplay.push(
                <>
                    order probability{" "}
                    <Tooltip
                        title={
                            <>
                                <p>
                                    Hold <kbd>Shift</kbd> and click on a province to display recommended/predicted
                                    orders for the province's unit.
                                </p>
                                <p>Click the province a second time to place an order.</p>
                                <p>
                                    Release <kbd>Shift</kbd> to clear all selections.
                                </p>
                            </>
                        }
                    >
                        {/* Tooltip does not display without using `<span>` here */}
                        <span>
                            <Octicon icon={Question} />
                        </span>
                    </Tooltip>
                </>,
            );

        const currentTabOrderCreation = hasTabCurrentPhase && (
            <div>
                <PowerOrderCreationForm
                    orderType={orderBuildingType}
                    orderTypes={allowedPowerOrderTypes}
                    onChange={this.onChangeOrderType}
                    onPass={() => this.onSetEmptyOrdersSet(currentPowerName)}
                    onSetWaitFlag={() => this.setWaitFlag(!currentPower.wait)}
                    onVote={this.vote}
                    role={engine.role}
                    power={currentPower}
                />
                {(allowedPowerOrderTypes.length && (
                    <span>
                        <strong>Orderable locations</strong>: {orderTypeToLocs[orderBuildingType].join(", ")}
                    </span>
                )) || <strong>&nbsp;No orderable location.</strong>}
                {phaseType === "A" &&
                    ((buildCount === null && <strong>&nbsp;(unknown build count)</strong>) ||
                        (buildCount === 0 ? (
                            <strong>&nbsp;(nothing to build or disband)</strong>
                        ) : buildCount > 0 ? (
                            <strong>
                                &nbsp;({buildCount} unit{buildCount > 1 && "s"} may be built)
                            </strong>
                        ) : (
                            <strong>
                                &nbsp;({-buildCount} unit
                                {buildCount < -1 && "s"} to disband)
                            </strong>
                        )))}
                {phaseType === "M" && <div>{numOrderText}</div>}
                {suggestionType === null && <div>No advice assigned</div>}
                {suggestionType !== null && suggestionType === UTILS.SuggestionType.NONE && (
                    <div>No advice this turn</div>
                )}
                {suggestionType !== null && suggestionType !== UTILS.SuggestionType.NONE && (
                    <div>
                        You are getting advice:{" "}
                        {/* `reduce()` call used to "`join()`" React elements
                        (from https://stackoverflow.com/questions/34034038/how-to-render-react-components-by-using-map-and-join/35840806#35840806)
                        */}
                        {suggestionTypeDisplay.reduce((accu, elem) => {
                            return accu === null ? [elem] : [...accu, ", ", elem];
                        }, null)}
                    </div>
                )}
            </div>
        );

        const moveAdvicePanel = this.renderMoveAdviceTab(true, engine, currentPowerName);

        const { engineCur, pastPhases, phaseIndex } = this.__get_engine_to_display(engine);
        let phasePanel;
        if (pastPhases[phaseIndex] === engine.phase) {
            if (hasTabCurrentPhase) {
                phasePanel = this.renderTabCurrentPhase(
                    true,
                    engine,
                    currentPowerName,
                    orderBuildingType,
                    this.state.orderBuildingPath,
                    currentPowerName,
                    currentTabOrderCreation,
                    moveAdvicePanel,
                );
            } else if (hasTabPhaseHistory) {
                phasePanel = this.renderTabResults(true, engine);
            }
        } else {
            phasePanel = this.renderTabResults(true, engine);
        }

        const advice = this.getSuggestionMessages(currentPowerName, messageChannels, engine);

        const isAdmin = engine.role === "omniscient_type" || engine.role === "master_type";

        const receivedSuggestions = advice.filter(
            (msg) =>
                msg.type &&
                (msg.type === STRINGS.SUGGESTED_COMMENTARY || msg.type === STRINGS.SUGGESTED_MESSAGE) &&
                (isAdmin || !this.state.annotatedMessages.hasOwnProperty(msg.time_sent)),
        );

        const showMessageAdviceTab =
            this.hasSuggestionType(suggestionType, UTILS.SuggestionType.MESSAGE) ||
            this.hasSuggestionType(suggestionType, UTILS.SuggestionType.COMMENTARY);
        const gameContent = (
            <div>
                {phasePanel}
                <Row className={"mb-4"}>
                    {this.renderTabChat(true, engine, currentPowerName, !showMessageAdviceTab)}
                    {showMessageAdviceTab && this.renderMessageAdviceTab(true, engine, currentPowerName, false)}
                </Row>
                <Row>
                    {!engine.isPlayerGame() && this.renderPowerInfo(engine)}
                    {page.channel.username === "admin" && this.renderLogs(engine, currentPowerName)}
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
                    phaseSel={this.__form_phases(pastPhases, phaseIndex)}
                    navigation={navigation}
                />
                {gameContent}
            </main>
        );
    }

    componentDidMount() {
        window.scrollTo(0, 0);
        if (this.props.data.client) this.reloadDeadlineTimer(this.props.data.client);
        this.props.data.displayed = true;

        document.onkeydown = (event) => {
            if (event.key === "Shift" && !event.repeat && this.state.hasInitialOrders) {
                this.setState({
                    shiftKeyPressed: true,
                    orderDistribution: [],
                    hoverDistributionOrder: [],
                    visibleDistributionOrder: [],
                });
            }

            // Try to prevent scrolling when pressing keys Home and End.
            if (["home", "end"].includes(event.key.toLowerCase())) {
                // Try to prevent scrolling.
                if (event.hasOwnProperty("cancelBubble")) event.cancelBubble = true;
                if (event.stopPropagation) event.stopPropagation();
                if (event.preventDefault) event.preventDefault();
            }
        };

        document.onkeyup = (event) => {
            if (event.key === "Shift") {
                this.setState({
                    shiftKeyPressed: false,
                    orderDistribution: [],
                    hoverDistributionOrder: [],
                    visibleDistributionOrder: [],
                });
            }
        };

        window.addEventListener("beforeunload", this.handleExit);
        window.addEventListener("blur", this.handleBlur);
        window.addEventListener("focus", this.handleFocus);
        this.setState({
            lastSwitchPanelTime: Date.now(),
        });
    }

    componentDidUpdate() {
        this.props.data.displayed = true;
    }

    componentWillUnmount() {
        this.clearScheduleTimeout();
        this.props.data.displayed = false;
        document.onkeydown = null;
        document.onkeyup = null;

        this.handleExit();
        window.removeEventListener("beforeunload", this.handleExit);
        window.removeEventListener("blur", this.handleBlur);
        window.removeEventListener("focus", this.handleFocus);
    }

    // ]
}

ContentGame.contextType = PageContext;
ContentGame.propTypes = {
    data: PropTypes.instanceOf(Game).isRequired,
};
