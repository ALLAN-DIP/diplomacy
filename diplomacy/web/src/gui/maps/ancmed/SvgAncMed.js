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
/** Generated with parameters: Namespace(input='src/diplomacy/maps/svg/ancmed.svg', name='SvgAncMed', output='src/gui/maps/ancmed/') **/
import React from "react";
import PropTypes from "prop-types";
import "./SvgAncMed.css";
import { Coordinates, SymbolSizes, Colors } from "./SvgAncMedMetadata";
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

export class SvgAncMed extends React.Component {
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
            _adr: "water",
            _aeg: "water",
            _ale: "nopower",
            _ant: "nopower",
            _apu: "nopower",
            _ara: "nopower",
            _arm: "nopower",
            _ath: "nopower",
            _aus: "water",
            _bal: "nopower",
            _bay: "nopower",
            _ber: "water",
            _bit: "nopower",
            _bla: "water",
            _byz: "nopower",
            _cap: "nopower",
            _car: "nopower",
            _che: "nopower",
            _cil: "water",
            _cir: "nopower",
            _cor: "nopower",
            _cre: "nopower",
            _cyp: "nopower",
            _cyr: "nopower",
            _dac: "nopower",
            _dal: "nopower",
            _dam: "nopower",
            _egy: "water",
            _epi: "nopower",
            _etr: "nopower",
            _gal: "nopower",
            _gau: "nopower",
            _gop: "water",
            _gos: "water",
            _got: "water",
            _ibe: "water",
            _ill: "nopower",
            _ion: "water",
            _isa: "nopower",
            _jer: "nopower",
            _lep: "nopower",
            _lib: "water",
            _lig: "water",
            _lus: "nopower",
            _mac: "nopower",
            _mar: "nopower",
            _mas: "nopower",
            _mau: "nopower",
            _mem: "nopower",
            _mes: "water",
            _mil: "nopower",
            _min: "water",
            _nab: "nopower",
            _nea: "nopower",
            _num: "nopower",
            _pet: "nopower",
            _pha: "nopower",
            _pun: "water",
            _rav: "nopower",
            _ree: "water",
            _rha: "nopower",
            _rom: "nopower",
            _sag: "nopower",
            _sah: "nopower",
            _sad: "nopower",
            _sam: "nopower",
            _sic: "nopower",
            _sid: "nopower",
            _sin: "nopower",
            _sip: "nopower",
            _spa: "nopower",
            _syr: "water",
            _tar: "nopower",
            _tha: "nopower",
            _thb: "nopower",
            _tye: "nopower",
            _tyn: "water",
            _ven: "nopower",
            _vin: "nopower",
            water: "water",
            BriefLabelLayer: "smalllabeltext",
            CurrentNote: "currentnotetext",
            CurrentNote2: "currentnotetext",
            CurrentPhase: "currentphasetext",
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
            <svg className="SvgAncMed" colorRendering="optimizeQuality" height="700px" imageRendering="optimizeQuality" preserveAspectRatio="xMinYMin" shapeRendering="geometricPrecision" textRendering="optimizeLegibility" viewBox="0 0 1030 700" width="1030px" xmlns="http://www.w3.org/2000/svg">
                <title>Ancient Med Map</title>
                <defs>
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
                    <pattern height="10" id="patternRed" patternTransform="scale(0.56 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="red" height="10" width="10" x="0" y="0"/>
                        <rect fill="pink" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBrown" patternTransform="scale(0.56 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="peru" height="10" width="10" x="0" y="0"/>
                        <rect fill="antiquewhite" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternGreen" patternTransform="scale(0.56 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="seagreen" height="10" width="10" x="0" y="0"/>
                        <rect fill="yellowgreen" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBlue" patternTransform="scale(0.56 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="CornflowerBlue" height="10" width="10" x="0" y="0"/>
                        <rect fill="cyan" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBlack" patternTransform="scale(0.56 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="black" height="10" width="10" x="0" y="0"/>
                        <rect fill="gray" height="10" width="10" x="0" y="5"/>
                    </pattern>
                </defs>
                <g id="MapLayer">
                    <rect fill="antiquewhite" height="660" width="1030" x="0" y="0"/>
                    <polygon className={classes['_adr']} id="_adr" points="530,249 529,255 523,252 509,252 504,253 500,250 490,245 484,244 460,227 460,222 464,219 465,216 461,214 452,214 446,215 438,213 432,208 425,198 419,184 417,179 414,176 410,170 397,162 389,154 383,140 384,137 388,135 388,131 384,127 385,121 393,115 399,111 406,110 415,111 419,115 419,118 415,118 412,120 413,129 420,139 422,138 425,133 427,130 430,129 433,130 436,135 437,140 441,145 443,148 441,149 439,149 437,151 439,154 445,159 450,161 454,163 454,167 456,169 459,168 463,168 467,171 472,176 476,180 481,182 482,184 480,185 476,184 474,185 476,186 479,187 482,189 485,192 488,193 488,190 491,189 493,192 498,196 501,199 502,201 506,203 511,204 513,203 516,204 515,206 513,206 513,208 515,210 518,214 520,217 523,218 527,219 529,220 530,224 531,232 530,241 530,249"/>
                    <polygon className={classes['_aeg']} id="_aeg" points="623,365 628,373 637,381 646,385 652,386 655,388 656,389 659,390 670,387 674,388 683,386 690,379 698,367 703,355 704,342 705,339 709,338 715,335 719,334 720,332 714,332 702,332 699,328 704,327 703,324 694,322 690,316 690,312 692,310 691,305 686,302 684,303 683,305 680,305 679,304 676,304 675,301 678,299 676,296 676,292 678,292 678,294 679,296 682,298 683,294 683,292 682,289 682,283 683,276 680,275 669,277 668,272 668,266 666,265 664,259 665,255 669,253 676,251 677,248 667,249 663,250 658,248 651,249 643,249 635,253 630,256 625,255 625,258 628,259 630,261 637,270 637,272 635,272 628,265 625,265 625,268 630,273 630,274 627,275 622,269 619,269 618,272 625,278 620,279 610,268 613,265 610,262 607,264 604,268 604,275 605,281 611,284 615,287 616,292 612,290 608,291 608,296 614,295 617,299 622,304 628,304 634,309 635,314 639,317 643,318 643,322 641,323 639,321 636,320 634,321 637,331 633,332 629,328 621,326 618,328 616,331 620,337 623,341 623,344 620,345 616,342 614,341 612,343 616,351 619,355 622,360 623,365"/>
                    <polygon className={classes['_ale']} id="_ale" points="659,475 666,476 670,479 673,482 684,482 706,484 725,487 733,488 749,490 763,491 771,491 779,490 786,486 794,480 806,471 808,476 813,477 817,479 821,483 826,489 829,495 832,501 832,506 822,505 816,506 810,508 805,512 799,511 794,518 786,527 780,532 772,532 764,529 762,528 756,528 752,531 744,537 738,538 733,538 727,537 724,536 720,537 715,540 711,545 707,548 703,548 699,544 695,542 689,541 684,540 682,537 681,533 681,528 684,524 686,520 684,515 680,509 676,507 671,507 663,503 661,497 660,492 656,488 656,481 659,475"/>
                    <polygon className={classes['_ant']} id="_ant" points="917,288 930,295 937,301 938,304 935,307 935,311 941,317 949,322 950,332 946,339 944,343 935,341 930,339 925,334 918,335 913,338 907,342 901,342 900,337 897,331 893,327 891,314 893,310 896,307 896,304 893,302 897,298 898,293 904,286 913,281 916,280 917,288"/>
                    <polygon className={classes['_apu']} id="_apu" points="419,184 425,198 433,209 438,213 446,215 453,214 462,214 465,215 465,218 460,222 460,226 465,230 475,237 484,244 491,245 500,249 504,253 508,261 505,268 501,267 494,262 488,258 483,256 480,256 478,257 471,255 468,251 458,246 451,244 441,237 436,235 433,229 429,223 422,218 413,218 407,219 406,209 401,202 400,194 404,188 411,188 419,184"/>
                    <polygon className={classes['_ara']} id="_ara" points="1030,491 1030,364 1024,367 1017,367 1001,359 991,356 985,356 969,365 961,365 952,368 947,373 940,380 940,387 939,392 943,396 943,400 935,412 928,412 924,418 917,419 912,422 917,434 917,444 919,447 920,452 943,454 952,457 964,463 979,464 984,466 988,472 995,477 1001,479 1006,479 1017,490 1030,491"/>
                    <polygon className={classes['_arm']} id="_arm" points="1030,160 1030,263 1024,260 1015,259 1010,254 1006,253 1002,251 996,250 984,251 976,249 968,248 962,250 957,253 951,255 945,257 939,261 934,257 929,254 927,252 926,249 929,246 931,243 931,239 930,237 930,230 934,226 938,221 941,215 942,212 942,207 952,202 955,198 955,189 959,182 969,176 973,171 973,159 982,158 997,158 1004,161 1013,165 1019,164 1030,160"/>
                    <polygon className={classes['_ath']} id="_ath" points="559,295 558,299 552,298 552,301 555,304 561,307 565,313 570,316 576,316 582,315 587,316 600,316 612,320 614,324 618,328 621,326 627,327 632,331 637,332 635,327 634,321 636,319 639,321 641,323 643,322 643,318 640,317 635,314 634,308 629,304 622,303 618,300 616,297 615,295 611,296 608,296 608,290 611,289 613,290 616,291 615,287 611,284 605,280 600,280 594,282 589,287 582,287 577,285 573,286 565,294 559,295"/>
                    <polygon className={classes['_aus']} id="_aus" points="450,326 447,334 445,340 443,346 443,352 445,357 445,362 443,366 439,367 433,368 429,363 427,361 423,360 418,358 411,355 408,353 404,350 404,360 401,371 397,377 391,384 385,391 424,403 448,407 483,412 522,413 523,381 522,363 520,343 513,341 503,338 494,333 483,326 475,318 471,322 469,327 466,329 462,330 458,327 458,326 450,326"/>
                    <g className={classes['_bal']} id="_bal">
                        <polygon points="195,253 190,255 186,258 181,260 183,265 187,266 192,270 195,271 198,265 201,260 197,259 195,254 "/>
                        <path className="water" d="M 204,208 L 214,213 L 224,220 L 233,230 L 238,239 L 238,252 L 237,260 L 225,273 L 210,283 L 194,290 L 177,293 L 164,294 L 139,294 L 135,288 L 130,278 L 127,270 L 132,263 L 138,255 L 139,248 L 147,243 L 149,237 L 154,227 L 157,227 L 162,223 L 172,221 L 179,220 L 189,216 L 196,210 L 203,210 L 204,208 z M 195,253 L 190,255 L 186,258 L 181,260 L 183,265 L 187,266 L 192,270 L 195,271 L 198,265 L 201,260 L 197,259 L 195,254 z" fillRule="nonzero"/>
                    </g>
                    <polygon className={classes['_bay']} id="_bay" points="483,660 830,661 830,657 833,655 834,652 834,647 832,644 831,642 831,637 832,633 835,629 839,626 842,623 846,619 847,615 840,612 832,607 825,606 817,612 804,619 795,619 788,612 778,604 772,601 762,601 756,603 752,605 742,605 735,599 729,593 709,593 706,590 698,583 689,582 680,585 673,586 666,587 663,589 655,594 648,600 646,606 644,612 638,616 626,621 618,618 609,616 604,618 598,615 590,612 572,612 564,614 555,614 532,606 527,606 521,611 515,612 508,609 497,606 490,601 485,606 476,611 471,614 467,613 463,613 463,618 464,624 461,632 461,637 466,640 473,644 478,648 483,660"/>
                    <polygon className={classes['_ber']} id="_ber" points="299,291 290,297 283,304 278,314 274,326 273,341 277,352 269,352 260,348 252,348 242,349 236,349 226,348 212,349 210,350 202,350 184,350 176,351 170,353 164,353 159,355 155,348 152,342 144,333 136,328 128,323 121,321 121,314 125,307 133,300 140,295 152,294 167,294 183,292 201,287 217,279 228,270 237,259 250,260 267,260 282,260 297,255 301,258 302,263 305,267 303,270 302,273 302,278 301,284 300,289 299,291"/>
                    <polygon className={classes['_bit']} id="_bit" points="833,173 819,173 814,175 807,179 802,180 793,183 784,189 771,200 763,208 757,215 752,217 745,218 748,222 752,223 755,228 755,232 754,239 757,243 763,249 768,242 772,234 777,230 787,229 798,226 806,220 813,213 815,205 818,200 824,196 828,191 829,186 832,180 833,177 833,173"/>
                    <polygon className={classes['_bla']} id="_bla" points="724,219 729,220 737,220 745,219 757,215 763,208 772,200 784,189 793,183 801,180 808,179 815,174 819,173 833,173 842,174 848,176 849,177 855,177 862,178 876,177 884,178 892,177 896,177 906,173 915,172 921,171 925,171 928,168 933,166 940,160 945,155 947,154 949,148 952,144 953,140 951,137 949,134 948,129 942,125 935,122 927,121 920,119 913,116 906,112 899,111 890,108 883,103 878,100 871,97 864,96 858,95 854,92 852,90 848,89 844,91 841,91 839,89 842,86 842,83 846,83 849,83 854,81 857,74 861,72 862,60 860,58 857,58 852,53 852,52 856,51 859,49 862,43 873,35 873,31 866,31 850,39 846,43 836,49 829,52 819,60 813,66 809,69 806,70 802,73 800,75 802,80 805,81 807,84 809,88 817,88 819,85 824,85 829,81 832,81 835,83 834,86 834,89 833,92 829,93 826,94 823,93 817,95 815,99 810,101 804,105 801,109 797,116 791,115 786,114 783,104 773,101 772,98 768,98 766,99 764,97 766,94 770,93 774,90 779,86 781,83 780,80 774,80 769,80 765,82 761,81 755,82 747,83 743,82 746,77 741,75 737,78 734,78 730,81 718,91 712,98 710,101 709,106 706,112 702,121 695,129 693,136 694,144 696,160 688,168 688,175 683,188 686,192 688,197 693,201 696,205 702,208 706,210 709,214 713,215 718,217 724,219"/>
                    <g className={classes['_byz']} id="_byz">
                        <polygon points="726,229 730,232 735,234 739,234 741,235 740,237 736,237 723,238 721,239 723,242 725,243 725,244 721,245 717,245 714,246 708,248 704,249 701,248 697,247 696,250 692,253 687,254 681,256 673,261 669,265 667,271 668,277 679,275 683,276 689,276 699,280 710,277 720,281 731,264 738,259 749,260 762,252 763,248 753,239 754,234 756,228 751,223 748,222 746,219 739,220 732,220 728,220 724,218 720,217 714,215 708,213 706,210 696,205 690,204 680,214 679,223 669,234 667,249 677,248 676,251 669,253 665,255 664,259 666,265 668,260 672,257 678,254 682,250 685,244 686,238 688,235 694,232 700,229 704,227 709,227 716,228 720,227 723,225 725,220 728,221 726,229"/>
                        <polygon className="water" points="666,265 668,260 672,257 678,254 682,250 685,244 686,238 688,235 694,232 700,229 704,227 709,227 716,228 720,227 723,225 725,220 728,221 726,229 726,229 730,232 735,234 739,234 741,235 740,237 736,237 723,238 721,239 723,242 725,243 725,244 721,245 717,245 714,246 708,248 704,249 701,248 697,247 696,250 692,253 687,254 681,256 673,261"/>
                    </g>
                    <polygon className={classes['_cap']} id="_cap" points="893,302 897,299 898,294 902,288 908,283 912,280 916,280 918,275 923,274 931,272 937,267 939,262 927,252 926,248 931,244 931,239 930,238 930,231 942,214 943,206 932,210 924,210 917,216 906,217 897,223 877,224 872,231 865,233 855,233 847,231 838,237 837,240 840,244 840,259 846,266 846,270 838,274 834,279 832,285 834,289 839,292 839,303 837,307 837,313 848,324 854,323 863,314 879,314 883,308 888,303 893,302"/>
                    <polygon className={classes['_car']} id="_car" points="345,384 345,379 345,376 349,372 355,364 357,358 356,354 353,353 348,356 341,356 334,352 329,349 324,348 320,350 313,351 301,351 289,349 280,352 276,352 270,352 260,348 252,347 242,349 236,349 233,362 242,374 242,381 245,386 254,391 261,394 274,393 286,397 297,399 319,396 327,392 333,386 338,384 345,384"/>
                    <polygon className={classes['_che']} id="_che" points="1030,160 1030,0 646,1 658,8 667,18 673,38 676,51 684,54 691,61 691,66 689,72 691,78 698,89 709,101 711,98 719,90 728,83 734,78 737,77 740,76 746,76 745,79 743,81 744,83 750,83 756,82 760,81 765,82 768,80 774,80 780,79 781,82 779,86 772,91 766,94 764,97 766,99 769,98 771,98 772,101 778,103 783,103 784,109 786,114 791,116 797,115 800,110 804,105 810,101 815,99 817,95 823,93 826,93 829,92 833,92 834,89 834,85 835,83 832,82 829,81 827,83 824,85 819,85 817,88 813,88 809,88 807,83 805,80 802,80 801,75 805,70 810,69 814,65 819,60 823,57 829,52 834,50 839,48 845,44 849,39 856,36 860,34 866,31 873,31 873,35 868,39 862,43 860,49 855,51 852,51 851,53 854,55 857,57 860,58 861,59 862,65 861,72 858,74 854,80 850,82 842,83 843,85 839,89 841,91 844,91 848,90 851,90 855,93 861,96 871,97 879,101 889,107 900,111 906,112 915,117 920,119 928,121 935,122 942,125 947,129 950,134 953,140 953,143 950,147 954,149 966,157 972,159 981,158 998,158 1013,165 1018,165 1030,160"/>
                    <polygon className={classes['_cil']} id="_cil" points="902,353 889,354 877,357 865,360 852,366 844,370 838,376 832,376 819,376 818,380 814,380 811,381 807,384 801,385 781,391 767,394 756,395 762,383 766,372 766,355 764,346 770,345 772,339 775,332 778,329 784,329 794,330 799,333 804,334 810,336 817,339 824,340 829,338 834,337 838,334 843,328 846,324 849,324 855,322 863,315 874,314 880,314 884,308 888,303 893,303 896,304 897,307 893,310 891,313 892,317 893,326 897,330 900,336 902,347 902,353"/>
                    <polygon className={classes['_cir']} id="_cir" points="245,386 261,394 270,394 276,393 286,397 280,405 280,414 280,422 277,428 278,433 282,438 280,439 280,446 288,458 295,460 297,463 299,470 305,473 306,479 300,479 291,483 283,482 277,483 267,491 257,488 249,483 243,476 235,473 227,474 222,475 217,474 216,466 208,454 206,440 212,430 207,416 207,409 214,398 224,390 245,386"/>
                    <polygon className={classes['_cor']} id="_cor" points="327,193 328,194 328,200 327,203 328,205 328,210 328,215 326,218 325,222 325,227 323,231 320,234 318,234 315,233 311,231 311,230 312,228 312,226 309,226 309,224 310,222 311,220 308,219 308,217 310,216 310,214 308,213 310,209 311,206 315,205 319,205 323,204 324,203 324,196 327,193"/>
                    <polygon className={classes['_cre']} id="_cre" points="659,390 664,389 670,387 674,388 683,385 684,389 687,390 691,389 695,388 698,389 701,387 703,387 704,390 701,393 694,393 690,394 686,395 681,398 674,399 671,397 648,396 645,393 645,387 647,386 652,386 655,387 656,389 659,390"/>
                    <polygon className={classes['_cyp']} id="_cyp" points="819,376 819,380 815,380 810,381 808,383 805,385 801,385 801,387 804,393 810,396 816,397 820,397 823,395 825,393 829,392 830,390 832,388 835,388 841,387 841,386 838,383 838,381 842,378 847,372 852,366 844,371 838,376 829,376 823,376 819,376"/>
                    <polygon className={classes['_cyr']} id="_cyr" points="659,476 647,474 632,472 621,464 606,462 592,464 579,471 572,477 567,486 566,494 569,501 572,507 571,513 568,520 563,528 558,534 549,538 545,539 548,561 559,561 568,556 579,549 587,543 592,543 597,539 603,535 629,535 636,538 644,541 647,549 653,553 660,554 665,556 668,562 672,558 678,555 683,552 684,540 682,535 681,528 686,521 683,511 678,507 672,507 663,503 661,497 658,490 655,486 659,476"/>
                    <polygon className={classes['_dac']} id="_dac" points="709,100 697,88 690,75 689,70 691,63 691,60 685,54 676,50 671,52 669,58 663,62 656,63 647,60 628,60 619,63 613,68 604,79 598,85 586,85 573,87 558,102 544,101 537,104 532,119 541,123 548,135 555,146 564,154 574,155 582,158 585,165 600,179 600,185 597,193 597,197 600,201 607,201 615,204 623,204 632,201 642,199 648,203 654,211 666,213 671,219 679,223 680,215 684,208 690,205 696,204 688,197 686,192 683,188 686,180 688,176 687,168 696,160 693,137 694,130 702,121 706,112 709,106 709,100"/>
                    <polygon className={classes['_dal']} id="_dal" points="443,105 433,104 430,99 421,93 416,91 412,92 412,98 407,105 407,110 412,111 415,111 419,115 419,118 415,118 412,121 412,129 420,138 423,137 427,129 430,129 433,131 436,136 436,139 443,149 439,149 437,151 439,155 454,164 454,167 456,169 459,168 463,169 467,171 473,177 476,180 481,182 482,184 480,184 476,184 475,185 477,187 480,188 483,190 485,192 488,193 488,190 491,190 493,193 501,198 502,201 510,205 513,203 516,204 515,205 513,206 513,208 516,212 518,214 520,217 523,218 529,220 531,226 533,224 537,223 541,228 549,228 553,214 553,210 549,206 543,197 538,188 533,181 528,177 524,179 518,175 518,167 511,161 506,159 501,155 492,152 487,148 482,140 481,134 473,132 465,128 459,123 457,118 456,114 450,108 443,105"/>
                    <polygon className={classes['_dam']} id="_dam" points="1030,365 1030,263 1025,260 1015,259 1010,254 1007,254 1002,251 997,250 990,251 983,251 977,249 968,248 962,250 957,254 950,255 945,258 939,261 938,266 931,272 923,275 917,276 915,281 917,288 926,293 930,295 938,302 937,305 936,308 936,312 949,323 950,331 947,338 943,343 949,349 952,358 952,369 959,366 969,365 978,361 985,356 992,357 1001,359 1011,364 1017,367 1023,367 1030,365"/>
                    <polygon className={classes['_egy']} id="_egy" points="684,482 694,483 707,484 718,486 727,487 736,489 748,490 762,490 770,491 778,490 784,487 793,481 794,459 795,445 799,431 803,419 812,403 816,397 809,396 804,393 801,388 801,385 789,388 777,392 763,394 745,395 727,395 702,392 693,393 688,394 684,397 680,399 676,399 681,411 688,432 688,442 687,467 684,482"/>
                    <polygon className={classes['_epi']} id="_epi" points="559,295 563,295 567,293 573,286 577,286 579,277 579,269 573,263 570,261 569,255 565,252 561,250 562,244 561,240 561,236 555,232 553,231 548,227 541,228 537,223 534,223 531,226 530,249 529,254 529,263 535,271 539,279 542,288 545,293 548,296 551,295 552,293 553,294 555,295 559,295"/>
                    <polygon className={classes['_etr']} id="_etr" points="344,164 349,161 353,156 359,156 357,147 349,139 350,133 351,124 342,119 341,115 343,105 326,101 320,105 314,111 305,112 295,121 296,131 292,139 291,148 293,154 296,154 297,153 300,155 301,158 304,154 315,148 322,148 326,149 339,158 344,164"/>
                    <polygon className={classes['_gal']} id="_gal" points="775,231 769,240 763,248 762,252 750,259 738,260 732,264 720,280 725,282 728,282 734,280 740,280 744,287 752,292 751,299 761,305 765,303 769,303 775,306 783,306 787,299 796,298 803,289 807,288 813,291 819,288 826,287 832,285 836,276 840,273 846,270 846,266 840,260 839,253 840,245 837,240 837,238 839,237 838,233 835,229 829,225 828,214 826,209 822,206 816,204 814,211 810,217 801,224 794,227 784,229 775,231"/>
                    <polygon className={classes['_gau']} id="_gau" points="120,173 123,169 126,143 127,128 127,122 126,119 128,116 129,113 130,109 127,105 126,100 120,93 120,90 115,87 119,82 116,79 115,76 110,75 98,67 92,65 82,63 82,53 86,47 90,44 96,47 99,47 105,45 112,45 116,47 126,41 126,34 125,27 125,20 128,17 131,18 135,23 139,28 144,29 147,24 151,18 156,16 172,15 178,11 182,0 299,1 299,6 303,11 303,15 299,21 299,26 302,30 306,31 306,38 310,44 316,46 316,52 314,57 310,60 310,64 311,71 302,78 295,85 295,94 282,95 274,101 266,111 249,117 246,123 239,131 226,130 219,128 216,135 212,140 210,146 206,151 201,151 195,161 182,163 174,159 168,164 168,176 172,185 163,182 147,183 138,179 129,179 123,177 120,173"/>
                    <polygon className={classes['_gop']} id="_gop" points="793,480 806,471 814,467 824,465 830,465 836,466 841,467 847,469 856,470 862,467 868,466 875,461 882,457 886,454 891,446 894,439 895,429 881,430 867,431 839,431 822,429 801,426 797,438 794,454 793,480"/>
                    <polygon className={classes['_gos']} id="_gos" points="572,477 553,470 538,466 522,464 508,463 491,464 474,467 458,471 443,477 435,481 429,487 435,489 442,491 450,496 454,499 456,505 461,511 470,517 478,521 488,523 496,524 507,528 519,532 528,537 537,538 545,539 552,538 558,533 567,523 571,515 572,506 569,500 566,494 567,486 570,481 572,477"/>
                    <polygon className={classes['_got']} id="_got" points="385,391 415,400 442,406 473,411 498,412 522,413 520,437 514,464 490,464 470,467 453,472 440,479 429,486 418,484 408,483 398,480 389,476 381,472 376,472 368,466 361,459 356,457 349,450 341,443 337,438 336,434 340,427 344,423 347,421 350,412 353,409 355,404 365,401 374,396 385,391"/>
                    <polygon className={classes['_ibe']} id="_ibe" points="121,321 132,325 143,332 153,343 158,356 146,365 132,372 121,374 110,378 103,380 98,384 90,379 85,380 75,380 68,377 63,377 47,370 32,367 25,361 23,354 18,354 15,356 13,362 0,379 0,324 6,325 11,332 14,343 18,347 24,348 31,342 36,342 48,334 55,334 63,337 71,338 90,339 103,326 108,326 115,323 121,321"/>
                    <polygon className={classes['_ill']} id="_ill" points="478,88 469,87 465,88 456,88 450,86 450,96 447,101 441,104 448,107 456,113 458,122 463,128 471,132 480,135 483,143 488,150 499,155 507,160 513,162 518,166 518,175 523,179 529,178 534,181 542,193 550,207 553,210 553,215 549,228 552,231 557,232 562,236 571,228 582,226 583,214 586,210 593,206 599,201 597,197 597,191 600,185 600,180 592,172 585,164 582,158 574,155 564,154 559,151 553,143 548,134 542,124 535,120 528,118 519,116 514,117 509,114 505,113 501,107 498,99 488,98 484,93 481,89 478,88"/>
                    <polygon className={classes['_ion']} id="_ion" points="552,345 531,345 521,344 507,340 495,334 484,327 475,318 476,314 476,308 478,303 482,301 485,297 484,290 479,285 475,283 474,280 472,275 474,272 475,266 476,260 480,256 484,257 490,259 497,264 501,267 505,268 508,261 505,253 510,252 522,252 529,255 529,263 532,268 536,273 539,278 541,285 545,293 549,296 551,295 551,293 553,293 555,295 559,294 558,299 554,298 552,298 552,301 555,303 559,305 562,307 566,314 571,316 577,316 582,315 587,316 594,317 601,316 607,318 612,320 614,324 612,324 609,323 605,323 601,322 595,321 592,321 588,319 584,320 579,322 577,326 577,332 579,336 569,341 552,345"/>
                    <polygon className={classes['_isa']} id="_isa" points="848,324 842,318 837,313 838,306 839,299 839,292 833,288 832,285 827,287 820,288 813,291 807,289 803,288 795,298 787,298 785,303 783,306 775,306 769,303 763,304 761,305 761,312 764,314 769,315 769,319 773,322 777,324 780,329 785,329 793,330 799,333 805,334 813,337 818,339 823,340 829,338 835,337 838,334 843,328 846,325 848,324"/>
                    <polygon className={classes['_jer']} id="_jer" points="886,454 892,459 900,474 905,472 913,471 919,474 919,462 918,458 920,452 920,447 917,444 917,435 912,422 911,416 908,414 904,416 896,416 895,428 894,437 891,446 886,454"/>
                    <polygon className={classes['_lep']} id="_lep" points="428,486 420,484 412,483 406,483 398,480 397,485 393,490 386,494 379,495 369,496 364,498 367,503 367,509 366,514 370,516 381,516 388,517 397,521 408,524 421,527 427,537 435,549 444,552 450,554 457,560 462,568 472,569 478,567 485,565 494,564 496,566 500,567 510,572 528,571 533,566 540,562 548,561 548,555 546,548 545,539 538,538 530,537 519,533 508,528 496,524 488,522 478,522 473,519 466,515 461,511 456,505 454,499 449,495 442,491 435,489 428,486"/>
                    <polygon className={classes['_lib']} id="_lib" points="676,400 681,411 687,429 689,442 688,459 687,470 684,482 673,482 669,478 664,476 658,475 646,474 631,472 625,467 621,464 610,462 598,462 589,464 579,470 572,477 558,472 540,466 524,464 513,464 518,445 521,427 522,413 536,413 563,412 590,408 620,404 647,396 671,397 674,400 676,400"/>
                    <polygon className={classes['_lig']} id="_lig" points="348,180 346,173 344,163 338,158 326,149 319,147 315,148 310,151 305,154 301,158 294,163 288,165 280,169 272,176 256,176 254,174 249,175 245,172 240,171 235,173 228,170 214,174 212,175 206,179 203,188 207,197 207,204 204,208 213,213 221,218 228,225 233,230 237,239 238,252 237,259 250,260 278,260 290,258 297,255 297,249 297,248 298,248 306,248 311,245 318,241 319,235 311,232 311,230 311,229 311,226 310,226 309,224 310,221 308,219 308,217 310,216 311,214 308,213 311,206 315,205 322,204 324,204 325,196 327,193 327,189 331,185 336,182 341,180 348,180"/>
                    <polygon className={classes['_lus']} id="_lus" points="119,174 112,175 102,174 86,174 77,172 70,168 55,166 48,167 29,166 16,167 5,162 0,161 0,296 10,294 18,286 28,283 46,272 54,273 61,268 58,258 67,245 66,235 70,233 75,226 82,223 99,213 103,213 112,204 126,203 134,195 144,189 147,182 136,179 128,179 119,174"/>
                    <polygon className={classes['_mac']} id="_mac" points="610,262 613,264 611,267 613,270 616,273 620,278 625,278 618,272 618,269 622,269 627,275 630,274 630,273 624,268 625,265 628,265 635,272 637,272 637,269 630,262 628,259 625,258 625,256 628,256 631,255 634,253 638,252 642,249 648,249 653,248 657,248 662,250 667,249 669,235 678,226 679,223 672,220 664,212 654,212 648,203 643,199 638,199 625,204 614,204 607,201 600,201 588,209 582,214 581,227 572,227 561,236 562,244 561,250 568,254 570,261 578,269 579,276 576,285 582,287 589,287 593,283 599,280 605,280 604,273 604,268 606,265 610,262"/>
                    <polygon className={classes['_mar']} id="_mar" points="643,612 647,603 654,594 666,587 666,581 664,575 663,568 668,562 666,557 662,555 654,553 648,549 645,543 637,538 629,535 603,534 594,542 587,544 576,552 561,561 548,561 541,562 535,565 528,571 510,572 502,569 495,566 494,569 489,578 486,584 488,591 490,598 490,602 498,606 506,609 517,612 521,611 525,606 532,606 541,609 550,613 556,614 565,614 573,612 588,612 597,614 603,618 609,616 619,618 625,622 629,621 636,617 643,612"/>
                    <polygon className={classes['_mas']} id="_mas" points="203,188 206,179 212,175 220,172 228,170 236,173 240,171 245,172 249,174 254,174 256,176 265,177 272,176 280,170 287,165 294,163 301,158 300,154 297,153 294,154 292,150 291,141 293,134 296,131 295,121 306,112 302,107 297,106 295,95 282,94 274,101 266,111 249,117 245,124 239,131 219,129 216,135 211,140 211,145 206,151 201,151 195,162 182,163 175,159 172,160 169,165 168,178 171,184 193,190 203,188"/>
                    <polygon className={classes['_mau']} id="_mau" points="0,379 8,368 13,363 14,356 18,353 23,354 26,361 32,367 47,370 62,377 68,377 74,380 84,380 88,379 98,384 103,380 110,378 121,373 131,372 147,365 159,355 170,353 176,350 209,350 213,348 237,349 233,363 243,374 242,381 245,386 227,389 224,390 216,397 207,408 207,415 212,430 207,439 207,453 216,465 217,474 202,472 195,472 188,476 181,478 169,479 164,482 157,490 150,498 139,498 131,497 125,495 115,499 105,504 95,504 85,499 75,495 65,499 47,505 38,512 24,523 12,524 0,525 0,379"/>
                    <polygon className={classes['_mem']} id="_mem" points="847,614 852,613 855,612 858,609 859,604 860,602 861,601 861,599 860,595 859,590 856,588 853,586 852,584 852,580 853,579 853,575 852,572 850,567 848,564 847,562 847,559 848,557 849,553 848,552 845,553 842,554 838,553 833,548 829,540 826,533 826,529 827,526 829,523 829,521 828,519 829,515 831,512 832,509 832,506 815,505 809,508 805,512 799,511 779,533 772,532 763,528 755,529 749,533 740,539 731,539 725,537 721,537 714,542 708,548 703,548 697,543 693,541 685,540 683,552 677,556 668,562 663,568 664,575 666,581 666,587 673,586 688,582 697,583 709,593 729,594 742,605 750,605 763,601 772,602 780,606 796,619 803,619 815,614 826,607 833,608 840,612 847,614"/>
                    <polygon className={classes['_mes']} id="_mes" points="522,413 566,412 600,407 626,403 648,397 645,393 645,388 647,386 639,382 631,375 622,365 619,363 616,360 614,357 608,358 608,362 607,365 602,364 600,359 595,355 593,356 592,362 588,361 585,356 587,346 579,337 565,341 553,345 529,345 520,344 522,364 523,382 522,413"/>
                    <polygon className={classes['_mil']} id="_mil" points="741,281 733,280 727,282 723,281 720,281 710,278 699,280 688,276 683,276 682,284 682,289 683,293 681,298 679,296 678,292 676,292 676,296 678,299 674,301 676,303 678,303 680,305 683,305 684,303 686,302 691,305 691,309 690,312 690,316 693,322 703,324 704,327 699,329 702,332 714,332 720,333 719,334 715,335 709,338 705,339 704,342 708,342 712,341 715,341 715,344 718,343 718,340 720,338 731,339 735,344 740,348 747,348 754,347 756,348 758,348 764,346 770,346 775,332 779,329 777,324 769,319 768,316 761,312 761,305 752,300 752,297 753,291 747,288 744,286 741,281"/>
                    <polygon className={classes['_min']} id="_min" points="703,392 722,395 744,395 756,395 763,380 766,371 766,355 764,345 759,348 757,348 754,347 748,348 740,348 735,344 731,338 722,338 720,338 718,340 717,343 715,344 715,341 712,341 708,342 704,342 704,355 699,368 691,378 684,385 684,389 687,390 691,388 695,388 698,389 701,386 703,387 704,389 703,392"/>
                    <polygon className={classes['_nab']} id="_nab" points="1030,661 1030,491 1018,491 1006,480 1001,479 994,476 985,467 979,464 964,463 950,456 942,453 920,453 919,458 919,463 919,473 923,474 930,480 936,482 943,485 952,494 959,504 958,512 953,520 941,531 926,541 932,547 936,549 939,554 944,562 950,566 958,574 967,579 973,583 979,589 985,600 987,610 993,615 1000,620 1003,625 1004,632 1006,637 1013,647 1022,654 1030,661"/>
                    <polygon className={classes['_nea']} id="_nea" points="399,235 401,229 404,226 405,222 407,220 413,218 422,218 429,223 436,234 451,244 458,246 469,252 471,255 478,257 476,260 475,268 474,272 471,275 473,280 476,284 479,285 484,290 485,297 482,301 478,303 476,307 476,315 475,319 471,322 469,327 466,330 462,330 458,327 459,323 460,319 461,313 463,309 465,304 464,297 463,290 461,285 459,281 455,275 452,272 445,268 440,264 437,258 431,254 426,253 420,250 415,243 413,239 407,237 399,235"/>
                    <polygon className={classes['_num']} id="_num" points="337,439 340,442 347,448 357,457 360,458 365,464 372,468 376,472 381,472 389,476 398,480 396,487 388,493 378,496 368,496 363,497 354,500 346,497 335,488 319,487 313,482 306,479 306,474 298,469 297,463 295,459 289,458 280,447 280,438 283,438 291,441 306,442 320,447 333,439 337,439"/>
                    <polygon className={classes['_pet']} id="_pet" points="906,527 912,530 919,535 926,542 936,535 948,525 957,516 959,510 959,504 952,494 943,485 936,483 930,481 923,474 919,473 914,471 908,471 900,473 901,478 903,487 903,492 904,493 905,499 905,505 905,513 906,518 906,527"/>
                    <polygon className={classes['_pha']} id="_pha" points="464,613 470,614 475,612 483,607 491,601 489,596 487,588 487,582 491,574 495,566 493,564 472,568 462,568 456,559 449,554 443,550 435,549 428,537 420,527 406,524 395,520 386,516 369,515 366,513 366,509 368,503 363,497 356,500 352,500 345,496 334,488 317,487 311,481 306,479 299,479 293,482 285,483 279,483 267,491 270,500 278,507 291,509 296,510 314,526 320,540 328,553 339,556 354,564 365,564 369,563 376,572 389,584 397,583 418,598 425,598 433,597 440,598 448,601 456,607 464,613"/>
                    <polygon className={classes['_pun']} id="_pun" points="277,352 274,342 274,326 277,315 281,307 290,297 299,291 301,292 303,299 309,304 313,303 314,298 316,296 323,298 326,295 327,285 351,288 366,293 379,301 389,311 400,329 396,330 392,330 389,332 386,336 388,341 399,346 404,350 404,361 400,372 394,382 385,390 371,398 355,404 352,397 349,390 345,384 344,379 345,376 350,371 354,364 357,358 356,354 353,353 350,355 347,357 341,356 335,352 330,349 323,349 320,351 312,352 301,351 295,350 289,349 284,351 280,352 277,352"/>
                    <polygon className={classes['_rav']} id="_rav" points="419,185 417,179 414,176 410,171 404,166 397,162 389,154 385,144 383,140 384,137 388,135 388,131 384,127 385,121 373,121 368,124 363,132 358,134 351,132 349,138 355,145 359,155 365,157 371,165 377,168 382,178 391,185 400,195 404,188 411,188 419,185"/>
                    <polygon className={classes['_ree']} id="_ree" points="1030,661 972,661 967,652 963,646 959,641 956,633 952,622 948,619 941,614 933,610 928,605 923,596 922,592 921,589 914,585 912,581 912,578 907,575 903,574 893,560 888,555 888,551 887,546 883,542 881,536 878,532 868,524 862,518 857,510 855,504 852,501 849,498 847,493 847,488 849,487 851,488 854,492 860,498 863,503 869,508 872,514 877,519 880,520 885,527 888,530 891,531 893,533 896,535 898,534 900,529 900,523 899,514 899,507 900,499 901,493 903,492 904,494 905,499 905,507 905,518 906,528 911,529 916,532 920,536 924,540 928,544 932,547 936,549 942,558 944,562 949,565 953,569 958,573 963,577 967,580 973,583 978,589 983,597 985,601 987,611 992,614 998,619 1002,623 1003,628 1005,635 1008,640 1014,647 1021,653 1030,661"/>
                    <polygon className={classes['_rha']} id="_rha" points="299,0 424,1 421,4 421,9 424,13 424,16 420,21 419,30 416,34 408,37 403,38 399,40 396,46 392,47 389,51 390,56 391,62 389,66 386,71 388,76 389,81 381,82 377,83 374,86 370,90 362,94 357,95 353,93 349,93 346,96 344,100 343,105 339,104 333,103 327,102 322,102 319,106 312,112 305,112 303,108 297,106 295,95 294,86 302,78 312,71 310,65 310,60 314,57 316,53 316,46 310,44 307,39 306,31 302,30 299,26 299,21 303,16 303,12 299,5 299,0"/>
                    <polygon className={classes['_rom']} id="_rom" points="399,235 401,229 404,226 405,222 407,220 406,209 401,202 400,194 388,182 384,180 379,171 376,168 372,166 366,158 363,156 360,156 353,155 350,161 344,163 346,173 348,180 362,198 364,202 367,204 374,211 382,221 390,228 399,235"/>
                    <polygon className={classes['_sag']} id="_sag" points="132,262 128,270 131,282 140,294 134,299 126,307 122,314 121,321 114,322 109,325 103,326 91,339 83,339 73,339 64,336 55,333 48,334 40,338 37,341 32,342 27,344 24,348 19,347 14,343 11,330 6,325 0,324 1,296 10,295 18,286 28,284 46,272 54,273 62,268 68,266 76,266 86,260 109,260 114,258 125,259 132,262"/>
                    <polygon className={classes['_sah']} id="_sah" points="0,526 22,524 42,508 74,495 95,503 105,504 126,495 139,498 149,498 161,485 169,479 181,479 196,472 207,471 216,474 224,475 232,472 237,473 247,480 256,488 267,491 270,500 278,507 293,509 298,512 306,519 314,527 320,540 328,553 340,557 354,564 363,564 369,563 378,575 389,583 397,583 418,598 425,598 432,597 442,598 449,602 463,613 462,617 464,623 461,631 461,636 470,642 476,645 481,653 483,660 0,661 0,526"/>
                    <polygon className={classes['_sad']} id="_sad" points="319,240 323,243 329,249 331,254 331,258 330,260 329,267 330,269 330,273 329,278 327,285 327,290 326,295 324,298 319,297 316,295 314,298 314,303 309,304 306,302 303,299 302,295 301,292 299,291 301,287 302,282 302,274 304,267 302,263 301,258 297,255 296,249 297,248 299,248 304,248 309,247 313,244 319,240"/>
                    <polygon className={classes['_sam']} id="_sam" points="424,0 645,0 655,6 660,9 666,17 671,31 676,50 671,52 670,58 664,62 658,63 651,62 646,60 628,60 621,62 615,66 607,75 598,85 592,85 580,86 572,88 567,92 558,102 550,102 543,101 537,104 534,110 532,119 519,116 514,117 509,114 505,114 502,108 498,99 488,98 482,89 477,88 469,87 466,88 455,88 451,86 449,78 455,71 454,66 457,60 456,57 455,54 446,47 440,45 433,37 419,36 414,35 419,29 419,20 424,15 421,10 421,4 424,0"/>
                    <polygon className={classes['_sic']} id="_sic" points="450,324 450,328 447,334 445,341 443,346 443,352 445,357 445,363 443,366 439,367 434,368 430,365 427,361 423,360 415,357 409,354 404,349 399,346 394,344 388,341 386,336 389,332 393,330 397,330 401,329 408,330 415,331 424,331 428,329 432,327 438,327 443,325 450,324"/>
                    <polygon className={classes['_sid']} id="_sid" points="912,384 906,384 904,383 901,382 900,375 901,370 904,366 905,361 905,358 902,353 901,343 905,342 907,341 914,338 919,335 925,335 930,338 936,342 943,343 947,347 951,353 952,361 952,369 948,373 943,377 940,380 935,380 930,379 928,378 924,377 919,380 912,384"/>
                    <polygon className={classes['_sin']} id="_sin" points="886,455 891,458 896,467 900,475 902,484 903,493 901,493 900,497 899,505 899,514 900,523 899,530 897,534 895,535 892,532 889,531 885,527 881,523 879,521 877,519 873,515 870,511 866,506 862,501 858,496 854,491 851,488 849,487 849,485 847,483 843,482 840,481 837,480 839,479 840,477 840,474 840,471 841,469 842,467 847,469 854,470 857,470 861,468 865,466 869,466 874,463 878,459 882,457 886,455"/>
                    <polygon className={classes['_sip']} id="_sip" points="906,173 913,172 920,171 925,171 928,168 932,167 938,162 944,156 948,152 950,147 953,148 958,151 965,156 973,159 973,170 970,175 964,180 960,183 955,189 955,198 952,202 947,204 939,207 930,210 924,210 918,216 912,216 905,218 898,223 892,224 877,224 874,228 872,232 864,233 856,233 847,232 843,234 838,237 837,233 829,225 828,213 824,207 816,205 818,201 824,197 828,191 828,186 832,178 833,172 842,173 846,175 849,177 853,177 866,178 877,178 886,179 892,177 897,177 906,173"/>
                    <polygon className={classes['_spa']} id="_spa" points="579,336 583,341 587,346 586,351 585,355 588,361 592,362 592,360 593,356 594,355 597,357 600,359 603,364 607,366 608,362 608,358 612,357 614,357 616,360 619,363 622,365 622,360 619,354 615,348 611,343 613,341 616,342 620,344 623,344 624,342 619,336 616,331 618,328 614,324 608,323 605,323 599,321 593,321 587,319 582,320 577,324 576,328 577,332 579,336"/>
                    <polygon className={classes['_syr']} id="_syr" points="895,428 895,416 896,408 896,403 898,400 897,392 900,388 900,382 900,374 901,370 904,365 905,359 902,353 887,355 872,358 853,365 846,374 841,380 839,381 838,382 839,384 841,386 841,387 838,388 834,388 831,389 830,391 826,393 823,395 821,397 816,397 811,404 804,417 800,426 812,428 828,430 846,431 862,431 876,430 895,428"/>
                    <polygon className={classes['_tar']} id="_tar" points="132,262 125,259 115,259 108,260 86,260 76,265 68,265 61,268 58,259 67,245 67,236 71,233 75,226 82,224 98,213 104,213 112,204 127,203 134,195 144,189 148,183 162,182 171,184 195,190 203,188 207,198 207,204 203,210 195,210 189,216 179,220 162,223 157,227 154,228 149,236 147,242 140,249 138,256 132,262"/>
                    <polygon className={classes['_tha']} id="_tha" points="337,438 336,434 340,428 345,422 348,420 349,416 351,412 354,408 355,404 352,397 349,390 345,384 338,384 332,388 327,392 319,397 310,398 299,400 287,397 280,404 279,415 280,422 278,429 279,434 282,437 289,441 305,442 311,444 321,447 326,444 333,439 337,438"/>
                    <polygon className={classes['_thb']} id="_thb" points="972,661 832,661 832,657 834,656 835,654 835,649 835,646 833,644 832,637 833,633 836,630 840,627 844,622 847,619 848,615 850,615 853,614 856,612 860,609 860,604 861,603 862,603 863,599 862,596 861,591 858,588 855,586 854,585 853,582 854,580 855,577 855,574 852,568 850,564 848,562 848,559 850,558 851,555 851,552 848,550 845,551 842,552 839,552 836,549 832,544 830,539 828,535 827,530 829,527 831,523 830,520 830,518 830,515 832,513 833,511 834,506 834,502 832,499 832,497 831,495 832,492 832,489 832,485 834,482 835,482 837,482 841,482 846,483 848,486 849,488 848,489 848,493 849,497 851,501 854,503 856,507 859,515 868,524 875,529 877,532 881,537 883,541 887,546 888,551 888,555 903,574 909,576 912,578 912,582 914,586 921,589 925,600 930,607 935,611 940,614 946,618 952,622 955,631 959,641 963,647 972,661"/>
                    <polygon className={classes['_tye']} id="_tye" points="896,416 896,403 898,399 898,392 899,389 900,382 904,382 906,384 912,384 917,380 924,377 928,378 935,380 940,380 940,385 939,388 940,393 944,396 943,400 935,412 928,412 923,419 916,419 912,422 911,416 908,414 905,416 896,416"/>
                    <polygon className={classes['_tyn']} id="_tyn" points="348,180 340,180 334,183 328,189 327,193 328,195 327,201 327,203 328,205 328,215 325,218 325,226 323,231 321,233 319,234 319,241 323,243 329,249 331,253 331,259 329,260 329,268 331,272 327,285 345,286 356,289 368,294 378,300 388,310 401,329 417,331 424,332 432,327 438,327 443,325 450,324 451,326 458,326 461,312 465,304 463,290 460,284 459,280 456,276 453,273 444,268 440,264 437,258 431,254 420,251 414,240 408,237 399,235 390,227 380,218 370,207 368,204 365,203 363,198 357,191 348,180"/>
                    <polygon className={classes['_ven']} id="_ven" points="407,110 399,111 393,114 385,120 380,121 372,121 367,124 365,128 364,133 357,134 350,132 350,125 346,122 341,118 341,114 343,111 343,106 344,99 349,94 354,94 358,95 371,90 376,82 388,81 392,81 404,88 408,88 412,93 412,98 407,105 407,110"/>
                    <polygon className={classes['_vin']} id="_vin" points="432,37 439,46 455,54 457,63 455,71 449,77 450,86 450,95 446,102 442,105 433,104 431,101 428,97 422,93 416,91 411,92 408,88 403,88 397,85 393,82 389,81 386,71 390,63 389,51 392,47 395,46 400,40 407,38 415,34 419,36 432,37"/>
                    <g>
                        <polyline className={classes['water']} id="water" points="120,173 123,169 126,143 127,128 127,122 126,119 128,116 129,113 130,109 127,105 126,100 120,93 120,90 115,87 119,82 116,79 115,76 110,75 98,67 92,65 82,63 82,53 86,47 90,44 96,47 99,47 105,45 112,45 116,47 126,41 126,34 125,27 125,20 128,17 131,18 135,23 139,28 144,29 147,24 151,18 156,16 172,15 178,11 182,0 0,0 0,161 5,162 16,167 29,166 48,167 55,166 70,168 77,172 86,174 102,174 112,175 119,174"/>
                        <g className="style1">
                            <path d="M 832,661 L 832,657 834,656 L 835,654 L 835,649 L 835,646 L 833,644 L 832,637 L 833,633 L 836,630 L 840,627 L 844,622 L 847,619 L 848,615 L 850,615 L 853,614 L 856,612 L 860,609 L 860,604 L 861,603 L 862,603 L 863,599 L 862,596 L 861,591 L 858,588 L 855,586 L 854,585 L 853,582 L 854,580 L 855,577 L 855,574 L 852,568 L 850,564 L 848,562 L 848,559 L 850,558 L 851,555 L 851,552 L 848,550 L 845,551 L 842,552 L 839,552 L 836,549 L 832,544 L 830,539 L 828,535 L 827,530 L 829,527 L 831,523 L 830,520 L 830,518 L 830,515 L 832,513 L 833,511 L 834,506 L 834,502 L 832,499 L 832,497 L 831,495 L 832,492 L 832,489 L 832,485 L 834,482 L 835,482 L 837,482 L 842,466"/>
                            <path d="M 830,495 L 821,483 L 815,477 L 808,477 L 807,472"/>
                            <path d="M 831,482 L 826,474 L 824,465"/>
                        </g>
                        <line className="thickdash" x1="45" x2="38" y1="327" y2="378"/>
                        <path className="thickdash" d="M 465,321 C 461,337 450,344 438,343"/>
                        <path className="thickdash" d="M 321,222 C 331,232 331,240 321,250"/>
                        <rect className="style2" height="660" width="1030" x="0" y="0"/>
                    </g>
                </g>
                <g id="SupplyCenterLayer">
                    <use height="10" href="#SupplyCenter" id="sc_CAR" width="10" x="318.9" y="353.7"/>
                    <use height="10" href="#SupplyCenter" id="sc_CIR" width="10" x="255.5" y="434.1"/>
                    <use height="10" href="#SupplyCenter" id="sc_THA" width="10" x="315.6" y="403.3"/>
                    <use height="10" href="#SupplyCenter" id="sc_ALE" width="10" x="724.2" y="490.2"/>
                    <use height="10" href="#SupplyCenter" id="sc_MEM" width="10" x="791.6" y="586.9"/>
                    <use height="10" href="#SupplyCenter" id="sc_THB" width="10" x="844.4" y="516.2"/>
                    <use height="10" href="#SupplyCenter" id="sc_SPA" width="10" x="587.7" y="337.5"/>
                    <use height="10" href="#SupplyCenter" id="sc_ATH" width="10" x="614.5" y="303.4"/>
                    <use height="10" href="#SupplyCenter" id="sc_MAC" width="10" x="604.8" y="243.3"/>
                    <use height="10" href="#SupplyCenter" id="sc_ANT" width="10" x="898.8" y="320.4"/>
                    <use height="10" href="#SupplyCenter" id="sc_SID" transform="translate(4)" width="10" x="902.1" y="361.8"/>
                    <use height="10" href="#SupplyCenter" id="sc_DAM" width="10" x="945.1" y="270.1"/>
                    <use height="10" href="#SupplyCenter" id="sc_NEA" width="10" x="421.2" y="232.7"/>
                    <use height="10" href="#SupplyCenter" id="sc_ROM" width="10" x="350.5" y="163.6"/>
                    <use height="10" href="#SupplyCenter" id="sc_RAV" width="10" x="378.2" y="153.1"/>
                    <use height="10" href="#SupplyCenter" id="sc_SAG" width="10" x="97.9" y="303.4"/>
                    <use height="10" href="#SupplyCenter" id="sc_MAS" width="10" x="257.1" y="155.5"/>
                    <use height="10" href="#SupplyCenter" id="sc_BAL" transform="translate(4,18)" width="10" x="183.2" y="238.4"/>
                    <use height="10" href="#SupplyCenter" id="sc_SAD" width="10" x="301.0" y="277.4"/>
                    <use height="10" href="#SupplyCenter" id="sc_SIC" width="10" x="398.5" y="331.0"/>
                    <use height="10" href="#SupplyCenter" id="sc_VIN" width="10" x="424.5" y="61.3"/>
                    <use height="10" href="#SupplyCenter" id="sc_DAL" width="10" x="455.3" y="139.3"/>
                    <use height="10" href="#SupplyCenter" id="sc_NUM" width="10" x="367.6" y="473.1"/>
                    <use height="10" href="#SupplyCenter" id="sc_LEP" width="10" x="399.3" y="494.3"/>
                    <use height="10" href="#SupplyCenter" id="sc_CYR" transform="translate(0,4)" width="10" x="589.4" y="465"/>
                    <use height="10" href="#SupplyCenter" id="sc_CRE" transform="translate(-4,4)" width="10" x="671.4" y="383"/>
                    <use height="10" href="#SupplyCenter" id="sc_CYP" transform="translate(-2,8)" width="10" x="808.5" y="377"/>
                    <use height="10" href="#SupplyCenter" id="sc_PET" transform="translate(6)" width="10" x="904.5" y="479.6"/>
                    <use height="10" href="#SupplyCenter" id="sc_JER" transform="translate(8,4)" width="10" x="887.5" y="436.6"/>
                    <use height="10" href="#SupplyCenter" id="sc_TYE" width="10" x="898.0" y="393.5"/>
                    <use height="10" href="#SupplyCenter" id="sc_SIP" width="10" x="837.9" y="192.1"/>
                    <use height="10" href="#SupplyCenter" id="sc_CHE" width="10" x="866.4" y="75.9"/>
                    <use height="10" href="#SupplyCenter" id="sc_BYZ" width="10" x="677.9" y="256.2"/>
                    <use height="10" href="#SupplyCenter" id="sc_MIL" transform="translate(4,6)" width="10" x="712" y="309.9"/>
                </g>
                <g id="OrderLayer">
                    <g id="Layer2">{renderedOrders2}</g>
                    <g id="Layer1">{renderedOrders}</g>
                </g>
                <g id="UnitLayer">{renderedUnits}</g>
                <g id="DislodgedUnitLayer">{renderedDislodgedUnits}</g>
                <g id="HighestOrderLayer">{renderedHighestOrders}</g>
                <g className={classes['BriefLabelLayer']} id="BriefLabelLayer">
                    <text x="454.9" y="199">adr</text>
                    <text x="668.5" y="326.5">aeg</text>
                    <text x="757.1" y="513.4">ale</text>
                    <text x="920.2" y="330.1">ant</text>
                    <text x="422.4" y="216.6">apu</text>
                    <text x="995.9" y="396.4">ara</text>
                    <text x="998.3" y="201.5">arm</text>
                    <text x="585.7" y="298">ath</text>
                    <text x="470.3" y="376.9">aus</text>
                    <text x="215.9" y="244.5">bal</text>
                    <text x="664.5" y="645">bay</text>
                    <text x="242" y="307">ber</text>
                    <text x="802.6" y="210.3">bit</text>
                    <text x="825" y="153">bla</text>
                    <text x="720.8" y="252.6">byz</text>
                    <text x="883.8" y="258.3">cap</text>
                    <text x="274.6" y="374.5">car</text>
                    <text x="962" y="39">che</text>
                    <text x="823.7" y="360.7">cil</text>
                    <text x="245.3" y="431.3">cir</text>
                    <text x="320.9" y="212.8">cor</text>
                    <text x="688.8" y="392.3">cre</text>
                    <text x="825" y="390">cyp</text>
                    <text x="599.5" y="499.6">cyr</text>
                    <text x="641.7" y="128.3">dac</text>
                    <text x="486.6" y="173.8">dal</text>
                    <text x="987.8" y="290.8">dam</text>
                    <text x="741.6" y="433.8">egy</text>
                    <text x="545.9" y="258.3">epi</text>
                    <text x="325" y="119">etr</text>
                    <text x="798.5" y="255.9">gal</text>
                    <text x="228" y="60">gau</text>
                    <text x="825.3" y="453.3">gop</text>
                    <text x="512.6" y="489">gos</text>
                    <text x="450" y="440.3">got</text>
                    <text x="120" y="345">ibe</text>
                    <text x="518.2" y="145.4">ill</text>
                    <text x="520" y="290">ion</text>
                    <text x="795.2" y="321.7">isa</text>
                    <text x="905" y="435">jer</text>
                    <text x="433" y="513.4">lep</text>
                    <text x="586.5" y="441.1">lib</text>
                    <text x="268.1" y="204.7">lig</text>
                    <text x="52.8" y="199.8">lus</text>
                    <text x="605.2" y="229.1">mac</text>
                    <text x="562.1" y="587.3">mar</text>
                    <text x="237.2" y="154.3">mas</text>
                    <text x="76.4" y="443.5">mau</text>
                    <text x="749.8" y="575.1">mem</text>
                    <text x="585" y="375.7">mes</text>
                    <text x="715.6" y="311.1">mil</text>
                    <text x="732.7" y="360.2">min</text>
                    <text x="992.6" y="513.4">nab</text>
                    <text x="454.1" y="259.9">nea</text>
                    <text x="327.4" y="474.4">num</text>
                    <text x="934.1" y="500.9">pet</text>
                    <text x="361.5" y="544.2">pha</text>
                    <text x="325" y="325">pun</text>
                    <text x="372" y="151.1">rav</text>
                    <text x="936.6" y="586.5">ree</text>
                    <text x="356" y="45">rha</text>
                    <text x="390.1" y="215.6">rom</text>
                    <text x="86.1" y="298.1">sag</text>
                    <text x="208.8" y="555.6">sah</text>
                    <text x="316" y="259.9">sad</text>
                    <text x="539" y="32">sam</text>
                    <text x="433" y="360">sic</text>
                    <text x="921.2" y="355.2">sid</text>
                    <text x="878.2" y="481.1">sin</text>
                    <text x="905.8" y="200.6">sip</text>
                    <text x="600" y="353">spa</text>
                    <text x="832.6" y="416.7">syr</text>
                    <text x="104" y="242.1">tar</text>
                    <text x="297.3" y="417.5">tha</text>
                    <text x="885.4" y="636">thb</text>
                    <text x="924" y="408">tye</text>
                    <text x="376.9" y="264.8">tyn</text>
                    <text x="395" y="100">ven</text>
                    <text x="417" y="60">vin</text>
                </g>
                <g id="FullLabelLayer" visibility="hidden"/>
                <rect className="currentnoterect" height="40" width="1030" x="0" y="660"/>
                <text className={classes['CurrentNote']} id="CurrentNote" x="10" y="676">{nb_centers_per_power ? nb_centers_per_power : ''}</text>
                <text className={classes['CurrentNote2']} id="CurrentNote2" x="10" y="692">{note ? note : ''}</text>
                <text className={classes['CurrentPhase']} id="CurrentPhase" x="930" y="682">{current_phase}</text>
                <g className={classes['MouseLayer']} id="MouseLayer">
                    <polygon id="adr" onClick={this.onClick} onMouseOver={this.onHover} points="530,249 529,255 523,252 509,252 504,253 500,250 490,245 484,244 460,227 460,222 464,219 465,216 461,214 452,214 446,215 438,213 432,208 425,198 419,184 417,179 414,176 410,170 397,162 389,154 383,140 384,137 388,135 388,131 384,127 385,121 393,115 399,111 406,110 415,111 419,115 419,118 415,118 412,120 413,129 420,139 422,138 425,133 427,130 430,129 433,130 436,135 437,140 441,145 443,148 441,149 439,149 437,151 439,154 445,159 450,161 454,163 454,167 456,169 459,168 463,168 467,171 472,176 476,180 481,182 482,184 480,185 476,184 474,185 476,186 479,187 482,189 485,192 488,193 488,190 491,189 493,192 498,196 501,199 502,201 506,203 511,204 513,203 516,204 515,206 513,206 513,208 515,210 518,214 520,217 523,218 527,219 529,220 530,224 531,232 530,241 530,249"/>
                    <polygon id="aeg" onClick={this.onClick} onMouseOver={this.onHover} points="623,365 628,373 637,381 646,385 652,386 655,388 656,389 659,390 670,387 674,388 683,386 690,379 698,367 703,355 704,342 705,339 709,338 715,335 719,334 720,332 714,332 702,332 699,328 704,327 703,324 694,322 690,316 690,312 692,310 691,305 686,302 684,303 683,305 680,305 679,304 676,304 675,301 678,299 676,296 676,292 678,292 678,294 679,296 682,298 683,294 683,292 682,289 682,283 683,276 680,275 669,277 668,272 668,266 666,265 664,259 665,255 669,253 676,251 677,248 667,249 663,250 658,248 651,249 643,249 635,253 630,256 625,255 625,258 628,259 630,261 637,270 637,272 635,272 628,265 625,265 625,268 630,273 630,274 627,275 622,269 619,269 618,272 625,278 620,279 610,268 613,265 610,262 607,264 604,268 604,275 605,281 611,284 615,287 616,292 612,290 608,291 608,296 614,295 617,299 622,304 628,304 634,309 635,314 639,317 643,318 643,322 641,323 639,321 636,320 634,321 637,331 633,332 629,328 621,326 618,328 616,331 620,337 623,341 623,344 620,345 616,342 614,341 612,343 616,351 619,355 622,360 623,365"/>
                    <polygon id="ale" onClick={this.onClick} onMouseOver={this.onHover} points="659,475 666,476 670,479 673,482 684,482 706,484 725,487 733,488 749,490 763,491 771,491 779,490 786,486 794,480 806,471 808,476 813,477 817,479 821,483 826,489 829,495 832,501 832,506 822,505 816,506 810,508 805,512 799,511 794,518 786,527 780,532 772,532 764,529 762,528 756,528 752,531 744,537 738,538 733,538 727,537 724,536 720,537 715,540 711,545 707,548 703,548 699,544 695,542 689,541 684,540 682,537 681,533 681,528 684,524 686,520 684,515 680,509 676,507 671,507 663,503 661,497 660,492 656,488 656,481 659,475"/>
                    <polygon id="ant" onClick={this.onClick} onMouseOver={this.onHover} points="917,288 930,295 937,301 938,304 935,307 935,311 941,317 949,322 950,332 946,339 944,343 935,341 930,339 925,334 918,335 913,338 907,342 901,342 900,337 897,331 893,327 891,314 893,310 896,307 896,304 893,302 897,298 898,293 904,286 913,281 916,280 917,288"/>
                    <polygon id="apu" onClick={this.onClick} onMouseOver={this.onHover} points="419,184 425,198 433,209 438,213 446,215 453,214 462,214 465,215 465,218 460,222 460,226 465,230 475,237 484,244 491,245 500,249 504,253 508,261 505,268 501,267 494,262 488,258 483,256 480,256 478,257 471,255 468,251 458,246 451,244 441,237 436,235 433,229 429,223 422,218 413,218 407,219 406,209 401,202 400,194 404,188 411,188 419,184"/>
                    <polygon id="ara" onClick={this.onClick} onMouseOver={this.onHover} points="1030,491 1030,364 1024,367 1017,367 1001,359 991,356 985,356 969,365 961,365 952,368 947,373 940,380 940,387 939,392 943,396 943,400 935,412 928,412 924,418 917,419 912,422 917,434 917,444 919,447 920,452 943,454 952,457 964,463 979,464 984,466 988,472 995,477 1001,479 1006,479 1017,490 1030,491"/>
                    <polygon id="arm" onClick={this.onClick} onMouseOver={this.onHover} points="1030,160 1030,263 1024,260 1015,259 1010,254 1006,253 1002,251 996,250 984,251 976,249 968,248 962,250 957,253 951,255 945,257 939,261 934,257 929,254 927,252 926,249 929,246 931,243 931,239 930,237 930,230 934,226 938,221 941,215 942,212 942,207 952,202 955,198 955,189 959,182 969,176 973,171 973,159 982,158 997,158 1004,161 1013,165 1019,164 1030,160"/>
                    <polygon id="ath" onClick={this.onClick} onMouseOver={this.onHover} points="559,295 558,299 552,298 552,301 555,304 561,307 565,313 570,316 576,316 582,315 587,316 600,316 612,320 614,324 618,328 621,326 627,327 632,331 637,332 635,327 634,321 636,319 639,321 641,323 643,322 643,318 640,317 635,314 634,308 629,304 622,303 618,300 616,297 615,295 611,296 608,296 608,290 611,289 613,290 616,291 615,287 611,284 605,280 600,280 594,282 589,287 582,287 577,285 573,286 565,294 559,295"/>
                    <polygon id="aus" onClick={this.onClick} onMouseOver={this.onHover} points="450,326 447,334 445,340 443,346 443,352 445,357 445,362 443,366 439,367 433,368 429,363 427,361 423,360 418,358 411,355 408,353 404,350 404,360 401,371 397,377 391,384 385,391 424,403 448,407 483,412 522,413 523,381 522,363 520,343 513,341 503,338 494,333 483,326 475,318 471,322 469,327 466,329 462,330 458,327 458,326 450,326"/>
                    <polygon id="bal" onClick={this.onClick} onMouseOver={this.onHover} points="204,208 214,213 224,220 233,230 238,239 238,252 237,260 225,273 210,283 194,290 177,293 164,294 139,294 135,288 130,278 127,270 132,263 138,255 139,248 147,243 149,237 154,227 157,227 162,223 172,221 179,220 189,216 196,210 195,253 190,255 186,258 181,260 183,265 187,266 192,270 195,271 198,265 201,260 197,259 195,254 196,210 203,210 204,208"/>
                    <polygon id="bay" onClick={this.onClick} onMouseOver={this.onHover} points="483,660 830,661 830,657 833,655 834,652 834,647 832,644 831,642 831,637 832,633 835,629 839,626 842,623 846,619 847,615 840,612 832,607 825,606 817,612 804,619 795,619 788,612 778,604 772,601 762,601 756,603 752,605 742,605 735,599 729,593 709,593 706,590 698,583 689,582 680,585 673,586 666,587 663,589 655,594 648,600 646,606 644,612 638,616 626,621 618,618 609,616 604,618 598,615 590,612 572,612 564,614 555,614 532,606 527,606 521,611 515,612 508,609 497,606 490,601 485,606 476,611 471,614 467,613 463,613 463,618 464,624 461,632 461,637 466,640 473,644 478,648 483,660"/>
                    <polygon id="ber" onClick={this.onClick} onMouseOver={this.onHover} points="299,291 290,297 283,304 278,314 274,326 273,341 277,352 269,352 260,348 252,348 242,349 236,349 226,348 212,349 210,350 202,350 184,350 176,351 170,353 164,353 159,355 155,348 152,342 144,333 136,328 128,323 121,321 121,314 125,307 133,300 140,295 152,294 167,294 183,292 201,287 217,279 228,270 237,259 250,260 267,260 282,260 297,255 301,258 302,263 305,267 303,270 302,273 302,278 301,284 300,289 299,291"/>
                    <polygon id="bit" onClick={this.onClick} onMouseOver={this.onHover} points="833,173 819,173 814,175 807,179 802,180 793,183 784,189 771,200 763,208 757,215 752,217 745,218 748,222 752,223 755,228 755,232 754,239 757,243 763,249 768,242 772,234 777,230 787,229 798,226 806,220 813,213 815,205 818,200 824,196 828,191 829,186 832,180 833,177 833,173"/>
                    <polygon id="bla" onClick={this.onClick} onMouseOver={this.onHover} points="724,219 729,220 737,220 745,219 757,215 763,208 772,200 784,189 793,183 801,180 808,179 815,174 819,173 833,173 842,174 848,176 849,177 855,177 862,178 876,177 884,178 892,177 896,177 906,173 915,172 921,171 925,171 928,168 933,166 940,160 945,155 947,154 949,148 952,144 953,140 951,137 949,134 948,129 942,125 935,122 927,121 920,119 913,116 906,112 899,111 890,108 883,103 878,100 871,97 864,96 858,95 854,92 852,90 848,89 844,91 841,91 839,89 842,86 842,83 846,83 849,83 854,81 857,74 861,72 862,60 860,58 857,58 852,53 852,52 856,51 859,49 862,43 873,35 873,31 866,31 850,39 846,43 836,49 829,52 819,60 813,66 809,69 806,70 802,73 800,75 802,80 805,81 807,84 809,88 817,88 819,85 824,85 829,81 832,81 835,83 834,86 834,89 833,92 829,93 826,94 823,93 817,95 815,99 810,101 804,105 801,109 797,116 791,115 786,114 783,104 773,101 772,98 768,98 766,99 764,97 766,94 770,93 774,90 779,86 781,83 780,80 774,80 769,80 765,82 761,81 755,82 747,83 743,82 746,77 741,75 737,78 734,78 730,81 718,91 712,98 710,101 709,106 706,112 702,121 695,129 693,136 694,144 696,160 688,168 688,175 683,188 686,192 688,197 693,201 696,205 702,208 706,210 709,214 713,215 718,217 724,219"/>
                    <polygon id="byz" onClick={this.onClick} onMouseOver={this.onHover} points="726,229 730,232 735,234 739,234 741,235 740,237 736,237 723,238 721,239 723,242 725,243 725,244 721,245 717,245 714,246 708,248 704,249 701,248 697,247 696,250 692,253 687,254 681,256 673,261 669,265 667,271 668,277 679,275 683,276 689,276 699,280 710,277 720,281 731,264 738,259 749,260 762,252 763,248 753,239 754,234 756,228 751,223 748,222 746,219 739,220 732,220 728,220 724,218 720,217 714,215 708,213 706,210 696,205 690,204 680,214 679,223 669,234 667,249 677,248 676,251 669,253 665,255 664,259 666,265 668,260 672,257 678,254 682,250 685,244 686,238 688,235 694,232 700,229 704,227 709,227 716,228 720,227 723,225 725,220 728,221 726,229"/>
                    <polygon id="cap" onClick={this.onClick} onMouseOver={this.onHover} points="893,302 897,299 898,294 902,288 908,283 912,280 916,280 918,275 923,274 931,272 937,267 939,262 927,252 926,248 931,244 931,239 930,238 930,231 942,214 943,206 932,210 924,210 917,216 906,217 897,223 877,224 872,231 865,233 855,233 847,231 838,237 837,240 840,244 840,259 846,266 846,270 838,274 834,279 832,285 834,289 839,292 839,303 837,307 837,313 848,324 854,323 863,314 879,314 883,308 888,303 893,302"/>
                    <polygon id="car" onClick={this.onClick} onMouseOver={this.onHover} points="345,384 345,379 345,376 349,372 355,364 357,358 356,354 353,353 348,356 341,356 334,352 329,349 324,348 320,350 313,351 301,351 289,349 280,352 276,352 270,352 260,348 252,347 242,349 236,349 233,362 242,374 242,381 245,386 254,391 261,394 274,393 286,397 297,399 319,396 327,392 333,386 338,384 345,384"/>
                    <polygon id="che" onClick={this.onClick} onMouseOver={this.onHover} points="1030,160 1030,0 646,1 658,8 667,18 673,38 676,51 684,54 691,61 691,66 689,72 691,78 698,89 709,101 711,98 719,90 728,83 734,78 737,77 740,76 746,76 745,79 743,81 744,83 750,83 756,82 760,81 765,82 768,80 774,80 780,79 781,82 779,86 772,91 766,94 764,97 766,99 769,98 771,98 772,101 778,103 783,103 784,109 786,114 791,116 797,115 800,110 804,105 810,101 815,99 817,95 823,93 826,93 829,92 833,92 834,89 834,85 835,83 832,82 829,81 827,83 824,85 819,85 817,88 813,88 809,88 807,83 805,80 802,80 801,75 805,70 810,69 814,65 819,60 823,57 829,52 834,50 839,48 845,44 849,39 856,36 860,34 866,31 873,31 873,35 868,39 862,43 860,49 855,51 852,51 851,53 854,55 857,57 860,58 861,59 862,65 861,72 858,74 854,80 850,82 842,83 843,85 839,89 841,91 844,91 848,90 851,90 855,93 861,96 871,97 879,101 889,107 900,111 906,112 915,117 920,119 928,121 935,122 942,125 947,129 950,134 953,140 953,143 950,147 954,149 966,157 972,159 981,158 998,158 1013,165 1018,165 1030,160"/>
                    <polygon id="cil" onClick={this.onClick} onMouseOver={this.onHover} points="902,353 889,354 877,357 865,360 852,366 844,370 838,376 832,376 819,376 818,380 814,380 811,381 807,384 801,385 781,391 767,394 756,395 762,383 766,372 766,355 764,346 770,345 772,339 775,332 778,329 784,329 794,330 799,333 804,334 810,336 817,339 824,340 829,338 834,337 838,334 843,328 846,324 849,324 855,322 863,315 874,314 880,314 884,308 888,303 893,303 896,304 897,307 893,310 891,313 892,317 893,326 897,330 900,336 902,347 902,353"/>
                    <polygon id="cir" onClick={this.onClick} onMouseOver={this.onHover} points="245,386 261,394 270,394 276,393 286,397 280,405 280,414 280,422 277,428 278,433 282,438 280,439 280,446 288,458 295,460 297,463 299,470 305,473 306,479 300,479 291,483 283,482 277,483 267,491 257,488 249,483 243,476 235,473 227,474 222,475 217,474 216,466 208,454 206,440 212,430 207,416 207,409 214,398 224,390 245,386"/>
                    <polygon id="cor" onClick={this.onClick} onMouseOver={this.onHover} points="327,193 328,194 328,200 327,203 328,205 328,210 328,215 326,218 325,222 325,227 323,231 320,234 318,234 315,233 311,231 311,230 312,228 312,226 309,226 309,224 310,222 311,220 308,219 308,217 310,216 310,214 308,213 310,209 311,206 315,205 319,205 323,204 324,203 324,196 327,193"/>
                    <polygon id="cre" onClick={this.onClick} onMouseOver={this.onHover} points="659,390 664,389 670,387 674,388 683,385 684,389 687,390 691,389 695,388 698,389 701,387 703,387 704,390 701,393 694,393 690,394 686,395 681,398 674,399 671,397 648,396 645,393 645,387 647,386 652,386 655,387 656,389 659,390"/>
                    <polygon id="cyp" onClick={this.onClick} onMouseOver={this.onHover} points="819,376 819,380 815,380 810,381 808,383 805,385 801,385 801,387 804,393 810,396 816,397 820,397 823,395 825,393 829,392 830,390 832,388 835,388 841,387 841,386 838,383 838,381 842,378 847,372 852,366 844,371 838,376 829,376 823,376 819,376"/>
                    <polygon id="cyr" onClick={this.onClick} onMouseOver={this.onHover} points="659,476 647,474 632,472 621,464 606,462 592,464 579,471 572,477 567,486 566,494 569,501 572,507 571,513 568,520 563,528 558,534 549,538 545,539 548,561 559,561 568,556 579,549 587,543 592,543 597,539 603,535 629,535 636,538 644,541 647,549 653,553 660,554 665,556 668,562 672,558 678,555 683,552 684,540 682,535 681,528 686,521 683,511 678,507 672,507 663,503 661,497 658,490 655,486 659,476"/>
                    <polygon id="dac" onClick={this.onClick} onMouseOver={this.onHover} points="709,100 697,88 690,75 689,70 691,63 691,60 685,54 676,50 671,52 669,58 663,62 656,63 647,60 628,60 619,63 613,68 604,79 598,85 586,85 573,87 558,102 544,101 537,104 532,119 541,123 548,135 555,146 564,154 574,155 582,158 585,165 600,179 600,185 597,193 597,197 600,201 607,201 615,204 623,204 632,201 642,199 648,203 654,211 666,213 671,219 679,223 680,215 684,208 690,205 696,204 688,197 686,192 683,188 686,180 688,176 687,168 696,160 693,137 694,130 702,121 706,112 709,106 709,100"/>
                    <polygon id="dal" onClick={this.onClick} onMouseOver={this.onHover} points="443,105 433,104 430,99 421,93 416,91 412,92 412,98 407,105 407,110 412,111 415,111 419,115 419,118 415,118 412,121 412,129 420,138 423,137 427,129 430,129 433,131 436,136 436,139 443,149 439,149 437,151 439,155 454,164 454,167 456,169 459,168 463,169 467,171 473,177 476,180 481,182 482,184 480,184 476,184 475,185 477,187 480,188 483,190 485,192 488,193 488,190 491,190 493,193 501,198 502,201 510,205 513,203 516,204 515,205 513,206 513,208 516,212 518,214 520,217 523,218 529,220 531,226 533,224 537,223 541,228 549,228 553,214 553,210 549,206 543,197 538,188 533,181 528,177 524,179 518,175 518,167 511,161 506,159 501,155 492,152 487,148 482,140 481,134 473,132 465,128 459,123 457,118 456,114 450,108 443,105"/>
                    <polygon id="dam" onClick={this.onClick} onMouseOver={this.onHover} points="1030,365 1030,263 1025,260 1015,259 1010,254 1007,254 1002,251 997,250 990,251 983,251 977,249 968,248 962,250 957,254 950,255 945,258 939,261 938,266 931,272 923,275 917,276 915,281 917,288 926,293 930,295 938,302 937,305 936,308 936,312 949,323 950,331 947,338 943,343 949,349 952,358 952,369 959,366 969,365 978,361 985,356 992,357 1001,359 1011,364 1017,367 1023,367 1030,365"/>
                    <polygon id="egy" onClick={this.onClick} onMouseOver={this.onHover} points="684,482 694,483 707,484 718,486 727,487 736,489 748,490 762,490 770,491 778,490 784,487 793,481 794,459 795,445 799,431 803,419 812,403 816,397 809,396 804,393 801,388 801,385 789,388 777,392 763,394 745,395 727,395 702,392 693,393 688,394 684,397 680,399 676,399 681,411 688,432 688,442 687,467 684,482"/>
                    <polygon id="epi" onClick={this.onClick} onMouseOver={this.onHover} points="559,295 563,295 567,293 573,286 577,286 579,277 579,269 573,263 570,261 569,255 565,252 561,250 562,244 561,240 561,236 555,232 553,231 548,227 541,228 537,223 534,223 531,226 530,249 529,254 529,263 535,271 539,279 542,288 545,293 548,296 551,295 552,293 553,294 555,295 559,295"/>
                    <polygon id="etr" onClick={this.onClick} onMouseOver={this.onHover} points="344,164 349,161 353,156 359,156 357,147 349,139 350,133 351,124 342,119 341,115 343,105 326,101 320,105 314,111 305,112 295,121 296,131 292,139 291,148 293,154 296,154 297,153 300,155 301,158 304,154 315,148 322,148 326,149 339,158 344,164"/>
                    <polygon id="gal" onClick={this.onClick} onMouseOver={this.onHover} points="775,231 769,240 763,248 762,252 750,259 738,260 732,264 720,280 725,282 728,282 734,280 740,280 744,287 752,292 751,299 761,305 765,303 769,303 775,306 783,306 787,299 796,298 803,289 807,288 813,291 819,288 826,287 832,285 836,276 840,273 846,270 846,266 840,260 839,253 840,245 837,240 837,238 839,237 838,233 835,229 829,225 828,214 826,209 822,206 816,204 814,211 810,217 801,224 794,227 784,229 775,231"/>
                    <polygon id="gau" onClick={this.onClick} onMouseOver={this.onHover} points="120,173 123,169 126,143 127,128 127,122 126,119 128,116 129,113 130,109 127,105 126,100 120,93 120,90 115,87 119,82 116,79 115,76 110,75 98,67 92,65 82,63 82,53 86,47 90,44 96,47 99,47 105,45 112,45 116,47 126,41 126,34 125,27 125,20 128,17 131,18 135,23 139,28 144,29 147,24 151,18 156,16 172,15 178,11 182,0 299,1 299,6 303,11 303,15 299,21 299,26 302,30 306,31 306,38 310,44 316,46 316,52 314,57 310,60 310,64 311,71 302,78 295,85 295,94 282,95 274,101 266,111 249,117 246,123 239,131 226,130 219,128 216,135 212,140 210,146 206,151 201,151 195,161 182,163 174,159 168,164 168,176 172,185 163,182 147,183 138,179 129,179 123,177 120,173"/>
                    <polygon id="gop" onClick={this.onClick} onMouseOver={this.onHover} points="793,480 806,471 814,467 824,465 830,465 836,466 841,467 847,469 856,470 862,467 868,466 875,461 882,457 886,454 891,446 894,439 895,429 881,430 867,431 839,431 822,429 801,426 797,438 794,454 793,480"/>
                    <polygon id="gos" onClick={this.onClick} onMouseOver={this.onHover} points="572,477 553,470 538,466 522,464 508,463 491,464 474,467 458,471 443,477 435,481 429,487 435,489 442,491 450,496 454,499 456,505 461,511 470,517 478,521 488,523 496,524 507,528 519,532 528,537 537,538 545,539 552,538 558,533 567,523 571,515 572,506 569,500 566,494 567,486 570,481 572,477"/>
                    <polygon id="got" onClick={this.onClick} onMouseOver={this.onHover} points="385,391 415,400 442,406 473,411 498,412 522,413 520,437 514,464 490,464 470,467 453,472 440,479 429,486 418,484 408,483 398,480 389,476 381,472 376,472 368,466 361,459 356,457 349,450 341,443 337,438 336,434 340,427 344,423 347,421 350,412 353,409 355,404 365,401 374,396 385,391"/>
                    <polygon id="ibe" onClick={this.onClick} onMouseOver={this.onHover} points="121,321 132,325 143,332 153,343 158,356 146,365 132,372 121,374 110,378 103,380 98,384 90,379 85,380 75,380 68,377 63,377 47,370 32,367 25,361 23,354 18,354 15,356 13,362 0,379 0,324 6,325 11,332 14,343 18,347 24,348 31,342 36,342 48,334 55,334 63,337 71,338 90,339 103,326 108,326 115,323 121,321"/>
                    <polygon id="ill" onClick={this.onClick} onMouseOver={this.onHover} points="478,88 469,87 465,88 456,88 450,86 450,96 447,101 441,104 448,107 456,113 458,122 463,128 471,132 480,135 483,143 488,150 499,155 507,160 513,162 518,166 518,175 523,179 529,178 534,181 542,193 550,207 553,210 553,215 549,228 552,231 557,232 562,236 571,228 582,226 583,214 586,210 593,206 599,201 597,197 597,191 600,185 600,180 592,172 585,164 582,158 574,155 564,154 559,151 553,143 548,134 542,124 535,120 528,118 519,116 514,117 509,114 505,113 501,107 498,99 488,98 484,93 481,89 478,88"/>
                    <polygon id="ion" onClick={this.onClick} onMouseOver={this.onHover} points="552,345 531,345 521,344 507,340 495,334 484,327 475,318 476,314 476,308 478,303 482,301 485,297 484,290 479,285 475,283 474,280 472,275 474,272 475,266 476,260 480,256 484,257 490,259 497,264 501,267 505,268 508,261 505,253 510,252 522,252 529,255 529,263 532,268 536,273 539,278 541,285 545,293 549,296 551,295 551,293 553,293 555,295 559,294 558,299 554,298 552,298 552,301 555,303 559,305 562,307 566,314 571,316 577,316 582,315 587,316 594,317 601,316 607,318 612,320 614,324 612,324 609,323 605,323 601,322 595,321 592,321 588,319 584,320 579,322 577,326 577,332 579,336 569,341 552,345"/>
                    <polygon id="isa" onClick={this.onClick} onMouseOver={this.onHover} points="848,324 842,318 837,313 838,306 839,299 839,292 833,288 832,285 827,287 820,288 813,291 807,289 803,288 795,298 787,298 785,303 783,306 775,306 769,303 763,304 761,305 761,312 764,314 769,315 769,319 773,322 777,324 780,329 785,329 793,330 799,333 805,334 813,337 818,339 823,340 829,338 835,337 838,334 843,328 846,325 848,324"/>
                    <polygon id="jer" onClick={this.onClick} onMouseOver={this.onHover} points="886,454 892,459 900,474 905,472 913,471 919,474 919,462 918,458 920,452 920,447 917,444 917,435 912,422 911,416 908,414 904,416 896,416 895,428 894,437 891,446 886,454"/>
                    <polygon id="lep" onClick={this.onClick} onMouseOver={this.onHover} points="428,486 420,484 412,483 406,483 398,480 397,485 393,490 386,494 379,495 369,496 364,498 367,503 367,509 366,514 370,516 381,516 388,517 397,521 408,524 421,527 427,537 435,549 444,552 450,554 457,560 462,568 472,569 478,567 485,565 494,564 496,566 500,567 510,572 528,571 533,566 540,562 548,561 548,555 546,548 545,539 538,538 530,537 519,533 508,528 496,524 488,522 478,522 473,519 466,515 461,511 456,505 454,499 449,495 442,491 435,489 428,486"/>
                    <polygon id="lib" onClick={this.onClick} onMouseOver={this.onHover} points="676,400 681,411 687,429 689,442 688,459 687,470 684,482 673,482 669,478 664,476 658,475 646,474 631,472 625,467 621,464 610,462 598,462 589,464 579,470 572,477 558,472 540,466 524,464 513,464 518,445 521,427 522,413 536,413 563,412 590,408 620,404 647,396 671,397 674,400 676,400"/>
                    <polygon id="lig" onClick={this.onClick} onMouseOver={this.onHover} points="348,180 346,173 344,163 338,158 326,149 319,147 315,148 310,151 305,154 301,158 294,163 288,165 280,169 272,176 256,176 254,174 249,175 245,172 240,171 235,173 228,170 214,174 212,175 206,179 203,188 207,197 207,204 204,208 213,213 221,218 228,225 233,230 237,239 238,252 237,259 250,260 278,260 290,258 297,255 297,249 297,248 298,248 306,248 311,245 318,241 319,235 311,232 311,230 311,229 311,226 310,226 309,224 310,221 308,219 308,217 310,216 311,214 308,213 311,206 315,205 322,204 324,204 325,196 327,193 327,189 331,185 336,182 341,180 348,180"/>
                    <polygon id="lus" onClick={this.onClick} onMouseOver={this.onHover} points="119,174 112,175 102,174 86,174 77,172 70,168 55,166 48,167 29,166 16,167 5,162 0,161 0,296 10,294 18,286 28,283 46,272 54,273 61,268 58,258 67,245 66,235 70,233 75,226 82,223 99,213 103,213 112,204 126,203 134,195 144,189 147,182 136,179 128,179 119,174"/>
                    <polygon id="mac" onClick={this.onClick} onMouseOver={this.onHover} points="610,262 613,264 611,267 613,270 616,273 620,278 625,278 618,272 618,269 622,269 627,275 630,274 630,273 624,268 625,265 628,265 635,272 637,272 637,269 630,262 628,259 625,258 625,256 628,256 631,255 634,253 638,252 642,249 648,249 653,248 657,248 662,250 667,249 669,235 678,226 679,223 672,220 664,212 654,212 648,203 643,199 638,199 625,204 614,204 607,201 600,201 588,209 582,214 581,227 572,227 561,236 562,244 561,250 568,254 570,261 578,269 579,276 576,285 582,287 589,287 593,283 599,280 605,280 604,273 604,268 606,265 610,262"/>
                    <polygon id="mar" onClick={this.onClick} onMouseOver={this.onHover} points="643,612 647,603 654,594 666,587 666,581 664,575 663,568 668,562 666,557 662,555 654,553 648,549 645,543 637,538 629,535 603,534 594,542 587,544 576,552 561,561 548,561 541,562 535,565 528,571 510,572 502,569 495,566 494,569 489,578 486,584 488,591 490,598 490,602 498,606 506,609 517,612 521,611 525,606 532,606 541,609 550,613 556,614 565,614 573,612 588,612 597,614 603,618 609,616 619,618 625,622 629,621 636,617 643,612"/>
                    <polygon id="mas" onClick={this.onClick} onMouseOver={this.onHover} points="203,188 206,179 212,175 220,172 228,170 236,173 240,171 245,172 249,174 254,174 256,176 265,177 272,176 280,170 287,165 294,163 301,158 300,154 297,153 294,154 292,150 291,141 293,134 296,131 295,121 306,112 302,107 297,106 295,95 282,94 274,101 266,111 249,117 245,124 239,131 219,129 216,135 211,140 211,145 206,151 201,151 195,162 182,163 175,159 172,160 169,165 168,178 171,184 193,190 203,188"/>
                    <polygon id="mau" onClick={this.onClick} onMouseOver={this.onHover} points="0,379 8,368 13,363 14,356 18,353 23,354 26,361 32,367 47,370 62,377 68,377 74,380 84,380 88,379 98,384 103,380 110,378 121,373 131,372 147,365 159,355 170,353 176,350 209,350 213,348 237,349 233,363 243,374 242,381 245,386 227,389 224,390 216,397 207,408 207,415 212,430 207,439 207,453 216,465 217,474 202,472 195,472 188,476 181,478 169,479 164,482 157,490 150,498 139,498 131,497 125,495 115,499 105,504 95,504 85,499 75,495 65,499 47,505 38,512 24,523 12,524 0,525 0,379"/>
                    <polygon id="mem" onClick={this.onClick} onMouseOver={this.onHover} points="847,614 852,613 855,612 858,609 859,604 860,602 861,601 861,599 860,595 859,590 856,588 853,586 852,584 852,580 853,579 853,575 852,572 850,567 848,564 847,562 847,559 848,557 849,553 848,552 845,553 842,554 838,553 833,548 829,540 826,533 826,529 827,526 829,523 829,521 828,519 829,515 831,512 832,509 832,506 815,505 809,508 805,512 799,511 779,533 772,532 763,528 755,529 749,533 740,539 731,539 725,537 721,537 714,542 708,548 703,548 697,543 693,541 685,540 683,552 677,556 668,562 663,568 664,575 666,581 666,587 673,586 688,582 697,583 709,593 729,594 742,605 750,605 763,601 772,602 780,606 796,619 803,619 815,614 826,607 833,608 840,612 847,614"/>
                    <polygon id="mes" onClick={this.onClick} onMouseOver={this.onHover} points="522,413 566,412 600,407 626,403 648,397 645,393 645,388 647,386 639,382 631,375 622,365 619,363 616,360 614,357 608,358 608,362 607,365 602,364 600,359 595,355 593,356 592,362 588,361 585,356 587,346 579,337 565,341 553,345 529,345 520,344 522,364 523,382 522,413"/>
                    <polygon id="mil" onClick={this.onClick} onMouseOver={this.onHover} points="741,281 733,280 727,282 723,281 720,281 710,278 699,280 688,276 683,276 682,284 682,289 683,293 681,298 679,296 678,292 676,292 676,296 678,299 674,301 676,303 678,303 680,305 683,305 684,303 686,302 691,305 691,309 690,312 690,316 693,322 703,324 704,327 699,329 702,332 714,332 720,333 719,334 715,335 709,338 705,339 704,342 708,342 712,341 715,341 715,344 718,343 718,340 720,338 731,339 735,344 740,348 747,348 754,347 756,348 758,348 764,346 770,346 775,332 779,329 777,324 769,319 768,316 761,312 761,305 752,300 752,297 753,291 747,288 744,286 741,281"/>
                    <polygon id="min" onClick={this.onClick} onMouseOver={this.onHover} points="703,392 722,395 744,395 756,395 763,380 766,371 766,355 764,345 759,348 757,348 754,347 748,348 740,348 735,344 731,338 722,338 720,338 718,340 717,343 715,344 715,341 712,341 708,342 704,342 704,355 699,368 691,378 684,385 684,389 687,390 691,388 695,388 698,389 701,386 703,387 704,389 703,392"/>
                    <polygon id="nab" onClick={this.onClick} onMouseOver={this.onHover} points="1030,661 1030,491 1018,491 1006,480 1001,479 994,476 985,467 979,464 964,463 950,456 942,453 920,453 919,458 919,463 919,473 923,474 930,480 936,482 943,485 952,494 959,504 958,512 953,520 941,531 926,541 932,547 936,549 939,554 944,562 950,566 958,574 967,579 973,583 979,589 985,600 987,610 993,615 1000,620 1003,625 1004,632 1006,637 1013,647 1022,654 1030,661"/>
                    <polygon id="nea" onClick={this.onClick} onMouseOver={this.onHover} points="399,235 401,229 404,226 405,222 407,220 413,218 422,218 429,223 436,234 451,244 458,246 469,252 471,255 478,257 476,260 475,268 474,272 471,275 473,280 476,284 479,285 484,290 485,297 482,301 478,303 476,307 476,315 475,319 471,322 469,327 466,330 462,330 458,327 459,323 460,319 461,313 463,309 465,304 464,297 463,290 461,285 459,281 455,275 452,272 445,268 440,264 437,258 431,254 426,253 420,250 415,243 413,239 407,237 399,235"/>
                    <polygon id="num" onClick={this.onClick} onMouseOver={this.onHover} points="337,439 340,442 347,448 357,457 360,458 365,464 372,468 376,472 381,472 389,476 398,480 396,487 388,493 378,496 368,496 363,497 354,500 346,497 335,488 319,487 313,482 306,479 306,474 298,469 297,463 295,459 289,458 280,447 280,438 283,438 291,441 306,442 320,447 333,439 337,439"/>
                    <polygon id="pet" onClick={this.onClick} onMouseOver={this.onHover} points="906,527 912,530 919,535 926,542 936,535 948,525 957,516 959,510 959,504 952,494 943,485 936,483 930,481 923,474 919,473 914,471 908,471 900,473 901,478 903,487 903,492 904,493 905,499 905,505 905,513 906,518 906,527"/>
                    <polygon id="pha" onClick={this.onClick} onMouseOver={this.onHover} points="464,613 470,614 475,612 483,607 491,601 489,596 487,588 487,582 491,574 495,566 493,564 472,568 462,568 456,559 449,554 443,550 435,549 428,537 420,527 406,524 395,520 386,516 369,515 366,513 366,509 368,503 363,497 356,500 352,500 345,496 334,488 317,487 311,481 306,479 299,479 293,482 285,483 279,483 267,491 270,500 278,507 291,509 296,510 314,526 320,540 328,553 339,556 354,564 365,564 369,563 376,572 389,584 397,583 418,598 425,598 433,597 440,598 448,601 456,607 464,613"/>
                    <polygon id="pun" onClick={this.onClick} onMouseOver={this.onHover} points="277,352 274,342 274,326 277,315 281,307 290,297 299,291 301,292 303,299 309,304 313,303 314,298 316,296 323,298 326,295 327,285 351,288 366,293 379,301 389,311 400,329 396,330 392,330 389,332 386,336 388,341 399,346 404,350 404,361 400,372 394,382 385,390 371,398 355,404 352,397 349,390 345,384 344,379 345,376 350,371 354,364 357,358 356,354 353,353 350,355 347,357 341,356 335,352 330,349 323,349 320,351 312,352 301,351 295,350 289,349 284,351 280,352 277,352"/>
                    <polygon id="rav" onClick={this.onClick} onMouseOver={this.onHover} points="419,185 417,179 414,176 410,171 404,166 397,162 389,154 385,144 383,140 384,137 388,135 388,131 384,127 385,121 373,121 368,124 363,132 358,134 351,132 349,138 355,145 359,155 365,157 371,165 377,168 382,178 391,185 400,195 404,188 411,188 419,185"/>
                    <polygon id="ree" onClick={this.onClick} onMouseOver={this.onHover} points="1030,661 972,661 967,652 963,646 959,641 956,633 952,622 948,619 941,614 933,610 928,605 923,596 922,592 921,589 914,585 912,581 912,578 907,575 903,574 893,560 888,555 888,551 887,546 883,542 881,536 878,532 868,524 862,518 857,510 855,504 852,501 849,498 847,493 847,488 849,487 851,488 854,492 860,498 863,503 869,508 872,514 877,519 880,520 885,527 888,530 891,531 893,533 896,535 898,534 900,529 900,523 899,514 899,507 900,499 901,493 903,492 904,494 905,499 905,507 905,518 906,528 911,529 916,532 920,536 924,540 928,544 932,547 936,549 942,558 944,562 949,565 953,569 958,573 963,577 967,580 973,583 978,589 983,597 985,601 987,611 992,614 998,619 1002,623 1003,628 1005,635 1008,640 1014,647 1021,653 1030,661"/>
                    <polygon id="rha" onClick={this.onClick} onMouseOver={this.onHover} points="299,0 424,1 421,4 421,9 424,13 424,16 420,21 419,30 416,34 408,37 403,38 399,40 396,46 392,47 389,51 390,56 391,62 389,66 386,71 388,76 389,81 381,82 377,83 374,86 370,90 362,94 357,95 353,93 349,93 346,96 344,100 343,105 339,104 333,103 327,102 322,102 319,106 312,112 305,112 303,108 297,106 295,95 294,86 302,78 312,71 310,65 310,60 314,57 316,53 316,46 310,44 307,39 306,31 302,30 299,26 299,21 303,16 303,12 299,5 299,0"/>
                    <polygon id="rom" onClick={this.onClick} onMouseOver={this.onHover} points="399,235 401,229 404,226 405,222 407,220 406,209 401,202 400,194 388,182 384,180 379,171 376,168 372,166 366,158 363,156 360,156 353,155 350,161 344,163 346,173 348,180 362,198 364,202 367,204 374,211 382,221 390,228 399,235"/>
                    <polygon id="sag" onClick={this.onClick} onMouseOver={this.onHover} points="132,262 128,270 131,282 140,294 134,299 126,307 122,314 121,321 114,322 109,325 103,326 91,339 83,339 73,339 64,336 55,333 48,334 40,338 37,341 32,342 27,344 24,348 19,347 14,343 11,330 6,325 0,324 1,296 10,295 18,286 28,284 46,272 54,273 62,268 68,266 76,266 86,260 109,260 114,258 125,259 132,262"/>
                    <polygon id="sah" onClick={this.onClick} onMouseOver={this.onHover} points="0,526 22,524 42,508 74,495 95,503 105,504 126,495 139,498 149,498 161,485 169,479 181,479 196,472 207,471 216,474 224,475 232,472 237,473 247,480 256,488 267,491 270,500 278,507 293,509 298,512 306,519 314,527 320,540 328,553 340,557 354,564 363,564 369,563 378,575 389,583 397,583 418,598 425,598 432,597 442,598 449,602 463,613 462,617 464,623 461,631 461,636 470,642 476,645 481,653 483,660 0,661 0,526"/>
                    <polygon id="sad" onClick={this.onClick} onMouseOver={this.onHover} points="319,240 323,243 329,249 331,254 331,258 330,260 329,267 330,269 330,273 329,278 327,285 327,290 326,295 324,298 319,297 316,295 314,298 314,303 309,304 306,302 303,299 302,295 301,292 299,291 301,287 302,282 302,274 304,267 302,263 301,258 297,255 296,249 297,248 299,248 304,248 309,247 313,244 319,240"/>
                    <polygon id="sam" onClick={this.onClick} onMouseOver={this.onHover} points="424,0 645,0 655,6 660,9 666,17 671,31 676,50 671,52 670,58 664,62 658,63 651,62 646,60 628,60 621,62 615,66 607,75 598,85 592,85 580,86 572,88 567,92 558,102 550,102 543,101 537,104 534,110 532,119 519,116 514,117 509,114 505,114 502,108 498,99 488,98 482,89 477,88 469,87 466,88 455,88 451,86 449,78 455,71 454,66 457,60 456,57 455,54 446,47 440,45 433,37 419,36 414,35 419,29 419,20 424,15 421,10 421,4 424,0"/>
                    <polygon id="sic" onClick={this.onClick} onMouseOver={this.onHover} points="450,324 450,328 447,334 445,341 443,346 443,352 445,357 445,363 443,366 439,367 434,368 430,365 427,361 423,360 415,357 409,354 404,349 399,346 394,344 388,341 386,336 389,332 393,330 397,330 401,329 408,330 415,331 424,331 428,329 432,327 438,327 443,325 450,324"/>
                    <polygon id="sid" onClick={this.onClick} onMouseOver={this.onHover} points="912,384 906,384 904,383 901,382 900,375 901,370 904,366 905,361 905,358 902,353 901,343 905,342 907,341 914,338 919,335 925,335 930,338 936,342 943,343 947,347 951,353 952,361 952,369 948,373 943,377 940,380 935,380 930,379 928,378 924,377 919,380 912,384"/>
                    <polygon id="sin" onClick={this.onClick} onMouseOver={this.onHover} points="886,455 891,458 896,467 900,475 902,484 903,493 901,493 900,497 899,505 899,514 900,523 899,530 897,534 895,535 892,532 889,531 885,527 881,523 879,521 877,519 873,515 870,511 866,506 862,501 858,496 854,491 851,488 849,487 849,485 847,483 843,482 840,481 837,480 839,479 840,477 840,474 840,471 841,469 842,467 847,469 854,470 857,470 861,468 865,466 869,466 874,463 878,459 882,457 886,455"/>
                    <polygon id="sip" onClick={this.onClick} onMouseOver={this.onHover} points="906,173 913,172 920,171 925,171 928,168 932,167 938,162 944,156 948,152 950,147 953,148 958,151 965,156 973,159 973,170 970,175 964,180 960,183 955,189 955,198 952,202 947,204 939,207 930,210 924,210 918,216 912,216 905,218 898,223 892,224 877,224 874,228 872,232 864,233 856,233 847,232 843,234 838,237 837,233 829,225 828,213 824,207 816,205 818,201 824,197 828,191 828,186 832,178 833,172 842,173 846,175 849,177 853,177 866,178 877,178 886,179 892,177 897,177 906,173"/>
                    <polygon id="spa" onClick={this.onClick} onMouseOver={this.onHover} points="579,336 583,341 587,346 586,351 585,355 588,361 592,362 592,360 593,356 594,355 597,357 600,359 603,364 607,366 608,362 608,358 612,357 614,357 616,360 619,363 622,365 622,360 619,354 615,348 611,343 613,341 616,342 620,344 623,344 624,342 619,336 616,331 618,328 614,324 608,323 605,323 599,321 593,321 587,319 582,320 577,324 576,328 577,332 579,336"/>
                    <polygon id="syr" onClick={this.onClick} onMouseOver={this.onHover} points="895,428 895,416 896,408 896,403 898,400 897,392 900,388 900,382 900,374 901,370 904,365 905,359 902,353 887,355 872,358 853,365 846,374 841,380 839,381 838,382 839,384 841,386 841,387 838,388 834,388 831,389 830,391 826,393 823,395 821,397 816,397 811,404 804,417 800,426 812,428 828,430 846,431 862,431 876,430 895,428"/>
                    <polygon id="tar" onClick={this.onClick} onMouseOver={this.onHover} points="132,262 125,259 115,259 108,260 86,260 76,265 68,265 61,268 58,259 67,245 67,236 71,233 75,226 82,224 98,213 104,213 112,204 127,203 134,195 144,189 148,183 162,182 171,184 195,190 203,188 207,198 207,204 203,210 195,210 189,216 179,220 162,223 157,227 154,228 149,236 147,242 140,249 138,256 132,262"/>
                    <polygon id="tha" onClick={this.onClick} onMouseOver={this.onHover} points="337,438 336,434 340,428 345,422 348,420 349,416 351,412 354,408 355,404 352,397 349,390 345,384 338,384 332,388 327,392 319,397 310,398 299,400 287,397 280,404 279,415 280,422 278,429 279,434 282,437 289,441 305,442 311,444 321,447 326,444 333,439 337,438"/>
                    <polygon id="thb" onClick={this.onClick} onMouseOver={this.onHover} points="972,661 832,661 832,657 834,656 835,654 835,649 835,646 833,644 832,637 833,633 836,630 840,627 844,622 847,619 848,615 850,615 853,614 856,612 860,609 860,604 861,603 862,603 863,599 862,596 861,591 858,588 855,586 854,585 853,582 854,580 855,577 855,574 852,568 850,564 848,562 848,559 850,558 851,555 851,552 848,550 845,551 842,552 839,552 836,549 832,544 830,539 828,535 827,530 829,527 831,523 830,520 830,518 830,515 832,513 833,511 834,506 834,502 832,499 832,497 831,495 832,492 832,489 832,485 834,482 835,482 837,482 841,482 846,483 848,486 849,488 848,489 848,493 849,497 851,501 854,503 856,507 859,515 868,524 875,529 877,532 881,537 883,541 887,546 888,551 888,555 903,574 909,576 912,578 912,582 914,586 921,589 925,600 930,607 935,611 940,614 946,618 952,622 955,631 959,641 963,647 972,661"/>
                    <polygon id="tye" onClick={this.onClick} onMouseOver={this.onHover} points="896,416 896,403 898,399 898,392 899,389 900,382 904,382 906,384 912,384 917,380 924,377 928,378 935,380 940,380 940,385 939,388 940,393 944,396 943,400 935,412 928,412 923,419 916,419 912,422 911,416 908,414 905,416 896,416"/>
                    <polygon id="tyn" onClick={this.onClick} onMouseOver={this.onHover} points="348,180 340,180 334,183 328,189 327,193 328,195 327,201 327,203 328,205 328,215 325,218 325,226 323,231 321,233 319,234 319,241 323,243 329,249 331,253 331,259 329,260 329,268 331,272 327,285 345,286 356,289 368,294 378,300 388,310 401,329 417,331 424,332 432,327 438,327 443,325 450,324 451,326 458,326 461,312 465,304 463,290 460,284 459,280 456,276 453,273 444,268 440,264 437,258 431,254 420,251 414,240 408,237 399,235 390,227 380,218 370,207 368,204 365,203 363,198 357,191 348,180"/>
                    <polygon id="ven" onClick={this.onClick} onMouseOver={this.onHover} points="407,110 399,111 393,114 385,120 380,121 372,121 367,124 365,128 364,133 357,134 350,132 350,125 346,122 341,118 341,114 343,111 343,106 344,99 349,94 354,94 358,95 371,90 376,82 388,81 392,81 404,88 408,88 412,93 412,98 407,105 407,110"/>
                    <polygon id="vin" onClick={this.onClick} onMouseOver={this.onHover} points="432,37 439,46 455,54 457,63 455,71 449,77 450,86 450,95 446,102 442,105 433,104 431,101 428,97 422,93 416,91 411,92 408,88 403,88 397,85 393,82 389,81 386,71 390,63 389,51 392,47 395,46 400,40 407,38 415,34 419,36 432,37"/>
                </g>
            </svg>
        );
    }
}
SvgAncMed.propTypes = {
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
