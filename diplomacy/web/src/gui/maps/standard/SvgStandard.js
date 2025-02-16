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
/** Generated with parameters: Namespace(input='src/diplomacy/maps/svg/standard.svg', name='SvgStandard', output='src/gui/maps/standard/') **/
import React from "react";
import PropTypes from "prop-types";
import "./SvgStandard.css";
import { Coordinates, SymbolSizes, Colors } from "./SvgStandardMetadata";
import { getClickedID, parseLocation, setInfluence, setInfluenceLightBackground } from "../common/common";
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

export class SvgStandard extends React.Component {
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
        const COUNTRIES = ["Austria", "England", "France", "Germany", "Italy", "Russia", "Turkey"];

        /* Get correct naming of province*/
        if (phaseType === "M") {
            /* MOVEMENT PHASE */
            for (const power of COUNTRIES) {
                var occupiedProvince = province.getOccupied(power.toUpperCase());
                if (occupiedProvince) {
                    requestedProvince = occupiedProvince.name.toUpperCase();
                    break;
                }
            }
        } else if (phaseType === "R") {
            /* RETREAT PHASE */
            for (const power of COUNTRIES) {
                var retreatProvince = province.getRetreated(power.toUpperCase());
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
            return this.props.onChangeOrderDistribution(requestedPower, null, null);
        }

        for (var orderDist of this.props.orderDistribution) {
            if (orderDist.province === requestedProvince) {
                return false; // advice is already displayed
            }
        }

        this.props.onChangeOrderDistribution(
            requestedPower,
            requestedProvince,
            this.props.distributionAdviceSetting?.model,
        );
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
     * Copied and modified original logic in render() for rendering orders
     * to render distribution advice order with specified opacity
     * @param {string} order - Order string
     * @param {string} powerName - Name of the power for this order
     * @param {Game} game - Game object of the current game
     * @param {float} opacity - The opacity of the current order
     * @param {string} key - The keycode for react component to have unique key
     * @returns renderComponents - Json object that stores the order component into the corresponding order rendering list
     */
    renderOrderFromDist(order, powerName, game, opacity, key) {
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
            throw new Error(`Unknown error to render (${order}).`);
        }
        return renderComponents;
    }

