/**
==============================================================================
Copyright (C) 2019 - Philip Paquette, Steven Bocco

 This program is free software: you can redistribute it and/or modify it under
 the terms of the GNU Affero General Public License as published by the Free
 Software Foundation, either version 3 of the License, or (at your option) any
 later version.

 This program is distributed in the hope that it will be useful, but WITHOUT
 ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
 details.

 You should have received a copy of the GNU Affero General Public License along
 with this program.  If not, see <https:www.gnu.org/licenses/>.
==============================================================================
**/
/** Generated with parameters: Namespace(input='src/diplomacy/maps/svg/pure.svg', name='SvgPure', output='src/gui/maps/pure/') **/
import React from "react";
import PropTypes from "prop-types";
import "./SvgPure.css";
import { Coordinates, SymbolSizes, Colors } from "./SvgPureMetadata";
import { getClickedID, parseLocation, setInfluence } from "../common/common";
import { Game } from "../../../diplomacy/engine/game";
import { MapData } from "../../utils/map_data";
import { UTILS } from "../../../diplomacy/utils/utils";
import { Diplog } from "../../../diplomacy/utils/diplog";
import { extendOrderBuilding, ProvinceCheck, POSSIBLE_ORDERS } from "../../utils/order_building";
import { Unit } from "../common/unit";
import { Hold } from "../common/hold";
import { Move } from "../common/move";
import { SupportMove } from "../common/supportMove";
import { SupportHold } from "../common/supportHold";
import { Convoy } from "../common/convoy";
import { Build } from "../common/build";
import { Disband } from "../common/disband";

export class SvgPure extends React.Component {
    constructor(props) {
        super(props);
        this.onClick = this.onClick.bind(this);
        this.onHover = this.onHover.bind(this);
    }
    onClick(event) {
        if (this.props.orderBuilding) return this.handleClickedID(getClickedID(event));
    }
    onHover(event) {
        return this.handleHoverID(getClickedID(event));
    }

    /**
     * Update predictions for displaying the order distribution in the selected province
     * @param orderBuilding
     * @param {Province} province - province hovered upon
     */
    onPrediction(orderBuilding, province) {
        const localGame = this.props.game; // Game Object
        const phaseType = localGame.phase.slice(-1); // 'M'/'A'/'R' - movement/adjustment/retreat
        const requestedPower = orderBuilding.power;
        var requestedProvince = "";
        const provinceController = province.controller;
        const powers = Object.values(this.props.game.powers).map((power) => power.name);

        /* Get correct naming of province*/
        if (phaseType === "M") {
            /* MOVEMENT PHASE */
            for (const power of powers) {
                var occupiedProvince = province.getOccupied(power);
                if (occupiedProvince) {
                    requestedProvince = occupiedProvince.name.toUpperCase();
                    break;
                }
            }
        } else if (phaseType === "R") {
            /* RETREAT PHASE */
            for (const power of powers) {
                var retreatProvince = province.getRetreated(power);
                if (retreatProvince) {
                    requestedProvince = retreatProvince.retreatUnit.split(" ")[1];
                    break;
                }
            }
        } else {
            /* ADJUSTMENT PHASE */
            const orderTypes = POSSIBLE_ORDERS["A"];
            const possibleOrders = this.props.game.ordersTree;
            const orderableLocations = new Set();

            for (const type of orderTypes) {
                // get all possible orderable locations in the game tree
                const orderTypeLocations = UTILS.javascript.getTreeValue(possibleOrders, type);
                if (orderTypeLocations !== null) {
                    orderTypeLocations.forEach((x) => {
                        if (type === "D") {
                            // x is a unit
                            orderableLocations.add(x.split(" ")[1]);
                        } else {
                            // x is a province code
                            orderableLocations.add(x);
                        }
                    });
                }
            }
            const provinceNames = ProvinceCheck.any(province, null);
            for (const n_x of provinceNames) {
                if (orderableLocations.has(n_x)) {
                    requestedProvince = n_x;
                    break;
                }
            }
        }
        if (requestedProvince === "") {
            this.props.onError(`No orderable locations at province ${province.name}`);
            return this.props.onChangeOrderDistribution(requestedPower, null, provinceController);
        }

        for (var orderDist of this.props.orderDistribution) {
            if (orderDist.province === requestedProvince) {
                return false; // advice is already displayed
            }
        }

        this.props.onChangeOrderDistribution(requestedPower, requestedProvince, provinceController);
        return true;
    }