    render() {
        const classes = {
            _ank: "nopower",
            _arm: "nopower",
            _con: "nopower",
            _mos: "nopower",
            _sev: "nopower",
            _stp: "nopower",
            _syr: "nopower",
            _ukr: "nopower",
            _lvn: "nopower",
            _war: "nopower",
            _pru: "nopower",
            _sil: "nopower",
            _ber: "nopower",
            _kie: "nopower",
            _ruh: "nopower",
            _mun: "nopower",
            _rum: "nopower",
            _bul: "nopower",
            _gre: "nopower",
            _smy: "nopower",
            _alb: "nopower",
            _ser: "nopower",
            _bud: "nopower",
            _gal: "nopower",
            _vie: "nopower",
            _boh: "nopower",
            _tyr: "nopower",
            _tri: "nopower",
            _fin: "nopower",
            _swe: "nopower",
            _nwy: "nopower",
            _den: "nopower",
            _hol: "nopower",
            _bel: "nopower",
            _swi: "impassable",
            _ven: "nopower",
            _pie: "nopower",
            _tus: "nopower",
            _rom: "nopower",
            _apu: "nopower",
            _nap: "nopower",
            _bur: "nopower",
            _mar: "nopower",
            _gas: "nopower",
            _pic: "nopower",
            _par: "nopower",
            _bre: "nopower",
            _spa: "nopower",
            _por: "nopower",
            _naf: "nopower",
            _tun: "nopower",
            _lon: "nopower",
            _wal: "nopower",
            _lvp: "nopower",
            _yor: "nopower",
            _edi: "nopower",
            _cly: "nopower",
            unplayable: "neutral",
            unplayable_water: "water",
            _nat: "water",
            _nrg: "water",
            _bar: "water",
            _bot: "water",
            _bal: "water",
            denmark_water: "water",
            _ska: "water",
            _hel: "water",
            _nth: "water",
            _eng: "water",
            _iri: "water",
            _mid: "water",
            _wes: "water",
            _gol: "water",
            _tyn: "water",
            _adr: "water",
            _ion: "water",
            _aeg: "water",
            _eas: "water",
            constantinople_water: "water",
            _bla: "water",
            BriefLabelLayer: "labeltext24",
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

                /* Modify classname to display light background */
                for (let classKey of Object.keys(classes)) {
                    if (classes.hasOwnProperty(classKey)) {
                        if (
                            classes[classKey] === "nopower" ||
                            classes[classKey] === "water" ||
                            classes[classKey] === "neutral"
                        ) {
                            classes[classKey] = `${classes[classKey]}light`;
                        }
                    }
                }

                for (let center of power.centers) {
                    setInfluenceLightBackground(classes, mapData, center, power.name);
                }
                for (let loc of power.influence) {
                    if (!mapData.supplyCenters.has(loc)) setInfluenceLightBackground(classes, mapData, loc, power.name);
                }

                if (orders) {
                    const powerOrders = (orders && orders.hasOwnProperty(power.name) && orders[power.name]) || [];
                    for (let order of powerOrders) {
                        const tokens = order.split(/ +/);
                        if (!tokens || tokens.length < 3) continue;
                        const unit_loc = tokens[1];
                        if (tokens[2] === "H") {
                            renderedOrders.push(
                                <Hold
                                    key={order}
                                    loc={unit_loc}
                                    powerName={power.name}
                                    coordinates={Coordinates}
                                    symbolSizes={SymbolSizes}
                                    colors={Colors}
                                />,
                            );
                        } else if (tokens[2] === "-") {
                            const destLoc = tokens[tokens.length - (tokens[tokens.length - 1] === "VIA" ? 2 : 1)];
                            renderedOrders.push(
                                <Move
                                    key={order}
                                    srcLoc={unit_loc}
                                    dstLoc={destLoc}
                                    powerName={power.name}
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
                                renderedOrders2.push(
                                    <SupportMove
                                        key={order}
                                        loc={unit_loc}
                                        srcLoc={srcLoc}
                                        dstLoc={destLoc}
                                        powerName={power.name}
                                        coordinates={Coordinates}
                                        symbolSizes={SymbolSizes}
                                        colors={Colors}
                                    />,
                                );
                            } else {
                                renderedOrders2.push(
                                    <SupportHold
                                        key={order}
                                        loc={unit_loc}
                                        dstLoc={destLoc}
                                        powerName={power.name}
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
                                renderedOrders2.push(
                                    <Convoy
                                        key={order}
                                        loc={unit_loc}
                                        srcLoc={srcLoc}
                                        dstLoc={destLoc}
                                        powerName={power.name}
                                        coordinates={Coordinates}
                                        colors={Colors}
                                        symbolSizes={SymbolSizes}
                                    />,
                                );
                            }
                        } else if (tokens[2] === "B") {
                            renderedHighestOrders.push(
                                <Build
                                    key={order}
                                    unitType={tokens[0]}
                                    loc={unit_loc}
                                    powerName={power.name}
                                    coordinates={Coordinates}
                                    symbolSizes={SymbolSizes}
                                />,
                            );
                        } else if (tokens[2] === "D") {
                            renderedHighestOrders.push(
                                <Disband
                                    key={order}
                                    loc={unit_loc}
                                    phaseType={game.getPhaseType()}
                                    coordinates={Coordinates}
                                    symbolSizes={SymbolSizes}
                                />,
                            );
                        } else if (tokens[2] === "R") {
                            const destLoc = tokens[3];
                            renderedOrders.push(
                                <Move
                                    key={order}
                                    srcLoc={unit_loc}
                                    dstLoc={destLoc}
                                    powerName={power.name}
                                    phaseType={game.getPhaseType()}
                                    coordinates={Coordinates}
                                    symbolSizes={SymbolSizes}
                                    colors={Colors}
                                />,
                            );
                        } else {
                            throw new Error(`Unknown error to render (${order}).`);
                        }
                    }
                }
            }

        /* If can display visual distribution advice, push the corresponding advice order components for rendering */
        if (this.props.orderDistribution && this.props.distributionAdviceSetting?.display_mode === "V") {
            for (var provinceDistribution of this.props.orderDistribution) {
                var orderDistribution = provinceDistribution.distribution;
                var provincePower = provinceDistribution.power;
                for (var order in orderDistribution) {
                    if (orderDistribution.hasOwnProperty(order)) {
                        const component = this.renderOrderFromDist(
                            order,
                            provincePower,
                            game,
                            orderDistribution[order].opacity,
                            "P",
                        );
                        if (component.renderedOrders.length !== 0) {
                            renderedOrders.push(component.renderedOrders[0]);
                        } else if (component.renderedOrders2.length !== 0) {
                            renderedOrders2.push(component.renderedOrders2[0]);
                        } else if (component.renderedHighestOrders.length !== 0) {
                            renderedHighestOrders.push(component.renderedHighestOrders[0]);
                        }
                    }
                }
            }
        }

        if (this.props.onShowHoverAdvice) {
            for (const orderObj of this.props.onShowHoverAdvice) {
                const component = this.renderOrderFromDist(orderObj.order, orderObj.power, game, 1, "H");
                if (component.renderedOrders.length !== 0) {
                    renderedOrders.push(component.renderedOrders[0]);
                } else if (component.renderedOrders2.length !== 0) {
                    renderedOrders2.push(component.renderedOrders2[0]);
                } else if (component.renderedHighestOrders.length !== 0) {
                    renderedHighestOrders.push(component.renderedHighestOrders[0]);
                }
            }
        }

        /** For textual advice, user is able to show or hide an advice order*/
        if (this.props.onShowVisibleAdvice) {
            for (const orderObj of this.props.onShowVisibleAdvice) {
                const component = this.renderOrderFromDist(orderObj.order, orderObj.power, game, 1, "V");
                if (component.renderedOrders.length !== 0) {
                    renderedOrders.push(component.renderedOrders[0]);
                } else if (component.renderedOrders2.length !== 0) {
                    renderedOrders2.push(component.renderedOrders2[0]);
                } else if (component.renderedHighestOrders.length !== 0) {
                    renderedHighestOrders.push(component.renderedHighestOrders[0]);
                }
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
            <svg className="SvgStandard noselect" colorRendering="optimizeQuality" height="680px" preserveAspectRatio="xMinYMin" viewBox="0 0 1835 1360" width="918px" xmlns="http://www.w3.org/2000/svg">
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
                    <pattern height="10" id="patternRed" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="red" height="10" width="10" x="0" y="0"/>
                        <rect fill="pink" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBrown" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="peru" height="10" width="10" x="0" y="0"/>
                        <rect fill="antiquewhite" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternGreen" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="seagreen" height="10" width="10" x="0" y="0"/>
                        <rect fill="yellowgreen" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBlue" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="CornflowerBlue" height="10" width="10" x="0" y="0"/>
                        <rect fill="cyan" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBlack" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="black" height="10" width="10" x="0" y="0"/>
                        <rect fill="gray" height="10" width="10" x="0" y="5"/>
                    </pattern>
                </defs>
                <g id="MapLayer" transform="translate(-195 -170)">
                    <rect fill="black" height="1360" width="1835" x="195" y="170"/>
                    <path className={classes['_ank']} d="M 1424 1364 C 1437 1361 1448 1353 1459 1346 C 1464 1343 1470 1337 1475 1336 C 1482 1334 1492 1338 1499 1340 C 1510 1342 1518 1341 1528 1336 C 1544 1328 1555 1307 1575 1297 C 1587 1291 1598 1293 1611 1293 C 1614 1293 1621 1292 1624 1292 C 1646 1286 1638 1257 1637 1241 C 1618 1244 1604 1253 1583 1253 C 1566 1253 1565 1248 1554 1246 C 1553 1247 1553 1248 1551 1248 C 1548 1249 1541 1242 1538 1240 C 1535 1242 1529 1247 1526 1246 C 1521 1245 1517 1235 1511 1235 C 1507 1236 1507 1239 1497 1241 C 1483 1243 1471 1243 1457 1249 C 1450 1253 1440 1261 1435 1266 C 1433 1268 1421 1282 1420 1284 C 1419 1286 1419 1290 1419 1292 C 1419 1300 1423 1305 1425 1312 C 1428 1318 1430 1326 1431 1333 C 1432 1342 1427 1355 1424 1364 z" id="_ank"/>
                    <path className={classes['_arm']} d="M 1671 1218 C 1663 1226 1648 1237 1638 1240 C 1638 1240 1641 1241 1641 1241 C 1641 1241 1643 1272 1643 1272 C 1642 1279 1638 1298 1639 1303 C 1641 1311 1648 1312 1652 1318 C 1658 1325 1657 1329 1657 1337 C 1657 1337 1708 1337 1708 1337 C 1708 1337 1720 1338 1720 1338 C 1720 1338 1730 1338 1730 1338 C 1730 1338 1825 1348 1825 1348 C 1825 1348 1837 1349 1837 1349 C 1837 1349 1845 1349 1845 1349 C 1853 1349 1867 1347 1874 1345 C 1892 1339 1913 1320 1927 1307 C 1927 1307 1956 1280 1956 1280 C 1956 1280 1938 1277 1938 1277 C 1922 1273 1905 1266 1896 1251 C 1894 1251 1890 1252 1888 1252 C 1883 1251 1872 1247 1869 1242 C 1868 1240 1867 1220 1858 1221 C 1853 1221 1846 1232 1843 1236 C 1833 1248 1822 1262 1805 1261 C 1784 1260 1786 1252 1767 1252 C 1767 1252 1753 1252 1753 1252 C 1753 1252 1736 1251 1736 1251 C 1727 1251 1722 1253 1713 1250 C 1697 1243 1680 1223 1671 1218 z" id="_arm"/>
                    <path className={classes['_con']} d="M 1331 1267 C 1320 1272 1310 1264 1298 1274 C 1289 1282 1298 1291 1291 1305 C 1289 1310 1284 1314 1287 1316 C 1289 1319 1295 1316 1303 1317 C 1303 1317 1303 1319 1303 1319 C 1299 1321 1292 1327 1290 1332 C 1294 1330 1296 1329 1297 1324 C 1297 1324 1323 1304 1323 1304 C 1323 1304 1337 1298 1337 1298 C 1337 1298 1356 1294 1356 1294 C 1356 1294 1340 1282 1340 1282 C 1340 1282 1331 1267 1331 1267 z M 1414 1284 C 1414 1284 1389 1288 1389 1288 C 1389 1288 1375 1292 1375 1292 C 1372 1292 1361 1293 1364 1299 C 1366 1301 1376 1303 1380 1304 C 1380 1304 1380 1306 1380 1306 C 1380 1306 1367 1310 1367 1310 C 1367 1310 1357 1315 1357 1315 C 1357 1315 1348 1318 1348 1318 C 1341 1321 1342 1326 1329 1326 C 1322 1326 1314 1323 1308 1328 C 1304 1331 1290 1344 1288 1349 C 1287 1351 1287 1353 1288 1356 C 1296 1354 1305 1345 1307 1359 C 1307 1359 1307 1364 1307 1364 C 1311 1361 1315 1355 1319 1355 C 1323 1354 1328 1358 1331 1360 C 1335 1363 1340 1364 1345 1365 C 1355 1366 1363 1362 1368 1361 C 1374 1361 1378 1364 1383 1365 C 1389 1365 1393 1361 1400 1361 C 1405 1361 1407 1361 1412 1362 C 1414 1363 1418 1364 1419 1363 C 1422 1362 1424 1355 1424 1352 C 1429 1337 1427 1328 1422 1314 C 1422 1314 1416 1297 1416 1297 C 1415 1292 1416 1288 1414 1284 z M 1346 1295 C 1346 1295 1346 1296 1346 1296 C 1346 1296 1345 1295 1345 1295 C 1345 1295 1346 1295 1346 1295 z" id="_con"/>
                    <path className={classes['_mos']} d="M 2022 319 C 2022 319 1994 345 1994 345 C 1994 345 1970 368 1970 368 C 1929 405 1867 454 1820 484 C 1791 502 1771 510 1741 525 C 1741 525 1716 539 1716 539 C 1708 544 1703 547 1694 551 C 1679 557 1664 558 1648 562 C 1618 570 1610 579 1590 585 C 1590 585 1546 593 1546 593 C 1535 596 1530 601 1521 607 C 1512 612 1496 620 1487 623 C 1468 629 1453 625 1434 632 C 1418 639 1408 654 1405 671 C 1404 678 1406 690 1401 696 C 1391 707 1376 685 1365 691 C 1360 693 1356 701 1353 706 C 1348 713 1340 724 1334 730 C 1321 742 1301 741 1284 741 C 1284 754 1279 767 1278 772 C 1278 777 1279 780 1280 784 C 1280 792 1276 793 1276 804 C 1276 804 1278 828 1278 828 C 1278 838 1278 846 1268 851 C 1264 853 1259 854 1255 856 C 1255 856 1242 870 1242 870 C 1242 870 1228 882 1228 882 C 1226 883 1222 886 1221 888 C 1220 891 1222 897 1223 900 C 1225 911 1226 909 1229 918 C 1229 918 1234 935 1234 935 C 1237 932 1238 930 1242 927 C 1247 925 1271 918 1278 916 C 1278 916 1353 897 1353 897 C 1364 894 1385 889 1396 889 C 1401 889 1407 889 1412 890 C 1415 890 1424 892 1427 892 C 1432 891 1438 885 1448 884 C 1448 884 1481 888 1481 888 C 1490 888 1497 888 1502 880 C 1506 873 1508 855 1519 855 C 1525 855 1535 862 1541 865 C 1551 869 1556 870 1567 870 C 1579 870 1580 865 1588 866 C 1593 867 1602 869 1606 872 C 1617 879 1623 900 1636 913 C 1647 924 1652 919 1660 927 C 1667 936 1662 948 1673 958 C 1678 962 1688 966 1694 968 C 1707 974 1719 977 1732 984 C 1748 993 1759 1009 1770 1017 C 1771 1015 1771 1011 1773 1010 C 1776 1008 1778 1010 1780 1010 C 1784 1009 1786 1005 1788 1002 C 1791 996 1789 991 1793 985 C 1797 977 1808 967 1815 960 C 1815 960 1828 941 1828 941 C 1834 935 1842 931 1849 928 C 1863 923 1881 917 1889 934 C 1892 941 1895 955 1895 963 C 1895 969 1896 975 1892 980 C 1887 988 1878 987 1874 997 C 1869 1008 1879 1013 1874 1020 C 1869 1028 1858 1029 1854 1040 C 1866 1041 1876 1045 1885 1053 C 1892 1060 1891 1065 1895 1067 C 1897 1067 1900 1067 1902 1067 C 1907 1067 1909 1070 1916 1068 C 1920 1068 1926 1064 1930 1065 C 1936 1066 1936 1072 1936 1077 C 1936 1088 1935 1099 1947 1105 C 1947 1096 1946 1088 1954 1081 C 1957 1079 1960 1079 1964 1080 C 1969 1081 1975 1087 1980 1090 C 1985 1093 1994 1094 1997 1100 C 1999 1105 1996 1111 1994 1115 C 1987 1126 1985 1124 1975 1127 C 1973 1128 1969 1130 1967 1130 C 1965 1130 1961 1128 1959 1127 C 1959 1138 1964 1147 1970 1156 C 1976 1153 1983 1143 1989 1143 C 1991 1142 1993 1143 1993 1145 C 1993 1148 1990 1151 1990 1154 C 1989 1160 1993 1158 1988 1166 C 1988 1166 2007 1175 2007 1175 C 2007 1175 2013 1183 2013 1183 C 2013 1183 2022 1217 2022 1217 C 2022 1217 2023 1195 2023 1195 C 2023 1195 2023 1149 2023 1149 C 2023 1149 2023 990 2023 990 C 2023 990 2023 516 2023 516 C 2023 516 2023 378 2023 378 C 2023 378 2023 338 2023 338 C 2023 338 2022 319 2022 319 z" id="_mos"/>
                    <path className={classes['_sev']} d="M 1364 1100 C 1367 1100 1372 1102 1374 1101 C 1376 1101 1381 1094 1383 1092 C 1389 1087 1394 1085 1401 1084 C 1404 1083 1410 1082 1413 1084 C 1419 1086 1415 1090 1411 1091 C 1411 1091 1406 1092 1406 1092 C 1408 1094 1410 1099 1412 1100 C 1422 1108 1442 1099 1446 1098 C 1450 1098 1453 1101 1452 1105 C 1452 1110 1446 1112 1442 1115 C 1437 1118 1435 1122 1434 1128 C 1439 1129 1450 1131 1453 1135 C 1457 1140 1451 1155 1464 1157 C 1466 1157 1467 1157 1469 1156 C 1474 1154 1480 1144 1485 1140 C 1491 1136 1499 1137 1499 1127 C 1503 1126 1504 1126 1508 1126 C 1508 1126 1512 1126 1512 1126 C 1514 1126 1518 1126 1519 1124 C 1521 1122 1520 1115 1516 1113 C 1509 1111 1504 1119 1499 1120 C 1490 1122 1478 1109 1471 1104 C 1469 1103 1461 1101 1461 1098 C 1460 1095 1464 1094 1466 1093 C 1474 1090 1479 1088 1486 1083 C 1486 1083 1512 1061 1512 1061 C 1512 1061 1549 1043 1549 1043 C 1549 1043 1564 1033 1564 1033 C 1566 1032 1569 1030 1571 1031 C 1575 1033 1571 1039 1569 1041 C 1569 1041 1543 1061 1543 1061 C 1545 1064 1546 1066 1549 1067 C 1552 1067 1556 1066 1557 1070 C 1558 1073 1557 1077 1556 1080 C 1556 1080 1549 1097 1549 1097 C 1548 1102 1549 1109 1544 1112 C 1540 1115 1536 1112 1530 1111 C 1531 1119 1535 1119 1542 1122 C 1542 1122 1554 1126 1554 1126 C 1554 1126 1571 1130 1571 1130 C 1584 1134 1594 1138 1605 1145 C 1613 1150 1620 1157 1628 1160 C 1640 1166 1653 1164 1664 1171 C 1672 1176 1682 1188 1681 1198 C 1680 1204 1676 1209 1677 1212 C 1678 1216 1690 1226 1693 1228 C 1699 1234 1710 1242 1718 1245 C 1724 1246 1727 1244 1734 1244 C 1734 1244 1749 1246 1749 1246 C 1756 1246 1759 1245 1765 1245 C 1782 1244 1789 1254 1804 1255 C 1820 1256 1831 1242 1840 1230 C 1844 1224 1849 1215 1857 1214 C 1866 1213 1872 1224 1873 1231 C 1874 1233 1874 1237 1875 1239 C 1878 1244 1887 1246 1892 1245 C 1890 1239 1886 1229 1886 1223 C 1886 1218 1889 1218 1889 1212 C 1889 1203 1883 1184 1891 1178 C 1895 1175 1899 1174 1903 1173 C 1900 1167 1894 1170 1888 1169 C 1883 1168 1880 1166 1876 1163 C 1876 1163 1855 1144 1855 1144 C 1847 1139 1843 1139 1839 1136 C 1839 1136 1831 1128 1831 1128 C 1824 1122 1818 1118 1811 1110 C 1799 1097 1803 1092 1796 1084 C 1793 1079 1788 1075 1782 1073 C 1778 1071 1774 1071 1772 1068 C 1769 1064 1768 1055 1768 1051 C 1768 1051 1769 1035 1769 1035 C 1769 1027 1769 1028 1770 1020 C 1765 1019 1762 1014 1759 1011 C 1759 1011 1738 992 1738 992 C 1724 982 1708 978 1692 971 C 1685 968 1674 964 1668 958 C 1660 948 1662 936 1658 930 C 1655 926 1651 926 1646 924 C 1642 922 1639 920 1636 917 C 1628 909 1623 901 1617 892 C 1614 886 1609 877 1603 874 C 1599 871 1587 869 1582 870 C 1578 871 1576 873 1569 874 C 1559 875 1550 873 1541 868 C 1535 866 1522 857 1516 860 C 1513 861 1512 865 1510 868 C 1507 875 1506 882 1500 888 C 1488 897 1465 889 1451 888 C 1446 888 1433 891 1431 896 C 1430 898 1431 902 1432 904 C 1432 908 1434 917 1434 921 C 1434 921 1429 938 1429 938 C 1426 958 1424 989 1411 1006 C 1404 1015 1391 1024 1381 1029 C 1381 1029 1367 1035 1367 1035 C 1363 1038 1362 1041 1359 1045 C 1359 1045 1350 1058 1350 1058 C 1348 1063 1348 1065 1344 1070 C 1340 1074 1335 1079 1330 1083 C 1328 1085 1323 1088 1322 1090 C 1321 1092 1324 1103 1325 1107 C 1325 1115 1320 1130 1329 1140 C 1334 1144 1339 1142 1344 1141 C 1347 1140 1356 1139 1357 1137 C 1359 1136 1360 1132 1361 1130 C 1362 1126 1368 1116 1369 1113 C 1369 1108 1365 1107 1364 1100 z" id="_sev"/>
                    <path className={classes['_stp']} d="M 1586 175 C 1590 180 1597 184 1598 190 C 1599 194 1597 196 1597 201 C 1598 204 1601 211 1595 211 C 1590 211 1588 204 1581 201 C 1578 207 1576 215 1572 220 C 1566 226 1562 224 1556 230 C 1551 236 1552 242 1550 245 C 1549 248 1547 248 1546 251 C 1544 254 1543 262 1543 266 C 1541 271 1539 277 1539 282 C 1540 291 1546 299 1547 308 C 1542 306 1541 303 1538 299 C 1530 288 1528 274 1530 261 C 1532 255 1537 239 1528 236 C 1525 235 1522 237 1522 240 C 1520 245 1523 248 1521 258 C 1520 257 1518 255 1516 255 C 1513 255 1511 258 1510 260 C 1506 265 1503 270 1500 276 C 1495 286 1493 293 1491 304 C 1490 311 1493 316 1489 322 C 1483 334 1471 334 1460 329 C 1456 328 1452 326 1449 323 C 1441 312 1463 307 1455 295 C 1450 288 1442 289 1434 288 C 1429 287 1424 286 1419 289 C 1428 296 1432 302 1434 313 C 1435 318 1436 327 1438 331 C 1440 335 1443 334 1446 337 C 1449 339 1451 342 1452 346 C 1453 351 1454 365 1449 368 C 1447 369 1445 369 1443 369 C 1438 369 1431 368 1426 372 C 1423 374 1418 386 1413 392 C 1410 396 1402 404 1403 409 C 1404 413 1409 416 1412 419 C 1416 422 1418 424 1421 428 C 1431 438 1435 433 1443 436 C 1445 437 1450 439 1448 442 C 1446 446 1437 443 1434 442 C 1426 441 1420 441 1412 441 C 1403 441 1398 443 1388 440 C 1381 438 1374 430 1369 433 C 1366 435 1366 440 1367 443 C 1368 448 1372 454 1377 455 C 1382 457 1385 454 1391 460 C 1396 466 1398 468 1392 474 C 1391 475 1390 477 1388 477 C 1384 479 1372 473 1368 471 C 1361 468 1352 467 1346 461 C 1343 457 1341 452 1338 448 C 1336 444 1331 439 1330 434 C 1328 428 1331 419 1326 414 C 1324 411 1319 411 1314 408 C 1314 408 1303 400 1303 400 C 1297 395 1296 396 1289 389 C 1288 387 1283 382 1286 380 C 1289 376 1295 385 1302 386 C 1302 386 1313 386 1313 386 C 1313 386 1322 390 1322 390 C 1329 391 1351 394 1358 394 C 1365 394 1378 395 1384 392 C 1395 387 1409 365 1406 352 C 1405 349 1394 336 1392 334 C 1383 327 1369 324 1358 321 C 1358 321 1313 304 1313 304 C 1303 303 1291 306 1284 306 C 1281 306 1272 304 1272 300 C 1272 297 1275 298 1276 291 C 1272 290 1267 289 1263 292 C 1257 296 1255 305 1252 312 C 1250 316 1246 322 1243 326 C 1241 329 1238 333 1237 336 C 1236 339 1237 344 1237 347 C 1240 361 1249 363 1251 372 C 1251 372 1253 396 1253 396 C 1254 406 1256 416 1258 426 C 1262 439 1275 471 1280 483 C 1287 498 1297 513 1297 530 C 1297 540 1292 539 1292 553 C 1292 553 1293 561 1293 561 C 1293 574 1286 587 1279 598 C 1276 603 1269 613 1272 619 C 1276 624 1284 623 1289 625 C 1293 626 1297 629 1300 631 C 1292 639 1293 635 1285 636 C 1285 636 1273 641 1273 641 C 1268 643 1266 651 1262 655 C 1258 658 1254 658 1249 658 C 1249 658 1226 656 1226 656 C 1214 656 1205 659 1194 665 C 1200 677 1215 678 1227 678 C 1232 678 1239 677 1243 678 C 1255 680 1256 690 1262 698 C 1267 705 1272 707 1276 712 C 1282 718 1284 729 1284 737 C 1301 737 1320 739 1334 726 C 1343 717 1349 705 1356 695 C 1360 690 1364 685 1371 686 C 1377 687 1383 692 1390 694 C 1393 695 1396 695 1398 693 C 1401 691 1401 683 1401 680 C 1401 673 1402 667 1404 661 C 1414 632 1438 623 1466 623 C 1484 623 1504 613 1519 604 C 1531 597 1535 592 1550 588 C 1550 588 1590 581 1590 581 C 1590 581 1643 560 1643 560 C 1643 560 1693 548 1693 548 C 1702 544 1709 539 1717 534 C 1717 534 1736 524 1736 524 C 1736 524 1795 495 1795 495 C 1825 477 1854 457 1882 436 C 1909 416 1934 395 1959 373 C 1959 373 1978 356 1978 356 C 1978 356 2008 328 2008 328 C 2012 324 2017 317 2023 316 C 2023 316 2023 175 2023 175 C 2023 175 1586 175 1586 175 z" id="_stp"/>
                    <path className={classes['_syr']} d="M 2022 1247 C 2020 1256 2012 1263 2005 1268 C 1988 1280 1980 1283 1959 1280 C 1958 1285 1953 1287 1950 1290 C 1950 1290 1934 1305 1934 1305 C 1918 1320 1892 1344 1871 1350 C 1862 1352 1859 1351 1850 1352 C 1850 1352 1842 1353 1842 1353 C 1842 1353 1831 1352 1831 1352 C 1798 1352 1766 1345 1733 1342 C 1709 1340 1683 1341 1659 1341 C 1645 1341 1636 1348 1624 1353 C 1614 1358 1609 1356 1600 1365 C 1591 1374 1592 1381 1588 1392 C 1582 1405 1577 1410 1576 1412 C 1576 1412 1574 1420 1574 1420 C 1574 1420 1568 1433 1568 1433 C 1568 1433 1572 1437 1572 1437 C 1572 1437 1573 1459 1573 1459 C 1580 1460 1579 1463 1579 1468 C 1579 1468 1581 1475 1581 1475 C 1583 1484 1582 1484 1582 1492 C 1582 1492 1584 1509 1584 1509 C 1584 1509 1584 1527 1584 1527 C 1584 1527 2023 1527 2023 1527 C 2023 1527 2023 1330 2023 1330 C 2023 1330 2023 1273 2023 1273 C 2023 1273 2022 1247 2022 1247 z" id="_syr"/>
                    <path className={classes['_ukr']} d="M 1275 1047 C 1293 1047 1303 1065 1311 1078 C 1311 1078 1318 1088 1318 1088 C 1324 1084 1337 1074 1341 1068 C 1344 1064 1344 1062 1347 1058 C 1347 1058 1362 1035 1362 1035 C 1367 1030 1371 1029 1377 1027 C 1383 1024 1390 1020 1395 1017 C 1415 1003 1417 987 1421 965 C 1421 965 1426 935 1426 935 C 1428 924 1431 925 1429 912 C 1429 909 1427 899 1425 897 C 1424 895 1419 895 1417 894 C 1409 893 1402 893 1394 893 C 1383 893 1365 898 1354 901 C 1354 901 1275 921 1275 921 C 1275 921 1257 926 1257 926 C 1249 928 1241 929 1237 938 C 1234 947 1237 953 1233 965 C 1232 968 1229 973 1230 976 C 1233 983 1249 989 1256 995 C 1266 1005 1275 1025 1275 1039 C 1275 1039 1275 1047 1275 1047 z" id="_ukr"/>
                    <path className={classes['_lvn']} d="M 1190 668 C 1187 675 1186 680 1189 688 C 1192 699 1199 697 1203 702 C 1206 705 1206 708 1206 711 C 1207 719 1207 731 1204 738 C 1202 742 1197 749 1192 747 C 1185 745 1175 723 1164 725 C 1159 726 1157 731 1155 735 C 1151 744 1145 758 1145 767 C 1145 770 1145 777 1146 780 C 1148 782 1152 782 1157 789 C 1159 794 1160 800 1165 803 C 1171 808 1178 805 1185 815 C 1191 823 1191 835 1188 844 C 1187 848 1184 853 1185 857 C 1188 866 1202 873 1209 879 C 1212 881 1214 883 1217 886 C 1225 881 1236 871 1243 864 C 1243 864 1251 855 1251 855 C 1257 849 1263 850 1268 848 C 1275 843 1274 833 1274 826 C 1274 817 1271 810 1272 801 C 1273 796 1276 793 1276 786 C 1276 780 1273 778 1274 771 C 1274 771 1278 757 1278 757 C 1280 747 1281 732 1278 722 C 1274 710 1266 710 1260 701 C 1255 695 1253 686 1246 682 C 1240 679 1231 682 1224 682 C 1218 682 1207 680 1202 677 C 1198 675 1194 671 1190 668 z" id="_lvn"/>
                    <path className={classes['_war']} d="M 1180 860 C 1162 885 1123 876 1100 892 C 1073 911 1079 940 1096 963 C 1098 966 1107 976 1109 978 C 1113 981 1125 983 1130 983 C 1138 983 1146 978 1152 973 C 1155 970 1157 966 1160 965 C 1167 962 1176 971 1186 973 C 1200 977 1205 969 1213 967 C 1218 967 1222 970 1226 972 C 1230 962 1231 958 1232 947 C 1232 942 1228 923 1226 918 C 1226 918 1221 908 1221 908 C 1219 901 1219 894 1214 888 C 1209 881 1201 878 1194 873 C 1189 869 1186 863 1180 860 z" id="_war"/>
                    <path className={classes['_pru']} d="M 1146 788 C 1147 796 1148 812 1141 817 C 1137 821 1131 817 1127 821 C 1125 824 1125 827 1123 830 C 1122 833 1119 836 1116 838 C 1109 843 1100 847 1093 840 C 1090 837 1090 835 1090 831 C 1087 831 1083 830 1080 830 C 1069 831 1058 838 1048 842 C 1031 848 1028 850 1010 853 C 1010 853 1014 883 1014 883 C 1016 891 1018 893 1019 898 C 1021 904 1019 909 1022 912 C 1025 915 1030 916 1033 916 C 1033 916 1061 918 1061 918 C 1064 918 1072 919 1074 917 C 1074 917 1081 904 1081 904 C 1085 896 1092 890 1099 885 C 1111 878 1130 875 1144 872 C 1154 870 1164 868 1172 861 C 1176 857 1179 851 1181 846 C 1182 841 1183 839 1183 834 C 1183 834 1183 830 1183 830 C 1183 824 1182 818 1177 815 C 1172 812 1168 814 1161 808 C 1151 799 1155 792 1146 788 z" id="_pru"/>
                    <path className={classes['_sil']} d="M 960 935 C 960 935 970 964 970 964 C 970 964 997 957 997 957 C 1004 956 1012 954 1019 956 C 1029 960 1036 969 1044 975 C 1053 982 1055 981 1065 984 C 1080 989 1090 995 1104 983 C 1104 983 1088 962 1088 962 C 1079 949 1075 937 1075 921 C 1075 921 1039 921 1039 921 C 1039 921 1027 919 1027 919 C 1027 919 1019 916 1019 916 C 1019 916 1012 921 1012 921 C 1012 921 1002 926 1002 926 C 1002 926 960 935 960 935 z" id="_sil"/>
                    <path className={classes['_ber']} d="M 939 938 C 939 938 969 929 969 929 C 969 929 1001 923 1001 923 C 1001 923 1017 913 1017 913 C 1017 913 1016 899 1016 899 C 1016 899 1010 884 1010 884 C 1008 875 1007 862 1007 853 C 1001 852 995 851 990 847 C 988 846 985 843 986 840 C 987 838 988 837 989 836 C 988 835 987 834 985 833 C 980 832 966 839 959 841 C 955 842 949 842 947 845 C 947 845 943 868 943 868 C 941 880 936 900 936 912 C 936 920 936 931 939 938 z" id="_ber"/>
                    <path className={classes['_kie']} d="M 823 916 C 842 925 854 923 872 938 C 878 944 883 947 888 954 C 890 956 892 960 895 960 C 899 961 903 956 906 954 C 913 949 918 950 927 945 C 929 943 933 941 933 939 C 935 937 934 934 933 932 C 933 932 932 918 932 918 C 932 913 932 912 933 908 C 933 908 936 886 936 886 C 938 874 942 860 942 848 C 942 848 926 848 926 848 C 928 845 933 839 933 836 C 932 832 926 829 923 825 C 918 818 915 812 915 803 C 915 803 900 803 900 803 C 898 803 894 803 893 804 C 889 807 893 819 893 823 C 893 826 891 839 890 842 C 889 844 888 846 886 848 C 876 857 871 837 859 845 C 855 848 856 853 856 858 C 856 869 852 871 849 880 C 848 884 848 889 845 893 C 838 904 826 902 823 916 z" id="_kie"/>
                    <path className={classes['_ruh']} d="M 822 920 C 820 928 819 933 815 940 C 813 943 810 948 810 951 C 809 957 817 969 815 978 C 813 984 810 984 808 988 C 805 998 813 1013 817 1015 C 821 1017 831 1013 834 1010 C 838 1007 841 1000 844 996 C 849 989 856 980 864 976 C 873 971 877 974 884 971 C 886 970 890 968 891 966 C 892 962 882 952 879 949 C 863 933 857 932 837 925 C 837 925 822 920 822 920 z" id="_ruh"/>
                    <path className={classes['_mun']} d="M 820 1020 C 820 1020 824 1031 824 1031 C 824 1031 821 1045 821 1045 C 821 1045 819 1058 819 1058 C 829 1058 833 1058 843 1057 C 847 1056 855 1054 859 1054 C 865 1055 868 1059 872 1060 C 875 1062 879 1060 883 1062 C 887 1064 889 1067 894 1068 C 894 1068 919 1066 919 1066 C 932 1066 937 1066 950 1069 C 950 1065 948 1059 950 1055 C 952 1049 956 1049 960 1047 C 967 1043 966 1040 975 1039 C 974 1033 971 1029 967 1024 C 967 1024 948 1001 948 1001 C 942 993 938 985 947 976 C 949 975 952 973 954 971 C 958 969 962 968 966 966 C 966 966 957 936 957 936 C 953 937 939 942 935 944 C 935 944 924 950 924 950 C 919 953 913 953 908 957 C 900 962 895 969 887 973 C 876 979 871 974 859 984 C 848 992 845 1004 837 1012 C 832 1017 826 1017 820 1020 z" id="_mun"/>
                    <path className={classes['_rum']} d="M 1277 1053 C 1276 1059 1276 1068 1272 1073 C 1268 1079 1259 1080 1258 1086 C 1257 1092 1263 1097 1266 1101 C 1276 1111 1287 1119 1280 1134 C 1275 1143 1265 1147 1256 1150 C 1256 1150 1203 1163 1203 1163 C 1193 1167 1180 1178 1187 1190 C 1189 1192 1192 1193 1194 1195 C 1198 1197 1198 1200 1201 1201 C 1205 1203 1226 1205 1231 1205 C 1242 1205 1255 1206 1266 1204 C 1266 1204 1287 1197 1287 1197 C 1303 1194 1323 1194 1339 1199 C 1339 1193 1341 1177 1343 1172 C 1346 1167 1352 1163 1355 1158 C 1357 1154 1357 1150 1357 1145 C 1349 1146 1336 1151 1329 1148 C 1321 1143 1317 1130 1317 1122 C 1317 1122 1318 1110 1318 1110 C 1318 1096 1314 1093 1307 1082 C 1299 1069 1293 1057 1277 1053 z" id="_rum"/>
                    <path className={classes['_bul']} d="M 1188 1199 C 1187 1205 1185 1210 1187 1216 C 1189 1223 1196 1231 1196 1237 C 1197 1245 1189 1244 1190 1255 C 1193 1268 1204 1282 1189 1291 C 1195 1299 1199 1297 1208 1294 C 1208 1294 1224 1288 1224 1288 C 1236 1284 1244 1282 1249 1297 C 1250 1301 1250 1303 1250 1307 C 1250 1307 1250 1311 1250 1311 C 1250 1311 1269 1311 1269 1311 C 1272 1311 1276 1313 1279 1311 C 1281 1310 1282 1308 1283 1306 C 1292 1293 1281 1282 1293 1270 C 1306 1258 1316 1264 1328 1262 C 1328 1262 1320 1248 1320 1248 C 1319 1245 1321 1241 1322 1238 C 1325 1229 1323 1223 1326 1218 C 1331 1210 1335 1216 1338 1206 C 1324 1199 1299 1201 1284 1204 C 1276 1206 1273 1209 1263 1211 C 1263 1211 1242 1212 1242 1212 C 1242 1212 1229 1211 1229 1211 C 1222 1211 1207 1210 1201 1208 C 1193 1206 1195 1202 1188 1199 z" id="_bul"/>
                    <path className={classes['_gre']} d="M 1155 1385 C 1155 1385 1155 1387 1155 1387 C 1153 1388 1149 1389 1148 1391 C 1146 1395 1152 1403 1155 1404 C 1162 1406 1184 1400 1188 1400 C 1191 1401 1193 1402 1196 1403 C 1200 1405 1207 1407 1206 1413 C 1205 1416 1203 1418 1200 1418 C 1200 1418 1191 1413 1191 1413 C 1186 1411 1178 1409 1173 1411 C 1173 1411 1166 1413 1166 1413 C 1162 1414 1160 1414 1158 1416 C 1155 1418 1156 1422 1158 1425 C 1161 1430 1165 1433 1167 1439 C 1167 1439 1172 1459 1172 1459 C 1173 1458 1175 1455 1176 1454 C 1185 1448 1189 1467 1191 1471 C 1193 1468 1195 1461 1199 1461 C 1202 1461 1203 1464 1209 1465 C 1208 1457 1204 1448 1201 1441 C 1199 1438 1197 1435 1201 1432 C 1206 1428 1214 1437 1217 1432 C 1220 1429 1212 1426 1211 1422 C 1210 1418 1213 1415 1217 1415 C 1223 1415 1227 1419 1232 1421 C 1232 1421 1231 1414 1231 1414 C 1230 1409 1232 1407 1228 1403 C 1223 1398 1203 1395 1199 1388 C 1196 1384 1199 1382 1199 1379 C 1200 1376 1198 1374 1198 1372 C 1199 1365 1208 1368 1212 1369 C 1208 1358 1195 1350 1192 1338 C 1190 1329 1198 1325 1201 1326 C 1204 1328 1202 1331 1205 1335 C 1207 1339 1212 1341 1216 1343 C 1216 1343 1214 1336 1214 1336 C 1214 1336 1230 1344 1230 1344 C 1230 1344 1222 1331 1222 1331 C 1222 1331 1233 1332 1233 1332 C 1231 1330 1226 1324 1226 1322 C 1225 1319 1229 1318 1231 1317 C 1237 1315 1235 1313 1243 1313 C 1243 1307 1245 1296 1238 1292 C 1234 1291 1222 1296 1218 1297 C 1218 1297 1187 1308 1187 1308 C 1187 1308 1166 1313 1166 1313 C 1164 1314 1159 1315 1158 1316 C 1155 1318 1156 1323 1156 1326 C 1156 1331 1154 1335 1151 1339 C 1146 1344 1141 1345 1138 1349 C 1136 1351 1135 1353 1134 1355 C 1132 1358 1130 1360 1129 1363 C 1127 1371 1134 1379 1140 1382 C 1145 1385 1145 1381 1155 1385 z M 1208 1382 C 1211 1386 1222 1396 1226 1399 C 1229 1400 1232 1401 1235 1401 C 1235 1390 1229 1393 1222 1389 C 1216 1385 1216 1382 1208 1382 z" id="_gre"/>
                    <path className={classes['_smy']} d="M 1636 1288 C 1625 1299 1615 1296 1600 1296 C 1584 1296 1573 1300 1561 1311 C 1546 1324 1537 1340 1516 1344 C 1513 1344 1510 1345 1507 1345 C 1498 1344 1483 1338 1475 1340 C 1470 1341 1465 1346 1461 1348 C 1451 1355 1437 1365 1425 1367 C 1418 1369 1409 1364 1401 1365 C 1395 1365 1391 1368 1386 1368 C 1379 1368 1376 1365 1371 1365 C 1366 1364 1362 1367 1358 1368 C 1358 1368 1349 1368 1349 1368 C 1342 1369 1337 1368 1331 1364 C 1328 1362 1323 1358 1319 1358 C 1316 1359 1311 1365 1311 1368 C 1311 1371 1313 1373 1313 1376 C 1314 1379 1312 1381 1311 1384 C 1311 1388 1312 1390 1311 1393 C 1311 1396 1307 1399 1305 1401 C 1312 1403 1321 1406 1322 1414 C 1322 1419 1320 1417 1323 1428 C 1323 1428 1331 1427 1331 1427 C 1333 1434 1333 1433 1330 1440 C 1330 1440 1349 1436 1349 1436 C 1351 1436 1354 1437 1355 1439 C 1355 1442 1350 1448 1349 1451 C 1355 1449 1355 1447 1359 1446 C 1363 1445 1366 1447 1370 1447 C 1372 1448 1375 1447 1377 1448 C 1381 1450 1383 1454 1385 1457 C 1389 1460 1395 1462 1400 1462 C 1404 1462 1416 1458 1418 1455 C 1421 1450 1418 1435 1432 1432 C 1443 1431 1460 1441 1469 1446 C 1474 1449 1478 1452 1484 1452 C 1493 1452 1512 1447 1518 1441 C 1524 1435 1528 1424 1535 1420 C 1544 1415 1552 1425 1558 1422 C 1565 1418 1564 1405 1575 1408 C 1579 1402 1583 1394 1586 1388 C 1590 1375 1588 1369 1603 1358 C 1611 1353 1614 1353 1622 1350 C 1622 1350 1640 1342 1640 1342 C 1644 1340 1652 1339 1654 1335 C 1657 1322 1641 1315 1637 1308 C 1634 1303 1637 1293 1636 1288 z" id="_smy"/>
                    <path className={classes['_alb']} d="M 1149 1316 C 1136 1313 1137 1308 1136 1297 C 1134 1284 1137 1271 1125 1262 C 1123 1261 1120 1259 1118 1258 C 1112 1257 1101 1264 1101 1273 C 1100 1280 1110 1281 1112 1290 C 1113 1298 1107 1314 1107 1326 C 1107 1329 1107 1334 1108 1337 C 1109 1341 1121 1352 1125 1353 C 1130 1354 1128 1349 1133 1344 C 1137 1340 1142 1339 1145 1336 C 1151 1331 1150 1323 1149 1316 z" id="_alb"/>
                    <path className={classes['_ser']} d="M 1189 1301 C 1187 1298 1181 1293 1183 1288 C 1185 1285 1189 1285 1190 1280 C 1191 1274 1184 1263 1184 1254 C 1184 1251 1184 1248 1185 1245 C 1187 1242 1190 1240 1190 1236 C 1189 1231 1184 1226 1181 1218 C 1178 1209 1181 1208 1181 1200 C 1181 1196 1181 1185 1177 1183 C 1176 1182 1173 1182 1171 1182 C 1171 1182 1144 1180 1144 1180 C 1137 1179 1135 1175 1131 1176 C 1128 1176 1125 1179 1121 1181 C 1115 1183 1111 1176 1107 1181 C 1106 1181 1104 1184 1104 1185 C 1100 1194 1107 1196 1107 1204 C 1106 1208 1104 1212 1103 1216 C 1101 1222 1101 1232 1104 1238 C 1110 1249 1126 1253 1134 1262 C 1140 1269 1140 1274 1141 1283 C 1141 1283 1142 1292 1142 1292 C 1142 1296 1141 1303 1144 1307 C 1146 1309 1151 1309 1154 1309 C 1165 1309 1174 1302 1189 1301 z" id="_ser"/>
                    <path className={classes['_bud']} d="M 1121 1029 C 1121 1031 1121 1033 1120 1035 C 1118 1041 1113 1038 1109 1039 C 1106 1040 1104 1041 1102 1043 C 1092 1052 1092 1061 1085 1069 C 1079 1075 1074 1076 1069 1080 C 1065 1083 1060 1089 1056 1093 C 1052 1097 1047 1100 1047 1106 C 1047 1106 1048 1113 1048 1113 C 1050 1124 1054 1132 1063 1139 C 1069 1143 1075 1144 1079 1148 C 1088 1155 1088 1174 1103 1173 C 1103 1173 1111 1171 1111 1171 C 1113 1172 1115 1174 1117 1174 C 1123 1176 1125 1169 1132 1169 C 1136 1170 1139 1173 1144 1174 C 1151 1175 1155 1175 1162 1175 C 1162 1175 1169 1176 1169 1176 C 1181 1177 1183 1170 1191 1163 C 1196 1160 1200 1157 1206 1156 C 1206 1156 1258 1143 1258 1143 C 1268 1139 1276 1135 1275 1123 C 1274 1113 1259 1104 1253 1095 C 1253 1095 1249 1087 1249 1087 C 1249 1087 1234 1065 1234 1065 C 1230 1061 1227 1062 1221 1056 C 1213 1047 1208 1039 1197 1033 C 1187 1028 1182 1031 1173 1028 C 1166 1026 1162 1021 1154 1021 C 1144 1021 1131 1027 1121 1029 z" id="_bud"/>
                    <path className={classes['_gal']} d="M 1083 997 C 1083 997 1085 1015 1085 1015 C 1094 1015 1098 1015 1106 1018 C 1112 1021 1115 1025 1120 1025 C 1123 1025 1128 1023 1131 1022 C 1139 1020 1146 1018 1155 1018 C 1164 1018 1166 1023 1174 1025 C 1182 1027 1189 1024 1201 1031 C 1212 1038 1216 1046 1224 1054 C 1229 1059 1232 1058 1238 1065 C 1243 1071 1246 1078 1252 1083 C 1258 1073 1266 1074 1269 1066 C 1270 1062 1269 1047 1269 1042 C 1269 1030 1262 1010 1254 1001 C 1249 996 1240 993 1234 988 C 1229 985 1220 975 1216 974 C 1209 973 1205 980 1193 981 C 1186 981 1180 978 1174 975 C 1172 974 1166 971 1163 971 C 1160 971 1157 976 1155 978 C 1151 982 1145 985 1140 988 C 1134 990 1130 990 1124 989 C 1121 989 1113 987 1111 987 C 1108 988 1105 991 1100 994 C 1096 996 1088 997 1083 997 z" id="_gal"/>
                    <path className={classes['_vie']} d="M 1117 1036 C 1117 1034 1118 1031 1117 1029 C 1116 1028 1113 1026 1111 1025 C 1104 1021 1099 1019 1091 1019 C 1091 1019 1074 1020 1074 1020 C 1067 1019 1069 1016 1057 1016 C 1057 1016 1045 1018 1045 1018 C 1040 1018 1033 1013 1025 1019 C 1020 1024 1016 1031 1012 1037 C 1010 1042 1005 1049 1003 1054 C 1001 1061 1002 1078 1005 1085 C 1006 1088 1007 1090 1009 1092 C 1012 1097 1017 1107 1023 1108 C 1027 1108 1031 1104 1035 1102 C 1035 1102 1044 1100 1044 1100 C 1052 1096 1059 1084 1065 1078 C 1072 1072 1078 1073 1084 1064 C 1087 1060 1088 1057 1090 1053 C 1093 1048 1101 1037 1107 1036 C 1110 1035 1114 1036 1117 1036 z" id="_vie"/>
                    <path className={classes['_boh']} d="M 1081 1016 C 1081 1016 1079 997 1079 997 C 1079 997 1083 997 1083 997 C 1083 997 1075 995 1075 995 C 1075 995 1063 990 1063 990 C 1056 988 1053 988 1046 984 C 1034 977 1023 959 1008 961 C 999 963 971 970 963 974 C 959 976 952 979 950 983 C 947 988 950 993 953 997 C 953 997 977 1027 977 1027 C 979 1031 981 1039 986 1040 C 990 1041 995 1041 999 1041 C 1001 1041 1004 1042 1005 1041 C 1008 1040 1011 1033 1012 1031 C 1017 1023 1025 1011 1036 1012 C 1040 1013 1042 1014 1046 1014 C 1050 1014 1053 1012 1060 1012 C 1067 1012 1069 1015 1073 1016 C 1075 1017 1079 1016 1081 1016 z" id="_boh"/>
                    <path className={classes['_tyr']} d="M 875 1067 C 878 1085 889 1086 894 1098 C 898 1108 892 1109 892 1122 C 892 1129 895 1137 903 1135 C 908 1135 915 1130 917 1125 C 918 1122 917 1119 920 1115 C 926 1109 936 1108 944 1108 C 947 1108 957 1108 959 1107 C 961 1106 962 1104 964 1102 C 967 1100 970 1099 973 1099 C 977 1098 981 1098 985 1099 C 988 1099 991 1100 994 1099 C 998 1097 1001 1088 1000 1084 C 999 1065 995 1064 1003 1045 C 994 1045 981 1042 973 1046 C 970 1047 967 1050 964 1052 C 962 1053 958 1054 957 1056 C 952 1060 962 1072 952 1075 C 950 1076 946 1075 944 1074 C 939 1073 936 1073 931 1073 C 931 1073 910 1073 910 1073 C 904 1073 897 1075 891 1074 C 884 1073 885 1068 875 1067 z" id="_tyr"/>
                    <path className={classes['_tri']} d="M 1003 1091 C 1001 1096 998 1102 993 1103 C 987 1104 968 1097 964 1109 C 966 1110 968 1112 970 1114 C 973 1120 969 1134 967 1140 C 966 1145 968 1144 965 1152 C 964 1157 962 1168 969 1169 C 972 1170 975 1165 976 1163 C 980 1156 980 1153 989 1154 C 989 1157 989 1159 988 1162 C 986 1168 982 1170 986 1181 C 990 1193 1002 1199 1011 1207 C 1016 1212 1018 1214 1024 1219 C 1024 1219 1047 1234 1047 1234 C 1047 1234 1064 1248 1064 1248 C 1064 1248 1081 1260 1081 1260 C 1086 1263 1090 1268 1095 1270 C 1097 1260 1102 1257 1110 1253 C 1101 1243 1094 1239 1095 1224 C 1095 1214 1099 1210 1100 1205 C 1100 1200 1097 1197 1096 1192 C 1096 1187 1099 1182 1100 1177 C 1095 1175 1091 1174 1088 1169 C 1084 1164 1083 1156 1078 1151 C 1073 1147 1068 1148 1059 1140 C 1047 1131 1046 1119 1043 1105 C 1039 1105 1037 1105 1034 1107 C 1031 1108 1027 1112 1023 1112 C 1014 1111 1010 1098 1003 1091 z" id="_tri"/>
                    <path className={classes['_fin']} d="M 1181 440 C 1190 443 1204 455 1199 465 C 1199 465 1189 478 1189 478 C 1189 478 1175 500 1175 500 C 1175 500 1153 527 1153 527 C 1148 534 1139 544 1140 553 C 1140 553 1142 562 1142 562 C 1142 562 1143 572 1143 572 C 1143 572 1147 586 1147 586 C 1147 593 1142 600 1142 608 C 1142 612 1142 618 1146 622 C 1148 624 1151 624 1154 626 C 1154 626 1163 631 1163 631 C 1163 631 1170 633 1170 633 C 1175 635 1176 639 1181 640 C 1186 640 1200 636 1205 635 C 1205 635 1238 622 1238 622 C 1244 620 1258 617 1262 614 C 1268 611 1271 605 1275 599 C 1282 588 1290 572 1289 559 C 1289 555 1288 553 1288 549 C 1289 539 1294 537 1294 528 C 1292 512 1283 498 1276 483 C 1269 468 1260 443 1255 427 C 1252 417 1250 405 1249 394 C 1249 389 1248 376 1247 372 C 1246 367 1241 364 1237 357 C 1234 350 1232 341 1232 333 C 1228 336 1224 334 1224 329 C 1223 325 1227 318 1227 312 C 1226 301 1208 291 1199 299 C 1196 302 1196 308 1195 312 C 1193 323 1191 330 1179 332 C 1171 334 1157 331 1149 328 C 1149 328 1139 323 1139 323 C 1135 322 1132 323 1131 327 C 1130 332 1134 334 1137 337 C 1145 343 1153 350 1159 358 C 1171 374 1173 391 1177 410 C 1177 410 1181 440 1181 440 z" id="_fin"/>
                    <path className={classes['_swe']} d="M 1128 338 C 1128 338 1126 348 1126 348 C 1120 349 1118 350 1112 351 C 1109 351 1104 351 1101 352 C 1098 355 1101 358 1098 362 C 1095 366 1091 362 1087 367 C 1082 373 1075 395 1071 403 C 1068 409 1064 416 1059 422 C 1055 428 1052 430 1048 437 C 1048 437 1043 456 1043 456 C 1043 456 1032 478 1032 478 C 1032 478 1028 494 1028 494 C 1023 504 1015 499 1008 505 C 1006 508 1004 513 1003 517 C 999 529 999 540 999 552 C 999 552 1000 567 1000 567 C 1000 567 1000 581 1000 581 C 1000 586 1000 589 998 593 C 994 601 991 599 991 610 C 991 623 987 636 984 649 C 981 657 978 676 970 679 C 967 680 964 679 961 679 C 961 689 964 693 966 703 C 966 703 973 731 973 731 C 975 736 981 751 982 755 C 982 760 978 769 979 774 C 979 774 982 786 982 786 C 984 794 980 803 993 801 C 1005 800 1003 794 1009 786 C 1014 780 1019 778 1026 778 C 1030 778 1037 779 1041 777 C 1045 774 1048 768 1049 764 C 1055 750 1054 741 1055 727 C 1055 727 1060 704 1060 704 C 1060 702 1060 699 1059 697 C 1058 696 1056 694 1057 692 C 1057 690 1060 689 1062 689 C 1067 688 1072 687 1077 684 C 1086 680 1090 674 1094 665 C 1097 659 1099 657 1099 650 C 1098 635 1083 627 1078 620 C 1075 616 1074 610 1074 605 C 1074 592 1078 571 1083 559 C 1086 553 1095 542 1099 537 C 1112 523 1128 517 1139 498 C 1144 489 1138 486 1139 477 C 1140 464 1149 444 1162 439 C 1166 438 1170 438 1174 438 C 1174 438 1171 417 1171 417 C 1169 402 1165 380 1158 367 C 1151 355 1139 345 1128 338 z" id="_swe"/>
                    <path className={classes['_nwy']} d="M 1198 263 C 1194 266 1193 270 1192 274 C 1189 282 1188 287 1182 292 C 1180 283 1183 280 1183 272 C 1183 270 1183 267 1181 266 C 1178 265 1175 267 1173 268 C 1166 275 1167 275 1158 280 C 1158 280 1133 298 1133 298 C 1128 300 1123 302 1118 303 C 1115 304 1111 304 1108 305 C 1104 307 1104 312 1100 315 C 1097 317 1095 316 1093 317 C 1089 319 1087 324 1086 328 C 1088 330 1090 332 1089 335 C 1088 337 1083 342 1081 344 C 1081 344 1063 367 1063 367 C 1063 367 1045 394 1045 394 C 1045 394 1024 415 1024 415 C 1019 422 1015 431 1010 439 C 1005 447 995 464 992 472 C 992 472 991 483 991 483 C 983 480 980 483 974 488 C 971 491 967 496 965 499 C 964 502 964 506 961 508 C 958 510 952 509 947 512 C 941 515 937 521 933 522 C 929 523 928 521 925 521 C 921 520 918 522 916 526 C 916 526 920 528 920 528 C 915 534 912 532 905 535 C 906 537 908 541 907 542 C 905 545 900 541 894 542 C 888 544 882 551 879 556 C 871 567 869 577 867 590 C 866 593 865 601 865 604 C 867 609 872 610 874 614 C 876 619 871 620 867 621 C 867 621 871 624 871 624 C 879 633 863 634 861 637 C 860 638 860 642 860 644 C 864 643 878 639 879 646 C 879 650 874 653 872 655 C 865 660 859 665 864 674 C 866 677 869 681 872 683 C 874 685 877 686 880 688 C 899 697 913 679 929 672 C 934 669 939 668 944 664 C 946 663 950 658 953 658 C 957 658 960 668 961 672 C 964 672 968 674 970 671 C 972 668 974 659 975 656 C 978 646 984 626 984 616 C 984 612 984 606 985 602 C 987 597 991 595 993 589 C 994 584 994 578 994 573 C 994 573 992 546 992 546 C 992 536 995 516 1000 507 C 1002 502 1006 498 1011 496 C 1016 494 1020 495 1022 491 C 1022 491 1026 476 1026 476 C 1026 476 1037 453 1037 453 C 1037 453 1043 434 1043 434 C 1046 427 1053 421 1058 414 C 1067 400 1070 386 1077 372 C 1081 364 1084 358 1093 357 C 1092 343 1110 344 1120 344 C 1121 340 1122 336 1123 332 C 1124 326 1127 318 1134 316 C 1139 315 1144 319 1149 321 C 1156 324 1165 326 1172 326 C 1176 326 1181 326 1184 323 C 1191 317 1185 298 1199 291 C 1201 290 1203 290 1205 290 C 1217 289 1232 299 1234 312 C 1234 317 1231 324 1230 330 C 1241 325 1247 308 1251 297 C 1249 298 1243 300 1241 299 C 1237 299 1229 292 1227 288 C 1232 287 1244 285 1246 281 C 1251 273 1234 268 1229 268 C 1222 269 1223 277 1219 279 C 1216 280 1215 277 1214 275 C 1214 271 1218 257 1210 259 C 1203 260 1207 278 1201 280 C 1197 281 1197 275 1197 273 C 1197 273 1198 263 1198 263 z" id="_nwy"/>
                    <path className={classes['_den']} d="M 939 716 C 933 720 923 725 917 728 C 912 729 904 731 900 734 C 896 737 895 742 894 746 C 892 754 888 769 889 777 C 891 785 894 784 894 796 C 899 796 912 796 916 798 C 919 794 919 789 920 784 C 922 779 927 774 930 770 C 932 768 934 767 936 766 C 938 766 942 768 943 763 C 943 757 933 755 934 747 C 934 743 938 738 940 734 C 943 728 943 721 939 716 z M 946 786 C 951 798 951 796 959 805 C 962 809 962 810 967 813 C 967 813 969 804 969 804 C 971 802 974 800 974 797 C 975 795 973 791 972 788 C 970 782 972 777 964 775 C 963 775 959 775 958 775 C 954 776 955 780 946 786 z M 944 812 C 943 813 943 815 943 816 C 942 826 959 823 952 815 C 951 815 950 814 949 814 C 947 813 946 812 944 812 z" id="_den"/>
                    <path className={classes['_hol']} d="M 768 906 C 778 917 791 914 799 922 C 804 928 800 932 804 943 C 804 943 806 943 806 943 C 809 937 813 931 815 924 C 816 918 817 911 820 906 C 824 900 834 897 839 892 C 841 889 841 883 843 879 C 847 866 850 867 850 850 C 850 850 823 849 823 849 C 815 850 801 861 796 866 C 786 876 790 890 780 900 C 776 903 772 904 768 906 z" id="_hol"/>
                    <path className={classes['_bel']} d="M 715 931 C 715 931 747 950 747 950 C 760 958 761 961 777 969 C 782 972 798 980 804 980 C 809 979 808 972 807 968 C 805 954 798 945 796 940 C 794 934 796 929 793 926 C 791 923 785 922 782 921 C 782 921 775 918 775 918 C 769 915 766 914 761 908 C 754 910 745 912 738 913 C 733 914 726 914 722 917 C 718 921 717 926 715 931 z" id="_bel"/>
                    <path className={classes['_swi']} d="M 778 1102 C 786 1104 791 1096 798 1099 C 809 1103 801 1114 814 1113 C 822 1111 825 1108 834 1112 C 842 1114 846 1121 851 1120 C 856 1120 857 1113 865 1112 C 870 1111 883 1114 886 1111 C 890 1109 890 1101 888 1098 C 887 1097 885 1094 884 1093 C 880 1089 877 1086 874 1081 C 868 1070 869 1061 853 1061 C 853 1061 827 1063 827 1063 C 823 1063 818 1063 814 1065 C 811 1066 797 1081 793 1085 C 793 1085 786 1092 786 1092 C 782 1096 780 1095 778 1102 z" id="_swi"/>
                    <path className={classes['_ven']} d="M 957 1271 C 959 1266 960 1265 964 1260 C 966 1258 969 1255 969 1252 C 969 1250 965 1243 964 1240 C 959 1228 962 1222 951 1210 C 941 1199 927 1193 928 1176 C 928 1168 932 1168 933 1164 C 934 1160 928 1155 935 1150 C 938 1148 949 1143 952 1142 C 955 1141 959 1141 961 1139 C 962 1137 964 1125 965 1122 C 965 1120 965 1118 963 1117 C 961 1115 950 1114 947 1114 C 942 1114 929 1115 926 1119 C 924 1121 924 1123 923 1126 C 918 1134 910 1143 900 1142 C 894 1141 892 1136 888 1136 C 886 1136 883 1139 881 1141 C 877 1146 873 1153 872 1160 C 872 1167 879 1174 884 1178 C 891 1184 897 1186 903 1190 C 912 1196 920 1205 926 1213 C 934 1224 937 1231 942 1244 C 942 1244 945 1260 945 1260 C 946 1264 953 1269 957 1271 z" id="_ven"/>
                    <path className={classes['_pie']} d="M 804 1114 C 803 1117 801 1120 802 1124 C 803 1128 807 1130 806 1135 C 805 1138 801 1142 801 1146 C 800 1151 804 1156 805 1161 C 806 1168 800 1176 806 1184 C 807 1186 809 1188 811 1189 C 815 1191 823 1187 826 1184 C 832 1179 839 1173 848 1174 C 856 1175 860 1182 869 1186 C 871 1183 875 1178 874 1175 C 874 1171 869 1169 869 1161 C 869 1149 878 1138 887 1131 C 887 1131 886 1119 886 1119 C 886 1119 866 1116 866 1116 C 859 1117 860 1129 851 1127 C 844 1126 838 1116 830 1115 C 821 1114 814 1125 804 1114 z" id="_pie"/>
                    <path className={classes['_tus']} d="M 878 1178 C 877 1180 873 1185 873 1188 C 873 1191 875 1194 876 1201 C 877 1208 877 1215 878 1221 C 882 1232 891 1245 899 1253 C 899 1253 914 1239 914 1239 C 914 1239 932 1229 932 1229 C 927 1220 918 1207 911 1200 C 901 1191 899 1192 889 1186 C 889 1186 878 1178 878 1178 z" id="_tus"/>
                    <path className={classes['_rom']} d="M 973 1291 C 973 1291 951 1271 951 1271 C 951 1271 942 1262 942 1262 C 942 1262 939 1249 939 1249 C 939 1249 934 1233 934 1233 C 925 1235 916 1241 909 1246 C 907 1249 903 1252 903 1256 C 903 1261 911 1268 914 1272 C 921 1280 926 1290 936 1295 C 941 1297 945 1296 950 1297 C 956 1298 958 1301 961 1300 C 961 1300 973 1291 973 1291 z" id="_rom"/>
                    <path className={classes['_apu']} d="M 972 1256 C 968 1260 960 1267 960 1272 C 960 1277 967 1281 969 1283 C 969 1283 991 1300 991 1300 C 996 1304 1005 1314 1008 1320 C 1011 1326 1010 1330 1013 1334 C 1015 1337 1028 1344 1032 1345 C 1034 1342 1038 1334 1041 1332 C 1042 1330 1043 1329 1046 1330 C 1046 1330 1052 1335 1052 1335 C 1057 1339 1063 1343 1069 1346 C 1072 1347 1077 1351 1079 1348 C 1081 1345 1079 1339 1077 1336 C 1074 1331 1061 1323 1055 1319 C 1044 1312 1029 1303 1021 1294 C 1019 1292 1018 1290 1017 1287 C 1017 1285 1018 1282 1016 1280 C 1015 1279 1010 1279 1008 1279 C 1003 1278 999 1277 995 1275 C 984 1270 980 1262 972 1256 z" id="_apu"/>
                    <path className={classes['_nap']} d="M 1029 1348 C 1024 1345 1013 1339 1009 1335 C 1006 1331 1007 1326 1005 1321 C 1002 1314 992 1305 986 1300 C 982 1297 978 1294 973 1296 C 969 1297 962 1303 962 1307 C 962 1310 964 1314 966 1316 C 966 1318 968 1321 969 1322 C 972 1326 979 1322 984 1326 C 988 1329 986 1333 991 1340 C 996 1346 1004 1350 1008 1357 C 1010 1360 1017 1377 1017 1381 C 1018 1383 1018 1385 1017 1387 C 1017 1389 1009 1402 1008 1404 C 1005 1407 1001 1412 1004 1417 C 1007 1421 1012 1419 1016 1416 C 1019 1413 1024 1405 1025 1400 C 1026 1397 1027 1392 1029 1389 C 1032 1385 1037 1387 1039 1385 C 1042 1383 1042 1378 1042 1375 C 1041 1362 1030 1364 1028 1356 C 1027 1354 1028 1350 1029 1348 z" id="_nap"/>
                    <path className={classes['_bur']} d="M 773 975 C 769 985 759 1008 751 1015 C 747 1018 745 1018 742 1021 C 742 1021 733 1028 733 1028 C 733 1028 725 1033 725 1033 C 721 1036 720 1039 717 1041 C 713 1044 710 1043 707 1046 C 702 1052 703 1058 701 1064 C 699 1073 692 1083 683 1086 C 683 1090 684 1093 688 1096 C 692 1099 699 1098 702 1103 C 704 1107 701 1113 700 1118 C 700 1128 713 1145 724 1138 C 731 1134 735 1120 737 1112 C 737 1108 736 1100 740 1098 C 743 1096 746 1097 749 1098 C 754 1100 759 1101 764 1101 C 766 1101 770 1101 772 1100 C 772 1100 785 1086 785 1086 C 791 1080 807 1065 811 1058 C 813 1054 813 1049 815 1044 C 815 1044 818 1034 818 1034 C 818 1028 812 1019 808 1014 C 802 1003 800 998 802 986 C 802 986 773 975 773 975 z" id="_bur"/>
                    <path className={classes['_mar']} d="M 741 1100 C 741 1112 739 1122 733 1133 C 730 1138 727 1142 721 1143 C 715 1144 712 1141 707 1139 C 704 1143 700 1147 695 1148 C 691 1150 682 1148 677 1153 C 674 1155 670 1164 667 1168 C 667 1168 650 1192 650 1192 C 654 1197 668 1205 674 1208 C 677 1209 682 1211 685 1211 C 690 1210 686 1204 690 1196 C 693 1189 703 1182 711 1181 C 721 1180 725 1187 733 1189 C 738 1190 743 1188 748 1191 C 754 1196 756 1207 768 1208 C 781 1210 791 1196 803 1193 C 801 1186 797 1185 797 1176 C 797 1176 798 1161 798 1161 C 797 1157 794 1153 794 1147 C 794 1140 800 1137 799 1133 C 799 1130 795 1127 794 1123 C 794 1117 800 1112 798 1108 C 797 1105 792 1106 789 1107 C 781 1109 778 1112 773 1104 C 760 1107 753 1102 741 1100 z" id="_mar"/>
                    <path className={classes['_gas']} d="M 611 1058 C 611 1058 611 1079 611 1079 C 611 1079 614 1086 614 1086 C 614 1086 609 1084 609 1084 C 606 1088 601 1097 601 1102 C 600 1105 601 1107 601 1110 C 600 1113 591 1131 589 1134 C 587 1138 584 1141 580 1145 C 578 1146 576 1148 576 1151 C 577 1155 588 1165 592 1168 C 600 1173 611 1180 620 1183 C 620 1183 633 1185 633 1185 C 637 1186 643 1189 647 1191 C 647 1191 664 1167 664 1167 C 667 1162 671 1153 676 1149 C 682 1145 688 1147 695 1145 C 699 1143 702 1140 705 1137 C 702 1132 698 1128 697 1122 C 696 1116 699 1110 700 1104 C 695 1102 688 1101 684 1098 C 680 1094 681 1090 677 1087 C 675 1086 670 1085 663 1080 C 658 1076 655 1070 650 1067 C 643 1063 620 1059 611 1058 z" id="_gas"/>
                    <path className={classes['_pic']} d="M 711 936 C 707 940 703 944 698 946 C 694 947 692 947 688 947 C 684 948 680 950 677 952 C 677 952 677 954 677 954 C 677 954 681 956 681 956 C 681 956 681 958 681 958 C 673 960 670 959 667 960 C 664 961 662 975 661 979 C 673 979 687 980 698 977 C 705 976 709 972 715 972 C 721 971 728 975 733 977 C 749 983 743 978 763 989 C 763 989 770 972 770 972 C 759 967 755 962 745 956 C 745 956 711 936 711 936 z" id="_pic"/>
                    <path className={classes['_par']} d="M 661 980 C 657 990 660 1003 660 1014 C 660 1035 658 1046 654 1066 C 658 1069 658 1071 661 1074 C 666 1079 675 1084 682 1082 C 690 1081 695 1072 697 1065 C 699 1058 698 1052 703 1045 C 708 1039 711 1041 716 1038 C 716 1038 722 1031 722 1031 C 722 1031 732 1025 732 1025 C 732 1025 740 1018 740 1018 C 744 1015 746 1015 750 1012 C 753 1008 759 997 761 992 C 745 983 747 986 733 981 C 728 979 720 975 715 975 C 709 976 706 979 701 980 C 693 983 684 982 676 982 C 671 982 665 983 661 980 z" id="_par"/>
                    <path className={classes['_bre']} d="M 631 936 C 631 936 633 952 633 952 C 633 952 631 966 631 966 C 631 966 633 976 633 976 C 626 975 627 974 621 971 C 621 971 601 963 601 963 C 597 961 595 957 592 956 C 589 955 586 956 582 956 C 576 955 564 953 559 958 C 557 959 556 962 555 965 C 553 967 550 969 550 973 C 552 980 562 979 567 982 C 573 985 586 997 591 1002 C 595 1007 593 1008 595 1011 C 596 1013 598 1015 599 1019 C 601 1024 599 1027 599 1031 C 600 1037 605 1048 610 1052 C 613 1055 619 1056 623 1056 C 623 1056 651 1063 651 1063 C 653 1053 656 1036 656 1026 C 656 1026 656 1009 656 1009 C 656 1009 655 999 655 999 C 655 982 659 974 662 958 C 656 956 651 954 647 950 C 642 945 644 941 641 939 C 640 937 634 936 631 936 z M 553 968 C 553 968 553 969 553 969 C 553 969 552 968 552 968 C 552 968 553 968 553 968 z" id="_bre"/>
                    <path className={classes['_spa']} d="M 386 1138 C 391 1137 398 1136 403 1138 C 407 1141 408 1144 414 1146 C 424 1149 439 1146 447 1159 C 449 1162 450 1166 450 1169 C 448 1177 442 1174 434 1184 C 434 1184 415 1216 415 1216 C 413 1219 410 1224 407 1226 C 405 1228 401 1230 400 1232 C 399 1235 399 1243 399 1246 C 399 1257 395 1257 393 1265 C 392 1272 396 1276 391 1284 C 388 1289 383 1291 379 1295 C 375 1300 372 1308 370 1314 C 379 1319 387 1329 389 1339 C 391 1347 388 1357 397 1362 C 404 1366 407 1361 413 1359 C 418 1358 420 1361 427 1361 C 427 1361 445 1357 445 1357 C 454 1357 462 1363 470 1365 C 478 1368 478 1367 485 1367 C 491 1366 497 1370 501 1369 C 507 1368 509 1360 520 1355 C 527 1352 541 1353 545 1350 C 545 1350 565 1326 565 1326 C 569 1323 575 1322 579 1321 C 577 1315 572 1310 572 1303 C 573 1298 577 1294 580 1290 C 584 1285 588 1276 592 1271 C 592 1271 599 1266 599 1266 C 604 1260 605 1257 613 1257 C 613 1255 613 1253 615 1251 C 618 1247 631 1245 636 1245 C 650 1243 675 1237 683 1225 C 685 1222 686 1220 686 1217 C 671 1217 656 1204 643 1196 C 640 1195 635 1192 632 1191 C 628 1191 626 1192 621 1190 C 613 1188 604 1183 597 1179 C 591 1175 583 1169 578 1164 C 578 1164 567 1151 567 1151 C 567 1151 558 1148 558 1148 C 553 1145 552 1143 548 1141 C 544 1139 540 1141 533 1138 C 533 1138 522 1132 522 1132 C 516 1130 514 1131 506 1127 C 506 1127 472 1110 472 1110 C 472 1110 448 1101 448 1101 C 439 1095 439 1088 427 1089 C 417 1089 419 1094 414 1096 C 409 1098 403 1095 400 1095 C 398 1095 396 1096 394 1098 C 385 1105 390 1114 390 1123 C 390 1129 388 1133 386 1138 z" id="_spa"/>
                    <path className={classes['_por']} d="M 394 1143 C 391 1144 387 1144 385 1146 C 383 1148 381 1158 380 1161 C 378 1169 372 1180 369 1187 C 365 1194 356 1210 351 1215 C 346 1220 340 1218 336 1224 C 335 1227 332 1240 332 1243 C 332 1245 332 1248 333 1249 C 335 1253 343 1251 343 1259 C 343 1264 340 1269 338 1273 C 336 1280 339 1280 334 1288 C 332 1291 326 1298 327 1302 C 327 1304 337 1309 340 1310 C 344 1312 347 1314 352 1314 C 354 1314 362 1312 363 1311 C 365 1310 369 1298 371 1295 C 379 1282 387 1287 387 1273 C 387 1269 387 1265 388 1261 C 389 1256 392 1254 393 1248 C 394 1242 391 1236 394 1230 C 397 1223 401 1226 409 1215 C 409 1215 429 1180 429 1180 C 439 1168 446 1171 442 1163 C 437 1153 421 1156 412 1152 C 404 1149 404 1143 394 1143 z" id="_por"/>
                    <path className={classes['_naf']} d="M 216 1527 C 216 1527 780 1527 780 1527 C 780 1505 779 1473 783 1452 C 786 1442 790 1439 793 1431 C 784 1430 782 1426 770 1425 C 763 1424 763 1428 757 1427 C 752 1427 746 1422 739 1422 C 736 1422 721 1426 718 1427 C 715 1428 711 1430 708 1429 C 705 1429 701 1425 699 1423 C 695 1420 691 1417 686 1416 C 673 1412 646 1412 632 1412 C 632 1412 612 1410 612 1410 C 602 1410 593 1409 583 1411 C 575 1412 568 1415 561 1418 C 558 1420 552 1423 548 1423 C 544 1423 542 1420 539 1420 C 537 1419 526 1419 524 1420 C 520 1423 516 1427 510 1430 C 501 1434 486 1430 477 1427 C 474 1426 469 1424 466 1422 C 464 1419 463 1417 462 1414 C 457 1415 456 1416 451 1416 C 440 1416 423 1415 416 1406 C 411 1400 409 1391 406 1384 C 405 1381 403 1377 399 1378 C 392 1378 385 1387 381 1392 C 369 1405 360 1419 345 1428 C 332 1437 308 1433 292 1438 C 283 1441 272 1448 265 1454 C 265 1454 256 1465 256 1465 C 256 1465 242 1475 242 1475 C 232 1485 218 1513 216 1527 z" id="_naf"/>
                    <path className={classes['_tun']} d="M 787 1527 C 787 1527 857 1527 857 1527 C 859 1527 863 1527 865 1526 C 867 1524 868 1521 869 1518 C 871 1510 872 1502 868 1494 C 864 1487 861 1486 856 1481 C 853 1478 852 1474 853 1470 C 854 1459 864 1455 869 1450 C 871 1448 873 1442 871 1440 C 869 1438 867 1439 865 1440 C 862 1442 855 1447 851 1446 C 846 1444 849 1438 846 1434 C 842 1429 832 1427 826 1427 C 826 1427 810 1430 810 1430 C 807 1431 804 1431 801 1433 C 795 1438 790 1451 789 1459 C 786 1477 787 1508 787 1527 z" id="_tun"/>
                    <path className={classes['_lon']} d="M 716 901 C 713 899 704 896 702 893 C 699 888 709 883 712 880 C 721 875 735 868 736 856 C 736 854 736 851 735 849 C 731 842 713 838 705 840 C 705 840 694 845 694 845 C 689 847 684 849 679 851 C 679 851 669 853 669 853 C 661 856 655 866 655 875 C 656 883 659 891 664 898 C 665 900 667 903 669 905 C 672 907 677 907 680 908 C 693 910 705 910 716 901 z" id="_lon"/>
                    <path className={classes['_wal']} d="M 612 810 C 624 811 622 824 617 828 C 612 833 594 831 590 837 C 586 844 597 847 601 849 C 608 852 613 860 619 864 C 625 866 626 863 634 865 C 633 867 632 868 630 870 C 619 878 611 870 603 870 C 596 870 596 877 590 872 C 583 878 586 880 571 888 C 565 892 560 890 555 896 C 558 897 561 900 564 900 C 567 900 572 897 575 896 C 582 894 591 897 596 902 C 603 899 605 894 610 892 C 615 891 624 896 630 897 C 630 897 660 900 660 900 C 657 891 650 882 651 872 C 652 864 657 856 664 852 C 668 849 671 849 672 847 C 674 845 672 836 672 832 C 667 831 649 824 645 821 C 642 818 640 815 640 810 C 640 807 640 803 639 800 C 633 792 615 804 612 810 z" id="_wal"/>
                    <path className={classes['_lvp']} d="M 622 715 C 622 715 633 711 633 711 C 636 700 641 699 643 706 C 644 715 635 723 630 730 C 624 738 625 742 634 745 C 637 747 636 746 639 746 C 643 747 642 749 645 750 C 647 751 652 751 654 751 C 654 751 647 757 647 757 C 647 757 651 765 651 765 C 651 765 651 778 651 778 C 652 783 654 788 652 793 C 650 803 640 801 644 813 C 644 815 645 817 647 818 C 650 820 668 827 672 828 C 672 813 670 810 672 793 C 672 793 677 777 677 777 C 679 771 678 760 677 754 C 676 748 665 735 661 728 C 654 714 657 711 657 697 C 650 695 633 692 626 692 C 622 693 617 695 616 699 C 615 703 619 703 621 705 C 622 707 622 712 622 715 z" id="_lvp"/>
                    <path className={classes['_yor']} d="M 680 750 C 680 750 681 758 681 758 C 681 758 681 767 681 767 C 681 767 675 804 675 804 C 675 804 677 848 677 848 C 683 846 698 840 703 837 C 703 837 707 832 707 832 C 710 830 714 828 714 824 C 714 818 707 811 704 806 C 711 803 712 802 711 794 C 709 779 702 779 698 768 C 694 761 695 754 692 752 C 690 750 683 750 680 750 z" id="_yor"/>
                    <path className={classes['_edi']} d="M 690 621 C 683 631 677 631 673 638 C 669 644 667 656 666 663 C 666 663 661 699 661 699 C 660 708 659 714 662 723 C 664 727 674 742 677 746 C 683 746 689 748 692 747 C 697 745 697 737 696 733 C 693 724 681 713 687 701 C 691 693 701 684 707 677 C 710 674 714 669 714 665 C 712 657 697 653 690 652 C 687 652 679 654 677 651 C 674 648 681 643 683 642 C 683 642 700 631 700 631 C 706 626 702 623 696 622 C 696 622 690 621 690 621 z" id="_edi"/>
                    <path className={classes['_cly']} d="M 624 681 C 629 681 639 680 631 688 C 631 688 658 694 658 694 C 658 694 661 670 661 670 C 662 661 665 645 669 637 C 674 629 682 627 686 620 C 682 619 676 617 672 618 C 667 619 664 624 661 628 C 659 630 647 638 645 639 C 640 641 636 632 631 639 C 627 646 636 652 636 658 C 635 664 626 673 624 681 z" id="_cly"/>
                    <path className={classes['unplayable']} d="M 560 240 C 560 240 554 258 554 258 C 549 251 550 244 546 242 C 539 240 539 256 533 247 C 533 247 529 255 529 255 C 529 255 522 250 522 250 C 522 264 533 259 542 264 C 546 266 549 271 545 274 C 543 276 541 276 539 277 C 539 277 543 286 543 286 C 531 284 525 274 512 273 C 516 281 528 284 528 291 C 529 295 525 306 522 308 C 517 312 512 314 510 307 C 506 308 506 310 505 314 C 514 319 522 323 529 331 C 537 341 537 361 557 360 C 564 360 568 358 576 358 C 576 358 595 360 595 360 C 595 360 620 359 620 359 C 626 358 638 352 643 347 C 654 338 650 326 649 314 C 649 307 650 300 644 294 C 639 290 634 290 628 290 C 620 290 617 291 611 286 C 609 287 606 289 604 289 C 599 287 601 276 593 278 C 592 279 591 279 590 280 C 589 281 587 282 586 283 C 586 283 585 268 585 268 C 584 268 583 268 582 270 C 579 272 572 290 565 279 C 563 280 558 283 556 283 C 552 282 555 273 556 271 C 559 266 562 265 564 262 C 566 259 566 246 564 243 C 563 241 562 241 560 240 z M 536 763 C 532 771 524 766 517 770 C 512 772 508 777 506 781 C 504 784 502 788 499 789 C 496 790 492 787 489 786 C 489 793 492 793 486 798 C 486 798 486 800 486 800 C 490 803 491 803 489 808 C 495 812 492 813 492 819 C 492 819 514 817 514 817 C 514 817 529 815 529 815 C 529 815 544 811 544 811 C 544 811 559 813 559 813 C 562 813 565 813 568 812 C 572 809 583 797 584 792 C 585 788 585 774 590 764 C 592 758 596 755 601 753 C 605 751 611 750 613 746 C 616 741 612 736 611 731 C 609 726 611 721 609 718 C 606 714 603 716 599 714 C 599 714 594 709 594 709 C 591 708 583 705 580 705 C 572 703 572 707 566 712 C 564 713 561 715 560 717 C 559 720 564 724 558 727 C 548 731 534 717 526 719 C 520 721 525 728 523 733 C 521 738 515 741 514 746 C 513 754 530 762 536 763 z M 845 1233 C 838 1239 834 1238 831 1242 C 825 1249 826 1269 838 1275 C 844 1265 853 1243 845 1233 z M 809 1293 C 806 1304 812 1303 813 1311 C 813 1311 811 1325 811 1325 C 811 1332 812 1339 810 1346 C 809 1350 807 1360 811 1363 C 816 1367 820 1361 825 1360 C 828 1359 830 1360 832 1358 C 834 1355 837 1346 838 1343 C 840 1334 846 1316 846 1307 C 846 1307 846 1298 846 1298 C 845 1297 845 1294 844 1293 C 843 1290 839 1288 836 1288 C 830 1287 823 1293 817 1294 C 814 1294 812 1294 809 1293 z M 647 1310 C 647 1310 659 1317 659 1317 C 666 1320 672 1311 671 1307 C 669 1301 654 1298 647 1310 z M 918 1408 C 915 1410 909 1417 912 1421 C 915 1427 924 1428 930 1430 C 939 1434 951 1443 958 1449 C 963 1453 974 1461 981 1458 C 984 1456 985 1453 985 1450 C 985 1444 985 1443 986 1436 C 986 1436 990 1423 990 1423 C 990 1420 990 1416 988 1414 C 985 1412 977 1410 974 1410 C 963 1410 954 1413 942 1411 C 935 1409 925 1406 918 1408 z M 1477 1489 C 1478 1492 1478 1494 1480 1497 C 1487 1508 1502 1502 1510 1495 C 1510 1495 1517 1489 1517 1489 C 1520 1486 1522 1486 1525 1485 C 1523 1475 1523 1477 1528 1467 C 1522 1469 1520 1471 1514 1473 C 1514 1473 1496 1477 1496 1477 C 1493 1478 1493 1481 1490 1484 C 1487 1487 1481 1488 1477 1489 z M 1302 1505 C 1300 1506 1297 1507 1295 1507 C 1293 1507 1290 1504 1288 1503 C 1288 1503 1273 1499 1273 1499 C 1264 1498 1256 1503 1240 1497 C 1235 1495 1229 1493 1226 1499 C 1225 1500 1225 1502 1225 1504 C 1226 1505 1226 1506 1227 1506 C 1227 1506 1245 1508 1245 1508 C 1252 1510 1258 1514 1265 1514 C 1270 1514 1272 1513 1276 1513 C 1286 1512 1295 1514 1302 1505 z" id="unplayable"/>
                    <path className={classes['unplayable_water']} d="M 1774 1010 C 1771 1023 1771 1042 1771 1056 C 1771 1059 1771 1064 1773 1066 C 1775 1068 1780 1069 1783 1071 C 1788 1073 1794 1078 1797 1082 C 1805 1092 1802 1098 1815 1112 C 1815 1112 1841 1134 1841 1134 C 1846 1138 1848 1137 1855 1142 C 1855 1142 1876 1161 1876 1161 C 1880 1164 1884 1166 1890 1167 C 1894 1167 1901 1166 1904 1170 C 1905 1172 1905 1174 1903 1175 C 1900 1177 1893 1176 1890 1183 C 1888 1187 1889 1195 1890 1200 C 1891 1209 1891 1210 1891 1219 C 1891 1219 1888 1219 1888 1219 C 1888 1225 1889 1231 1891 1237 C 1900 1263 1918 1270 1943 1275 C 1952 1277 1961 1278 1970 1279 C 1985 1280 2010 1266 2017 1253 C 2021 1247 2021 1243 2021 1237 C 2021 1237 2021 1226 2021 1226 C 2021 1216 2017 1207 2015 1198 C 2014 1193 2013 1185 2009 1180 C 2006 1175 2001 1174 1996 1172 C 1993 1171 1988 1169 1987 1166 C 1986 1164 1988 1162 1988 1160 C 1988 1160 1988 1154 1988 1154 C 1988 1151 1990 1149 1991 1144 C 1983 1146 1976 1152 1973 1160 C 1965 1156 1961 1145 1958 1137 C 1958 1135 1956 1130 1956 1128 C 1958 1122 1964 1128 1969 1127 C 1969 1127 1984 1123 1984 1123 C 1989 1120 1996 1110 1996 1104 C 1995 1096 1985 1096 1977 1091 C 1973 1088 1968 1083 1964 1082 C 1961 1081 1959 1081 1956 1082 C 1947 1087 1950 1100 1950 1108 C 1940 1106 1933 1094 1934 1085 C 1934 1081 1935 1071 1932 1068 C 1927 1065 1918 1073 1910 1071 C 1910 1071 1902 1069 1902 1069 C 1899 1069 1895 1070 1892 1067 C 1889 1065 1889 1061 1886 1057 C 1883 1053 1877 1049 1872 1047 C 1866 1044 1865 1044 1859 1043 C 1857 1043 1854 1042 1853 1040 C 1852 1037 1854 1035 1856 1033 C 1863 1026 1870 1024 1872 1020 C 1875 1015 1871 1010 1870 1005 C 1869 998 1874 991 1880 987 C 1884 984 1887 984 1890 980 C 1896 971 1892 949 1888 939 C 1887 935 1885 930 1881 927 C 1875 924 1867 926 1861 927 C 1851 929 1837 935 1830 942 C 1830 942 1814 964 1814 964 C 1808 971 1801 975 1796 983 C 1791 991 1795 998 1787 1007 C 1785 1009 1782 1012 1779 1011 C 1777 1011 1775 1011 1774 1010 z" id="unplayable_water"/>
                    <path className={classes['_nat']} d="M 202 175 C 202 175 202 859 202 859 C 202 859 240 849 240 849 C 272 844 323 842 355 846 C 372 849 395 856 410 862 C 416 865 419 866 424 869 C 426 871 429 873 432 872 C 436 871 445 861 448 858 C 448 858 477 829 477 829 C 483 823 489 819 491 811 C 487 809 487 808 488 804 C 483 799 483 797 489 794 C 488 792 485 788 488 786 C 491 782 496 789 500 786 C 500 786 508 774 508 774 C 515 766 523 765 533 765 C 527 762 510 754 512 746 C 513 741 519 738 521 733 C 523 727 517 721 525 718 C 530 716 537 719 542 722 C 549 725 553 726 560 724 C 559 722 557 719 558 717 C 558 714 561 713 563 712 C 568 708 571 703 576 702 C 580 702 591 705 594 707 C 594 707 599 711 599 711 C 603 714 606 712 610 716 C 613 720 612 725 613 729 C 614 736 616 737 617 741 C 617 745 613 750 611 753 C 615 756 618 759 623 761 C 631 764 640 763 648 763 C 645 759 645 759 647 754 C 643 752 642 752 641 748 C 640 748 638 749 637 749 C 632 749 623 744 624 737 C 626 731 633 724 637 719 C 640 713 640 709 640 703 C 634 707 637 713 628 713 C 627 714 627 715 626 716 C 625 716 624 717 622 717 C 618 715 620 708 620 705 C 613 705 611 700 615 695 C 620 689 627 691 633 683 C 633 683 629 683 629 683 C 612 683 633 668 633 658 C 634 652 625 646 629 639 C 633 632 638 633 642 638 C 646 636 656 630 659 627 C 664 621 665 618 673 615 C 673 615 670 614 670 614 C 670 614 672 594 672 594 C 672 594 676 553 676 553 C 676 553 684 485 684 485 C 684 476 684 469 682 460 C 679 450 664 424 658 413 C 658 413 629 359 629 359 C 629 359 620 362 620 362 C 620 362 593 362 593 362 C 593 362 572 360 572 360 C 563 361 553 365 544 359 C 534 353 531 337 526 330 C 522 325 515 322 510 319 C 508 318 504 316 503 313 C 503 312 504 311 504 310 C 507 299 511 311 517 309 C 523 307 523 303 525 298 C 525 298 526 293 526 293 C 527 286 519 284 514 279 C 512 277 509 274 511 272 C 514 270 518 272 520 272 C 527 275 531 280 539 282 C 537 275 539 275 545 273 C 542 260 529 267 522 258 C 518 253 519 244 528 251 C 531 247 532 243 536 248 C 538 246 540 241 543 240 C 550 237 553 249 553 254 C 559 242 556 229 556 216 C 556 216 556 175 556 175 C 556 175 202 175 202 175 z" id="_nat"/>
                    <path className={classes['_nrg']} d="M 560 175 C 560 175 560 228 560 228 C 560 243 569 238 568 255 C 567 263 563 265 560 269 C 558 273 556 278 556 282 C 556 282 568 277 568 277 C 568 277 568 281 568 281 C 577 279 575 273 580 268 C 586 263 587 268 587 273 C 587 273 587 278 587 278 C 589 277 593 276 595 276 C 601 276 602 283 604 287 C 606 286 609 285 611 285 C 613 285 614 287 618 288 C 618 288 630 288 630 288 C 633 288 635 288 638 289 C 653 293 651 308 652 320 C 653 327 654 334 651 341 C 647 348 639 353 632 357 C 632 357 667 423 667 423 C 679 443 688 458 688 482 C 688 482 684 516 684 516 C 684 516 677 587 677 587 C 677 587 674 615 674 615 C 674 615 698 620 698 620 C 701 621 705 623 708 623 C 710 622 718 615 720 612 C 730 604 737 597 748 590 C 775 574 808 568 838 562 C 848 559 868 554 877 555 C 886 543 890 538 905 541 C 901 531 909 531 917 530 C 913 525 913 522 920 519 C 926 517 928 521 932 520 C 935 519 941 513 947 510 C 953 506 957 508 959 506 C 961 504 961 502 964 497 C 967 492 978 481 983 480 C 985 479 987 480 989 480 C 989 466 999 454 1006 442 C 1012 433 1017 421 1023 413 C 1023 413 1042 394 1042 394 C 1042 394 1053 378 1053 378 C 1053 378 1069 356 1069 356 C 1069 356 1080 342 1080 342 C 1082 340 1086 336 1087 335 C 1088 332 1085 330 1085 327 C 1084 324 1088 319 1090 316 C 1094 313 1097 315 1099 312 C 1102 310 1103 305 1109 303 C 1113 301 1120 302 1131 297 C 1140 293 1145 286 1153 281 C 1159 277 1169 272 1172 266 C 1174 263 1172 256 1171 252 C 1171 252 1171 234 1171 234 C 1171 234 1172 219 1172 219 C 1172 219 1174 175 1174 175 C 1174 175 560 175 560 175 z" id="_nrg"/>
                    <path className={classes['_bar']} d="M 1178 175 C 1178 175 1176 214 1176 214 C 1176 214 1175 230 1175 230 C 1175 230 1175 246 1175 246 C 1175 249 1175 259 1177 261 C 1179 264 1183 263 1184 267 C 1186 271 1183 283 1183 288 C 1189 282 1189 273 1193 266 C 1194 264 1197 260 1199 262 C 1201 265 1199 274 1200 279 C 1204 273 1202 263 1207 258 C 1210 254 1217 257 1218 262 C 1218 267 1215 270 1217 278 C 1222 274 1222 268 1228 266 C 1234 265 1252 272 1249 280 C 1247 286 1236 289 1230 289 C 1232 292 1237 296 1241 297 C 1246 297 1248 293 1260 293 C 1265 285 1277 288 1278 293 C 1278 295 1275 299 1274 301 C 1284 305 1293 302 1303 302 C 1306 302 1312 302 1315 302 C 1322 304 1337 311 1344 314 C 1344 314 1359 319 1359 319 C 1371 322 1386 326 1395 334 C 1398 337 1407 349 1408 353 C 1410 365 1401 379 1393 387 C 1390 390 1387 393 1383 395 C 1379 396 1370 397 1366 397 C 1357 397 1330 394 1322 392 C 1322 392 1313 388 1313 388 C 1309 388 1306 390 1301 388 C 1295 386 1294 383 1287 380 C 1289 391 1296 392 1304 398 C 1308 401 1310 404 1315 406 C 1319 408 1323 409 1327 412 C 1334 419 1331 430 1333 436 C 1335 440 1340 447 1343 451 C 1345 455 1346 459 1350 462 C 1350 462 1369 469 1369 469 C 1372 470 1384 476 1387 475 C 1389 475 1392 472 1394 470 C 1392 465 1389 460 1384 458 C 1381 458 1378 458 1375 457 C 1371 455 1367 450 1365 446 C 1363 441 1364 431 1371 430 C 1375 430 1380 434 1383 436 C 1388 438 1391 439 1397 439 C 1397 439 1423 439 1423 439 C 1430 439 1441 442 1447 441 C 1447 441 1447 439 1447 439 C 1440 437 1430 437 1426 435 C 1420 432 1418 426 1413 422 C 1409 418 1402 415 1401 410 C 1399 404 1408 395 1411 391 C 1420 380 1419 376 1422 372 C 1428 366 1440 366 1448 367 C 1451 360 1452 347 1447 340 C 1443 336 1439 337 1436 331 C 1433 326 1434 317 1430 306 C 1426 297 1421 294 1416 287 C 1428 283 1455 284 1459 299 C 1461 306 1452 309 1450 316 C 1450 318 1450 321 1452 322 C 1456 327 1471 331 1477 329 C 1493 325 1488 312 1489 300 C 1491 290 1496 278 1502 269 C 1504 265 1511 254 1515 253 C 1517 253 1518 253 1520 254 C 1520 249 1518 242 1520 237 C 1526 227 1534 237 1535 244 C 1537 251 1532 257 1532 270 C 1532 285 1533 289 1542 302 C 1543 298 1537 288 1537 282 C 1537 276 1539 270 1541 264 C 1541 260 1542 254 1544 251 C 1544 251 1548 244 1548 244 C 1550 240 1549 236 1554 229 C 1560 222 1565 224 1570 219 C 1574 214 1575 208 1577 204 C 1578 202 1580 199 1583 199 C 1585 199 1587 203 1588 204 C 1591 207 1593 209 1597 210 C 1596 207 1595 203 1595 200 C 1595 194 1598 192 1594 186 C 1593 184 1591 182 1589 181 C 1587 179 1584 177 1582 176 C 1578 174 1566 175 1561 175 C 1561 175 1493 175 1493 175 C 1493 175 1178 175 1178 175 z" id="_bar"/>
                    <path className={classes['_bot']} d="M 1058 692 C 1058 692 1062 700 1062 700 C 1062 700 1064 709 1064 709 C 1064 709 1085 715 1085 715 C 1085 715 1129 730 1129 730 C 1129 730 1154 733 1154 733 C 1155 731 1156 729 1158 727 C 1167 716 1178 731 1185 738 C 1187 741 1189 744 1192 745 C 1202 747 1204 731 1204 724 C 1204 719 1205 707 1202 703 C 1200 700 1197 701 1192 697 C 1186 692 1184 681 1186 673 C 1188 666 1194 663 1200 660 C 1211 654 1223 653 1236 654 C 1236 654 1250 656 1250 656 C 1264 657 1263 645 1270 640 C 1273 638 1275 638 1278 637 C 1278 637 1286 633 1286 633 C 1289 633 1294 634 1298 634 C 1287 619 1270 633 1268 612 C 1268 612 1261 617 1261 617 C 1261 617 1237 625 1237 625 C 1237 625 1208 636 1208 636 C 1203 638 1185 643 1181 642 C 1176 642 1175 637 1170 635 C 1170 635 1163 633 1163 633 C 1163 633 1154 628 1154 628 C 1154 628 1147 625 1147 625 C 1142 622 1139 614 1140 608 C 1140 599 1144 597 1144 587 C 1144 587 1138 553 1138 553 C 1137 542 1147 531 1154 523 C 1154 523 1166 508 1166 508 C 1166 508 1186 478 1186 478 C 1186 478 1197 464 1197 464 C 1198 462 1198 459 1197 457 C 1194 447 1182 441 1172 440 C 1168 440 1163 441 1159 443 C 1150 449 1142 466 1142 477 C 1142 487 1145 488 1143 494 C 1140 504 1125 518 1117 525 C 1117 525 1103 535 1103 535 C 1100 538 1097 542 1095 545 C 1085 558 1083 563 1079 579 C 1077 590 1074 609 1079 619 C 1082 624 1086 625 1090 629 C 1097 637 1103 646 1100 657 C 1100 661 1097 666 1095 669 C 1085 686 1076 689 1058 692 z" id="_bot"/>
                    <path className={classes['_bal']} d="M 1060 713 C 1059 721 1057 725 1057 734 C 1057 744 1056 753 1052 763 C 1050 769 1047 776 1041 779 C 1037 781 1031 780 1026 780 C 1021 780 1016 781 1012 785 C 1006 792 1007 803 993 804 C 990 804 985 803 983 804 C 981 805 975 814 973 817 C 966 825 955 830 945 829 C 931 828 931 808 917 804 C 918 812 919 816 924 823 C 927 826 935 831 935 836 C 935 839 932 844 930 846 C 934 846 939 846 942 845 C 946 844 947 842 952 840 C 952 840 967 836 967 836 C 971 834 979 830 984 831 C 985 831 986 831 987 831 C 994 835 986 840 989 844 C 991 848 1002 850 1007 850 C 1024 850 1040 843 1056 836 C 1070 830 1079 824 1094 831 C 1090 839 1098 844 1107 840 C 1113 838 1118 835 1121 830 C 1123 827 1123 824 1125 821 C 1127 818 1130 817 1133 816 C 1135 816 1137 817 1139 816 C 1143 814 1144 805 1144 801 C 1146 790 1140 777 1143 762 C 1143 762 1152 735 1152 735 C 1144 735 1138 735 1130 734 C 1122 732 1115 729 1108 727 C 1097 723 1071 715 1060 713 z" id="_bal"/>
                    <path className={classes['denmark_water']} d="M 919 800 C 926 804 928 807 932 813 C 935 817 938 823 943 825 C 950 828 962 823 967 818 C 970 816 973 811 975 808 C 978 805 980 801 981 797 C 982 787 978 782 976 773 C 976 773 965 771 965 771 C 965 771 943 769 943 769 C 943 769 935 769 935 769 C 935 769 926 778 926 778 C 926 778 922 786 922 786 C 922 786 919 800 919 800 z M 966 815 C 961 812 959 809 955 805 C 952 802 945 792 944 788 C 944 785 947 783 949 781 C 953 777 955 772 961 772 C 973 772 972 779 975 788 C 976 792 978 795 976 799 C 975 805 969 810 966 815 z M 957 821 C 954 822 952 823 949 823 C 935 824 939 804 951 812 C 952 813 953 814 954 815 C 956 817 956 819 957 821 z" id="denmark_water"/>
                    <path className={classes['_ska']} d="M 888 693 C 886 712 885 718 894 735 C 894 735 896 735 896 735 C 902 728 907 729 915 726 C 921 724 926 722 931 718 C 934 717 939 713 942 717 C 944 719 944 721 944 723 C 945 727 944 731 942 735 C 940 739 936 743 936 748 C 937 752 940 754 943 757 C 946 761 945 763 948 765 C 949 766 954 767 956 767 C 956 767 976 771 976 771 C 977 768 980 758 980 756 C 980 751 972 733 970 727 C 970 727 962 698 962 698 C 961 692 958 685 958 679 C 959 674 960 664 954 661 C 950 660 947 665 938 670 C 930 674 928 674 919 679 C 908 686 902 692 888 693 z" id="_ska"/>
                    <path className={classes['_hel']} d="M 817 848 C 830 846 840 850 849 848 C 856 846 859 840 865 840 C 873 840 877 851 884 847 C 889 844 890 837 890 832 C 890 832 890 819 890 819 C 890 814 889 813 889 807 C 889 801 891 798 891 790 C 891 785 889 784 888 780 C 887 777 887 772 887 769 C 887 769 867 769 867 769 C 853 769 842 778 834 788 C 823 802 821 815 819 832 C 819 832 817 848 817 848 z" id="_hel"/>
                    <path className={classes['_nth']} d="M 678 650 C 678 650 687 650 687 650 C 693 650 695 650 700 652 C 703 653 705 654 708 655 C 718 662 717 668 711 676 C 704 684 689 696 688 706 C 687 715 695 726 698 734 C 700 741 697 744 697 751 C 697 758 697 764 701 770 C 705 778 709 779 712 789 C 715 797 716 804 707 807 C 710 812 719 820 716 827 C 713 831 710 831 707 837 C 707 837 723 839 723 839 C 726 840 729 841 732 843 C 734 844 735 845 736 847 C 747 862 724 875 714 882 C 712 883 705 887 704 889 C 702 895 714 895 717 900 C 718 902 718 909 724 912 C 726 913 735 911 738 910 C 748 909 771 905 778 899 C 783 894 787 881 790 875 C 796 863 802 857 814 851 C 812 844 814 838 815 831 C 818 807 827 780 851 769 C 862 763 876 765 888 765 C 888 765 892 740 892 740 C 892 737 888 731 886 728 C 883 722 883 718 883 711 C 883 711 883 693 883 693 C 882 691 877 689 875 687 C 870 684 860 676 860 669 C 859 658 875 655 877 645 C 874 644 872 644 869 644 C 867 645 863 646 861 645 C 856 644 857 637 860 634 C 865 630 868 634 872 627 C 872 627 861 623 861 623 C 864 617 867 619 873 617 C 868 608 864 611 863 602 C 863 594 867 577 870 569 C 870 569 874 558 874 558 C 874 558 829 567 829 567 C 803 573 776 579 752 592 C 735 602 727 611 713 623 C 706 629 703 632 695 637 C 689 641 681 643 678 650 z" id="_nth"/>
                    <path className={classes['_eng']} d="M 498 922 C 498 922 514 932 514 932 C 514 932 541 946 541 946 C 541 946 558 954 558 954 C 558 954 571 952 571 952 C 571 952 583 954 583 954 C 583 954 592 954 592 954 C 592 954 602 962 602 962 C 602 962 610 964 610 964 C 610 964 630 973 630 973 C 627 962 629 965 631 956 C 631 951 627 939 629 936 C 631 933 640 935 643 936 C 646 940 645 945 648 949 C 654 956 668 957 677 957 C 674 951 676 950 682 947 C 691 943 693 947 700 943 C 712 936 714 925 721 915 C 719 913 716 908 714 907 C 712 907 708 908 706 909 C 702 910 698 911 693 911 C 688 911 675 910 671 908 C 666 906 666 904 659 903 C 659 903 630 900 630 900 C 625 899 618 895 613 894 C 606 894 603 902 598 903 C 596 904 593 901 591 900 C 588 899 583 897 579 897 C 574 898 570 901 566 902 C 560 903 559 899 554 900 C 554 900 534 907 534 907 C 534 907 498 922 498 922 z" id="_eng"/>
                    <path className={classes['_iri']} d="M 490 820 C 490 820 452 859 452 859 C 447 864 439 871 436 877 C 436 877 475 907 475 907 C 479 910 489 918 493 919 C 497 919 511 913 515 911 C 515 911 549 897 549 897 C 554 895 555 892 558 890 C 561 888 563 890 570 886 C 574 884 580 881 583 878 C 585 875 586 872 588 871 C 591 869 592 871 593 873 C 596 871 599 868 602 868 C 604 867 611 870 614 870 C 622 872 625 871 631 867 C 627 866 623 868 619 866 C 613 863 608 854 600 850 C 595 849 584 845 587 838 C 593 825 620 836 618 818 C 617 811 612 813 610 810 C 608 807 617 802 619 801 C 631 793 634 792 645 802 C 647 801 648 800 649 798 C 652 791 648 774 648 766 C 632 770 618 765 607 753 C 603 754 599 755 596 759 C 585 769 591 789 583 799 C 579 803 571 812 567 814 C 561 817 554 814 547 814 C 538 814 535 816 526 817 C 518 819 498 821 490 820 z" id="_iri"/>
                    <path className={classes['_mid']} d="M 202 1527 C 204 1527 210 1527 212 1526 C 214 1525 216 1518 217 1516 C 219 1509 222 1502 226 1496 C 230 1489 236 1479 242 1473 C 242 1473 254 1464 254 1464 C 260 1458 263 1453 270 1448 C 278 1442 288 1436 298 1434 C 298 1434 336 1430 336 1430 C 353 1425 369 1402 381 1389 C 381 1389 391 1379 391 1379 C 393 1378 396 1376 397 1374 C 401 1366 392 1362 389 1356 C 389 1356 387 1340 387 1340 C 385 1330 379 1321 370 1316 C 361 1311 358 1317 349 1316 C 343 1315 338 1311 333 1308 C 330 1307 325 1305 324 1302 C 323 1298 330 1291 332 1288 C 336 1281 334 1279 336 1273 C 337 1268 340 1265 340 1260 C 340 1252 335 1256 332 1252 C 328 1248 329 1242 331 1238 C 332 1232 335 1224 340 1220 C 344 1216 347 1217 352 1210 C 361 1200 375 1172 378 1159 C 378 1159 383 1139 383 1139 C 385 1134 387 1130 388 1123 C 388 1114 383 1107 390 1099 C 393 1096 397 1093 401 1093 C 404 1093 410 1096 414 1094 C 416 1094 416 1091 418 1090 C 421 1087 427 1086 430 1086 C 441 1087 439 1095 453 1101 C 453 1101 477 1109 477 1109 C 477 1109 503 1123 503 1123 C 503 1123 523 1130 523 1130 C 523 1130 534 1136 534 1136 C 539 1138 544 1138 547 1139 C 555 1141 558 1149 570 1148 C 575 1148 583 1139 587 1135 C 589 1132 598 1113 598 1110 C 599 1107 598 1106 598 1103 C 599 1096 605 1086 610 1082 C 606 1069 610 1069 609 1059 C 607 1048 598 1044 597 1032 C 597 1028 598 1025 597 1021 C 597 1016 594 1014 593 1012 C 592 1009 592 1007 591 1005 C 590 1003 586 1001 584 999 C 579 994 574 988 568 984 C 563 982 554 983 549 976 C 548 974 547 971 547 969 C 554 967 554 964 555 957 C 555 957 535 947 535 947 C 512 936 496 928 475 912 C 453 895 439 879 412 867 C 390 857 356 848 332 848 C 332 848 290 848 290 848 C 290 848 278 849 278 849 C 259 850 241 852 222 858 C 219 859 205 862 203 864 C 202 865 202 869 202 871 C 202 871 202 1527 202 1527 z" id="_mid"/>
                    <path className={classes['_wes']} d="M 674 1309 C 673 1311 672 1313 671 1315 C 670 1316 668 1318 667 1319 C 658 1325 653 1312 645 1313 C 645 1313 624 1321 624 1321 C 610 1325 596 1324 582 1324 C 577 1324 568 1325 564 1329 C 564 1329 546 1351 546 1351 C 540 1356 526 1353 517 1359 C 510 1363 506 1371 500 1372 C 497 1372 493 1370 490 1369 C 484 1368 482 1371 475 1369 C 475 1369 452 1360 452 1360 C 440 1358 436 1362 427 1363 C 418 1364 418 1358 408 1364 C 407 1365 404 1366 403 1368 C 400 1372 404 1376 406 1379 C 410 1386 412 1399 418 1406 C 424 1412 442 1414 451 1414 C 454 1414 460 1412 462 1413 C 466 1414 464 1418 470 1422 C 477 1426 494 1429 502 1429 C 516 1429 517 1420 526 1417 C 528 1417 537 1417 539 1417 C 543 1419 544 1421 549 1420 C 549 1420 571 1412 571 1412 C 580 1409 591 1407 600 1407 C 621 1407 621 1410 634 1410 C 650 1410 670 1409 685 1413 C 691 1415 694 1417 699 1421 C 701 1423 705 1427 708 1427 C 711 1428 714 1425 717 1425 C 717 1425 739 1419 739 1419 C 744 1420 753 1424 757 1425 C 762 1426 763 1422 770 1422 C 780 1423 784 1427 791 1429 C 799 1430 807 1428 815 1427 C 815 1427 819 1396 819 1396 C 819 1389 816 1376 813 1370 C 811 1366 808 1363 807 1358 C 805 1353 809 1345 809 1338 C 809 1335 808 1325 807 1324 C 806 1322 801 1320 799 1320 C 799 1320 779 1313 779 1313 C 758 1306 746 1305 724 1305 C 724 1305 692 1308 692 1308 C 686 1309 680 1310 674 1309 z" id="_wes"/>
                    <path className={classes['_gol']} d="M 674 1307 C 674 1307 698 1304 698 1304 C 720 1301 738 1299 760 1304 C 760 1304 809 1319 809 1319 C 813 1307 808 1308 806 1300 C 806 1296 807 1293 808 1290 C 821 1296 822 1286 836 1285 C 836 1269 826 1273 825 1257 C 825 1251 826 1242 831 1239 C 835 1236 838 1236 843 1232 C 848 1227 848 1222 854 1221 C 860 1219 870 1222 876 1223 C 876 1223 874 1210 874 1210 C 874 1206 874 1202 873 1198 C 872 1190 868 1189 862 1184 C 855 1179 852 1175 842 1177 C 832 1179 829 1185 822 1189 C 822 1189 799 1197 799 1197 C 790 1201 784 1208 774 1210 C 765 1212 758 1207 752 1200 C 750 1197 750 1195 748 1193 C 743 1190 739 1192 734 1191 C 728 1190 721 1184 715 1183 C 711 1183 706 1185 702 1186 C 682 1196 698 1217 680 1232 C 672 1238 656 1244 646 1246 C 640 1247 622 1249 618 1251 C 614 1254 616 1257 613 1259 C 611 1260 608 1260 605 1262 C 605 1262 600 1267 600 1267 C 600 1267 594 1273 594 1273 C 590 1276 586 1284 583 1289 C 583 1289 576 1298 576 1298 C 573 1304 576 1316 582 1319 C 584 1320 588 1320 590 1320 C 590 1320 606 1320 606 1320 C 619 1320 631 1316 642 1310 C 647 1307 648 1304 653 1301 C 661 1298 669 1301 674 1307 z" id="_gol"/>
                    <path className={classes['_tyn']} d="M 816 1367 C 820 1377 822 1381 822 1392 C 822 1392 822 1404 822 1404 C 822 1404 819 1426 819 1426 C 829 1424 844 1425 849 1435 C 850 1438 850 1442 850 1445 C 856 1444 870 1435 876 1432 C 876 1432 906 1419 906 1419 C 911 1415 913 1407 919 1405 C 924 1403 938 1408 944 1409 C 944 1409 951 1409 951 1409 C 964 1409 970 1407 983 1409 C 992 1398 994 1403 1004 1406 C 1006 1403 1014 1390 1015 1387 C 1016 1382 1014 1376 1012 1371 C 1010 1367 1009 1360 1006 1357 C 1003 1352 996 1347 991 1342 C 989 1340 987 1338 986 1335 C 985 1333 985 1330 982 1328 C 980 1325 970 1326 966 1326 C 967 1319 963 1315 960 1309 C 958 1306 957 1302 954 1300 C 950 1298 942 1298 938 1297 C 932 1296 927 1292 923 1287 C 923 1287 913 1273 913 1273 C 913 1273 898 1255 898 1255 C 898 1255 885 1238 885 1238 C 883 1236 880 1229 878 1228 C 875 1226 869 1225 866 1225 C 862 1224 857 1222 853 1225 C 847 1229 850 1237 850 1243 C 850 1252 849 1258 845 1266 C 843 1270 840 1275 839 1279 C 838 1288 844 1287 847 1293 C 848 1297 848 1303 848 1307 C 848 1318 842 1335 839 1346 C 838 1350 836 1358 833 1360 C 830 1363 828 1361 825 1362 C 823 1363 818 1366 816 1367 z" id="_tyn"/>
                    <path className={classes['_adr']} d="M 1104 1335 C 1104 1321 1105 1317 1108 1304 C 1109 1300 1111 1292 1109 1288 C 1107 1284 1101 1280 1098 1277 C 1085 1265 1083 1264 1069 1254 C 1069 1254 1040 1231 1040 1231 C 1040 1231 1022 1219 1022 1219 C 1022 1219 1006 1205 1006 1205 C 1001 1201 995 1197 990 1192 C 986 1187 981 1178 982 1172 C 983 1164 989 1163 985 1155 C 978 1159 976 1173 969 1172 C 966 1171 962 1165 962 1162 C 960 1155 966 1148 964 1145 C 962 1142 958 1143 956 1144 C 952 1144 943 1148 939 1150 C 937 1151 935 1153 934 1155 C 933 1158 936 1161 935 1164 C 935 1166 932 1169 931 1171 C 929 1175 930 1182 931 1186 C 937 1198 952 1206 960 1219 C 964 1227 964 1234 967 1242 C 970 1251 979 1261 986 1267 C 991 1271 997 1274 1004 1276 C 1007 1276 1016 1277 1018 1279 C 1022 1283 1016 1286 1022 1293 C 1029 1301 1059 1319 1070 1327 C 1073 1329 1076 1332 1079 1335 C 1080 1337 1082 1340 1084 1340 C 1087 1341 1100 1336 1104 1335 z" id="_adr"/>
                    <path className={classes['_ion']} d="M 1044 1331 C 1040 1336 1036 1342 1032 1348 C 1031 1350 1029 1353 1030 1356 C 1031 1359 1036 1361 1038 1363 C 1044 1369 1047 1377 1043 1385 C 1039 1391 1035 1386 1031 1390 C 1029 1392 1029 1397 1028 1400 C 1025 1406 1020 1416 1015 1419 C 1007 1425 999 1419 1001 1409 C 995 1406 990 1403 987 1411 C 990 1413 992 1414 993 1418 C 993 1422 990 1429 989 1434 C 989 1434 986 1455 986 1455 C 985 1458 982 1460 979 1461 C 969 1462 961 1453 954 1448 C 950 1444 937 1436 932 1433 C 932 1433 919 1429 919 1429 C 914 1427 912 1423 909 1423 C 906 1422 901 1425 898 1426 C 898 1426 874 1437 874 1437 C 877 1455 856 1455 855 1470 C 854 1481 866 1486 871 1495 C 876 1506 872 1516 868 1527 C 868 1527 1223 1527 1223 1527 C 1223 1527 1224 1509 1224 1509 C 1224 1509 1211 1479 1211 1479 C 1209 1474 1206 1464 1199 1464 C 1195 1464 1196 1471 1189 1475 C 1187 1467 1186 1458 1178 1454 C 1177 1456 1174 1462 1171 1461 C 1170 1460 1169 1457 1168 1455 C 1167 1450 1167 1444 1165 1439 C 1162 1431 1155 1427 1154 1421 C 1153 1412 1162 1412 1165 1411 C 1173 1409 1173 1407 1182 1408 C 1193 1410 1195 1414 1203 1416 C 1204 1408 1203 1409 1195 1405 C 1193 1404 1191 1403 1188 1402 C 1188 1402 1164 1406 1164 1406 C 1161 1406 1157 1407 1155 1406 C 1153 1405 1136 1392 1151 1387 C 1146 1384 1145 1387 1141 1385 C 1138 1384 1133 1379 1131 1376 C 1125 1369 1128 1367 1126 1361 C 1124 1355 1111 1342 1106 1340 C 1102 1338 1088 1343 1084 1346 C 1081 1348 1080 1351 1077 1351 C 1074 1352 1070 1349 1068 1348 C 1059 1344 1052 1337 1044 1331 z" id="_ion"/>
                    <path className={classes['_aeg']} d="M 1227 1321 C 1227 1321 1242 1339 1242 1339 C 1237 1336 1231 1334 1225 1333 C 1225 1333 1233 1347 1233 1347 C 1233 1347 1217 1339 1217 1339 C 1217 1339 1221 1347 1221 1347 C 1214 1346 1202 1339 1201 1332 C 1200 1330 1201 1329 1201 1327 C 1184 1333 1203 1353 1209 1360 C 1211 1362 1214 1366 1214 1369 C 1213 1373 1207 1369 1204 1370 C 1202 1370 1201 1371 1199 1372 C 1200 1374 1202 1377 1202 1379 C 1202 1381 1200 1383 1200 1386 C 1202 1390 1213 1394 1217 1395 C 1214 1391 1213 1391 1210 1388 C 1204 1382 1209 1379 1213 1380 C 1215 1381 1219 1384 1221 1385 C 1227 1389 1231 1389 1234 1392 C 1238 1395 1238 1401 1233 1404 C 1233 1404 1233 1413 1233 1413 C 1233 1413 1234 1425 1234 1425 C 1229 1423 1225 1418 1219 1418 C 1217 1418 1213 1418 1213 1421 C 1213 1425 1224 1429 1218 1434 C 1213 1439 1210 1431 1200 1434 C 1200 1434 1209 1455 1209 1455 C 1209 1455 1212 1470 1212 1470 C 1212 1470 1223 1497 1223 1497 C 1225 1496 1228 1493 1231 1493 C 1234 1492 1239 1494 1242 1496 C 1247 1497 1252 1498 1257 1498 C 1267 1498 1268 1496 1279 1498 C 1279 1498 1296 1504 1296 1504 C 1298 1504 1300 1503 1302 1502 C 1305 1502 1306 1502 1309 1501 C 1318 1498 1333 1485 1339 1478 C 1345 1470 1350 1464 1350 1454 C 1340 1451 1353 1448 1352 1438 C 1352 1438 1335 1442 1335 1442 C 1333 1442 1330 1442 1329 1440 C 1328 1436 1332 1436 1329 1429 C 1328 1429 1326 1430 1325 1430 C 1316 1429 1322 1415 1318 1410 C 1314 1404 1302 1405 1305 1399 C 1306 1397 1309 1395 1309 1393 C 1310 1390 1308 1387 1309 1384 C 1309 1381 1311 1379 1311 1376 C 1311 1374 1308 1369 1306 1366 C 1305 1362 1304 1357 1303 1353 C 1297 1354 1293 1358 1289 1357 C 1286 1357 1285 1354 1284 1352 C 1281 1347 1276 1342 1280 1336 C 1284 1328 1294 1326 1300 1319 C 1300 1319 1288 1320 1288 1320 C 1288 1320 1280 1315 1280 1315 C 1280 1315 1259 1313 1259 1313 C 1259 1313 1238 1316 1238 1316 C 1238 1316 1227 1321 1227 1321 z" id="_aeg"/>
                    <path className={classes['_eas']} d="M 1304 1506 C 1296 1516 1288 1514 1277 1515 C 1272 1516 1268 1518 1263 1516 C 1258 1515 1255 1513 1245 1511 C 1245 1511 1227 1509 1227 1509 C 1227 1509 1227 1527 1227 1527 C 1227 1527 1582 1527 1582 1527 C 1582 1527 1582 1515 1582 1515 C 1582 1515 1579 1485 1579 1485 C 1579 1485 1576 1461 1576 1461 C 1576 1461 1571 1462 1571 1462 C 1571 1462 1571 1440 1571 1440 C 1571 1440 1567 1432 1567 1432 C 1567 1432 1572 1420 1572 1420 C 1572 1420 1572 1409 1572 1409 C 1564 1413 1565 1422 1558 1424 C 1551 1427 1543 1417 1534 1423 C 1530 1426 1524 1436 1519 1442 C 1512 1449 1495 1455 1485 1454 C 1478 1454 1473 1450 1467 1447 C 1457 1441 1448 1435 1436 1435 C 1434 1435 1431 1435 1430 1435 C 1419 1438 1424 1450 1419 1457 C 1417 1460 1407 1463 1403 1464 C 1397 1465 1390 1463 1385 1459 C 1385 1459 1378 1451 1378 1451 C 1376 1450 1371 1450 1368 1449 C 1365 1449 1362 1447 1359 1448 C 1353 1450 1355 1458 1350 1469 C 1342 1482 1332 1492 1319 1500 C 1314 1502 1310 1506 1304 1506 z M 1536 1460 C 1534 1467 1530 1468 1527 1474 C 1525 1479 1528 1482 1526 1485 C 1525 1487 1523 1487 1520 1490 C 1515 1493 1513 1498 1504 1502 C 1495 1507 1483 1508 1477 1498 C 1476 1496 1475 1493 1475 1491 C 1474 1485 1481 1487 1487 1482 C 1491 1479 1490 1477 1494 1475 C 1494 1475 1517 1470 1517 1470 C 1524 1467 1528 1462 1536 1460 z" id="_eas"/>
                    <path className={classes['constantinople_water']} d="M 1348 1283 C 1350 1286 1356 1290 1357 1292 C 1359 1297 1352 1298 1349 1299 C 1334 1302 1327 1302 1314 1313 C 1314 1313 1297 1329 1297 1329 C 1294 1332 1292 1335 1287 1333 C 1282 1339 1281 1340 1285 1347 C 1291 1341 1304 1327 1311 1323 C 1318 1320 1324 1326 1335 1323 C 1341 1321 1342 1318 1347 1316 C 1347 1316 1357 1312 1357 1312 C 1357 1312 1366 1308 1366 1308 C 1366 1308 1375 1305 1375 1305 C 1371 1303 1366 1304 1363 1301 C 1359 1297 1363 1291 1371 1290 C 1366 1279 1358 1276 1348 1283 z" id="constantinople_water"/>
                    <path className={classes['_bla']} d="M 1570 1032 C 1570 1032 1546 1047 1546 1047 C 1546 1047 1511 1064 1511 1064 C 1511 1064 1483 1087 1483 1087 C 1483 1087 1462 1097 1462 1097 C 1462 1097 1474 1104 1474 1104 C 1481 1109 1488 1117 1496 1118 C 1505 1119 1513 1102 1521 1115 C 1523 1119 1523 1123 1520 1126 C 1515 1130 1507 1128 1503 1130 C 1500 1132 1499 1135 1496 1137 C 1492 1140 1489 1140 1486 1142 C 1483 1144 1478 1151 1475 1154 C 1471 1158 1467 1161 1461 1159 C 1457 1156 1454 1153 1453 1148 C 1453 1145 1454 1140 1452 1137 C 1449 1133 1442 1133 1438 1131 C 1435 1130 1432 1128 1432 1125 C 1433 1120 1438 1115 1442 1112 C 1444 1110 1448 1109 1449 1106 C 1450 1103 1448 1101 1445 1101 C 1439 1101 1428 1108 1417 1105 C 1408 1102 1409 1097 1402 1094 C 1405 1089 1409 1089 1415 1088 C 1413 1087 1413 1086 1411 1085 C 1404 1084 1389 1089 1384 1093 C 1380 1097 1378 1102 1375 1104 C 1372 1105 1369 1103 1366 1102 C 1368 1105 1371 1109 1371 1112 C 1371 1116 1368 1120 1366 1123 C 1364 1127 1362 1133 1361 1138 C 1359 1145 1360 1152 1357 1158 C 1353 1166 1347 1166 1344 1176 C 1344 1176 1339 1210 1339 1210 C 1336 1216 1332 1214 1329 1218 C 1325 1223 1327 1230 1325 1235 C 1325 1235 1322 1246 1322 1246 C 1322 1250 1325 1253 1327 1256 C 1327 1256 1337 1273 1337 1273 C 1338 1275 1340 1279 1343 1280 C 1347 1281 1350 1277 1355 1275 C 1366 1273 1370 1281 1375 1289 C 1375 1289 1400 1284 1400 1284 C 1406 1283 1414 1283 1419 1280 C 1419 1280 1442 1257 1442 1257 C 1453 1248 1463 1244 1477 1241 C 1477 1241 1501 1237 1501 1237 C 1506 1236 1507 1233 1511 1233 C 1519 1232 1522 1247 1529 1244 C 1530 1243 1532 1242 1533 1241 C 1534 1240 1536 1238 1537 1237 C 1537 1237 1552 1247 1552 1247 C 1552 1247 1553 1242 1553 1242 C 1561 1246 1570 1250 1579 1251 C 1582 1251 1584 1250 1587 1250 C 1603 1249 1607 1247 1622 1242 C 1640 1236 1637 1241 1655 1229 C 1670 1218 1687 1202 1673 1183 C 1670 1179 1665 1173 1660 1171 C 1652 1167 1640 1168 1630 1164 C 1620 1159 1611 1151 1601 1145 C 1592 1140 1583 1136 1573 1133 C 1573 1133 1556 1129 1556 1129 C 1556 1129 1543 1124 1543 1124 C 1538 1123 1533 1122 1530 1117 C 1528 1115 1527 1111 1530 1109 C 1534 1108 1539 1112 1543 1110 C 1547 1108 1546 1102 1547 1098 C 1549 1088 1555 1079 1556 1069 C 1554 1069 1551 1069 1549 1069 C 1544 1068 1540 1063 1544 1058 C 1544 1058 1565 1042 1565 1042 C 1568 1040 1571 1037 1570 1032 z" id="_bla"/>
                </g>
                <g id="SupplyCenterLayer">
                    <use height="20" href="#SupplyCenter" id="sc_BUD" width="20" x="891.5" y="905.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_TRI" width="20" x="785.5" y="964.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_VIE" width="20" x="826.5" y="876.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_EDI" width="20" x="480.5" y="554.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_LON" width="20" x="480.5" y="706.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_LVP" width="20" x="449.5" y="627.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_BRE" width="20" x="360.5" y="788.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_MAR" width="20" x="553.5" y="1007.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_PAR" width="20" x="509.5" y="808.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_BER" width="20" x="774.5" y="725.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_KIE" width="20" x="715.5" y="674.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_MUN" width="20" x="721.5" y="867.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_NAP" width="20" x="769.5" y="1132.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_ROM" width="20" x="710.5" y="1076.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_VEN" width="20" x="724.5" y="960.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_MOS" width="20" x="1258.5" y="573.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_SEV" width="20" x="1258.5" y="962.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_STP" width="20" x="1104.5" y="458.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_WAR" width="20" x="928.5" y="737.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_ANK" width="20" x="1262.5" y="1133.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_CON" width="20" x="1132.5" y="1108.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_SMY" width="20" x="1123.5" y="1211.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_BEL" width="20" x="566.5" y="744.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_BUL" width="20" x="1004.5" y="1067.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_DEN" width="20" x="758.5" y="615.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_GRE" width="20" x="1014.5" y="1226.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_HOL" width="20" x="621.5" y="681.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_NWY" width="20" x="752.5" y="452.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_POR" width="20" x="142.5" y="1049.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_RUM" width="20" x="1074.5" y="1003.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_SER" width="20" x="927.5" y="1010.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_SPA" width="20" x="293.5" y="1045.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_SWE" width="20" x="881.5" y="478.0"/>
                    <use height="20" href="#SupplyCenter" id="sc_TUN" width="20" x="638.5" y="1271.0"/>
                </g>
                <g id="OrderLayer">
                    <g id="Layer2">{renderedOrders2}</g>
                    <g id="Layer1">{renderedOrders}</g>
                </g>
                <g id="UnitLayer">{renderedUnits}</g>
                <g id="DislodgedUnitLayer">{renderedDislodgedUnits}</g>
                <g id="HighestOrderLayer">{renderedHighestOrders}</g>
                <g className={classes['BriefLabelLayer']} id="BriefLabelLayer">
                    <text x="649.4" y="924.2">SWI</text>
                    <text className="labeltext18" x="849.4" y="1100.6">ADR</text>
                    <text x="1085.7" y="1296.4">AEG</text>
                    <text className="labeltext18" x="932.4" y="1164.4">ALB</text>
                    <text x="1368.8" y="1115.5">ANK</text>
                    <text className="labeltext18" x="832.3" y="1151.7">APU</text>
                    <text x="1603" y="1145.3">ARM</text>
                    <text x="827.2" y="660.2">BAL</text>
                    <text x="1077.8" y="59.3">BAR</text>
                    <text className="labeltext18" x="591.8" y="796.2">BEL</text>
                    <text className="labeltext18" x="760" y="728">BER</text>
                    <text x="1319.8" y="1034.6">BLA</text>
                    <text className="labeltext18" x="800.4" y="855.8">BOH</text>
                    <text className="labeltext18" x="430" y="866.4">BRE</text>
                    <text className="labeltext18" x="953.7" y="964.3">BUD</text>
                    <text className="labeltext18" x="1021.8" y="1109.1">BUL</text>
                    <text className="labeltext18" x="530.1" y="915.4">BUR</text>
                    <text className="labeltext18" x="457.7" y="479">CLY</text>
                    <text x="1202.8" y="1177.2">CON</text>
                    <text x="718.2" y="584.3">DEN</text>
                    <text x="1164.4" y="1343.3">EAS</text>
                    <text className="labeltext18" x="496" y="500.3">EDI</text>
                    <text x="466.2" y="762.6">ENG</text>
                    <text x="1030.3" y="347">FIN</text>
                    <text className="labeltext18" x="940.9" y="840.9">GAL</text>
                    <text className="labeltext18" x="447" y="972.8">GAS</text>
                    <text className="labeltext18" x="981.4" y="1160.2">GRE</text>
                    <text x="929.6" y="538.9">BOT</text>
                    <text x="525.8" y="1107">LYO</text>
                    <text x="654.2" y="665.4">HEL</text>
                    <text className="labeltext18" x="608.8" y="749.3">HOL</text>
                    <text x="894.1" y="1251.7">ION</text>
                    <text x="318" y="711.4">IRI</text>
                    <text className="labeltext18" x="691.9" y="753.6">KIE</text>
                    <text className="labeltext18" x="500.3" y="734.4">LON</text>
                    <text x="1030.3" y="640.8">LVN</text>
                    <text className="labeltext18" x="449.2" y="564.1">LVP</text>
                    <text className="labeltext18" x="572.6" y="962.2">MAR</text>
                    <text x="153.3" y="815.3">MAO</text>
                    <text x="1568.9" y="572.6">MOS</text>
                    <text className="labeltext18" x="681.2" y="872.8">MUN</text>
                    <text x="240.6" y="1317.7">NAF</text>
                    <text className="labeltext18" x="832.3" y="1211.3">NAP</text>
                    <text x="191.6" y="268.2">NAO</text>
                    <text x="595.5" y="512">NTH</text>
                    <text x="760" y="391.7">NWY</text>
                    <text x="664.2" y="161.8">NWG</text>
                    <text className="labeltext18" x="481.1" y="892">PAR</text>
                    <text className="labeltext18" x="489.6" y="802.5">PIC</text>
                    <text className="labeltext18" x="628" y="1004.8">PIE</text>
                    <text transform="translate(175.1 1102.1) rotate(-60)" x="0" y="0">POR</text>
                    <text className="labeltext18" x="938.8" y="687.6">PRU</text>
                    <text className="labeltext18" transform="translate(729 1092) rotate(45)" x="0" y="0">ROM</text>
                    <text className="labeltext18" x="632.2" y="826">RUH</text>
                    <text className="labeltext18" x="1036.7" y="1015.4">RUM</text>
                    <text className="labeltext18" x="964.3" y="1100.6">SER</text>
                    <text x="1479.3" y="937.7">SEV</text>
                    <text className="labeltext18" x="791.9" y="779.1">SIL</text>
                    <text transform="translate(754.5 571.2) rotate(75)" x="0" y="0">SKA</text>
                    <text x="1194.2" y="1247.5">SMY</text>
                    <text x="302.3" y="1119.7">SPA</text>
                    <text x="1473.1" y="217.1">STP</text>
                    <text x="845.1" y="391.7">SWE</text>
                    <text x="1639.2" y="1292.2">SYR</text>
                    <text className="labeltext18" x="826" y="966.5">TRI</text>
                    <text x="634.4" y="1351.8">TUN</text>
                    <text className="labeltext18" x="706.5" y="1069">TUS</text>
                    <text className="labeltext18" x="717.4" y="936.7">TYR</text>
                    <text x="710" y="1209.1">TYS</text>
                    <text x="1119.7" y="860">UKR</text>
                    <text className="labeltext18" x="749.3" y="962.2">VEN</text>
                    <text className="labeltext18" x="834.5" y="919.6">VIE</text>
                    <text className="labeltext18" x="436.4" y="719.5">WAL</text>
                    <text className="labeltext18" x="938.8" y="783.4">WAR</text>
                    <text x="400.2" y="1209.1">WES</text>
                    <text className="labeltext18" x="496" y="653.5">YOR</text>
                </g>
                <rect className="currentnoterect" height="70" width="750" x="25" y="25"/>
                <text className={classes['CurrentNote']} id="CurrentNote" x="35" y="50">{nb_centers_per_power ? nb_centers_per_power : ''}</text>
                <text className={classes['CurrentNote2']} id="CurrentNote2" x="35" y="85">{note ? note : ''}</text>
                <text className={classes['CurrentPhase']} id="CurrentPhase" x="1650" y="1325">{current_phase}</text>
                <g className={classes['MouseLayer']} id="MouseLayer" transform="translate(-195 -170)">
                    <g id="con" onClick={this.onClick} onMouseOver={this.onHover}>
                        <path d="M 1331 1267 C 1320 1272 1310 1264 1298 1274 C 1289 1282 1298 1291 1291 1305 C 1289 1310 1284 1314 1287 1316 C 1289 1319 1295 1316 1303 1317 C 1303 1317 1303 1319 1303 1319 C 1299 1321 1292 1327 1290 1332 C 1294 1330 1296 1329 1297 1324 C 1297 1324 1323 1304 1323 1304 C 1323 1304 1337 1298 1337 1298 C 1337 1298 1356 1294 1356 1294 C 1356 1294 1340 1282 1340 1282 C 1340 1282 1331 1267 1331 1267 z M 1414 1284 C 1414 1284 1389 1288 1389 1288 C 1389 1288 1375 1292 1375 1292 C 1372 1292 1361 1293 1364 1299 C 1366 1301 1376 1303 1380 1304 C 1380 1304 1380 1306 1380 1306 C 1380 1306 1367 1310 1367 1310 C 1367 1310 1357 1315 1357 1315 C 1357 1315 1348 1318 1348 1318 C 1341 1321 1342 1326 1329 1326 C 1322 1326 1314 1323 1308 1328 C 1304 1331 1290 1344 1288 1349 C 1287 1351 1287 1353 1288 1356 C 1296 1354 1305 1345 1307 1359 C 1307 1359 1307 1364 1307 1364 C 1311 1361 1315 1355 1319 1355 C 1323 1354 1328 1358 1331 1360 C 1335 1363 1340 1364 1345 1365 C 1355 1366 1363 1362 1368 1361 C 1374 1361 1378 1364 1383 1365 C 1389 1365 1393 1361 1400 1361 C 1405 1361 1407 1361 1412 1362 C 1414 1363 1418 1364 1419 1363 C 1422 1362 1424 1355 1424 1352 C 1429 1337 1427 1328 1422 1314 C 1422 1314 1416 1297 1416 1297 C 1415 1292 1416 1288 1414 1284 z M 1346 1295 C 1346 1295 1346 1296 1346 1296 C 1346 1296 1345 1295 1345 1295 C 1345 1295 1346 1295 1346 1295 z"/>
                        <path d="M 1348 1283 C 1350 1286 1356 1290 1357 1292 C 1359 1297 1352 1298 1349 1299 C 1334 1302 1327 1302 1314 1313 C 1314 1313 1297 1329 1297 1329 C 1294 1332 1292 1335 1287 1333 C 1282 1339 1281 1340 1285 1347 C 1291 1341 1304 1327 1311 1323 C 1318 1320 1324 1326 1335 1323 C 1341 1321 1342 1318 1347 1316 C 1347 1316 1357 1312 1357 1312 C 1357 1312 1366 1308 1366 1308 C 1366 1308 1375 1305 1375 1305 C 1371 1303 1366 1304 1363 1301 C 1359 1297 1363 1291 1371 1290 C 1366 1279 1358 1276 1348 1283 z"/>
                    </g>
                    <g id="den" onClick={this.onClick} onMouseOver={this.onHover}>
                        <path d="M 939 716 C 933 720 923 725 917 728 C 912 729 904 731 900 734 C 896 737 895 742 894 746 C 892 754 888 769 889 777 C 891 785 894 784 894 796 C 899 796 912 796 916 798 C 919 794 919 789 920 784 C 922 779 927 774 930 770 C 932 768 934 767 936 766 C 938 766 942 768 943 763 C 943 757 933 755 934 747 C 934 743 938 738 940 734 C 943 728 943 721 939 716 z M 946 786 C 951 798 951 796 959 805 C 962 809 962 810 967 813 C 967 813 969 804 969 804 C 971 802 974 800 974 797 C 975 795 973 791 972 788 C 970 782 972 777 964 775 C 963 775 959 775 958 775 C 954 776 955 780 946 786 z M 944 812 C 943 813 943 815 943 816 C 942 826 959 823 952 815 C 951 815 950 814 949 814 C 947 813 946 812 944 812 z"/>
                        <path d="M 919 800 C 926 804 928 807 932 813 C 935 817 938 823 943 825 C 950 828 962 823 967 818 C 970 816 973 811 975 808 C 978 805 980 801 981 797 C 982 787 978 782 976 773 C 976 773 965 771 965 771 C 965 771 943 769 943 769 C 943 769 935 769 935 769 C 935 769 926 778 926 778 C 926 778 922 786 922 786 C 922 786 919 800 919 800 z M 966 815 C 961 812 959 809 955 805 C 952 802 945 792 944 788 C 944 785 947 783 949 781 C 953 777 955 772 961 772 C 973 772 972 779 975 788 C 976 792 978 795 976 799 C 975 805 969 810 966 815 z M 957 821 C 954 822 952 823 949 823 C 935 824 939 804 951 812 C 952 813 953 814 954 815 C 956 817 956 819 957 821 z"/>
                    </g>
                    <path d="M 1424 1364 C 1437 1361 1448 1353 1459 1346 C 1464 1343 1470 1337 1475 1336 C 1482 1334 1492 1338 1499 1340 C 1510 1342 1518 1341 1528 1336 C 1544 1328 1555 1307 1575 1297 C 1587 1291 1598 1293 1611 1293 C 1614 1293 1621 1292 1624 1292 C 1646 1286 1638 1257 1637 1241 C 1618 1244 1604 1253 1583 1253 C 1566 1253 1565 1248 1554 1246 C 1553 1247 1553 1248 1551 1248 C 1548 1249 1541 1242 1538 1240 C 1535 1242 1529 1247 1526 1246 C 1521 1245 1517 1235 1511 1235 C 1507 1236 1507 1239 1497 1241 C 1483 1243 1471 1243 1457 1249 C 1450 1253 1440 1261 1435 1266 C 1433 1268 1421 1282 1420 1284 C 1419 1286 1419 1290 1419 1292 C 1419 1300 1423 1305 1425 1312 C 1428 1318 1430 1326 1431 1333 C 1432 1342 1427 1355 1424 1364 z" id="ank" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1671 1218 C 1663 1226 1648 1237 1638 1240 C 1638 1240 1641 1241 1641 1241 C 1641 1241 1643 1272 1643 1272 C 1642 1279 1638 1298 1639 1303 C 1641 1311 1648 1312 1652 1318 C 1658 1325 1657 1329 1657 1337 C 1657 1337 1708 1337 1708 1337 C 1708 1337 1720 1338 1720 1338 C 1720 1338 1730 1338 1730 1338 C 1730 1338 1825 1348 1825 1348 C 1825 1348 1837 1349 1837 1349 C 1837 1349 1845 1349 1845 1349 C 1853 1349 1867 1347 1874 1345 C 1892 1339 1913 1320 1927 1307 C 1927 1307 1956 1280 1956 1280 C 1956 1280 1938 1277 1938 1277 C 1922 1273 1905 1266 1896 1251 C 1894 1251 1890 1252 1888 1252 C 1883 1251 1872 1247 1869 1242 C 1868 1240 1867 1220 1858 1221 C 1853 1221 1846 1232 1843 1236 C 1833 1248 1822 1262 1805 1261 C 1784 1260 1786 1252 1767 1252 C 1767 1252 1753 1252 1753 1252 C 1753 1252 1736 1251 1736 1251 C 1727 1251 1722 1253 1713 1250 C 1697 1243 1680 1223 1671 1218 z" id="arm" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 2022 319 C 2022 319 1994 345 1994 345 C 1994 345 1970 368 1970 368 C 1929 405 1867 454 1820 484 C 1791 502 1771 510 1741 525 C 1741 525 1716 539 1716 539 C 1708 544 1703 547 1694 551 C 1679 557 1664 558 1648 562 C 1618 570 1610 579 1590 585 C 1590 585 1546 593 1546 593 C 1535 596 1530 601 1521 607 C 1512 612 1496 620 1487 623 C 1468 629 1453 625 1434 632 C 1418 639 1408 654 1405 671 C 1404 678 1406 690 1401 696 C 1391 707 1376 685 1365 691 C 1360 693 1356 701 1353 706 C 1348 713 1340 724 1334 730 C 1321 742 1301 741 1284 741 C 1284 754 1279 767 1278 772 C 1278 777 1279 780 1280 784 C 1280 792 1276 793 1276 804 C 1276 804 1278 828 1278 828 C 1278 838 1278 846 1268 851 C 1264 853 1259 854 1255 856 C 1255 856 1242 870 1242 870 C 1242 870 1228 882 1228 882 C 1226 883 1222 886 1221 888 C 1220 891 1222 897 1223 900 C 1225 911 1226 909 1229 918 C 1229 918 1234 935 1234 935 C 1237 932 1238 930 1242 927 C 1247 925 1271 918 1278 916 C 1278 916 1353 897 1353 897 C 1364 894 1385 889 1396 889 C 1401 889 1407 889 1412 890 C 1415 890 1424 892 1427 892 C 1432 891 1438 885 1448 884 C 1448 884 1481 888 1481 888 C 1490 888 1497 888 1502 880 C 1506 873 1508 855 1519 855 C 1525 855 1535 862 1541 865 C 1551 869 1556 870 1567 870 C 1579 870 1580 865 1588 866 C 1593 867 1602 869 1606 872 C 1617 879 1623 900 1636 913 C 1647 924 1652 919 1660 927 C 1667 936 1662 948 1673 958 C 1678 962 1688 966 1694 968 C 1707 974 1719 977 1732 984 C 1748 993 1759 1009 1770 1017 C 1771 1015 1771 1011 1773 1010 C 1776 1008 1778 1010 1780 1010 C 1784 1009 1786 1005 1788 1002 C 1791 996 1789 991 1793 985 C 1797 977 1808 967 1815 960 C 1815 960 1828 941 1828 941 C 1834 935 1842 931 1849 928 C 1863 923 1881 917 1889 934 C 1892 941 1895 955 1895 963 C 1895 969 1896 975 1892 980 C 1887 988 1878 987 1874 997 C 1869 1008 1879 1013 1874 1020 C 1869 1028 1858 1029 1854 1040 C 1866 1041 1876 1045 1885 1053 C 1892 1060 1891 1065 1895 1067 C 1897 1067 1900 1067 1902 1067 C 1907 1067 1909 1070 1916 1068 C 1920 1068 1926 1064 1930 1065 C 1936 1066 1936 1072 1936 1077 C 1936 1088 1935 1099 1947 1105 C 1947 1096 1946 1088 1954 1081 C 1957 1079 1960 1079 1964 1080 C 1969 1081 1975 1087 1980 1090 C 1985 1093 1994 1094 1997 1100 C 1999 1105 1996 1111 1994 1115 C 1987 1126 1985 1124 1975 1127 C 1973 1128 1969 1130 1967 1130 C 1965 1130 1961 1128 1959 1127 C 1959 1138 1964 1147 1970 1156 C 1976 1153 1983 1143 1989 1143 C 1991 1142 1993 1143 1993 1145 C 1993 1148 1990 1151 1990 1154 C 1989 1160 1993 1158 1988 1166 C 1988 1166 2007 1175 2007 1175 C 2007 1175 2013 1183 2013 1183 C 2013 1183 2022 1217 2022 1217 C 2022 1217 2023 1195 2023 1195 C 2023 1195 2023 1149 2023 1149 C 2023 1149 2023 990 2023 990 C 2023 990 2023 516 2023 516 C 2023 516 2023 378 2023 378 C 2023 378 2023 338 2023 338 C 2023 338 2022 319 2022 319 z" id="mos" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1364 1100 C 1367 1100 1372 1102 1374 1101 C 1376 1101 1381 1094 1383 1092 C 1389 1087 1394 1085 1401 1084 C 1404 1083 1410 1082 1413 1084 C 1419 1086 1415 1090 1411 1091 C 1411 1091 1406 1092 1406 1092 C 1408 1094 1410 1099 1412 1100 C 1422 1108 1442 1099 1446 1098 C 1450 1098 1453 1101 1452 1105 C 1452 1110 1446 1112 1442 1115 C 1437 1118 1435 1122 1434 1128 C 1439 1129 1450 1131 1453 1135 C 1457 1140 1451 1155 1464 1157 C 1466 1157 1467 1157 1469 1156 C 1474 1154 1480 1144 1485 1140 C 1491 1136 1499 1137 1499 1127 C 1503 1126 1504 1126 1508 1126 C 1508 1126 1512 1126 1512 1126 C 1514 1126 1518 1126 1519 1124 C 1521 1122 1520 1115 1516 1113 C 1509 1111 1504 1119 1499 1120 C 1490 1122 1478 1109 1471 1104 C 1469 1103 1461 1101 1461 1098 C 1460 1095 1464 1094 1466 1093 C 1474 1090 1479 1088 1486 1083 C 1486 1083 1512 1061 1512 1061 C 1512 1061 1549 1043 1549 1043 C 1549 1043 1564 1033 1564 1033 C 1566 1032 1569 1030 1571 1031 C 1575 1033 1571 1039 1569 1041 C 1569 1041 1543 1061 1543 1061 C 1545 1064 1546 1066 1549 1067 C 1552 1067 1556 1066 1557 1070 C 1558 1073 1557 1077 1556 1080 C 1556 1080 1549 1097 1549 1097 C 1548 1102 1549 1109 1544 1112 C 1540 1115 1536 1112 1530 1111 C 1531 1119 1535 1119 1542 1122 C 1542 1122 1554 1126 1554 1126 C 1554 1126 1571 1130 1571 1130 C 1584 1134 1594 1138 1605 1145 C 1613 1150 1620 1157 1628 1160 C 1640 1166 1653 1164 1664 1171 C 1672 1176 1682 1188 1681 1198 C 1680 1204 1676 1209 1677 1212 C 1678 1216 1690 1226 1693 1228 C 1699 1234 1710 1242 1718 1245 C 1724 1246 1727 1244 1734 1244 C 1734 1244 1749 1246 1749 1246 C 1756 1246 1759 1245 1765 1245 C 1782 1244 1789 1254 1804 1255 C 1820 1256 1831 1242 1840 1230 C 1844 1224 1849 1215 1857 1214 C 1866 1213 1872 1224 1873 1231 C 1874 1233 1874 1237 1875 1239 C 1878 1244 1887 1246 1892 1245 C 1890 1239 1886 1229 1886 1223 C 1886 1218 1889 1218 1889 1212 C 1889 1203 1883 1184 1891 1178 C 1895 1175 1899 1174 1903 1173 C 1900 1167 1894 1170 1888 1169 C 1883 1168 1880 1166 1876 1163 C 1876 1163 1855 1144 1855 1144 C 1847 1139 1843 1139 1839 1136 C 1839 1136 1831 1128 1831 1128 C 1824 1122 1818 1118 1811 1110 C 1799 1097 1803 1092 1796 1084 C 1793 1079 1788 1075 1782 1073 C 1778 1071 1774 1071 1772 1068 C 1769 1064 1768 1055 1768 1051 C 1768 1051 1769 1035 1769 1035 C 1769 1027 1769 1028 1770 1020 C 1765 1019 1762 1014 1759 1011 C 1759 1011 1738 992 1738 992 C 1724 982 1708 978 1692 971 C 1685 968 1674 964 1668 958 C 1660 948 1662 936 1658 930 C 1655 926 1651 926 1646 924 C 1642 922 1639 920 1636 917 C 1628 909 1623 901 1617 892 C 1614 886 1609 877 1603 874 C 1599 871 1587 869 1582 870 C 1578 871 1576 873 1569 874 C 1559 875 1550 873 1541 868 C 1535 866 1522 857 1516 860 C 1513 861 1512 865 1510 868 C 1507 875 1506 882 1500 888 C 1488 897 1465 889 1451 888 C 1446 888 1433 891 1431 896 C 1430 898 1431 902 1432 904 C 1432 908 1434 917 1434 921 C 1434 921 1429 938 1429 938 C 1426 958 1424 989 1411 1006 C 1404 1015 1391 1024 1381 1029 C 1381 1029 1367 1035 1367 1035 C 1363 1038 1362 1041 1359 1045 C 1359 1045 1350 1058 1350 1058 C 1348 1063 1348 1065 1344 1070 C 1340 1074 1335 1079 1330 1083 C 1328 1085 1323 1088 1322 1090 C 1321 1092 1324 1103 1325 1107 C 1325 1115 1320 1130 1329 1140 C 1334 1144 1339 1142 1344 1141 C 1347 1140 1356 1139 1357 1137 C 1359 1136 1360 1132 1361 1130 C 1362 1126 1368 1116 1369 1113 C 1369 1108 1365 1107 1364 1100 z" id="sev" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1586 175 C 1590 180 1597 184 1598 190 C 1599 194 1597 196 1597 201 C 1598 204 1601 211 1595 211 C 1590 211 1588 204 1581 201 C 1578 207 1576 215 1572 220 C 1566 226 1562 224 1556 230 C 1551 236 1552 242 1550 245 C 1549 248 1547 248 1546 251 C 1544 254 1543 262 1543 266 C 1541 271 1539 277 1539 282 C 1540 291 1546 299 1547 308 C 1542 306 1541 303 1538 299 C 1530 288 1528 274 1530 261 C 1532 255 1537 239 1528 236 C 1525 235 1522 237 1522 240 C 1520 245 1523 248 1521 258 C 1520 257 1518 255 1516 255 C 1513 255 1511 258 1510 260 C 1506 265 1503 270 1500 276 C 1495 286 1493 293 1491 304 C 1490 311 1493 316 1489 322 C 1483 334 1471 334 1460 329 C 1456 328 1452 326 1449 323 C 1441 312 1463 307 1455 295 C 1450 288 1442 289 1434 288 C 1429 287 1424 286 1419 289 C 1428 296 1432 302 1434 313 C 1435 318 1436 327 1438 331 C 1440 335 1443 334 1446 337 C 1449 339 1451 342 1452 346 C 1453 351 1454 365 1449 368 C 1447 369 1445 369 1443 369 C 1438 369 1431 368 1426 372 C 1423 374 1418 386 1413 392 C 1410 396 1402 404 1403 409 C 1404 413 1409 416 1412 419 C 1416 422 1418 424 1421 428 C 1431 438 1435 433 1443 436 C 1445 437 1450 439 1448 442 C 1446 446 1437 443 1434 442 C 1426 441 1420 441 1412 441 C 1403 441 1398 443 1388 440 C 1381 438 1374 430 1369 433 C 1366 435 1366 440 1367 443 C 1368 448 1372 454 1377 455 C 1382 457 1385 454 1391 460 C 1396 466 1398 468 1392 474 C 1391 475 1390 477 1388 477 C 1384 479 1372 473 1368 471 C 1361 468 1352 467 1346 461 C 1343 457 1341 452 1338 448 C 1336 444 1331 439 1330 434 C 1328 428 1331 419 1326 414 C 1324 411 1319 411 1314 408 C 1314 408 1303 400 1303 400 C 1297 395 1296 396 1289 389 C 1288 387 1283 382 1286 380 C 1289 376 1295 385 1302 386 C 1302 386 1313 386 1313 386 C 1313 386 1322 390 1322 390 C 1329 391 1351 394 1358 394 C 1365 394 1378 395 1384 392 C 1395 387 1409 365 1406 352 C 1405 349 1394 336 1392 334 C 1383 327 1369 324 1358 321 C 1358 321 1313 304 1313 304 C 1303 303 1291 306 1284 306 C 1281 306 1272 304 1272 300 C 1272 297 1275 298 1276 291 C 1272 290 1267 289 1263 292 C 1257 296 1255 305 1252 312 C 1250 316 1246 322 1243 326 C 1241 329 1238 333 1237 336 C 1236 339 1237 344 1237 347 C 1240 361 1249 363 1251 372 C 1251 372 1253 396 1253 396 C 1254 406 1256 416 1258 426 C 1262 439 1275 471 1280 483 C 1287 498 1297 513 1297 530 C 1297 540 1292 539 1292 553 C 1292 553 1293 561 1293 561 C 1293 574 1286 587 1279 598 C 1276 603 1269 613 1272 619 C 1276 624 1284 623 1289 625 C 1293 626 1297 629 1300 631 C 1292 639 1293 635 1285 636 C 1285 636 1273 641 1273 641 C 1268 643 1266 651 1262 655 C 1258 658 1254 658 1249 658 C 1249 658 1226 656 1226 656 C 1214 656 1205 659 1194 665 C 1200 677 1215 678 1227 678 C 1232 678 1239 677 1243 678 C 1255 680 1256 690 1262 698 C 1267 705 1272 707 1276 712 C 1282 718 1284 729 1284 737 C 1301 737 1320 739 1334 726 C 1343 717 1349 705 1356 695 C 1360 690 1364 685 1371 686 C 1377 687 1383 692 1390 694 C 1393 695 1396 695 1398 693 C 1401 691 1401 683 1401 680 C 1401 673 1402 667 1404 661 C 1414 632 1438 623 1466 623 C 1484 623 1504 613 1519 604 C 1531 597 1535 592 1550 588 C 1550 588 1590 581 1590 581 C 1590 581 1643 560 1643 560 C 1643 560 1693 548 1693 548 C 1702 544 1709 539 1717 534 C 1717 534 1736 524 1736 524 C 1736 524 1795 495 1795 495 C 1825 477 1854 457 1882 436 C 1909 416 1934 395 1959 373 C 1959 373 1978 356 1978 356 C 1978 356 2008 328 2008 328 C 2012 324 2017 317 2023 316 C 2023 316 2023 175 2023 175 C 2023 175 1586 175 1586 175 z" id="stp" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1279 598 C 1276 603 1269 613 1272 619 C 1276 624 1284 623 1289 625 C 1293 626 1297 629 1300 631 C 1292 639 1293 635 1285 636 C 1285 636 1273 641 1273 641 C 1268 643 1266 651 1262 655 C 1258 658 1254 658 1249 658 C 1249 658 1226 656 1226 656 C 1214 656 1205 659 1194 665 C 1200 677 1215 678 1227 678 C 1232 678 1239 677 1243 678 C 1255 680 1256 690 1262 698 C 1267 705 1272 707 1276 712 C 1282 718 1284 729 1284 737 C 1301 737 1320 739 1334 726 C 1343 717 1349 705 1356 695 C 1360 690 1364 685 1371 686 C 1377 687 1383 692 1390 694 C 1393 695 1396 695 1398 693 C 1401 691 1401 683 1401 680 C 1401 673 1402 667 1404 661 C 1414 632 1340.57 568.188 1340.57 568.188 C 1340.57 568.188 1286 587 1279 598 z" id="stp-sc" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1768.68 297.625 C 1760.48 338.063 1829.46 251.188 1842.41 241.75 C 1842.41 241.75 2023 175 2023 175 C 2023 175 1586 175 1586 175 C 1590 180 1597 184 1598 190 C 1599 194 1597 196 1597 201 C 1598 204 1601 211 1595 211 C 1590 211 1588 204 1581 201 C 1578 207 1576 215 1572 220 C 1566 226 1562 224 1556 230 C 1551 236 1552 242 1550 245 C 1549 248 1547 248 1546 251 C 1544 254 1543 262 1543 266 C 1541 271 1539 277 1539 282 C 1540 291 1546 299 1547 308 C 1542 306 1541 303 1538 299 C 1530 288 1528 274 1530 261 C 1532 255 1537 239 1528 236 C 1525 235 1522 237 1522 240 C 1520 245 1523 248 1521 258 C 1520 257 1518 255 1516 255 C 1513 255 1511 258 1510 260 C 1506 265 1503 270 1500 276 C 1495 286 1493 293 1491 304 C 1490 311 1493 316 1489 322 C 1483 334 1471 334 1460 329 C 1456 328 1452 326 1449 323 C 1441 312 1463 307 1455 295 C 1450 288 1442 289 1434 288 C 1429 287 1424 286 1419 289 C 1428 296 1432 302 1434 313 C 1435 318 1436 327 1438 331 C 1440 335 1443 334 1446 337 C 1449 339 1451 342 1452 346 C 1453 351 1454 365 1449 368 C 1447 369 1445 369 1443 369 C 1438 369 1431 368 1426 372 C 1423 374 1418 386 1413 392 C 1410 396 1402 404 1403 409 C 1404 413 1409 416 1412 419 C 1416 422 1418 424 1421 428 C 1431 438 1435 433 1443 436 C 1445 437 1450 439 1448 442 C 1446 446 1437 443 1434 442 C 1426 441 1420 441 1412 441 C 1403 441 1398 443 1388 440 C 1381 438 1374 430 1369 433 C 1366 435 1366 440 1367 443 C 1368 448 1372 454 1377 455 C 1382 457 1385 454 1391 460 C 1396 466 1398 468 1392 474 C 1391 475 1390 477 1388 477 C 1384 479 1372 473 1368 471 C 1361 468 1352 467 1346 461 C 1343 457 1341 452 1338 448 C 1336 444 1331 439 1330 434 C 1328 428 1331 419 1326 414 C 1324 411 1319 411 1314 408 C 1314 408 1303 400 1303 400 C 1297 395 1296 396 1289 389 C 1288 387 1283 382 1286 380 C 1289 376 1295 385 1302 386 C 1302 386 1313 386 1313 386 C 1313 386 1322 390 1322 390 C 1329 391 1351 394 1358 394 C 1365 394 1378 395 1384 392 C 1395 387 1409 365 1406 352 C 1405 349 1394 336 1392 334 C 1383 327 1369 324 1358 321 C 1358 321 1313 304 1313 304 C 1303 303 1291 306 1284 306 C 1281 306 1272 304 1272 300 C 1272 297 1275 298 1276 291 C 1272 290 1267 289 1263 292 C 1257 296 1255 305 1252 312 C 1250 316 1246 322 1243 326 C 1241 329 1238 333 1237 336 C 1236 339 1237 344 1237 347 C 1240 361 1249 363 1251 372 C 1251 372 1253 396 1253 396 C 1254 406 1256 416 1258 426 C 1262 439 1275 471 1280 483 C 1287 498 1297 513 1297 530 C 1297 540 1462.17 478.25 1462.17 492.25 C 1467.38 490.563 1602.09 407.438 1595.15 407.438 C 1593.41 422.125 1728.8 338.938 1721.8 349.938" id="stp-nc" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 2022 1247 C 2020 1256 2012 1263 2005 1268 C 1988 1280 1980 1283 1959 1280 C 1958 1285 1953 1287 1950 1290 C 1950 1290 1934 1305 1934 1305 C 1918 1320 1892 1344 1871 1350 C 1862 1352 1859 1351 1850 1352 C 1850 1352 1842 1353 1842 1353 C 1842 1353 1831 1352 1831 1352 C 1798 1352 1766 1345 1733 1342 C 1709 1340 1683 1341 1659 1341 C 1645 1341 1636 1348 1624 1353 C 1614 1358 1609 1356 1600 1365 C 1591 1374 1592 1381 1588 1392 C 1582 1405 1577 1410 1576 1412 C 1576 1412 1574 1420 1574 1420 C 1574 1420 1568 1433 1568 1433 C 1568 1433 1572 1437 1572 1437 C 1572 1437 1573 1459 1573 1459 C 1580 1460 1579 1463 1579 1468 C 1579 1468 1581 1475 1581 1475 C 1583 1484 1582 1484 1582 1492 C 1582 1492 1584 1509 1584 1509 C 1584 1509 1584 1527 1584 1527 C 1584 1527 2023 1527 2023 1527 C 2023 1527 2023 1330 2023 1330 C 2023 1330 2023 1273 2023 1273 C 2023 1273 2022 1247 2022 1247 z" id="syr" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 778 1102 C 786 1104 791 1096 798 1099 C 809 1103 801 1114 814 1113 C 822 1111 825 1108 834 1112 C 842 1114 846 1121 851 1120 C 856 1120 857 1113 865 1112 C 870 1111 883 1114 886 1111 C 890 1109 890 1101 888 1098 C 887 1097 885 1094 884 1093 C 880 1089 877 1086 874 1081 C 868 1070 869 1061 853 1061 C 853 1061 827 1063 827 1063 C 823 1063 818 1063 814 1065 C 811 1066 797 1081 793 1085 C 793 1085 786 1092 786 1092 C 782 1096 780 1095 778 1102 z" id="swi" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1275 1047 C 1293 1047 1303 1065 1311 1078 C 1311 1078 1318 1088 1318 1088 C 1324 1084 1337 1074 1341 1068 C 1344 1064 1344 1062 1347 1058 C 1347 1058 1362 1035 1362 1035 C 1367 1030 1371 1029 1377 1027 C 1383 1024 1390 1020 1395 1017 C 1415 1003 1417 987 1421 965 C 1421 965 1426 935 1426 935 C 1428 924 1431 925 1429 912 C 1429 909 1427 899 1425 897 C 1424 895 1419 895 1417 894 C 1409 893 1402 893 1394 893 C 1383 893 1365 898 1354 901 C 1354 901 1275 921 1275 921 C 1275 921 1257 926 1257 926 C 1249 928 1241 929 1237 938 C 1234 947 1237 953 1233 965 C 1232 968 1229 973 1230 976 C 1233 983 1249 989 1256 995 C 1266 1005 1275 1025 1275 1039 C 1275 1039 1275 1047 1275 1047 z" id="ukr" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1190 668 C 1187 675 1186 680 1189 688 C 1192 699 1199 697 1203 702 C 1206 705 1206 708 1206 711 C 1207 719 1207 731 1204 738 C 1202 742 1197 749 1192 747 C 1185 745 1175 723 1164 725 C 1159 726 1157 731 1155 735 C 1151 744 1145 758 1145 767 C 1145 770 1145 777 1146 780 C 1148 782 1152 782 1157 789 C 1159 794 1160 800 1165 803 C 1171 808 1178 805 1185 815 C 1191 823 1191 835 1188 844 C 1187 848 1184 853 1185 857 C 1188 866 1202 873 1209 879 C 1212 881 1214 883 1217 886 C 1225 881 1236 871 1243 864 C 1243 864 1251 855 1251 855 C 1257 849 1263 850 1268 848 C 1275 843 1274 833 1274 826 C 1274 817 1271 810 1272 801 C 1273 796 1276 793 1276 786 C 1276 780 1273 778 1274 771 C 1274 771 1278 757 1278 757 C 1280 747 1281 732 1278 722 C 1274 710 1266 710 1260 701 C 1255 695 1253 686 1246 682 C 1240 679 1231 682 1224 682 C 1218 682 1207 680 1202 677 C 1198 675 1194 671 1190 668 z" id="lvn" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1180 860 C 1162 885 1123 876 1100 892 C 1073 911 1079 940 1096 963 C 1098 966 1107 976 1109 978 C 1113 981 1125 983 1130 983 C 1138 983 1146 978 1152 973 C 1155 970 1157 966 1160 965 C 1167 962 1176 971 1186 973 C 1200 977 1205 969 1213 967 C 1218 967 1222 970 1226 972 C 1230 962 1231 958 1232 947 C 1232 942 1228 923 1226 918 C 1226 918 1221 908 1221 908 C 1219 901 1219 894 1214 888 C 1209 881 1201 878 1194 873 C 1189 869 1186 863 1180 860 z" id="war" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1146 788 C 1147 796 1148 812 1141 817 C 1137 821 1131 817 1127 821 C 1125 824 1125 827 1123 830 C 1122 833 1119 836 1116 838 C 1109 843 1100 847 1093 840 C 1090 837 1090 835 1090 831 C 1087 831 1083 830 1080 830 C 1069 831 1058 838 1048 842 C 1031 848 1028 850 1010 853 C 1010 853 1014 883 1014 883 C 1016 891 1018 893 1019 898 C 1021 904 1019 909 1022 912 C 1025 915 1030 916 1033 916 C 1033 916 1061 918 1061 918 C 1064 918 1072 919 1074 917 C 1074 917 1081 904 1081 904 C 1085 896 1092 890 1099 885 C 1111 878 1130 875 1144 872 C 1154 870 1164 868 1172 861 C 1176 857 1179 851 1181 846 C 1182 841 1183 839 1183 834 C 1183 834 1183 830 1183 830 C 1183 824 1182 818 1177 815 C 1172 812 1168 814 1161 808 C 1151 799 1155 792 1146 788 z" id="pru" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 960 935 C 960 935 970 964 970 964 C 970 964 997 957 997 957 C 1004 956 1012 954 1019 956 C 1029 960 1036 969 1044 975 C 1053 982 1055 981 1065 984 C 1080 989 1090 995 1104 983 C 1104 983 1088 962 1088 962 C 1079 949 1075 937 1075 921 C 1075 921 1039 921 1039 921 C 1039 921 1027 919 1027 919 C 1027 919 1019 916 1019 916 C 1019 916 1012 921 1012 921 C 1012 921 1002 926 1002 926 C 1002 926 960 935 960 935 z" id="sil" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 939 938 C 939 938 969 929 969 929 C 969 929 1001 923 1001 923 C 1001 923 1017 913 1017 913 C 1017 913 1016 899 1016 899 C 1016 899 1010 884 1010 884 C 1008 875 1007 862 1007 853 C 1001 852 995 851 990 847 C 988 846 985 843 986 840 C 987 838 988 837 989 836 C 988 835 987 834 985 833 C 980 832 966 839 959 841 C 955 842 949 842 947 845 C 947 845 943 868 943 868 C 941 880 936 900 936 912 C 936 920 936 931 939 938 z" id="ber" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 823 916 C 842 925 854 923 872 938 C 878 944 883 947 888 954 C 890 956 892 960 895 960 C 899 961 903 956 906 954 C 913 949 918 950 927 945 C 929 943 933 941 933 939 C 935 937 934 934 933 932 C 933 932 932 918 932 918 C 932 913 932 912 933 908 C 933 908 936 886 936 886 C 938 874 942 860 942 848 C 942 848 926 848 926 848 C 928 845 933 839 933 836 C 932 832 926 829 923 825 C 918 818 915 812 915 803 C 915 803 900 803 900 803 C 898 803 894 803 893 804 C 889 807 893 819 893 823 C 893 826 891 839 890 842 C 889 844 888 846 886 848 C 876 857 871 837 859 845 C 855 848 856 853 856 858 C 856 869 852 871 849 880 C 848 884 848 889 845 893 C 838 904 826 902 823 916 z" id="kie" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 822 920 C 820 928 819 933 815 940 C 813 943 810 948 810 951 C 809 957 817 969 815 978 C 813 984 810 984 808 988 C 805 998 813 1013 817 1015 C 821 1017 831 1013 834 1010 C 838 1007 841 1000 844 996 C 849 989 856 980 864 976 C 873 971 877 974 884 971 C 886 970 890 968 891 966 C 892 962 882 952 879 949 C 863 933 857 932 837 925 C 837 925 822 920 822 920 z" id="ruh" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 820 1020 C 820 1020 824 1031 824 1031 C 824 1031 821 1045 821 1045 C 821 1045 819 1058 819 1058 C 829 1058 833 1058 843 1057 C 847 1056 855 1054 859 1054 C 865 1055 868 1059 872 1060 C 875 1062 879 1060 883 1062 C 887 1064 889 1067 894 1068 C 894 1068 919 1066 919 1066 C 932 1066 937 1066 950 1069 C 950 1065 948 1059 950 1055 C 952 1049 956 1049 960 1047 C 967 1043 966 1040 975 1039 C 974 1033 971 1029 967 1024 C 967 1024 948 1001 948 1001 C 942 993 938 985 947 976 C 949 975 952 973 954 971 C 958 969 962 968 966 966 C 966 966 957 936 957 936 C 953 937 939 942 935 944 C 935 944 924 950 924 950 C 919 953 913 953 908 957 C 900 962 895 969 887 973 C 876 979 871 974 859 984 C 848 992 845 1004 837 1012 C 832 1017 826 1017 820 1020 z" id="mun" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1277 1053 C 1276 1059 1276 1068 1272 1073 C 1268 1079 1259 1080 1258 1086 C 1257 1092 1263 1097 1266 1101 C 1276 1111 1287 1119 1280 1134 C 1275 1143 1265 1147 1256 1150 C 1256 1150 1203 1163 1203 1163 C 1193 1167 1180 1178 1187 1190 C 1189 1192 1192 1193 1194 1195 C 1198 1197 1198 1200 1201 1201 C 1205 1203 1226 1205 1231 1205 C 1242 1205 1255 1206 1266 1204 C 1266 1204 1287 1197 1287 1197 C 1303 1194 1323 1194 1339 1199 C 1339 1193 1341 1177 1343 1172 C 1346 1167 1352 1163 1355 1158 C 1357 1154 1357 1150 1357 1145 C 1349 1146 1336 1151 1329 1148 C 1321 1143 1317 1130 1317 1122 C 1317 1122 1318 1110 1318 1110 C 1318 1096 1314 1093 1307 1082 C 1299 1069 1293 1057 1277 1053 z" id="rum" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1188 1199 C 1187 1205 1185 1210 1187 1216 C 1189 1223 1196 1231 1196 1237 C 1197 1245 1189 1244 1190 1255 C 1193 1268 1204 1282 1189 1291 C 1195 1299 1199 1297 1208 1294 C 1208 1294 1224 1288 1224 1288 C 1236 1284 1244 1282 1249 1297 C 1250 1301 1250 1303 1250 1307 C 1250 1307 1250 1311 1250 1311 C 1250 1311 1269 1311 1269 1311 C 1272 1311 1276 1313 1279 1311 C 1281 1310 1282 1308 1283 1306 C 1292 1293 1281 1282 1293 1270 C 1306 1258 1316 1264 1328 1262 C 1328 1262 1320 1248 1320 1248 C 1319 1245 1321 1241 1322 1238 C 1325 1229 1323 1223 1326 1218 C 1331 1210 1335 1216 1338 1206 C 1324 1199 1299 1201 1284 1204 C 1276 1206 1273 1209 1263 1211 C 1263 1211 1242 1212 1242 1212 C 1242 1212 1229 1211 1229 1211 C 1222 1211 1207 1210 1201 1208 C 1193 1206 1195 1202 1188 1199 z" id="bul" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1244.54 1260.06 C 1215.87 1268 1224 1288 1224 1288 C 1236 1284 1244 1282 1249 1297 C 1250 1301 1250 1303 1250 1307 C 1250 1307 1250 1311 1250 1311 C 1250 1311 1269 1311 1269 1311 C 1272 1311 1276 1313 1279 1311 C 1281 1310 1282 1308 1283 1306 C 1292 1293 1281 1282 1293 1270 C 1306 1258 1264.65 1252.44 1244.54 1260.06 z" id="bul-sc" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1293 1270 C 1306 1258 1316 1264 1328 1262 C 1328 1262 1320 1248 1320 1248 C 1319 1245 1321 1241 1322 1238 C 1325 1229 1323 1223 1326 1218 C 1331 1210 1335 1216 1338 1206 C 1324 1199 1299 1201 1284 1204 C 1276 1206 1273 1209 1263 1211 C 1263 1211 1281 1282 1293 1270 z" id="bul-ec" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1155 1385 C 1155 1385 1155 1387 1155 1387 C 1153 1388 1149 1389 1148 1391 C 1146 1395 1152 1403 1155 1404 C 1162 1406 1184 1400 1188 1400 C 1191 1401 1193 1402 1196 1403 C 1200 1405 1207 1407 1206 1413 C 1205 1416 1203 1418 1200 1418 C 1200 1418 1191 1413 1191 1413 C 1186 1411 1178 1409 1173 1411 C 1173 1411 1166 1413 1166 1413 C 1162 1414 1160 1414 1158 1416 C 1155 1418 1156 1422 1158 1425 C 1161 1430 1165 1433 1167 1439 C 1167 1439 1172 1459 1172 1459 C 1173 1458 1175 1455 1176 1454 C 1185 1448 1189 1467 1191 1471 C 1193 1468 1195 1461 1199 1461 C 1202 1461 1203 1464 1209 1465 C 1208 1457 1204 1448 1201 1441 C 1199 1438 1197 1435 1201 1432 C 1206 1428 1214 1437 1217 1432 C 1220 1429 1212 1426 1211 1422 C 1210 1418 1213 1415 1217 1415 C 1223 1415 1227 1419 1232 1421 C 1232 1421 1231 1414 1231 1414 C 1230 1409 1232 1407 1228 1403 C 1223 1398 1203 1395 1199 1388 C 1196 1384 1199 1382 1199 1379 C 1200 1376 1198 1374 1198 1372 C 1199 1365 1208 1368 1212 1369 C 1208 1358 1195 1350 1192 1338 C 1190 1329 1198 1325 1201 1326 C 1204 1328 1202 1331 1205 1335 C 1207 1339 1212 1341 1216 1343 C 1216 1343 1214 1336 1214 1336 C 1214 1336 1230 1344 1230 1344 C 1230 1344 1222 1331 1222 1331 C 1222 1331 1233 1332 1233 1332 C 1231 1330 1226 1324 1226 1322 C 1225 1319 1229 1318 1231 1317 C 1237 1315 1235 1313 1243 1313 C 1243 1307 1245 1296 1238 1292 C 1234 1291 1222 1296 1218 1297 C 1218 1297 1187 1308 1187 1308 C 1187 1308 1166 1313 1166 1313 C 1164 1314 1159 1315 1158 1316 C 1155 1318 1156 1323 1156 1326 C 1156 1331 1154 1335 1151 1339 C 1146 1344 1141 1345 1138 1349 C 1136 1351 1135 1353 1134 1355 C 1132 1358 1130 1360 1129 1363 C 1127 1371 1134 1379 1140 1382 C 1145 1385 1145 1381 1155 1385 z M 1208 1382 C 1211 1386 1222 1396 1226 1399 C 1229 1400 1232 1401 1235 1401 C 1235 1390 1229 1393 1222 1389 C 1216 1385 1216 1382 1208 1382 z" id="gre" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1636 1288 C 1625 1299 1615 1296 1600 1296 C 1584 1296 1573 1300 1561 1311 C 1546 1324 1537 1340 1516 1344 C 1513 1344 1510 1345 1507 1345 C 1498 1344 1483 1338 1475 1340 C 1470 1341 1465 1346 1461 1348 C 1451 1355 1437 1365 1425 1367 C 1418 1369 1409 1364 1401 1365 C 1395 1365 1391 1368 1386 1368 C 1379 1368 1376 1365 1371 1365 C 1366 1364 1362 1367 1358 1368 C 1358 1368 1349 1368 1349 1368 C 1342 1369 1337 1368 1331 1364 C 1328 1362 1323 1358 1319 1358 C 1316 1359 1311 1365 1311 1368 C 1311 1371 1313 1373 1313 1376 C 1314 1379 1312 1381 1311 1384 C 1311 1388 1312 1390 1311 1393 C 1311 1396 1307 1399 1305 1401 C 1312 1403 1321 1406 1322 1414 C 1322 1419 1320 1417 1323 1428 C 1323 1428 1331 1427 1331 1427 C 1333 1434 1333 1433 1330 1440 C 1330 1440 1349 1436 1349 1436 C 1351 1436 1354 1437 1355 1439 C 1355 1442 1350 1448 1349 1451 C 1355 1449 1355 1447 1359 1446 C 1363 1445 1366 1447 1370 1447 C 1372 1448 1375 1447 1377 1448 C 1381 1450 1383 1454 1385 1457 C 1389 1460 1395 1462 1400 1462 C 1404 1462 1416 1458 1418 1455 C 1421 1450 1418 1435 1432 1432 C 1443 1431 1460 1441 1469 1446 C 1474 1449 1478 1452 1484 1452 C 1493 1452 1512 1447 1518 1441 C 1524 1435 1528 1424 1535 1420 C 1544 1415 1552 1425 1558 1422 C 1565 1418 1564 1405 1575 1408 C 1579 1402 1583 1394 1586 1388 C 1590 1375 1588 1369 1603 1358 C 1611 1353 1614 1353 1622 1350 C 1622 1350 1640 1342 1640 1342 C 1644 1340 1652 1339 1654 1335 C 1657 1322 1641 1315 1637 1308 C 1634 1303 1637 1293 1636 1288 z" id="smy" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1149 1316 C 1136 1313 1137 1308 1136 1297 C 1134 1284 1137 1271 1125 1262 C 1123 1261 1120 1259 1118 1258 C 1112 1257 1101 1264 1101 1273 C 1100 1280 1110 1281 1112 1290 C 1113 1298 1107 1314 1107 1326 C 1107 1329 1107 1334 1108 1337 C 1109 1341 1121 1352 1125 1353 C 1130 1354 1128 1349 1133 1344 C 1137 1340 1142 1339 1145 1336 C 1151 1331 1150 1323 1149 1316 z" id="alb" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1189 1301 C 1187 1298 1181 1293 1183 1288 C 1185 1285 1189 1285 1190 1280 C 1191 1274 1184 1263 1184 1254 C 1184 1251 1184 1248 1185 1245 C 1187 1242 1190 1240 1190 1236 C 1189 1231 1184 1226 1181 1218 C 1178 1209 1181 1208 1181 1200 C 1181 1196 1181 1185 1177 1183 C 1176 1182 1173 1182 1171 1182 C 1171 1182 1144 1180 1144 1180 C 1137 1179 1135 1175 1131 1176 C 1128 1176 1125 1179 1121 1181 C 1115 1183 1111 1176 1107 1181 C 1106 1181 1104 1184 1104 1185 C 1100 1194 1107 1196 1107 1204 C 1106 1208 1104 1212 1103 1216 C 1101 1222 1101 1232 1104 1238 C 1110 1249 1126 1253 1134 1262 C 1140 1269 1140 1274 1141 1283 C 1141 1283 1142 1292 1142 1292 C 1142 1296 1141 1303 1144 1307 C 1146 1309 1151 1309 1154 1309 C 1165 1309 1174 1302 1189 1301 z" id="ser" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1121 1029 C 1121 1031 1121 1033 1120 1035 C 1118 1041 1113 1038 1109 1039 C 1106 1040 1104 1041 1102 1043 C 1092 1052 1092 1061 1085 1069 C 1079 1075 1074 1076 1069 1080 C 1065 1083 1060 1089 1056 1093 C 1052 1097 1047 1100 1047 1106 C 1047 1106 1048 1113 1048 1113 C 1050 1124 1054 1132 1063 1139 C 1069 1143 1075 1144 1079 1148 C 1088 1155 1088 1174 1103 1173 C 1103 1173 1111 1171 1111 1171 C 1113 1172 1115 1174 1117 1174 C 1123 1176 1125 1169 1132 1169 C 1136 1170 1139 1173 1144 1174 C 1151 1175 1155 1175 1162 1175 C 1162 1175 1169 1176 1169 1176 C 1181 1177 1183 1170 1191 1163 C 1196 1160 1200 1157 1206 1156 C 1206 1156 1258 1143 1258 1143 C 1268 1139 1276 1135 1275 1123 C 1274 1113 1259 1104 1253 1095 C 1253 1095 1249 1087 1249 1087 C 1249 1087 1234 1065 1234 1065 C 1230 1061 1227 1062 1221 1056 C 1213 1047 1208 1039 1197 1033 C 1187 1028 1182 1031 1173 1028 C 1166 1026 1162 1021 1154 1021 C 1144 1021 1131 1027 1121 1029 z" id="bud" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1083 997 C 1083 997 1085 1015 1085 1015 C 1094 1015 1098 1015 1106 1018 C 1112 1021 1115 1025 1120 1025 C 1123 1025 1128 1023 1131 1022 C 1139 1020 1146 1018 1155 1018 C 1164 1018 1166 1023 1174 1025 C 1182 1027 1189 1024 1201 1031 C 1212 1038 1216 1046 1224 1054 C 1229 1059 1232 1058 1238 1065 C 1243 1071 1246 1078 1252 1083 C 1258 1073 1266 1074 1269 1066 C 1270 1062 1269 1047 1269 1042 C 1269 1030 1262 1010 1254 1001 C 1249 996 1240 993 1234 988 C 1229 985 1220 975 1216 974 C 1209 973 1205 980 1193 981 C 1186 981 1180 978 1174 975 C 1172 974 1166 971 1163 971 C 1160 971 1157 976 1155 978 C 1151 982 1145 985 1140 988 C 1134 990 1130 990 1124 989 C 1121 989 1113 987 1111 987 C 1108 988 1105 991 1100 994 C 1096 996 1088 997 1083 997 z" id="gal" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1117 1036 C 1117 1034 1118 1031 1117 1029 C 1116 1028 1113 1026 1111 1025 C 1104 1021 1099 1019 1091 1019 C 1091 1019 1074 1020 1074 1020 C 1067 1019 1069 1016 1057 1016 C 1057 1016 1045 1018 1045 1018 C 1040 1018 1033 1013 1025 1019 C 1020 1024 1016 1031 1012 1037 C 1010 1042 1005 1049 1003 1054 C 1001 1061 1002 1078 1005 1085 C 1006 1088 1007 1090 1009 1092 C 1012 1097 1017 1107 1023 1108 C 1027 1108 1031 1104 1035 1102 C 1035 1102 1044 1100 1044 1100 C 1052 1096 1059 1084 1065 1078 C 1072 1072 1078 1073 1084 1064 C 1087 1060 1088 1057 1090 1053 C 1093 1048 1101 1037 1107 1036 C 1110 1035 1114 1036 1117 1036 z" id="vie" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1081 1016 C 1081 1016 1079 997 1079 997 C 1079 997 1083 997 1083 997 C 1083 997 1075 995 1075 995 C 1075 995 1063 990 1063 990 C 1056 988 1053 988 1046 984 C 1034 977 1023 959 1008 961 C 999 963 971 970 963 974 C 959 976 952 979 950 983 C 947 988 950 993 953 997 C 953 997 977 1027 977 1027 C 979 1031 981 1039 986 1040 C 990 1041 995 1041 999 1041 C 1001 1041 1004 1042 1005 1041 C 1008 1040 1011 1033 1012 1031 C 1017 1023 1025 1011 1036 1012 C 1040 1013 1042 1014 1046 1014 C 1050 1014 1053 1012 1060 1012 C 1067 1012 1069 1015 1073 1016 C 1075 1017 1079 1016 1081 1016 z" id="boh" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 875 1067 C 878 1085 889 1086 894 1098 C 898 1108 892 1109 892 1122 C 892 1129 895 1137 903 1135 C 908 1135 915 1130 917 1125 C 918 1122 917 1119 920 1115 C 926 1109 936 1108 944 1108 C 947 1108 957 1108 959 1107 C 961 1106 962 1104 964 1102 C 967 1100 970 1099 973 1099 C 977 1098 981 1098 985 1099 C 988 1099 991 1100 994 1099 C 998 1097 1001 1088 1000 1084 C 999 1065 995 1064 1003 1045 C 994 1045 981 1042 973 1046 C 970 1047 967 1050 964 1052 C 962 1053 958 1054 957 1056 C 952 1060 962 1072 952 1075 C 950 1076 946 1075 944 1074 C 939 1073 936 1073 931 1073 C 931 1073 910 1073 910 1073 C 904 1073 897 1075 891 1074 C 884 1073 885 1068 875 1067 z" id="tyr" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1003 1091 C 1001 1096 998 1102 993 1103 C 987 1104 968 1097 964 1109 C 966 1110 968 1112 970 1114 C 973 1120 969 1134 967 1140 C 966 1145 968 1144 965 1152 C 964 1157 962 1168 969 1169 C 972 1170 975 1165 976 1163 C 980 1156 980 1153 989 1154 C 989 1157 989 1159 988 1162 C 986 1168 982 1170 986 1181 C 990 1193 1002 1199 1011 1207 C 1016 1212 1018 1214 1024 1219 C 1024 1219 1047 1234 1047 1234 C 1047 1234 1064 1248 1064 1248 C 1064 1248 1081 1260 1081 1260 C 1086 1263 1090 1268 1095 1270 C 1097 1260 1102 1257 1110 1253 C 1101 1243 1094 1239 1095 1224 C 1095 1214 1099 1210 1100 1205 C 1100 1200 1097 1197 1096 1192 C 1096 1187 1099 1182 1100 1177 C 1095 1175 1091 1174 1088 1169 C 1084 1164 1083 1156 1078 1151 C 1073 1147 1068 1148 1059 1140 C 1047 1131 1046 1119 1043 1105 C 1039 1105 1037 1105 1034 1107 C 1031 1108 1027 1112 1023 1112 C 1014 1111 1010 1098 1003 1091 z" id="tri" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1181 440 C 1190 443 1204 455 1199 465 C 1199 465 1189 478 1189 478 C 1189 478 1175 500 1175 500 C 1175 500 1153 527 1153 527 C 1148 534 1139 544 1140 553 C 1140 553 1142 562 1142 562 C 1142 562 1143 572 1143 572 C 1143 572 1147 586 1147 586 C 1147 593 1142 600 1142 608 C 1142 612 1142 618 1146 622 C 1148 624 1151 624 1154 626 C 1154 626 1163 631 1163 631 C 1163 631 1170 633 1170 633 C 1175 635 1176 639 1181 640 C 1186 640 1200 636 1205 635 C 1205 635 1238 622 1238 622 C 1244 620 1258 617 1262 614 C 1268 611 1271 605 1275 599 C 1282 588 1290 572 1289 559 C 1289 555 1288 553 1288 549 C 1289 539 1294 537 1294 528 C 1292 512 1283 498 1276 483 C 1269 468 1260 443 1255 427 C 1252 417 1250 405 1249 394 C 1249 389 1248 376 1247 372 C 1246 367 1241 364 1237 357 C 1234 350 1232 341 1232 333 C 1228 336 1224 334 1224 329 C 1223 325 1227 318 1227 312 C 1226 301 1208 291 1199 299 C 1196 302 1196 308 1195 312 C 1193 323 1191 330 1179 332 C 1171 334 1157 331 1149 328 C 1149 328 1139 323 1139 323 C 1135 322 1132 323 1131 327 C 1130 332 1134 334 1137 337 C 1145 343 1153 350 1159 358 C 1171 374 1173 391 1177 410 C 1177 410 1181 440 1181 440 z" id="fin" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1128 338 C 1128 338 1126 348 1126 348 C 1120 349 1118 350 1112 351 C 1109 351 1104 351 1101 352 C 1098 355 1101 358 1098 362 C 1095 366 1091 362 1087 367 C 1082 373 1075 395 1071 403 C 1068 409 1064 416 1059 422 C 1055 428 1052 430 1048 437 C 1048 437 1043 456 1043 456 C 1043 456 1032 478 1032 478 C 1032 478 1028 494 1028 494 C 1023 504 1015 499 1008 505 C 1006 508 1004 513 1003 517 C 999 529 999 540 999 552 C 999 552 1000 567 1000 567 C 1000 567 1000 581 1000 581 C 1000 586 1000 589 998 593 C 994 601 991 599 991 610 C 991 623 987 636 984 649 C 981 657 978 676 970 679 C 967 680 964 679 961 679 C 961 689 964 693 966 703 C 966 703 973 731 973 731 C 975 736 981 751 982 755 C 982 760 978 769 979 774 C 979 774 982 786 982 786 C 984 794 980 803 993 801 C 1005 800 1003 794 1009 786 C 1014 780 1019 778 1026 778 C 1030 778 1037 779 1041 777 C 1045 774 1048 768 1049 764 C 1055 750 1054 741 1055 727 C 1055 727 1060 704 1060 704 C 1060 702 1060 699 1059 697 C 1058 696 1056 694 1057 692 C 1057 690 1060 689 1062 689 C 1067 688 1072 687 1077 684 C 1086 680 1090 674 1094 665 C 1097 659 1099 657 1099 650 C 1098 635 1083 627 1078 620 C 1075 616 1074 610 1074 605 C 1074 592 1078 571 1083 559 C 1086 553 1095 542 1099 537 C 1112 523 1128 517 1139 498 C 1144 489 1138 486 1139 477 C 1140 464 1149 444 1162 439 C 1166 438 1170 438 1174 438 C 1174 438 1171 417 1171 417 C 1169 402 1165 380 1158 367 C 1151 355 1139 345 1128 338 z" id="swe" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1198 263 C 1194 266 1193 270 1192 274 C 1189 282 1188 287 1182 292 C 1180 283 1183 280 1183 272 C 1183 270 1183 267 1181 266 C 1178 265 1175 267 1173 268 C 1166 275 1167 275 1158 280 C 1158 280 1133 298 1133 298 C 1128 300 1123 302 1118 303 C 1115 304 1111 304 1108 305 C 1104 307 1104 312 1100 315 C 1097 317 1095 316 1093 317 C 1089 319 1087 324 1086 328 C 1088 330 1090 332 1089 335 C 1088 337 1083 342 1081 344 C 1081 344 1063 367 1063 367 C 1063 367 1045 394 1045 394 C 1045 394 1024 415 1024 415 C 1019 422 1015 431 1010 439 C 1005 447 995 464 992 472 C 992 472 991 483 991 483 C 983 480 980 483 974 488 C 971 491 967 496 965 499 C 964 502 964 506 961 508 C 958 510 952 509 947 512 C 941 515 937 521 933 522 C 929 523 928 521 925 521 C 921 520 918 522 916 526 C 916 526 920 528 920 528 C 915 534 912 532 905 535 C 906 537 908 541 907 542 C 905 545 900 541 894 542 C 888 544 882 551 879 556 C 871 567 869 577 867 590 C 866 593 865 601 865 604 C 867 609 872 610 874 614 C 876 619 871 620 867 621 C 867 621 871 624 871 624 C 879 633 863 634 861 637 C 860 638 860 642 860 644 C 864 643 878 639 879 646 C 879 650 874 653 872 655 C 865 660 859 665 864 674 C 866 677 869 681 872 683 C 874 685 877 686 880 688 C 899 697 913 679 929 672 C 934 669 939 668 944 664 C 946 663 950 658 953 658 C 957 658 960 668 961 672 C 964 672 968 674 970 671 C 972 668 974 659 975 656 C 978 646 984 626 984 616 C 984 612 984 606 985 602 C 987 597 991 595 993 589 C 994 584 994 578 994 573 C 994 573 992 546 992 546 C 992 536 995 516 1000 507 C 1002 502 1006 498 1011 496 C 1016 494 1020 495 1022 491 C 1022 491 1026 476 1026 476 C 1026 476 1037 453 1037 453 C 1037 453 1043 434 1043 434 C 1046 427 1053 421 1058 414 C 1067 400 1070 386 1077 372 C 1081 364 1084 358 1093 357 C 1092 343 1110 344 1120 344 C 1121 340 1122 336 1123 332 C 1124 326 1127 318 1134 316 C 1139 315 1144 319 1149 321 C 1156 324 1165 326 1172 326 C 1176 326 1181 326 1184 323 C 1191 317 1185 298 1199 291 C 1201 290 1203 290 1205 290 C 1217 289 1232 299 1234 312 C 1234 317 1231 324 1230 330 C 1241 325 1247 308 1251 297 C 1249 298 1243 300 1241 299 C 1237 299 1229 292 1227 288 C 1232 287 1244 285 1246 281 C 1251 273 1234 268 1229 268 C 1222 269 1223 277 1219 279 C 1216 280 1215 277 1214 275 C 1214 271 1218 257 1210 259 C 1203 260 1207 278 1201 280 C 1197 281 1197 275 1197 273 C 1197 273 1198 263 1198 263 z" id="nwy" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 768 906 C 778 917 791 914 799 922 C 804 928 800 932 804 943 C 804 943 806 943 806 943 C 809 937 813 931 815 924 C 816 918 817 911 820 906 C 824 900 834 897 839 892 C 841 889 841 883 843 879 C 847 866 850 867 850 850 C 850 850 823 849 823 849 C 815 850 801 861 796 866 C 786 876 790 890 780 900 C 776 903 772 904 768 906 z" id="hol" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 715 931 C 715 931 747 950 747 950 C 760 958 761 961 777 969 C 782 972 798 980 804 980 C 809 979 808 972 807 968 C 805 954 798 945 796 940 C 794 934 796 929 793 926 C 791 923 785 922 782 921 C 782 921 775 918 775 918 C 769 915 766 914 761 908 C 754 910 745 912 738 913 C 733 914 726 914 722 917 C 718 921 717 926 715 931 z" id="bel" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 957 1271 C 959 1266 960 1265 964 1260 C 966 1258 969 1255 969 1252 C 969 1250 965 1243 964 1240 C 959 1228 962 1222 951 1210 C 941 1199 927 1193 928 1176 C 928 1168 932 1168 933 1164 C 934 1160 928 1155 935 1150 C 938 1148 949 1143 952 1142 C 955 1141 959 1141 961 1139 C 962 1137 964 1125 965 1122 C 965 1120 965 1118 963 1117 C 961 1115 950 1114 947 1114 C 942 1114 929 1115 926 1119 C 924 1121 924 1123 923 1126 C 918 1134 910 1143 900 1142 C 894 1141 892 1136 888 1136 C 886 1136 883 1139 881 1141 C 877 1146 873 1153 872 1160 C 872 1167 879 1174 884 1178 C 891 1184 897 1186 903 1190 C 912 1196 920 1205 926 1213 C 934 1224 937 1231 942 1244 C 942 1244 945 1260 945 1260 C 946 1264 953 1269 957 1271 z" id="ven" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 804 1114 C 803 1117 801 1120 802 1124 C 803 1128 807 1130 806 1135 C 805 1138 801 1142 801 1146 C 800 1151 804 1156 805 1161 C 806 1168 800 1176 806 1184 C 807 1186 809 1188 811 1189 C 815 1191 823 1187 826 1184 C 832 1179 839 1173 848 1174 C 856 1175 860 1182 869 1186 C 871 1183 875 1178 874 1175 C 874 1171 869 1169 869 1161 C 869 1149 878 1138 887 1131 C 887 1131 886 1119 886 1119 C 886 1119 866 1116 866 1116 C 859 1117 860 1129 851 1127 C 844 1126 838 1116 830 1115 C 821 1114 814 1125 804 1114 z" id="pie" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 878 1178 C 877 1180 873 1185 873 1188 C 873 1191 875 1194 876 1201 C 877 1208 877 1215 878 1221 C 882 1232 891 1245 899 1253 C 899 1253 914 1239 914 1239 C 914 1239 932 1229 932 1229 C 927 1220 918 1207 911 1200 C 901 1191 899 1192 889 1186 C 889 1186 878 1178 878 1178 z" id="tus" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 973 1291 C 973 1291 951 1271 951 1271 C 951 1271 942 1262 942 1262 C 942 1262 939 1249 939 1249 C 939 1249 934 1233 934 1233 C 925 1235 916 1241 909 1246 C 907 1249 903 1252 903 1256 C 903 1261 911 1268 914 1272 C 921 1280 926 1290 936 1295 C 941 1297 945 1296 950 1297 C 956 1298 958 1301 961 1300 C 961 1300 973 1291 973 1291 z" id="rom" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 972 1256 C 968 1260 960 1267 960 1272 C 960 1277 967 1281 969 1283 C 969 1283 991 1300 991 1300 C 996 1304 1005 1314 1008 1320 C 1011 1326 1010 1330 1013 1334 C 1015 1337 1028 1344 1032 1345 C 1034 1342 1038 1334 1041 1332 C 1042 1330 1043 1329 1046 1330 C 1046 1330 1052 1335 1052 1335 C 1057 1339 1063 1343 1069 1346 C 1072 1347 1077 1351 1079 1348 C 1081 1345 1079 1339 1077 1336 C 1074 1331 1061 1323 1055 1319 C 1044 1312 1029 1303 1021 1294 C 1019 1292 1018 1290 1017 1287 C 1017 1285 1018 1282 1016 1280 C 1015 1279 1010 1279 1008 1279 C 1003 1278 999 1277 995 1275 C 984 1270 980 1262 972 1256 z" id="apu" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1029 1348 C 1024 1345 1013 1339 1009 1335 C 1006 1331 1007 1326 1005 1321 C 1002 1314 992 1305 986 1300 C 982 1297 978 1294 973 1296 C 969 1297 962 1303 962 1307 C 962 1310 964 1314 966 1316 C 966 1318 968 1321 969 1322 C 972 1326 979 1322 984 1326 C 988 1329 986 1333 991 1340 C 996 1346 1004 1350 1008 1357 C 1010 1360 1017 1377 1017 1381 C 1018 1383 1018 1385 1017 1387 C 1017 1389 1009 1402 1008 1404 C 1005 1407 1001 1412 1004 1417 C 1007 1421 1012 1419 1016 1416 C 1019 1413 1024 1405 1025 1400 C 1026 1397 1027 1392 1029 1389 C 1032 1385 1037 1387 1039 1385 C 1042 1383 1042 1378 1042 1375 C 1041 1362 1030 1364 1028 1356 C 1027 1354 1028 1350 1029 1348 z" id="nap" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 773 975 C 769 985 759 1008 751 1015 C 747 1018 745 1018 742 1021 C 742 1021 733 1028 733 1028 C 733 1028 725 1033 725 1033 C 721 1036 720 1039 717 1041 C 713 1044 710 1043 707 1046 C 702 1052 703 1058 701 1064 C 699 1073 692 1083 683 1086 C 683 1090 684 1093 688 1096 C 692 1099 699 1098 702 1103 C 704 1107 701 1113 700 1118 C 700 1128 713 1145 724 1138 C 731 1134 735 1120 737 1112 C 737 1108 736 1100 740 1098 C 743 1096 746 1097 749 1098 C 754 1100 759 1101 764 1101 C 766 1101 770 1101 772 1100 C 772 1100 785 1086 785 1086 C 791 1080 807 1065 811 1058 C 813 1054 813 1049 815 1044 C 815 1044 818 1034 818 1034 C 818 1028 812 1019 808 1014 C 802 1003 800 998 802 986 C 802 986 773 975 773 975 z" id="bur" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 741 1100 C 741 1112 739 1122 733 1133 C 730 1138 727 1142 721 1143 C 715 1144 712 1141 707 1139 C 704 1143 700 1147 695 1148 C 691 1150 682 1148 677 1153 C 674 1155 670 1164 667 1168 C 667 1168 650 1192 650 1192 C 654 1197 668 1205 674 1208 C 677 1209 682 1211 685 1211 C 690 1210 686 1204 690 1196 C 693 1189 703 1182 711 1181 C 721 1180 725 1187 733 1189 C 738 1190 743 1188 748 1191 C 754 1196 756 1207 768 1208 C 781 1210 791 1196 803 1193 C 801 1186 797 1185 797 1176 C 797 1176 798 1161 798 1161 C 797 1157 794 1153 794 1147 C 794 1140 800 1137 799 1133 C 799 1130 795 1127 794 1123 C 794 1117 800 1112 798 1108 C 797 1105 792 1106 789 1107 C 781 1109 778 1112 773 1104 C 760 1107 753 1102 741 1100 z" id="mar" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 611 1058 C 611 1058 611 1079 611 1079 C 611 1079 614 1086 614 1086 C 614 1086 609 1084 609 1084 C 606 1088 601 1097 601 1102 C 600 1105 601 1107 601 1110 C 600 1113 591 1131 589 1134 C 587 1138 584 1141 580 1145 C 578 1146 576 1148 576 1151 C 577 1155 588 1165 592 1168 C 600 1173 611 1180 620 1183 C 620 1183 633 1185 633 1185 C 637 1186 643 1189 647 1191 C 647 1191 664 1167 664 1167 C 667 1162 671 1153 676 1149 C 682 1145 688 1147 695 1145 C 699 1143 702 1140 705 1137 C 702 1132 698 1128 697 1122 C 696 1116 699 1110 700 1104 C 695 1102 688 1101 684 1098 C 680 1094 681 1090 677 1087 C 675 1086 670 1085 663 1080 C 658 1076 655 1070 650 1067 C 643 1063 620 1059 611 1058 z" id="gas" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 711 936 C 707 940 703 944 698 946 C 694 947 692 947 688 947 C 684 948 680 950 677 952 C 677 952 677 954 677 954 C 677 954 681 956 681 956 C 681 956 681 958 681 958 C 673 960 670 959 667 960 C 664 961 662 975 661 979 C 673 979 687 980 698 977 C 705 976 709 972 715 972 C 721 971 728 975 733 977 C 749 983 743 978 763 989 C 763 989 770 972 770 972 C 759 967 755 962 745 956 C 745 956 711 936 711 936 z" id="pic" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 661 980 C 657 990 660 1003 660 1014 C 660 1035 658 1046 654 1066 C 658 1069 658 1071 661 1074 C 666 1079 675 1084 682 1082 C 690 1081 695 1072 697 1065 C 699 1058 698 1052 703 1045 C 708 1039 711 1041 716 1038 C 716 1038 722 1031 722 1031 C 722 1031 732 1025 732 1025 C 732 1025 740 1018 740 1018 C 744 1015 746 1015 750 1012 C 753 1008 759 997 761 992 C 745 983 747 986 733 981 C 728 979 720 975 715 975 C 709 976 706 979 701 980 C 693 983 684 982 676 982 C 671 982 665 983 661 980 z" id="par" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 631 936 C 631 936 633 952 633 952 C 633 952 631 966 631 966 C 631 966 633 976 633 976 C 626 975 627 974 621 971 C 621 971 601 963 601 963 C 597 961 595 957 592 956 C 589 955 586 956 582 956 C 576 955 564 953 559 958 C 557 959 556 962 555 965 C 553 967 550 969 550 973 C 552 980 562 979 567 982 C 573 985 586 997 591 1002 C 595 1007 593 1008 595 1011 C 596 1013 598 1015 599 1019 C 601 1024 599 1027 599 1031 C 600 1037 605 1048 610 1052 C 613 1055 619 1056 623 1056 C 623 1056 651 1063 651 1063 C 653 1053 656 1036 656 1026 C 656 1026 656 1009 656 1009 C 656 1009 655 999 655 999 C 655 982 659 974 662 958 C 656 956 651 954 647 950 C 642 945 644 941 641 939 C 640 937 634 936 631 936 z M 553 968 C 553 968 553 969 553 969 C 553 969 552 968 552 968 C 552 968 553 968 553 968 z" id="bre" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 386 1138 C 391 1137 398 1136 403 1138 C 407 1141 408 1144 414 1146 C 424 1149 439 1146 447 1159 C 449 1162 450 1166 450 1169 C 448 1177 442 1174 434 1184 C 434 1184 415 1216 415 1216 C 413 1219 410 1224 407 1226 C 405 1228 401 1230 400 1232 C 399 1235 399 1243 399 1246 C 399 1257 395 1257 393 1265 C 392 1272 396 1276 391 1284 C 388 1289 383 1291 379 1295 C 375 1300 372 1308 370 1314 C 379 1319 387 1329 389 1339 C 391 1347 388 1357 397 1362 C 404 1366 407 1361 413 1359 C 418 1358 420 1361 427 1361 C 427 1361 445 1357 445 1357 C 454 1357 462 1363 470 1365 C 478 1368 478 1367 485 1367 C 491 1366 497 1370 501 1369 C 507 1368 509 1360 520 1355 C 527 1352 541 1353 545 1350 C 545 1350 565 1326 565 1326 C 569 1323 575 1322 579 1321 C 577 1315 572 1310 572 1303 C 573 1298 577 1294 580 1290 C 584 1285 588 1276 592 1271 C 592 1271 599 1266 599 1266 C 604 1260 605 1257 613 1257 C 613 1255 613 1253 615 1251 C 618 1247 631 1245 636 1245 C 650 1243 675 1237 683 1225 C 685 1222 686 1220 686 1217 C 671 1217 656 1204 643 1196 C 640 1195 635 1192 632 1191 C 628 1191 626 1192 621 1190 C 613 1188 604 1183 597 1179 C 591 1175 583 1169 578 1164 C 578 1164 567 1151 567 1151 C 567 1151 558 1148 558 1148 C 553 1145 552 1143 548 1141 C 544 1139 540 1141 533 1138 C 533 1138 522 1132 522 1132 C 516 1130 514 1131 506 1127 C 506 1127 472 1110 472 1110 C 472 1110 448 1101 448 1101 C 439 1095 439 1088 427 1089 C 417 1089 419 1094 414 1096 C 409 1098 403 1095 400 1095 C 398 1095 396 1096 394 1098 C 385 1105 390 1114 390 1123 C 390 1129 388 1133 386 1138 z" id="spa" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 391 1284 C 388 1289 383 1291 379 1295 C 375 1300 372 1308 370 1314 C 379 1319 387 1329 389 1339 C 391 1347 388 1357 397 1362 C 404 1366 407 1361 413 1359 C 418 1358 420 1361 427 1361 C 427 1361 445 1357 445 1357 C 454 1357 462 1363 470 1365 C 478 1368 478 1367 485 1367 C 491 1366 497 1370 501 1369 C 507 1368 509 1360 520 1355 C 527 1352 541 1353 545 1350 C 545 1350 565 1326 565 1326 C 569 1323 575 1322 579 1321 C 577 1315 572 1310 572 1303 C 573 1298 577 1294 580 1290 C 584 1285 588 1276 592 1271 C 592 1271 599 1266 599 1266 C 604 1260 605 1257 613 1257 C 613 1255 613 1253 615 1251 C 618 1247 631 1245 636 1245 C 650 1243 675 1237 683 1225 C 685 1222 686 1220 686 1217 C 671 1217 656 1204 643 1196 C 640 1195 635 1192 632 1191 C 628 1191 626 1192 621 1190 C 613 1188 396 1276 391 1284 z" id="spa-sc" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 386 1138 C 391 1137 398 1136 403 1138 C 407 1141 408 1144 414 1146 C 424 1149 439 1146 447 1159 C 449 1162 450 1166 450 1169 C 448 1177 442 1174 434 1184 C 434 1184 567 1151 567 1151 C 567 1151 558 1148 558 1148 C 553 1145 552 1143 548 1141 C 544 1139 540 1141 533 1138 C 533 1138 522 1132 522 1132 C 516 1130 514 1131 506 1127 C 506 1127 472 1110 472 1110 C 472 1110 448 1101 448 1101 C 439 1095 439 1088 427 1089 C 417 1089 419 1094 414 1096 C 409 1098 403 1095 400 1095 C 398 1095 396 1096 394 1098 C 385 1105 390 1114 390 1123 C 390 1129 388 1133 386 1138 z" id="spa-nc" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 394 1143 C 391 1144 387 1144 385 1146 C 383 1148 381 1158 380 1161 C 378 1169 372 1180 369 1187 C 365 1194 356 1210 351 1215 C 346 1220 340 1218 336 1224 C 335 1227 332 1240 332 1243 C 332 1245 332 1248 333 1249 C 335 1253 343 1251 343 1259 C 343 1264 340 1269 338 1273 C 336 1280 339 1280 334 1288 C 332 1291 326 1298 327 1302 C 327 1304 337 1309 340 1310 C 344 1312 347 1314 352 1314 C 354 1314 362 1312 363 1311 C 365 1310 369 1298 371 1295 C 379 1282 387 1287 387 1273 C 387 1269 387 1265 388 1261 C 389 1256 392 1254 393 1248 C 394 1242 391 1236 394 1230 C 397 1223 401 1226 409 1215 C 409 1215 429 1180 429 1180 C 439 1168 446 1171 442 1163 C 437 1153 421 1156 412 1152 C 404 1149 404 1143 394 1143 z" id="por" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 216 1527 C 216 1527 780 1527 780 1527 C 780 1505 779 1473 783 1452 C 786 1442 790 1439 793 1431 C 784 1430 782 1426 770 1425 C 763 1424 763 1428 757 1427 C 752 1427 746 1422 739 1422 C 736 1422 721 1426 718 1427 C 715 1428 711 1430 708 1429 C 705 1429 701 1425 699 1423 C 695 1420 691 1417 686 1416 C 673 1412 646 1412 632 1412 C 632 1412 612 1410 612 1410 C 602 1410 593 1409 583 1411 C 575 1412 568 1415 561 1418 C 558 1420 552 1423 548 1423 C 544 1423 542 1420 539 1420 C 537 1419 526 1419 524 1420 C 520 1423 516 1427 510 1430 C 501 1434 486 1430 477 1427 C 474 1426 469 1424 466 1422 C 464 1419 463 1417 462 1414 C 457 1415 456 1416 451 1416 C 440 1416 423 1415 416 1406 C 411 1400 409 1391 406 1384 C 405 1381 403 1377 399 1378 C 392 1378 385 1387 381 1392 C 369 1405 360 1419 345 1428 C 332 1437 308 1433 292 1438 C 283 1441 272 1448 265 1454 C 265 1454 256 1465 256 1465 C 256 1465 242 1475 242 1475 C 232 1485 218 1513 216 1527 z" id="naf" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 787 1527 C 787 1527 857 1527 857 1527 C 859 1527 863 1527 865 1526 C 867 1524 868 1521 869 1518 C 871 1510 872 1502 868 1494 C 864 1487 861 1486 856 1481 C 853 1478 852 1474 853 1470 C 854 1459 864 1455 869 1450 C 871 1448 873 1442 871 1440 C 869 1438 867 1439 865 1440 C 862 1442 855 1447 851 1446 C 846 1444 849 1438 846 1434 C 842 1429 832 1427 826 1427 C 826 1427 810 1430 810 1430 C 807 1431 804 1431 801 1433 C 795 1438 790 1451 789 1459 C 786 1477 787 1508 787 1527 z" id="tun" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 716 901 C 713 899 704 896 702 893 C 699 888 709 883 712 880 C 721 875 735 868 736 856 C 736 854 736 851 735 849 C 731 842 713 838 705 840 C 705 840 694 845 694 845 C 689 847 684 849 679 851 C 679 851 669 853 669 853 C 661 856 655 866 655 875 C 656 883 659 891 664 898 C 665 900 667 903 669 905 C 672 907 677 907 680 908 C 693 910 705 910 716 901 z" id="lon" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 612 810 C 624 811 622 824 617 828 C 612 833 594 831 590 837 C 586 844 597 847 601 849 C 608 852 613 860 619 864 C 625 866 626 863 634 865 C 633 867 632 868 630 870 C 619 878 611 870 603 870 C 596 870 596 877 590 872 C 583 878 586 880 571 888 C 565 892 560 890 555 896 C 558 897 561 900 564 900 C 567 900 572 897 575 896 C 582 894 591 897 596 902 C 603 899 605 894 610 892 C 615 891 624 896 630 897 C 630 897 660 900 660 900 C 657 891 650 882 651 872 C 652 864 657 856 664 852 C 668 849 671 849 672 847 C 674 845 672 836 672 832 C 667 831 649 824 645 821 C 642 818 640 815 640 810 C 640 807 640 803 639 800 C 633 792 615 804 612 810 z" id="wal" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 622 715 C 622 715 633 711 633 711 C 636 700 641 699 643 706 C 644 715 635 723 630 730 C 624 738 625 742 634 745 C 637 747 636 746 639 746 C 643 747 642 749 645 750 C 647 751 652 751 654 751 C 654 751 647 757 647 757 C 647 757 651 765 651 765 C 651 765 651 778 651 778 C 652 783 654 788 652 793 C 650 803 640 801 644 813 C 644 815 645 817 647 818 C 650 820 668 827 672 828 C 672 813 670 810 672 793 C 672 793 677 777 677 777 C 679 771 678 760 677 754 C 676 748 665 735 661 728 C 654 714 657 711 657 697 C 650 695 633 692 626 692 C 622 693 617 695 616 699 C 615 703 619 703 621 705 C 622 707 622 712 622 715 z" id="lvp" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 680 750 C 680 750 681 758 681 758 C 681 758 681 767 681 767 C 681 767 675 804 675 804 C 675 804 677 848 677 848 C 683 846 698 840 703 837 C 703 837 707 832 707 832 C 710 830 714 828 714 824 C 714 818 707 811 704 806 C 711 803 712 802 711 794 C 709 779 702 779 698 768 C 694 761 695 754 692 752 C 690 750 683 750 680 750 z" id="yor" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 690 621 C 683 631 677 631 673 638 C 669 644 667 656 666 663 C 666 663 661 699 661 699 C 660 708 659 714 662 723 C 664 727 674 742 677 746 C 683 746 689 748 692 747 C 697 745 697 737 696 733 C 693 724 681 713 687 701 C 691 693 701 684 707 677 C 710 674 714 669 714 665 C 712 657 697 653 690 652 C 687 652 679 654 677 651 C 674 648 681 643 683 642 C 683 642 700 631 700 631 C 706 626 702 623 696 622 C 696 622 690 621 690 621 z" id="edi" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 624 681 C 629 681 639 680 631 688 C 631 688 658 694 658 694 C 658 694 661 670 661 670 C 662 661 665 645 669 637 C 674 629 682 627 686 620 C 682 619 676 617 672 618 C 667 619 664 624 661 628 C 659 630 647 638 645 639 C 640 641 636 632 631 639 C 627 646 636 652 636 658 C 635 664 626 673 624 681 z" id="cly" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 202 175 C 202 175 202 859 202 859 C 202 859 240 849 240 849 C 272 844 323 842 355 846 C 372 849 395 856 410 862 C 416 865 419 866 424 869 C 426 871 429 873 432 872 C 436 871 445 861 448 858 C 448 858 477 829 477 829 C 483 823 489 819 491 811 C 487 809 487 808 488 804 C 483 799 483 797 489 794 C 488 792 485 788 488 786 C 491 782 496 789 500 786 C 500 786 508 774 508 774 C 515 766 523 765 533 765 C 527 762 510 754 512 746 C 513 741 519 738 521 733 C 523 727 517 721 525 718 C 530 716 537 719 542 722 C 549 725 553 726 560 724 C 559 722 557 719 558 717 C 558 714 561 713 563 712 C 568 708 571 703 576 702 C 580 702 591 705 594 707 C 594 707 599 711 599 711 C 603 714 606 712 610 716 C 613 720 612 725 613 729 C 614 736 616 737 617 741 C 617 745 613 750 611 753 C 615 756 618 759 623 761 C 631 764 640 763 648 763 C 645 759 645 759 647 754 C 643 752 642 752 641 748 C 640 748 638 749 637 749 C 632 749 623 744 624 737 C 626 731 633 724 637 719 C 640 713 640 709 640 703 C 634 707 637 713 628 713 C 627 714 627 715 626 716 C 625 716 624 717 622 717 C 618 715 620 708 620 705 C 613 705 611 700 615 695 C 620 689 627 691 633 683 C 633 683 629 683 629 683 C 612 683 633 668 633 658 C 634 652 625 646 629 639 C 633 632 638 633 642 638 C 646 636 656 630 659 627 C 664 621 665 618 673 615 C 673 615 670 614 670 614 C 670 614 672 594 672 594 C 672 594 676 553 676 553 C 676 553 684 485 684 485 C 684 476 684 469 682 460 C 679 450 664 424 658 413 C 658 413 629 359 629 359 C 629 359 620 362 620 362 C 620 362 593 362 593 362 C 593 362 572 360 572 360 C 563 361 553 365 544 359 C 534 353 531 337 526 330 C 522 325 515 322 510 319 C 508 318 504 316 503 313 C 503 312 504 311 504 310 C 507 299 511 311 517 309 C 523 307 523 303 525 298 C 525 298 526 293 526 293 C 527 286 519 284 514 279 C 512 277 509 274 511 272 C 514 270 518 272 520 272 C 527 275 531 280 539 282 C 537 275 539 275 545 273 C 542 260 529 267 522 258 C 518 253 519 244 528 251 C 531 247 532 243 536 248 C 538 246 540 241 543 240 C 550 237 553 249 553 254 C 559 242 556 229 556 216 C 556 216 556 175 556 175 C 556 175 202 175 202 175 z" id="nat" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 560 175 C 560 175 560 228 560 228 C 560 243 569 238 568 255 C 567 263 563 265 560 269 C 558 273 556 278 556 282 C 556 282 568 277 568 277 C 568 277 568 281 568 281 C 577 279 575 273 580 268 C 586 263 587 268 587 273 C 587 273 587 278 587 278 C 589 277 593 276 595 276 C 601 276 602 283 604 287 C 606 286 609 285 611 285 C 613 285 614 287 618 288 C 618 288 630 288 630 288 C 633 288 635 288 638 289 C 653 293 651 308 652 320 C 653 327 654 334 651 341 C 647 348 639 353 632 357 C 632 357 667 423 667 423 C 679 443 688 458 688 482 C 688 482 684 516 684 516 C 684 516 677 587 677 587 C 677 587 674 615 674 615 C 674 615 698 620 698 620 C 701 621 705 623 708 623 C 710 622 718 615 720 612 C 730 604 737 597 748 590 C 775 574 808 568 838 562 C 848 559 868 554 877 555 C 886 543 890 538 905 541 C 901 531 909 531 917 530 C 913 525 913 522 920 519 C 926 517 928 521 932 520 C 935 519 941 513 947 510 C 953 506 957 508 959 506 C 961 504 961 502 964 497 C 967 492 978 481 983 480 C 985 479 987 480 989 480 C 989 466 999 454 1006 442 C 1012 433 1017 421 1023 413 C 1023 413 1042 394 1042 394 C 1042 394 1053 378 1053 378 C 1053 378 1069 356 1069 356 C 1069 356 1080 342 1080 342 C 1082 340 1086 336 1087 335 C 1088 332 1085 330 1085 327 C 1084 324 1088 319 1090 316 C 1094 313 1097 315 1099 312 C 1102 310 1103 305 1109 303 C 1113 301 1120 302 1131 297 C 1140 293 1145 286 1153 281 C 1159 277 1169 272 1172 266 C 1174 263 1172 256 1171 252 C 1171 252 1171 234 1171 234 C 1171 234 1172 219 1172 219 C 1172 219 1174 175 1174 175 C 1174 175 560 175 560 175 z" id="nrg" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1178 175 C 1178 175 1176 214 1176 214 C 1176 214 1175 230 1175 230 C 1175 230 1175 246 1175 246 C 1175 249 1175 259 1177 261 C 1179 264 1183 263 1184 267 C 1186 271 1183 283 1183 288 C 1189 282 1189 273 1193 266 C 1194 264 1197 260 1199 262 C 1201 265 1199 274 1200 279 C 1204 273 1202 263 1207 258 C 1210 254 1217 257 1218 262 C 1218 267 1215 270 1217 278 C 1222 274 1222 268 1228 266 C 1234 265 1252 272 1249 280 C 1247 286 1236 289 1230 289 C 1232 292 1237 296 1241 297 C 1246 297 1248 293 1260 293 C 1265 285 1277 288 1278 293 C 1278 295 1275 299 1274 301 C 1284 305 1293 302 1303 302 C 1306 302 1312 302 1315 302 C 1322 304 1337 311 1344 314 C 1344 314 1359 319 1359 319 C 1371 322 1386 326 1395 334 C 1398 337 1407 349 1408 353 C 1410 365 1401 379 1393 387 C 1390 390 1387 393 1383 395 C 1379 396 1370 397 1366 397 C 1357 397 1330 394 1322 392 C 1322 392 1313 388 1313 388 C 1309 388 1306 390 1301 388 C 1295 386 1294 383 1287 380 C 1289 391 1296 392 1304 398 C 1308 401 1310 404 1315 406 C 1319 408 1323 409 1327 412 C 1334 419 1331 430 1333 436 C 1335 440 1340 447 1343 451 C 1345 455 1346 459 1350 462 C 1350 462 1369 469 1369 469 C 1372 470 1384 476 1387 475 C 1389 475 1392 472 1394 470 C 1392 465 1389 460 1384 458 C 1381 458 1378 458 1375 457 C 1371 455 1367 450 1365 446 C 1363 441 1364 431 1371 430 C 1375 430 1380 434 1383 436 C 1388 438 1391 439 1397 439 C 1397 439 1423 439 1423 439 C 1430 439 1441 442 1447 441 C 1447 441 1447 439 1447 439 C 1440 437 1430 437 1426 435 C 1420 432 1418 426 1413 422 C 1409 418 1402 415 1401 410 C 1399 404 1408 395 1411 391 C 1420 380 1419 376 1422 372 C 1428 366 1440 366 1448 367 C 1451 360 1452 347 1447 340 C 1443 336 1439 337 1436 331 C 1433 326 1434 317 1430 306 C 1426 297 1421 294 1416 287 C 1428 283 1455 284 1459 299 C 1461 306 1452 309 1450 316 C 1450 318 1450 321 1452 322 C 1456 327 1471 331 1477 329 C 1493 325 1488 312 1489 300 C 1491 290 1496 278 1502 269 C 1504 265 1511 254 1515 253 C 1517 253 1518 253 1520 254 C 1520 249 1518 242 1520 237 C 1526 227 1534 237 1535 244 C 1537 251 1532 257 1532 270 C 1532 285 1533 289 1542 302 C 1543 298 1537 288 1537 282 C 1537 276 1539 270 1541 264 C 1541 260 1542 254 1544 251 C 1544 251 1548 244 1548 244 C 1550 240 1549 236 1554 229 C 1560 222 1565 224 1570 219 C 1574 214 1575 208 1577 204 C 1578 202 1580 199 1583 199 C 1585 199 1587 203 1588 204 C 1591 207 1593 209 1597 210 C 1596 207 1595 203 1595 200 C 1595 194 1598 192 1594 186 C 1593 184 1591 182 1589 181 C 1587 179 1584 177 1582 176 C 1578 174 1566 175 1561 175 C 1561 175 1493 175 1493 175 C 1493 175 1178 175 1178 175 z" id="bar" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1058 692 C 1058 692 1062 700 1062 700 C 1062 700 1064 709 1064 709 C 1064 709 1085 715 1085 715 C 1085 715 1129 730 1129 730 C 1129 730 1154 733 1154 733 C 1155 731 1156 729 1158 727 C 1167 716 1178 731 1185 738 C 1187 741 1189 744 1192 745 C 1202 747 1204 731 1204 724 C 1204 719 1205 707 1202 703 C 1200 700 1197 701 1192 697 C 1186 692 1184 681 1186 673 C 1188 666 1194 663 1200 660 C 1211 654 1223 653 1236 654 C 1236 654 1250 656 1250 656 C 1264 657 1263 645 1270 640 C 1273 638 1275 638 1278 637 C 1278 637 1286 633 1286 633 C 1289 633 1294 634 1298 634 C 1287 619 1270 633 1268 612 C 1268 612 1261 617 1261 617 C 1261 617 1237 625 1237 625 C 1237 625 1208 636 1208 636 C 1203 638 1185 643 1181 642 C 1176 642 1175 637 1170 635 C 1170 635 1163 633 1163 633 C 1163 633 1154 628 1154 628 C 1154 628 1147 625 1147 625 C 1142 622 1139 614 1140 608 C 1140 599 1144 597 1144 587 C 1144 587 1138 553 1138 553 C 1137 542 1147 531 1154 523 C 1154 523 1166 508 1166 508 C 1166 508 1186 478 1186 478 C 1186 478 1197 464 1197 464 C 1198 462 1198 459 1197 457 C 1194 447 1182 441 1172 440 C 1168 440 1163 441 1159 443 C 1150 449 1142 466 1142 477 C 1142 487 1145 488 1143 494 C 1140 504 1125 518 1117 525 C 1117 525 1103 535 1103 535 C 1100 538 1097 542 1095 545 C 1085 558 1083 563 1079 579 C 1077 590 1074 609 1079 619 C 1082 624 1086 625 1090 629 C 1097 637 1103 646 1100 657 C 1100 661 1097 666 1095 669 C 1085 686 1076 689 1058 692 z" id="bot" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1060 713 C 1059 721 1057 725 1057 734 C 1057 744 1056 753 1052 763 C 1050 769 1047 776 1041 779 C 1037 781 1031 780 1026 780 C 1021 780 1016 781 1012 785 C 1006 792 1007 803 993 804 C 990 804 985 803 983 804 C 981 805 975 814 973 817 C 966 825 955 830 945 829 C 931 828 931 808 917 804 C 918 812 919 816 924 823 C 927 826 935 831 935 836 C 935 839 932 844 930 846 C 934 846 939 846 942 845 C 946 844 947 842 952 840 C 952 840 967 836 967 836 C 971 834 979 830 984 831 C 985 831 986 831 987 831 C 994 835 986 840 989 844 C 991 848 1002 850 1007 850 C 1024 850 1040 843 1056 836 C 1070 830 1079 824 1094 831 C 1090 839 1098 844 1107 840 C 1113 838 1118 835 1121 830 C 1123 827 1123 824 1125 821 C 1127 818 1130 817 1133 816 C 1135 816 1137 817 1139 816 C 1143 814 1144 805 1144 801 C 1146 790 1140 777 1143 762 C 1143 762 1152 735 1152 735 C 1144 735 1138 735 1130 734 C 1122 732 1115 729 1108 727 C 1097 723 1071 715 1060 713 z" id="bal" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 888 693 C 886 712 885 718 894 735 C 894 735 896 735 896 735 C 902 728 907 729 915 726 C 921 724 926 722 931 718 C 934 717 939 713 942 717 C 944 719 944 721 944 723 C 945 727 944 731 942 735 C 940 739 936 743 936 748 C 937 752 940 754 943 757 C 946 761 945 763 948 765 C 949 766 954 767 956 767 C 956 767 976 771 976 771 C 977 768 980 758 980 756 C 980 751 972 733 970 727 C 970 727 962 698 962 698 C 961 692 958 685 958 679 C 959 674 960 664 954 661 C 950 660 947 665 938 670 C 930 674 928 674 919 679 C 908 686 902 692 888 693 z" id="ska" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 817 848 C 830 846 840 850 849 848 C 856 846 859 840 865 840 C 873 840 877 851 884 847 C 889 844 890 837 890 832 C 890 832 890 819 890 819 C 890 814 889 813 889 807 C 889 801 891 798 891 790 C 891 785 889 784 888 780 C 887 777 887 772 887 769 C 887 769 867 769 867 769 C 853 769 842 778 834 788 C 823 802 821 815 819 832 C 819 832 817 848 817 848 z" id="hel" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 678 650 C 678 650 687 650 687 650 C 693 650 695 650 700 652 C 703 653 705 654 708 655 C 718 662 717 668 711 676 C 704 684 689 696 688 706 C 687 715 695 726 698 734 C 700 741 697 744 697 751 C 697 758 697 764 701 770 C 705 778 709 779 712 789 C 715 797 716 804 707 807 C 710 812 719 820 716 827 C 713 831 710 831 707 837 C 707 837 723 839 723 839 C 726 840 729 841 732 843 C 734 844 735 845 736 847 C 747 862 724 875 714 882 C 712 883 705 887 704 889 C 702 895 714 895 717 900 C 718 902 718 909 724 912 C 726 913 735 911 738 910 C 748 909 771 905 778 899 C 783 894 787 881 790 875 C 796 863 802 857 814 851 C 812 844 814 838 815 831 C 818 807 827 780 851 769 C 862 763 876 765 888 765 C 888 765 892 740 892 740 C 892 737 888 731 886 728 C 883 722 883 718 883 711 C 883 711 883 693 883 693 C 882 691 877 689 875 687 C 870 684 860 676 860 669 C 859 658 875 655 877 645 C 874 644 872 644 869 644 C 867 645 863 646 861 645 C 856 644 857 637 860 634 C 865 630 868 634 872 627 C 872 627 861 623 861 623 C 864 617 867 619 873 617 C 868 608 864 611 863 602 C 863 594 867 577 870 569 C 870 569 874 558 874 558 C 874 558 829 567 829 567 C 803 573 776 579 752 592 C 735 602 727 611 713 623 C 706 629 703 632 695 637 C 689 641 681 643 678 650 z" id="nth" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 498 922 C 498 922 514 932 514 932 C 514 932 541 946 541 946 C 541 946 558 954 558 954 C 558 954 571 952 571 952 C 571 952 583 954 583 954 C 583 954 592 954 592 954 C 592 954 602 962 602 962 C 602 962 610 964 610 964 C 610 964 630 973 630 973 C 627 962 629 965 631 956 C 631 951 627 939 629 936 C 631 933 640 935 643 936 C 646 940 645 945 648 949 C 654 956 668 957 677 957 C 674 951 676 950 682 947 C 691 943 693 947 700 943 C 712 936 714 925 721 915 C 719 913 716 908 714 907 C 712 907 708 908 706 909 C 702 910 698 911 693 911 C 688 911 675 910 671 908 C 666 906 666 904 659 903 C 659 903 630 900 630 900 C 625 899 618 895 613 894 C 606 894 603 902 598 903 C 596 904 593 901 591 900 C 588 899 583 897 579 897 C 574 898 570 901 566 902 C 560 903 559 899 554 900 C 554 900 534 907 534 907 C 534 907 498 922 498 922 z" id="eng" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 490 820 C 490 820 452 859 452 859 C 447 864 439 871 436 877 C 436 877 475 907 475 907 C 479 910 489 918 493 919 C 497 919 511 913 515 911 C 515 911 549 897 549 897 C 554 895 555 892 558 890 C 561 888 563 890 570 886 C 574 884 580 881 583 878 C 585 875 586 872 588 871 C 591 869 592 871 593 873 C 596 871 599 868 602 868 C 604 867 611 870 614 870 C 622 872 625 871 631 867 C 627 866 623 868 619 866 C 613 863 608 854 600 850 C 595 849 584 845 587 838 C 593 825 620 836 618 818 C 617 811 612 813 610 810 C 608 807 617 802 619 801 C 631 793 634 792 645 802 C 647 801 648 800 649 798 C 652 791 648 774 648 766 C 632 770 618 765 607 753 C 603 754 599 755 596 759 C 585 769 591 789 583 799 C 579 803 571 812 567 814 C 561 817 554 814 547 814 C 538 814 535 816 526 817 C 518 819 498 821 490 820 z" id="iri" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 202 1527 C 204 1527 210 1527 212 1526 C 214 1525 216 1518 217 1516 C 219 1509 222 1502 226 1496 C 230 1489 236 1479 242 1473 C 242 1473 254 1464 254 1464 C 260 1458 263 1453 270 1448 C 278 1442 288 1436 298 1434 C 298 1434 336 1430 336 1430 C 353 1425 369 1402 381 1389 C 381 1389 391 1379 391 1379 C 393 1378 396 1376 397 1374 C 401 1366 392 1362 389 1356 C 389 1356 387 1340 387 1340 C 385 1330 379 1321 370 1316 C 361 1311 358 1317 349 1316 C 343 1315 338 1311 333 1308 C 330 1307 325 1305 324 1302 C 323 1298 330 1291 332 1288 C 336 1281 334 1279 336 1273 C 337 1268 340 1265 340 1260 C 340 1252 335 1256 332 1252 C 328 1248 329 1242 331 1238 C 332 1232 335 1224 340 1220 C 344 1216 347 1217 352 1210 C 361 1200 375 1172 378 1159 C 378 1159 383 1139 383 1139 C 385 1134 387 1130 388 1123 C 388 1114 383 1107 390 1099 C 393 1096 397 1093 401 1093 C 404 1093 410 1096 414 1094 C 416 1094 416 1091 418 1090 C 421 1087 427 1086 430 1086 C 441 1087 439 1095 453 1101 C 453 1101 477 1109 477 1109 C 477 1109 503 1123 503 1123 C 503 1123 523 1130 523 1130 C 523 1130 534 1136 534 1136 C 539 1138 544 1138 547 1139 C 555 1141 558 1149 570 1148 C 575 1148 583 1139 587 1135 C 589 1132 598 1113 598 1110 C 599 1107 598 1106 598 1103 C 599 1096 605 1086 610 1082 C 606 1069 610 1069 609 1059 C 607 1048 598 1044 597 1032 C 597 1028 598 1025 597 1021 C 597 1016 594 1014 593 1012 C 592 1009 592 1007 591 1005 C 590 1003 586 1001 584 999 C 579 994 574 988 568 984 C 563 982 554 983 549 976 C 548 974 547 971 547 969 C 554 967 554 964 555 957 C 555 957 535 947 535 947 C 512 936 496 928 475 912 C 453 895 439 879 412 867 C 390 857 356 848 332 848 C 332 848 290 848 290 848 C 290 848 278 849 278 849 C 259 850 241 852 222 858 C 219 859 205 862 203 864 C 202 865 202 869 202 871 C 202 871 202 1527 202 1527 z" id="mid" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 674 1309 C 673 1311 672 1313 671 1315 C 670 1316 668 1318 667 1319 C 658 1325 653 1312 645 1313 C 645 1313 624 1321 624 1321 C 610 1325 596 1324 582 1324 C 577 1324 568 1325 564 1329 C 564 1329 546 1351 546 1351 C 540 1356 526 1353 517 1359 C 510 1363 506 1371 500 1372 C 497 1372 493 1370 490 1369 C 484 1368 482 1371 475 1369 C 475 1369 452 1360 452 1360 C 440 1358 436 1362 427 1363 C 418 1364 418 1358 408 1364 C 407 1365 404 1366 403 1368 C 400 1372 404 1376 406 1379 C 410 1386 412 1399 418 1406 C 424 1412 442 1414 451 1414 C 454 1414 460 1412 462 1413 C 466 1414 464 1418 470 1422 C 477 1426 494 1429 502 1429 C 516 1429 517 1420 526 1417 C 528 1417 537 1417 539 1417 C 543 1419 544 1421 549 1420 C 549 1420 571 1412 571 1412 C 580 1409 591 1407 600 1407 C 621 1407 621 1410 634 1410 C 650 1410 670 1409 685 1413 C 691 1415 694 1417 699 1421 C 701 1423 705 1427 708 1427 C 711 1428 714 1425 717 1425 C 717 1425 739 1419 739 1419 C 744 1420 753 1424 757 1425 C 762 1426 763 1422 770 1422 C 780 1423 784 1427 791 1429 C 799 1430 807 1428 815 1427 C 815 1427 819 1396 819 1396 C 819 1389 816 1376 813 1370 C 811 1366 808 1363 807 1358 C 805 1353 809 1345 809 1338 C 809 1335 808 1325 807 1324 C 806 1322 801 1320 799 1320 C 799 1320 779 1313 779 1313 C 758 1306 746 1305 724 1305 C 724 1305 692 1308 692 1308 C 686 1309 680 1310 674 1309 z" id="wes" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 674 1307 C 674 1307 698 1304 698 1304 C 720 1301 738 1299 760 1304 C 760 1304 809 1319 809 1319 C 813 1307 808 1308 806 1300 C 806 1296 807 1293 808 1290 C 821 1296 822 1286 836 1285 C 836 1269 826 1273 825 1257 C 825 1251 826 1242 831 1239 C 835 1236 838 1236 843 1232 C 848 1227 848 1222 854 1221 C 860 1219 870 1222 876 1223 C 876 1223 874 1210 874 1210 C 874 1206 874 1202 873 1198 C 872 1190 868 1189 862 1184 C 855 1179 852 1175 842 1177 C 832 1179 829 1185 822 1189 C 822 1189 799 1197 799 1197 C 790 1201 784 1208 774 1210 C 765 1212 758 1207 752 1200 C 750 1197 750 1195 748 1193 C 743 1190 739 1192 734 1191 C 728 1190 721 1184 715 1183 C 711 1183 706 1185 702 1186 C 682 1196 698 1217 680 1232 C 672 1238 656 1244 646 1246 C 640 1247 622 1249 618 1251 C 614 1254 616 1257 613 1259 C 611 1260 608 1260 605 1262 C 605 1262 600 1267 600 1267 C 600 1267 594 1273 594 1273 C 590 1276 586 1284 583 1289 C 583 1289 576 1298 576 1298 C 573 1304 576 1316 582 1319 C 584 1320 588 1320 590 1320 C 590 1320 606 1320 606 1320 C 619 1320 631 1316 642 1310 C 647 1307 648 1304 653 1301 C 661 1298 669 1301 674 1307 z" id="gol" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 816 1367 C 820 1377 822 1381 822 1392 C 822 1392 822 1404 822 1404 C 822 1404 819 1426 819 1426 C 829 1424 844 1425 849 1435 C 850 1438 850 1442 850 1445 C 856 1444 870 1435 876 1432 C 876 1432 906 1419 906 1419 C 911 1415 913 1407 919 1405 C 924 1403 938 1408 944 1409 C 944 1409 951 1409 951 1409 C 964 1409 970 1407 983 1409 C 992 1398 994 1403 1004 1406 C 1006 1403 1014 1390 1015 1387 C 1016 1382 1014 1376 1012 1371 C 1010 1367 1009 1360 1006 1357 C 1003 1352 996 1347 991 1342 C 989 1340 987 1338 986 1335 C 985 1333 985 1330 982 1328 C 980 1325 970 1326 966 1326 C 967 1319 963 1315 960 1309 C 958 1306 957 1302 954 1300 C 950 1298 942 1298 938 1297 C 932 1296 927 1292 923 1287 C 923 1287 913 1273 913 1273 C 913 1273 898 1255 898 1255 C 898 1255 885 1238 885 1238 C 883 1236 880 1229 878 1228 C 875 1226 869 1225 866 1225 C 862 1224 857 1222 853 1225 C 847 1229 850 1237 850 1243 C 850 1252 849 1258 845 1266 C 843 1270 840 1275 839 1279 C 838 1288 844 1287 847 1293 C 848 1297 848 1303 848 1307 C 848 1318 842 1335 839 1346 C 838 1350 836 1358 833 1360 C 830 1363 828 1361 825 1362 C 823 1363 818 1366 816 1367 z" id="tyn" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1104 1335 C 1104 1321 1105 1317 1108 1304 C 1109 1300 1111 1292 1109 1288 C 1107 1284 1101 1280 1098 1277 C 1085 1265 1083 1264 1069 1254 C 1069 1254 1040 1231 1040 1231 C 1040 1231 1022 1219 1022 1219 C 1022 1219 1006 1205 1006 1205 C 1001 1201 995 1197 990 1192 C 986 1187 981 1178 982 1172 C 983 1164 989 1163 985 1155 C 978 1159 976 1173 969 1172 C 966 1171 962 1165 962 1162 C 960 1155 966 1148 964 1145 C 962 1142 958 1143 956 1144 C 952 1144 943 1148 939 1150 C 937 1151 935 1153 934 1155 C 933 1158 936 1161 935 1164 C 935 1166 932 1169 931 1171 C 929 1175 930 1182 931 1186 C 937 1198 952 1206 960 1219 C 964 1227 964 1234 967 1242 C 970 1251 979 1261 986 1267 C 991 1271 997 1274 1004 1276 C 1007 1276 1016 1277 1018 1279 C 1022 1283 1016 1286 1022 1293 C 1029 1301 1059 1319 1070 1327 C 1073 1329 1076 1332 1079 1335 C 1080 1337 1082 1340 1084 1340 C 1087 1341 1100 1336 1104 1335 z" id="adr" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1044 1331 C 1040 1336 1036 1342 1032 1348 C 1031 1350 1029 1353 1030 1356 C 1031 1359 1036 1361 1038 1363 C 1044 1369 1047 1377 1043 1385 C 1039 1391 1035 1386 1031 1390 C 1029 1392 1029 1397 1028 1400 C 1025 1406 1020 1416 1015 1419 C 1007 1425 999 1419 1001 1409 C 995 1406 990 1403 987 1411 C 990 1413 992 1414 993 1418 C 993 1422 990 1429 989 1434 C 989 1434 986 1455 986 1455 C 985 1458 982 1460 979 1461 C 969 1462 961 1453 954 1448 C 950 1444 937 1436 932 1433 C 932 1433 919 1429 919 1429 C 914 1427 912 1423 909 1423 C 906 1422 901 1425 898 1426 C 898 1426 874 1437 874 1437 C 877 1455 856 1455 855 1470 C 854 1481 866 1486 871 1495 C 876 1506 872 1516 868 1527 C 868 1527 1223 1527 1223 1527 C 1223 1527 1224 1509 1224 1509 C 1224 1509 1211 1479 1211 1479 C 1209 1474 1206 1464 1199 1464 C 1195 1464 1196 1471 1189 1475 C 1187 1467 1186 1458 1178 1454 C 1177 1456 1174 1462 1171 1461 C 1170 1460 1169 1457 1168 1455 C 1167 1450 1167 1444 1165 1439 C 1162 1431 1155 1427 1154 1421 C 1153 1412 1162 1412 1165 1411 C 1173 1409 1173 1407 1182 1408 C 1193 1410 1195 1414 1203 1416 C 1204 1408 1203 1409 1195 1405 C 1193 1404 1191 1403 1188 1402 C 1188 1402 1164 1406 1164 1406 C 1161 1406 1157 1407 1155 1406 C 1153 1405 1136 1392 1151 1387 C 1146 1384 1145 1387 1141 1385 C 1138 1384 1133 1379 1131 1376 C 1125 1369 1128 1367 1126 1361 C 1124 1355 1111 1342 1106 1340 C 1102 1338 1088 1343 1084 1346 C 1081 1348 1080 1351 1077 1351 C 1074 1352 1070 1349 1068 1348 C 1059 1344 1052 1337 1044 1331 z" id="ion" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1227 1321 C 1227 1321 1242 1339 1242 1339 C 1237 1336 1231 1334 1225 1333 C 1225 1333 1233 1347 1233 1347 C 1233 1347 1217 1339 1217 1339 C 1217 1339 1221 1347 1221 1347 C 1214 1346 1202 1339 1201 1332 C 1200 1330 1201 1329 1201 1327 C 1184 1333 1203 1353 1209 1360 C 1211 1362 1214 1366 1214 1369 C 1213 1373 1207 1369 1204 1370 C 1202 1370 1201 1371 1199 1372 C 1200 1374 1202 1377 1202 1379 C 1202 1381 1200 1383 1200 1386 C 1202 1390 1213 1394 1217 1395 C 1214 1391 1213 1391 1210 1388 C 1204 1382 1209 1379 1213 1380 C 1215 1381 1219 1384 1221 1385 C 1227 1389 1231 1389 1234 1392 C 1238 1395 1238 1401 1233 1404 C 1233 1404 1233 1413 1233 1413 C 1233 1413 1234 1425 1234 1425 C 1229 1423 1225 1418 1219 1418 C 1217 1418 1213 1418 1213 1421 C 1213 1425 1224 1429 1218 1434 C 1213 1439 1210 1431 1200 1434 C 1200 1434 1209 1455 1209 1455 C 1209 1455 1212 1470 1212 1470 C 1212 1470 1223 1497 1223 1497 C 1225 1496 1228 1493 1231 1493 C 1234 1492 1239 1494 1242 1496 C 1247 1497 1252 1498 1257 1498 C 1267 1498 1268 1496 1279 1498 C 1279 1498 1296 1504 1296 1504 C 1298 1504 1300 1503 1302 1502 C 1305 1502 1306 1502 1309 1501 C 1318 1498 1333 1485 1339 1478 C 1345 1470 1350 1464 1350 1454 C 1340 1451 1353 1448 1352 1438 C 1352 1438 1335 1442 1335 1442 C 1333 1442 1330 1442 1329 1440 C 1328 1436 1332 1436 1329 1429 C 1328 1429 1326 1430 1325 1430 C 1316 1429 1322 1415 1318 1410 C 1314 1404 1302 1405 1305 1399 C 1306 1397 1309 1395 1309 1393 C 1310 1390 1308 1387 1309 1384 C 1309 1381 1311 1379 1311 1376 C 1311 1374 1308 1369 1306 1366 C 1305 1362 1304 1357 1303 1353 C 1297 1354 1293 1358 1289 1357 C 1286 1357 1285 1354 1284 1352 C 1281 1347 1276 1342 1280 1336 C 1284 1328 1294 1326 1300 1319 C 1300 1319 1288 1320 1288 1320 C 1288 1320 1280 1315 1280 1315 C 1280 1315 1259 1313 1259 1313 C 1259 1313 1238 1316 1238 1316 C 1238 1316 1227 1321 1227 1321 z" id="aeg" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1304 1506 C 1296 1516 1288 1514 1277 1515 C 1272 1516 1268 1518 1263 1516 C 1258 1515 1255 1513 1245 1511 C 1245 1511 1227 1509 1227 1509 C 1227 1509 1227 1527 1227 1527 C 1227 1527 1582 1527 1582 1527 C 1582 1527 1582 1515 1582 1515 C 1582 1515 1579 1485 1579 1485 C 1579 1485 1576 1461 1576 1461 C 1576 1461 1571 1462 1571 1462 C 1571 1462 1571 1440 1571 1440 C 1571 1440 1567 1432 1567 1432 C 1567 1432 1572 1420 1572 1420 C 1572 1420 1572 1409 1572 1409 C 1564 1413 1565 1422 1558 1424 C 1551 1427 1543 1417 1534 1423 C 1530 1426 1524 1436 1519 1442 C 1512 1449 1495 1455 1485 1454 C 1478 1454 1473 1450 1467 1447 C 1457 1441 1448 1435 1436 1435 C 1434 1435 1431 1435 1430 1435 C 1419 1438 1424 1450 1419 1457 C 1417 1460 1407 1463 1403 1464 C 1397 1465 1390 1463 1385 1459 C 1385 1459 1378 1451 1378 1451 C 1376 1450 1371 1450 1368 1449 C 1365 1449 1362 1447 1359 1448 C 1353 1450 1355 1458 1350 1469 C 1342 1482 1332 1492 1319 1500 C 1314 1502 1310 1506 1304 1506 z M 1536 1460 C 1534 1467 1530 1468 1527 1474 C 1525 1479 1528 1482 1526 1485 C 1525 1487 1523 1487 1520 1490 C 1515 1493 1513 1498 1504 1502 C 1495 1507 1483 1508 1477 1498 C 1476 1496 1475 1493 1475 1491 C 1474 1485 1481 1487 1487 1482 C 1491 1479 1490 1477 1494 1475 C 1494 1475 1517 1470 1517 1470 C 1524 1467 1528 1462 1536 1460 z" id="eas" onClick={this.onClick} onMouseOver={this.onHover}/>
                    <path d="M 1570 1032 C 1570 1032 1546 1047 1546 1047 C 1546 1047 1511 1064 1511 1064 C 1511 1064 1483 1087 1483 1087 C 1483 1087 1462 1097 1462 1097 C 1462 1097 1474 1104 1474 1104 C 1481 1109 1488 1117 1496 1118 C 1505 1119 1513 1102 1521 1115 C 1523 1119 1523 1123 1520 1126 C 1515 1130 1507 1128 1503 1130 C 1500 1132 1499 1135 1496 1137 C 1492 1140 1489 1140 1486 1142 C 1483 1144 1478 1151 1475 1154 C 1471 1158 1467 1161 1461 1159 C 1457 1156 1454 1153 1453 1148 C 1453 1145 1454 1140 1452 1137 C 1449 1133 1442 1133 1438 1131 C 1435 1130 1432 1128 1432 1125 C 1433 1120 1438 1115 1442 1112 C 1444 1110 1448 1109 1449 1106 C 1450 1103 1448 1101 1445 1101 C 1439 1101 1428 1108 1417 1105 C 1408 1102 1409 1097 1402 1094 C 1405 1089 1409 1089 1415 1088 C 1413 1087 1413 1086 1411 1085 C 1404 1084 1389 1089 1384 1093 C 1380 1097 1378 1102 1375 1104 C 1372 1105 1369 1103 1366 1102 C 1368 1105 1371 1109 1371 1112 C 1371 1116 1368 1120 1366 1123 C 1364 1127 1362 1133 1361 1138 C 1359 1145 1360 1152 1357 1158 C 1353 1166 1347 1166 1344 1176 C 1344 1176 1339 1210 1339 1210 C 1336 1216 1332 1214 1329 1218 C 1325 1223 1327 1230 1325 1235 C 1325 1235 1322 1246 1322 1246 C 1322 1250 1325 1253 1327 1256 C 1327 1256 1337 1273 1337 1273 C 1338 1275 1340 1279 1343 1280 C 1347 1281 1350 1277 1355 1275 C 1366 1273 1370 1281 1375 1289 C 1375 1289 1400 1284 1400 1284 C 1406 1283 1414 1283 1419 1280 C 1419 1280 1442 1257 1442 1257 C 1453 1248 1463 1244 1477 1241 C 1477 1241 1501 1237 1501 1237 C 1506 1236 1507 1233 1511 1233 C 1519 1232 1522 1247 1529 1244 C 1530 1243 1532 1242 1533 1241 C 1534 1240 1536 1238 1537 1237 C 1537 1237 1552 1247 1552 1247 C 1552 1247 1553 1242 1553 1242 C 1561 1246 1570 1250 1579 1251 C 1582 1251 1584 1250 1587 1250 C 1603 1249 1607 1247 1622 1242 C 1640 1236 1637 1241 1655 1229 C 1670 1218 1687 1202 1673 1183 C 1670 1179 1665 1173 1660 1171 C 1652 1167 1640 1168 1630 1164 C 1620 1159 1611 1151 1601 1145 C 1592 1140 1583 1136 1573 1133 C 1573 1133 1556 1129 1556 1129 C 1556 1129 1543 1124 1543 1124 C 1538 1123 1533 1122 1530 1117 C 1528 1115 1527 1111 1530 1109 C 1534 1108 1539 1112 1543 1110 C 1547 1108 1546 1102 1547 1098 C 1549 1088 1555 1079 1556 1069 C 1554 1069 1551 1069 1549 1069 C 1544 1068 1540 1063 1544 1058 C 1544 1058 1565 1042 1565 1042 C 1568 1040 1571 1037 1570 1032 z" id="bla" onClick={this.onClick} onMouseOver={this.onHover}/>
                </g>
            </svg>
        );
    }
}
SvgStandard.propTypes = {
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
    distributionAdviceSetting: PropTypes.object,
    shiftKeyPressed: PropTypes.bool,
    onShowHoverAdvice: PropTypes.array,
    onShowVisibleAdvice: PropTypes.array,
};
// eslint-disable-line semi