    handleClickedID(id) {
        const province = this.props.mapData.getProvince(id);
        if (!province) throw new Error(`Cannot find a province named ${id}`);

        const orderBuilding = this.props.orderBuilding;
        if (this.props.shiftKeyPressed) {
            if (this.onPrediction(orderBuilding, province)) {
                return;
            }
        }
        if (!orderBuilding.builder) return this.props.onError("No orderable locations.");
        const stepLength = orderBuilding.builder.steps.length;
        if (orderBuilding.path.length >= stepLength)
            throw new Error(
                `Order building: current steps count (${orderBuilding.path.length}) should be less than` +
                    ` expected steps count (${stepLength}) (${orderBuilding.path.join(", ")}).`,
            );

        const lengthAfterClick = orderBuilding.path.length + 1;
        let validLocations = [];
        const testedPath = [orderBuilding.type].concat(orderBuilding.path);
        const value = UTILS.javascript.getTreeValue(this.props.game.ordersTree, testedPath);
        if (value !== null) {
            const checker = orderBuilding.builder.steps[lengthAfterClick - 1];
            try {
                const possibleLocations = checker(province, orderBuilding.power);
                for (let possibleLocation of possibleLocations) {
                    possibleLocation = possibleLocation.toUpperCase();
                    if (value.includes(possibleLocation)) validLocations.push(possibleLocation);
                }
            } catch (error) {
                return this.props.onError(error);
            }
        }
        if (!validLocations.length) return this.props.onError("Disallowed.");

        if (validLocations.length > 1 && orderBuilding.type === "S" && orderBuilding.path.length >= 2) {
            /* We are building a support order and we have a multiple choice for a location.        */
            /* Let's check if next location to choose is a coast. To have a coast:                  */
            /* - all possible locations must start with same 3 characters.                          */
            /* - we expect at least province name in possible locations (e.g. 'SPA' for 'SPA/NC').  */
            /* If we have a coast, we will remove province name from possible locations.            */
            let isACoast = true;
            let validLocationsNoProvinceName = [];
            for (let i = 0; i < validLocations.length; ++i) {
                let location = validLocations[i];
                if (i > 0) {
                    /* Compare 3 first letters with previous location. */
                    if (
                        validLocations[i - 1].substring(0, 3).toUpperCase() !==
                        validLocations[i].substring(0, 3).toUpperCase()
                    ) {
                        /* No same prefix with previous location. We does not have a coast. */
                        isACoast = false;
                        break;
                    }
                }
                if (location.length !== 3) validLocationsNoProvinceName.push(location);
            }
            if (validLocations.length === validLocationsNoProvinceName.length) {
                /* We have not found province name. */
                isACoast = false;
            }
            if (isACoast) {
                /* We want to choose location in a coastal province. Let's remove province name. */
                validLocations = validLocationsNoProvinceName;
            }
        }

        if (validLocations.length > 1) {
            if (this.props.onSelectLocation) {
                return this.props.onSelectLocation(
                    validLocations,
                    orderBuilding.power,
                    orderBuilding.type,
                    orderBuilding.path,
                );
            } else {
                Diplog.warn(`Forced to select first valid location.`);
                validLocations = [validLocations[0]];
            }
        }
        let orderBuildingType = orderBuilding.type;
        if (lengthAfterClick === stepLength && orderBuildingType === "M") {
            const moveOrderPath = ["M"].concat(orderBuilding.path, validLocations[0]);
            const moveTypes = UTILS.javascript.getTreeValue(this.props.game.ordersTree, moveOrderPath);
            if (moveTypes !== null) {
                if (moveTypes.length === 2 && this.props.onSelectVia) {
                    /* This move can be done either regularly or VIA a fleet. Let user choose. */
                    return this.props.onSelectVia(validLocations[0], orderBuilding.power, orderBuilding.path);
                } else {
                    orderBuildingType = moveTypes[0];
                }
            }
        }
        extendOrderBuilding(
            orderBuilding.power,
            orderBuildingType,
            orderBuilding.path,
            validLocations[0],
            this.props.onOrderBuilding,
            this.props.onOrderBuilt,
            this.props.onError,
        );
    }
    handleHoverID(id) {
        if (this.props.onHover) {
            const province = this.props.mapData.getProvince(id);
            if (province) {
                this.props.onHover(province.name, this.getRelatedOrders(province.name));
            }
        }
    }
    getRelatedOrders(name) {
        const orders = [];
        if (this.props.orders) {
            for (let powerOrders of Object.values(this.props.orders)) {
                if (powerOrders) {
                    for (let order of powerOrders) {
                        const pieces = order.split(/ +/);
                        if (pieces[1].slice(0, 3) === name.toUpperCase().slice(0, 3)) orders.push(order);
                    }
                }
            }
        }
        return orders;
    }
    getNeighbors(extraLocation) {
        const selectedPath = [this.props.orderBuilding.type].concat(this.props.orderBuilding.path);
        if (extraLocation) selectedPath.push(extraLocation);
        const possibleNeighbors = UTILS.javascript.getTreeValue(this.props.game.ordersTree, selectedPath);
        const neighbors = possibleNeighbors ? possibleNeighbors.map((neighbor) => parseLocation(neighbor)) : [];
        return neighbors.length ? neighbors : null;
    }

    /**
     * Render orders, including for distribution advice
     * @param {string} order - Order string
     * @param {string} powerName - Name of the power for this order
     * @param {Game} game - Game object of the current game
     * @param {float} opacity - The opacity of the current order
     * @param {string} key - The keycode for react component to have unique key
     * @returns renderComponents - Json object that stores the order component into the corresponding order rendering list
     */
    renderOrder(order, powerName, game, opacity = undefined, key = "O") {
        var renderComponents = {
            renderedOrders: [],
            renderedOrders2: [],
            renderedHighestOrders: [],
        };

        const tokens = order.split(/ +/);
        if (!tokens || tokens.length < 3) return renderComponents;

        const unit_loc = tokens[1];
        if (tokens[2] === "H") {
            renderComponents.renderedOrders.push(
                <Hold
                    key={`${key}:${order}`}
                    opacity={opacity}
                    loc={unit_loc}
                    powerName={powerName}
                    coordinates={Coordinates}
                    symbolSizes={SymbolSizes}
                    colors={Colors}
                />,
            );
        } else if (tokens[2] === "-") {
            const destLoc = tokens[tokens.length - (tokens[tokens.length - 1] === "VIA" ? 2 : 1)];
            renderComponents.renderedOrders.push(
                <Move
                    key={`${key}:${order}`}
                    opacity={opacity}
                    srcLoc={unit_loc}
                    dstLoc={destLoc}
                    powerName={powerName}
                    phaseType={game.getPhaseType()}
                    coordinates={Coordinates}
                    symbolSizes={SymbolSizes}
                    colors={Colors}
                />,
            );
        } else if (tokens[2] === "S") {
            const destLoc = tokens[tokens.length - 1];
            if (tokens.includes("-")) {
                const srcLoc = tokens[4];
                renderComponents.renderedOrders2.push(
                    <SupportMove
                        key={`${key}:${order}`}
                        opacity={opacity}
                        loc={unit_loc}
                        srcLoc={srcLoc}
                        dstLoc={destLoc}
                        powerName={powerName}
                        coordinates={Coordinates}
                        symbolSizes={SymbolSizes}
                        colors={Colors}
                    />,
                );
            } else {
                renderComponents.renderedOrders2.push(
                    <SupportHold
                        key={`${key}:${order}`}
                        opacity={opacity}
                        loc={unit_loc}
                        dstLoc={destLoc}
                        powerName={powerName}
                        coordinates={Coordinates}
                        symbolSizes={SymbolSizes}
                        colors={Colors}
                    />,
                );
            }
        } else if (tokens[2] === "C") {
            const srcLoc = tokens[4];
            const destLoc = tokens[tokens.length - 1];
            if (srcLoc !== destLoc && tokens.includes("-")) {
                renderComponents.renderedOrders2.push(
                    <Convoy
                        key={`${key}:${order}`}
                        opacity={opacity}
                        loc={unit_loc}
                        srcLoc={srcLoc}
                        dstLoc={destLoc}
                        powerName={powerName}
                        coordinates={Coordinates}
                        colors={Colors}
                        symbolSizes={SymbolSizes}
                    />,
                );
            }
        } else if (tokens[2] === "B") {
            renderComponents.renderedHighestOrders.push(
                <Build
                    key={`${key}:${order}`}
                    opacity={opacity}
                    unitType={tokens[0]}
                    loc={unit_loc}
                    powerName={powerName}
                    coordinates={Coordinates}
                    symbolSizes={SymbolSizes}
                />,
            );
        } else if (tokens[2] === "D") {
            renderComponents.renderedHighestOrders.push(
                <Disband
                    key={`${key}:${order}`}
                    opacity={opacity}
                    loc={unit_loc}
                    phaseType={game.getPhaseType()}
                    coordinates={Coordinates}
                    symbolSizes={SymbolSizes}
                />,
            );
        } else if (tokens[2] === "R") {
            const destLoc = tokens[3];
            renderComponents.renderedOrders.push(
                <Move
                    key={`${key}:${order}`}
                    opacity={opacity}
                    srcLoc={unit_loc}
                    dstLoc={destLoc}
                    powerName={powerName}
                    phaseType={game.getPhaseType()}
                    coordinates={Coordinates}
                    symbolSizes={SymbolSizes}
                    colors={Colors}
                />,
            );
        } else {
            console.error(`Unable to parse order to render: ${JSON.stringify(order)}.`);
        }
        return renderComponents;
    }

    render() {
        const classes = {
            _vie: "nopower",
            _lon: "nopower",
            _par: "nopower",
            _ber: "nopower",
            _rom: "nopower",
            _mos: "nopower",
            _con: "nopower",
            CurrentNote: "currentnotetext",
            CurrentNote2: "currentnotetext",
            CurrentPhase: "currentphasetext",
            BriefLabelLayer: "labeltext",
            FullLabelLayer: "labeltext",
            MouseLayer: "invisibleContent",
        };
        const game = this.props.game;
        const mapData = this.props.mapData;
        const orders = this.props.orders;

        /* Current phase. */
        const current_phase = game.phase[0] === "?" || game.phase === "COMPLETED" ? "FINAL" : game.phase;

        /* Notes. */
        const nb_centers = [];
        for (let power of Object.values(game.powers)) {
            if (!power.isEliminated()) nb_centers.push([power.name.substr(0, 3), power.centers.length]);
        }
        /* Sort nb_centers by descending number of centers. */
        nb_centers.sort((a, b) => {
            return -(a[1] - b[1]) || a[0].localeCompare(b[0]);
        });
        const nb_centers_per_power = nb_centers.map((couple) => couple[0] + ": " + couple[1]).join(" ");
        const note = game.note;

        /* Adding units, influence and orders. */
        const renderedUnits = [];
        const renderedDislodgedUnits = [];
        const renderedOrders = [];
        const renderedOrders2 = [];
        const renderedHighestOrders = [];
        for (let power of Object.values(game.powers))
            if (!power.isEliminated()) {
                for (let unit of power.units) {
                    renderedUnits.push(
                        <Unit
                            key={unit}
                            unit={unit}
                            powerName={power.name}
                            isDislodged={false}
                            coordinates={Coordinates}
                            symbolSizes={SymbolSizes}
                        />,
                    );
                }
                for (let unit of Object.keys(power.retreats)) {
                    renderedDislodgedUnits.push(
                        <Unit
                            key={unit}
                            unit={unit}
                            powerName={power.name}
                            isDislodged={true}
                            coordinates={Coordinates}
                            symbolSizes={SymbolSizes}
                        />,
                    );
                }
                for (let center of power.centers) {
                    setInfluence(classes, mapData, center, power.name);
                }
                for (let loc of power.influence) {
                    if (!mapData.supplyCenters.has(loc)) setInfluence(classes, mapData, loc, power.name);
                }

                if (orders) {
                    const powerOrders = (orders && orders.hasOwnProperty(power.name) && orders[power.name]) || [];
                    for (let order of powerOrders) {
                        const component = this.renderOrder(order, power.name, game);
                        renderedOrders.push(...component.renderedOrders);
                        renderedOrders2.push(...component.renderedOrders2);
                        renderedHighestOrders.push(...component.renderedHighestOrders);
                    }
                }
            }

        /* If can display visual distribution advice, push the corresponding advice order components for rendering */
        if (this.props.orderDistribution && this.props.displayVisualAdvice) {
            for (var provinceDistribution of this.props.orderDistribution) {
                var orderDistribution = provinceDistribution.distribution;
                var provincePower = provinceDistribution.power;
                for (var order in orderDistribution) {
                    if (orderDistribution.hasOwnProperty(order)) {
                        const component = this.renderOrder(
                            order,
                            provincePower,
                            game,
                            orderDistribution[order].opacity,
                            "P",
                        );
                        renderedOrders.push(...component.renderedOrders);
                        renderedOrders2.push(...component.renderedOrders2);
                        renderedHighestOrders.push(...component.renderedHighestOrders);
                    }
                }
            }
        }

        if (this.props.hoverDistributionOrder) {
            for (const orderObj of this.props.hoverDistributionOrder) {
                const component = this.renderOrder(orderObj.order, orderObj.power, game, 1, "H");
                renderedOrders.push(...component.renderedOrders);
                renderedOrders2.push(...component.renderedOrders2);
                renderedHighestOrders.push(...component.renderedHighestOrders);
            }
        }

        /** For textual advice, user is able to show or hide an advice order*/
        if (this.props.visibleDistributionOrder) {
            for (const orderObj of this.props.visibleDistributionOrder) {
                const component = this.renderOrder(orderObj.order, orderObj.power, game, 1, "V");
                renderedOrders.push(...component.renderedOrders);
                renderedOrders2.push(...component.renderedOrders2);
                renderedHighestOrders.push(...component.renderedHighestOrders);
            }
        }

        if (this.props.orderBuilding && this.props.orderBuilding.path.length) {
            const clicked = parseLocation(this.props.orderBuilding.path[0]);
            const province = this.props.mapData.getProvince(clicked);
            if (!province) throw new Error("Unknown clicked province " + clicked);
            const clickedID = province.getID(classes);
            if (!clicked) throw new Error(`Unknown path (${clickedID}) for province (${clicked}).`);
            classes[clickedID] = "provinceRed";
            const neighbors = this.getNeighbors();
            if (neighbors) {
                for (let neighbor of neighbors) {
                    const neighborProvince = this.props.mapData.getProvince(neighbor);
                    if (!neighborProvince) throw new Error("Unknown neighbor province " + neighbor);
                    const neighborID = neighborProvince.getID(classes);
                    if (!neighborID)
                        throw new Error(`Unknown neighbor path (${neighborID}) for province (${neighbor}).`);
                    classes[neighborID] = neighborProvince.isWater() ? "provinceBlue" : "provinceGreen";
                }
            }
        }

        if (this.props.showAbbreviations === false) {
            classes["BriefLabelLayer"] = "visibilityHidden";
        }

        // prettier-ignore
        return (
            <svg className="SvgPure" height="500px" preserveAspectRatio="xMinYMin" textRendering="optimizeLegibility" viewBox="0 0 1000 1000" width="500px" xmlns="http://www.w3.org/2000/svg">
                <title>Pure</title>
                <defs>
                    <marker id="arrow" markerHeight="3" markerUnits="strokeWidth" markerWidth="4" orient="auto" refX="5" refY="5" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>
                    <symbol id="WaivedBuild" overflow="visible" viewBox="0 0 100 100">
                        <linearGradient gradientUnits="userSpaceOnUse" id="symWBGradient" x1="15" x2="100" y1="100" y2="10">
                            <stop offset="20%" stopColor="yellow" stopOpacity="1"/>
                            <stop offset="95%" stopColor="yellow" stopOpacity="0"/>
                        </linearGradient>
                        <linearGradient gradientUnits="userSpaceOnUse" id="symShadowWBGradient" x1="15" x2="100" y1="100" y2="10">
                            <stop offset="20%" stopColor="black" stopOpacity="0.5"/>
                            <stop offset="90%" stopColor="black" stopOpacity="0"/>
                        </linearGradient>
                        <g>
                            <polygon fill="url(#symShadowWBGradient)" points="40,100 100,35 95,30 40,85 13,65 10,70" transform="translate(1 7)"/>
                            <polygon fill="url(#symWBGradient)" points="40,100 100,35 90,20 40,85 13,65 10,70" stroke="black" strokeWidth="0.5"/>
                        </g>
                    </symbol>
                    <symbol id="BuildUnit" overflow="visible" viewBox="-23.5 -23.5 153 153">
                        <g>
                            <g fill="none" opacity="0.5" stroke="black" strokeWidth="7" transform="translate(6 6)">
                                <circle cx="50" cy="50" r="10"/>
                                <circle cx="50" cy="50" r="30"/>
                                <circle cx="50" cy="50" r="50"/>
                                <circle cx="50" cy="50" r="70"/>
                            </g>
                            <g fill="none" stroke="yellow" strokeWidth="7">
                                <circle cx="50" cy="50" r="10"/>
                                <circle cx="50" cy="50" r="30"/>
                                <circle cx="50" cy="50" r="50"/>
                                <circle cx="50" cy="50" r="70"/>
                            </g>
                        </g>
                    </symbol>
                    <symbol id="RemoveUnit" overflow="visible" viewBox="-2.5 -2.5 15.5 15.5">
                        <g fill="none" stroke="red" strokeWidth="1">
                            <circle cx="5" cy="5" r="7"/>
                            <line x1="-2" x2="12" y1="-2" y2="12"/>
                            <line x1="-2" x2="12" y1="12" y2="-2"/>
                        </g>
                    </symbol>
                    <symbol id="FailedOrder" overflow="visible" viewBox="0 0 35 35">
                        <g>
                            <polygon className="shadow" points="0,0 12,0 17,6 22,0 35,0 22,17 32,34 19,34 15,27 9,34 -4,34 10,17" strokeWidth="1" transform="translate(3.5,3.5)"/>
                            <polygon fill="red" fillOpacity="1" points="0,0 12,0 17,6 22,0 35,0 22,17 32,34 19,34 15,27 9,34 -4,34 10,17" stroke="black" strokeWidth="3%"/>
                        </g>
                    </symbol>
                    <symbol id="SupplyCenter" overflow="visible" viewBox="-0.375 -0.375 10.75 10.75">
                        <g>
                            <circle cx="5" cy="5" r="3" stroke="black" strokeWidth="0.4"/>
                            <circle cx="5" cy="5" fill="none" r="5" stroke="black" strokeWidth="0.75"/>
                        </g>
                    </symbol>
                    <symbol id="HoldUnit" overflow="visible" viewBox="-5 -5 76.6 76.6">
                        <g>
                            <polygon fill="none" points="47.1,0.0 66.6,19.5 66.6, 47.1 47.1,66.6 19.5,66.6 0.0,47.1 0.0,19.5 19.5,0.0" stroke="black" strokeWidth="10"/>
                            <polygon fill="none" points="47.1,0.0 66.6,19.5 66.6, 47.1 47.1,66.6 19.5,66.6 0.0,47.1 0.0,19.5 19.5,0.0" strokeWidth="6"/>
                        </g>
                    </symbol>
                    <symbol id="SupportHoldUnit" overflow="visible" viewBox="-5 -5 86.6 86.6">
                        <g>
                            <polygon fill="none" opacity="0.45" points="54.2,0.0 76.6,22.4 76.6,54.2 54.2,76.6 22.4,76.6 0.0,54.2 0.0,22.4 22.4,0.0" stroke="black" strokeWidth="10"/>
                            <polygon fill="none" points="54.2,0.0 76.6,22.4 76.6,54.2 54.2,76.6 22.4,76.6 0.0,54.2 0.0,22.4 22.4,0.0" strokeDasharray="5,5" strokeWidth="6"/>
                        </g>
                    </symbol>
                    <symbol id="ConvoyTriangle" overflow="visible" viewBox="-9 -10 84.4 72.4">
                        <g>
                            <polygon fill="none" opacity="0.45" points="33.2,0.0 66.4,57.4 0.0,57.4" stroke="black" strokeWidth="10"/>
                            <polygon fill="none" points="33.2,0.0 66.4,57.4 0.0,57.4" strokeDasharray="15,5" strokeWidth="6"/>
                        </g>
                    </symbol>
                    <symbol id="Army" overflow="visible" viewBox="0 0 23 15">
                        <g>
                            <rect fill="black" height="13" opacity="0.40" rx="4" stroke="black" strokeWidth="1" width="23" x="2" y="2"/>
                            <rect height="13" rx="4" stroke="black" strokeWidth="3%" width="23" x="0" y="0"/>
                            <g fill="black" stroke="black" strokeWidth="1">
                                <rect height="1" width="13" x="6" y="6"/>
                                <rect height="1" width="14" x="5" y="7"/>
                                <rect height="1" width="12" x="6" y="8"/>
                                <rect height="1" width="10" x="7" y="9"/>
                                <rect height="3" width="5" x="10" y="3"/>
                                <rect height="1.5" width="1" x="15" y="4.5"/>
                                <line x1="3" x2="10" y1="4" y2="4"/>
                            </g>
                        </g>
                    </symbol>
                    <symbol id="Fleet" overflow="visible" viewBox="0 0 23 15">
                        <g>
                            <rect fill="black" height="13" opacity="0.40" rx="4" stroke="black" strokeWidth="1" width="23" x="2" y="2"/>
                            <rect height="13" rx="4" stroke="black" strokeWidth="3%" width="23" x="0" y="0"/>
                            <g fill="black" stroke="black" strokeWidth="1">
                                <rect height="1" width="16.5" x="3" y="7"/>
                                <rect height="1" width="15" x="4" y="8"/>
                                <rect height="1" width="13.5" x="5" y="9"/>
                                <rect height="1" width="2.75" x="13.5" y="6"/>
                                <rect height="2" width="4" x="7" y="5"/>
                                <rect height="1" width="1" x="8.5" y="4"/>
                                <rect height="1" width="1" x="6" y="6"/>
                            </g>
                        </g>
                    </symbol>
                    <symbol id="DislodgedArmy" overflow="visible" viewBox="0 0 23 15">
                        <g>
                            <rect fill="red" height="13" opacity="0.50" rx="4" stroke="red" strokeWidth="1" width="23" x="3" y="3"/>
                            <rect height="13" rx="4" stroke="red" strokeWidth="3%" width="23" x="0" y="0"/>
                            <g fill="black" stroke="black" strokeWidth="1">
                                <rect height="1" width="13" x="6" y="6"/>
                                <rect height="1" width="14" x="5" y="7"/>
                                <rect height="1" width="12" x="6" y="8"/>
                                <rect height="1" width="10" x="7" y="9"/>
                                <rect height="3" width="5" x="10" y="3"/>
                                <rect height="1.5" width="1" x="15" y="4.5"/>
                                <line x1="3" x2="10" y1="4" y2="4"/>
                            </g>
                        </g>
                    </symbol>
                    <symbol id="DislodgedFleet" overflow="visible" viewBox="0 0 23 15">
                        <g>
                            <rect fill="red" height="13" opacity="0.50" rx="4" stroke="red" strokeWidth="1" width="23" x="3" y="3"/>
                            <rect height="13" rx="4" stroke="red" strokeWidth="3%" width="23" x="0" y="0"/>
                            <g fill="black" stroke="black" strokeWidth="1">
                                <rect height="1" width="16.5" x="3" y="7"/>
                                <rect height="1" width="15" x="4" y="8"/>
                                <rect height="1" width="13.5" x="5" y="9"/>
                                <rect height="1" width="2.75" x="13.5" y="6"/>
                                <rect height="2" width="4" x="7" y="5"/>
                                <rect height="1" width="1" x="8.5" y="4"/>
                                <rect height="1" width="1" x="6" y="6"/>
                            </g>
                        </g>
                    </symbol>
                    <marker id="arrow" markerHeight="4" markerUnits="strokeWidth" markerWidth="4" orient="auto" refX="5" refY="5" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>
                    <pattern height="10" id="patternRed" patternTransform="scale(0.54 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="red" height="10" width="10" x="0" y="0"/>
                        <rect fill="pink" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBrown" patternTransform="scale(0.54 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="peru" height="10" width="10" x="0" y="0"/>
                        <rect fill="antiquewhite" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternGreen" patternTransform="scale(0.54 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="seagreen" height="10" width="10" x="0" y="0"/>
                        <rect fill="yellowgreen" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBlue" patternTransform="scale(0.54 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="CornflowerBlue" height="10" width="10" x="0" y="0"/>
                        <rect fill="cyan" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBlack" patternTransform="scale(0.54 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="black" height="10" width="10" x="0" y="0"/>
                        <rect fill="gray" height="10" width="10" x="0" y="5"/>
                    </pattern>
                </defs>
                <g id="MapLayer">
                    <rect fill="rgb(240,237,168)" height="995" stroke="black" strokeWidth="5" width="995" x="0" y="0"/>
                    <path d="M497.619 30.1868 L866.51 207.835 L957.619 607.008 L702.338 927.12 L292.9 927.12 L37.6191 607.008 L128.728 207.835 z" fill="none" id="001" stroke="black" strokeWidth="3"/>
                    <path d="M497.619 142.283 L650.619 176.571 L774.287 275.519 L842.619 416.571 L842.619 574.899 L773.619 715.571 L651.158 814.983 L497.619 849.571 L344.08 814.983 L220.619 716.571 L152.619 574.899 L152.619 416.571 L220.951 275.519 L343.619 176.571 z" fill="rgb(240,237,168)" id="002" stroke="black" strokeWidth="3"/>
                    <line fill="none" stroke="black" strokeWidth="3" x1="497.619" x2="497.619" y1="30.5714" y2="141.571"/>
                    <line fill="none" stroke="black" strokeWidth="3" x1="772.619" x2="866.619" y1="274.571" y2="207.571"/>
                    <line fill="none" stroke="black" strokeWidth="3" x1="957.619" x2="841.619" y1="607.571" y2="574.571"/>
                    <line fill="none" stroke="black" strokeWidth="3" x1="649.619" x2="701.619" y1="814.571" y2="929.571"/>
                    <line fill="none" stroke="black" strokeWidth="3" x1="291.619" x2="344.619" y1="926.571" y2="814.571"/>
                    <line fill="none" stroke="black" strokeWidth="3" x1="150.619" x2="36.6191" y1="574.571" y2="606.571"/>
                    <line fill="none" stroke="black" strokeWidth="3" x1="220.619" x2="128.619" y1="274.571" y2="207.571"/>
                    <g transform="translate(-2.38095 -21.4286)">
                        <line fill="none" stroke="black" strokeWidth="1" x1="346" x2="845" y1="198" y2="438"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="346" x2="776" y1="198" y2="737"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="346" x2="500" y1="198" y2="871"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="346" x2="223" y1="198" y2="738"/>
                    </g>
                    <g transform="translate(-2.38095 -21.4286)">
                        <line fill="none" stroke="black" strokeWidth="1" x1="653" x2="776" y1="198" y2="737"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="653" x2="500" y1="198" y2="871"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="653" x2="223" y1="198" y2="738"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="653" x2="155" y1="198" y2="438"/>
                    </g>
                    <g transform="translate(-2.38095 -21.4286)">
                        <line fill="none" stroke="black" strokeWidth="1" x1="845" x2="500" y1="438" y2="871"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="845" x2="223" y1="438" y2="738"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="845" x2="155" y1="438" y2="438"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="845" x2="346" y1="438" y2="198"/>
                    </g>
                    <g transform="translate(-2.38095 -21.4286)">
                        <line fill="none" stroke="black" strokeWidth="1" x1="776" x2="223" y1="737" y2="738"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="776" x2="155" y1="737" y2="438"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="776" x2="346" y1="737" y2="198"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="776" x2="653" y1="737" y2="198"/>
                    </g>
                    <g transform="translate(-2.38095 -21.4286)">
                        <line fill="none" stroke="black" strokeWidth="1" x1="500" x2="155" y1="871" y2="438"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="500" x2="346" y1="871" y2="198"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="500" x2="653" y1="871" y2="198"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="500" x2="845" y1="871" y2="438"/>
                    </g>
                    <g transform="translate(-2.38095 -21.4286)">
                        <line fill="none" stroke="black" strokeWidth="1" x1="223" x2="346" y1="738" y2="198"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="223" x2="653" y1="738" y2="198"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="223" x2="845" y1="738" y2="438"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="223" x2="776" y1="738" y2="737"/>
                    </g>
                    <g transform="translate(-2.38095 -21.4286)">
                        <line fill="none" stroke="black" strokeWidth="1" x1="155" x2="653" y1="438" y2="198"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="155" x2="845" y1="438" y2="438"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="155" x2="776" y1="438" y2="737"/>
                        <line fill="none" stroke="black" strokeWidth="1" x1="155" x2="500" y1="438" y2="871"/>
                    </g>
                    <text fill="black" fontFamily="sansserif" fontSize="36" transform="translate(-123.913 110.87) translate(1263.04 589.13) translate(-32.6087 2.17391) rotate(309.832 -221.264 125.31) translate(-7.1597 -41.6087) translate(14.9305 -15.5542)" x="-278px" y="138px">Paris</text>
                    <text fill="black" fontFamily="sansserif" fontSize="36" transform="translate(-119.565 -19.5652) translate(1354.35 219.565) translate(-64.1975 1.23457) rotate(75.7072 -220.85 195.892) translate(26.8838 14.493) translate(-21.3531 -2.98297) translate(0.45683 6.30804)" x="-287px" y="205px">London</text>
                    <text fill="black" fontFamily="sansserif" fontSize="36" transform="translate(-132.609 -197.826) translate(2.17391 6.52174) translate(1069.57 -10.8696) rotate(29.8179 -218.768 295.31) translate(10.2944 29.5644) rotate(358.562 -220.214 298.775) rotate(359.007 -220.285 298.603) rotate(357.849 -220.329 298.482) translate(0.720196 6.03851) translate(-8.46365 -1.53838) translate(-11.2897 -18.3683)" x="-274px" y="308px">Vienna</text>
                    <text fill="black" fontFamily="sansserif" fontSize="36" transform="translate(-93.4783 -84.7826) translate(839.13 676.087) translate(-8.69565 -2.17391) translate(0 2.17391) translate(-2.38095 -21.4286) translate(0 5.76923) translate(23 -2) translate(7 0)" x="-313px" y="390px">Berlin</text>
                    <text fill="black" fontFamily="sansserif" fontSize="36" transform="translate(-60.8696 0) translate(586.957 -369.565) translate(32.6923 23.0769) rotate(335.957 -277.737 465.894) translate(17.1839 -0.756818) translate(-1.37782 7.80842) translate(0.972716 2.53974) translate(6.55609 -20.5395) rotate(358.255 -213.197 464.84) translate(-50.1197 -2.00399) translate(-10.8147 -1.39563) translate(-2.30251 0.802347) translate(2.35477 3.05259)" x="-333px" y="475px">Constantinople</text>
                    <text fill="black" fontFamily="sansserif" fontSize="36" transform="translate(-71.7391 -130.435) translate(6.52174 0) translate(6.52174 2.17391) translate(330.435 6.52174) translate(1.92308 0) translate(50 0) translate(-7.69231 0) rotate(285.776 -266.269 538.335) translate(1.28651 11.6267) rotate(357.124 -268.227 538.669) translate(20.3562 -7.10479)" x="-322px" y="551px">Moscow</text>
                    <text fill="black" fontFamily="sansserif" fontSize="36" transform="translate(-82.6087 -241.304) translate(476.087 471.739) translate(5.76923 -9.61538) rotate(49.7338 -280.476 591.894) translate(3.62518 -22.1318) translate(-17.89 -12.0334)" x="-315px" y="601px">Rome</text>
                    <path className={classes['_vie']} d="M497.619 142.283 L650.619 176.571 L774.287 275.519 L866.51 207.835 L497.619 30.1868 z" id="_vie"/>
                    <path className={classes['_lon']} d="M774.287 275.519 L842.619 416.571 L842.619 574.899 L957.619 607.008 L866.51 207.835 z" id="_lon"/>
                    <path className={classes['_par']} d="M842.619 574.899 L773.619 715.571 L651.158 814.983 L702.338 927.12 L957.619 607.008 z" id="_par"/>
                    <path className={classes['_ber']} d="M651.158 814.983 L497.619 849.571 L344.08 814.983 L292.9 927.12 L702.338 927.12 z" id="_ber"/>
                    <path className={classes['_rom']} d="M344.08 814.983 L220.619 716.571 L152.619 574.899 L37.6191 607.008 L292.9 927.12 z" id="_rom"/>
                    <path className={classes['_mos']} d="M152.619 574.899 L152.619 416.571 L220.951 275.519 L128.728 207.835 L37.6191 607.008 z" id="_mos"/>
                    <path className={classes['_con']} d="M220.951 275.519 L343.619 176.571 L497.619 142.283 L497.619 30.1868 L128.728 207.835 z" id="_con"/>
                </g>
                <text className={classes['CurrentNote']} id="CurrentNote" x="15" y="25">{nb_centers_per_power ? nb_centers_per_power : ''}</text>
                <text className={classes['CurrentNote2']} id="CurrentNote2" x="15" y="50">{note ? note : ''}</text>
                <text className={classes['CurrentPhase']} fontSize="30" id="CurrentPhase" x="845" y="970">{current_phase}</text>
                <g id="SupplyCenterLayer">
                    <use height="20" href="#SupplyCenter" id="sc_VIE" width="20" x="655.5" y="138.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_LON" width="20" x="865.5" y="393.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_PAR" width="20" x="791.5" y="723.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_BER" width="20" x="488.5" y="874.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_ROM" width="20" x="184.5" y="727.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_MOS" width="20" x="110.5" y="398.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_CON" width="20" x="322.5" y="136.0"/>
                </g>
                <g id="OrderLayer">
                    <g id="Layer2">{renderedOrders2}</g>
                    <g id="Layer1">{renderedOrders}</g>
                </g>
                <g id="UnitLayer">{renderedUnits}</g>
                <g id="DislodgedUnitLayer">{renderedDislodgedUnits}</g>
                <g id="HighestOrderLayer">{renderedHighestOrders}</g>
                <g className={classes['BriefLabelLayer']} id="BriefLabelLayer" visibility="hidden"/>
                <g className={classes['FullLabelLayer']} id="FullLabelLayer" visibility="hidden"/>
                <g className={classes['MouseLayer']} id="MouseLayer">
                    <path d="M497.619 142.283 L650.619 176.571 L774.287 275.519 L866.51 207.835 L497.619 30.1868 z" id="vie" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M774.287 275.519 L842.619 416.571 L842.619 574.899 L957.619 607.008 L866.51 207.835 z" id="lon" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M842.619 574.899 L773.619 715.571 L651.158 814.983 L702.338 927.12 L957.619 607.008 z" id="par" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M651.158 814.983 L497.619 849.571 L344.08 814.983 L292.9 927.12 L702.338 927.12 z" id="ber" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M344.08 814.983 L220.619 716.571 L152.619 574.899 L37.6191 607.008 L292.9 927.12 z" id="rom" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M152.619 574.899 L152.619 416.571 L220.951 275.519 L128.728 207.835 L37.6191 607.008 z" id="mos" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M220.951 275.519 L343.619 176.571 L497.619 142.283 L497.619 30.1868 L128.728 207.835 z" id="con" onClick={this.onClick} onMouseOver={this.onHover}/>
                </g>
            </svg>
        );
    }
}
SvgPure.propTypes = {
    game: PropTypes.instanceOf(Game).isRequired,
    mapData: PropTypes.instanceOf(MapData).isRequired,
    orders: PropTypes.object,
    onHover: PropTypes.func,
    onError: PropTypes.func.isRequired,
    onSelectLocation: PropTypes.func,
    onSelectVia: PropTypes.func,
    onOrderBuilding: PropTypes.func,
    onOrderBuilt: PropTypes.func,
    orderBuilding: PropTypes.object,
    showAbbreviations: PropTypes.bool,
    onChangeOrderDistribution: PropTypes.func,
    orderDistribution: PropTypes.array,
    displayVisualAdvice: PropTypes.bool,
    shiftKeyPressed: PropTypes.bool,
    hoverDistributionOrder: PropTypes.array,
    visibleDistributionOrder: PropTypes.array,
};
// eslint-disable-line semi
