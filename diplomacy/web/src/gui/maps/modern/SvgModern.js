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
/** Generated with parameters: Namespace(input='src/diplomacy/maps/svg/modern.svg', name='SvgModern', output='src/gui/maps/modern/') **/
import React from "react";
import PropTypes from "prop-types";
import "./SvgModern.css";
import { Coordinates, SymbolSizes, Colors } from "./SvgModernMetadata";
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

export class SvgModern extends React.Component {
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
            _ada: "nopower",
            _adr: "water",
            _aeg: "water",
            _alb: "nopower",
            _ale: "nopower",
            _alg: "nopower",
            _als: "nopower",
            _ana: "nopower",
            _adl: "nopower",
            _ank: "nopower",
            _apu: "nopower",
            _ara: "water",
            _arc: "water",
            _arm: "nopower",
            _asw: "nopower",
            _aus: "nopower",
            _auv: "nopower",
            _aze: "nopower",
            _bal: "water",
            _bar: "nopower",
            _bel: "nopower",
            _ber: "nopower",
            _bhm: "water",
            _bie: "nopower",
            _bis: "water",
            _bor: "nopower",
            _bos: "nopower",
            _bri: "nopower",
            _brn: "water",
            _bul: "nopower",
            _cai: "nopower",
            _cas: "water",
            _cau: "nopower",
            _crp: "nopower",
            _cly: "nopower",
            _cro: "nopower",
            _cze: "nopower",
            _den: "nopower",
            _don: "nopower",
            _ebs: "water",
            _edi: "nopower",
            _eme: "water",
            _eng: "water",
            _esa: "nopower",
            _est: "nopower",
            _fin: "nopower",
            _fra: "nopower",
            _gda: "nopower",
            _geo: "nopower",
            _gib: "nopower",
            _gob: "water",
            _gol: "water",
            _gor: "nopower",
            _gre: "nopower",
            _ham: "nopower",
            _hel: "water",
            _hol: "nopower",
            _hun: "nopower",
            _ice: "nopower",
            _ion: "water",
            _ire: "nopower",
            _iri: "water",
            _irk: "nopower",
            _irn: "nopower",
            _isr: "nopower",
            _ist: "nopower",
            _izm: "nopower",
            _jor: "nopower",
            _kaz: "nopower",
            _kha: "nopower",
            _kie: "nopower",
            _kra: "nopower",
            _lap: "nopower",
            _lat: "nopower",
            _lbn: "water",
            _lib: "nopower",
            _lig: "nopower",
            _lit: "nopower",
            _lpl: "nopower",
            _lon: "nopower",
            _lyo: "nopower",
            _mac: "nopower",
            _mad: "nopower",
            _mal: "water",
            _mar: "nopower",
            _mat: "water",
            _mil: "nopower",
            _mol: "nopower",
            _mon: "nopower",
            _mor: "nopower",
            _mos: "nopower",
            _mun: "nopower",
            _mur: "nopower",
            _nap: "nopower",
            _nat: "water",
            _nav: "nopower",
            _nwy: "nopower",
            _nth: "water",
            _nwg: "water",
            _ode: "nopower",
            _par: "nopower",
            _per: "water",
            _pic: "nopower",
            _pie: "nopower",
            _pod: "nopower",
            _por: "nopower",
            _pru: "nopower",
            _red: "water",
            _rom: "nopower",
            _ros: "nopower",
            _ruh: "nopower",
            _rum: "nopower",
            _sat: "water",
            _sau: "nopower",
            _sax: "nopower",
            _ser: "nopower",
            _sev: "nopower",
            _sib: "nopower",
            _sil: "nopower",
            _sin: "nopower",
            _ska: "water",
            _slk: "nopower",
            _stp: "nopower",
            _sog: "water",
            _svl: "nopower",
            _swe: "nopower",
            _swi: "nopower",
            _syr: "nopower",
            _tun: "nopower",
            _tus: "nopower",
            _tyr: "water",
            _ura: "nopower",
            _ven: "nopower",
            _vol: "nopower",
            _wal: "nopower",
            _war: "nopower",
            _wbs: "water",
            _wme: "water",
            _wsa: "nopower",
            _whi: "water",
            _yor: "nopower",
            BriefLabelLayer: "labeltext",
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
            <svg className="SvgModern" colorRendering="optimizeQuality" height="600px" imageRendering="optimizeQuality" preserveAspectRatio="xMinYMin" shapeRendering="geometricPrecision" textRendering="optimizeLegibility" viewBox="0 0 716 600" width="716px" xmlns="http://www.w3.org/2000/svg">
                <title>MODERN</title>
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
                    <pattern height="10" id="patternRed" patternTransform="scale(0.39 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="red" height="10" width="10" x="0" y="0"/>
                        <rect fill="pink" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBrown" patternTransform="scale(0.39 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="peru" height="10" width="10" x="0" y="0"/>
                        <rect fill="antiquewhite" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternGreen" patternTransform="scale(0.39 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="seagreen" height="10" width="10" x="0" y="0"/>
                        <rect fill="yellowgreen" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBlue" patternTransform="scale(0.39 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="CornflowerBlue" height="10" width="10" x="0" y="0"/>
                        <rect fill="cyan" height="10" width="10" x="5" y="0"/>
                    </pattern>
                    <pattern height="10" id="patternBlack" patternTransform="scale(0.39 1)" patternUnits="userSpaceOnUse" width="10" x="0" y="0">
                        <rect fill="black" height="10" width="10" x="0" y="0"/>
                        <rect fill="gray" height="10" width="10" x="0" y="5"/>
                    </pattern>
                </defs>
                <g id="MapLayer">
                    <rect className="style1" height="85" width="210" x="205" y="355"/>
                    <polygon className={classes['_ada']} id="_ada" points="483,407 491,409 499,400 502,403 506,396,516,393,520,389,530,390,546,378,552,380,558,373 563,374 568,369 585,369 581,362 575,360 571,343 569,340 563,339 560,337 555,341,543,345,539,352,515,359,502,357 480,376 482,383 478,393"/>
                    <polygon className={classes['_adr']} id="_adr" points="309,374 308,372 288,354 291,350 281,351 275,348 271,342 266,325 258,319 258,305 266,300 269,302 268,305 271,311 274,305 279,306 281,319 298,337 310,346 319,352 321,354 319,371 321,374"/>
                    <polygon className={classes['_aeg']} id="_aeg" points="361,423 357,412 362,413 361,406 369,408 366,399 355,392 362,388 353,378 356,372 363,379 368,373 365,368 389,366 395,369 391,374 393,375 390,382 398,381 400,397 397,400 402,402 404,410 408,412 404,417 413,415 413,421 402,432 390,429 376,430 371,428 368,430"/>
                    <polygon className={classes['_alb']} id="_alb" points="319,352 321,354 319,371 321,374 327,382 337,372 337,368 333,364 332,351 327,344 320,345"/>
                    <polygon className={classes['_ale']} id="_ale" points="459,462 447,462,441,467,432,471 426,470 424,474,417,476,399,469 394,469 388,476,389,482,385,487,393,494 393,526 412,530,424,529,440,521,456,525,465,534 474,532 471,526,475,522,470,514,465,514,455,495,463,480,459,473"/>
                    <polygon className={classes['_alg']} id="_alg" points="201,415 191,411,183,411,180,410,169,412,153,406,122,404,106,410 96,408 91,413,81,411,78,406 74,408 75,417,70,422,77,428,76,434 31,449 173,533 176,531 219,514 213,507 214,475 205,461 201,460 195,447 196,421"/>
                    <polygon className={classes['_als']} id="_als" points="193,233 204,240 211,247 219,250 212,270 210,270 205,275 196,274 193,268 195,266 195,257 185,252 190,240"/>
                    <polygon className={classes['_ana']} id="_ana" points="480,376 472,378,464,376,452,379 447,386 449,393,435,401,433,407,439,407 442,413 448,412,456,414,465,420,480,415 483,407 478,393 482,383"/>
                    <polygon className={classes['_adl']} id="_adl" points="74,382 96,387 95,384 100,378 107,379 107,377 102,367 104,359 101,356 97,355 88,361 85,361 81,368 74,367 71,370"/>
                    <polygon className={classes['_ank']} id="_ank" points="440,355 456,337,471,335 475,332 482,338,485,338,491,340,504,340,522,337 536,328 547,324 554,324 558,327 560,337 555,341,543,345,539,352,515,359,502,357 480,376 472,378,464,376,452,379 447,386 442,385 444,371"/>
                    <polygon className={classes['_apu']} id="_apu" points="309,374 308,372 288,354 291,350 281,351 275,348 271,342 267,346 272,356 276,358 280,362 284,367 287,376 293,378 297,372 307,380 311,377"/>
                    <polygon className={classes['_ara']} id="_ara" points="559,554 569,554,584,548,588,551,595,545,598,545,645,531,658,532,678,515 690,502 704,474 715,477 715,559 559,559"/>
                    <polygon className={classes['_arc']} id="_arc" points="0,37 91,37 95,34 99,36 102,29 96,25 98,24 107,28 105,23 111,24 100,18 99,13 109,9 110,17 113,8 117,9 118,20 113,28 120,27 123,21 131,24 287,24 287,0 0,0"/>
                    <polygon className={classes['_arm']} id="_arm" points="571,343 569,340 563,339 560,337 558,327 561,321 574,317 580,324 580,329 588,334 595,348"/>
                    <polygon className={classes['_asw']} id="_asw" points="393,559 393,526 412,530,424,529,440,521,456,525,465,534 474,532 485,525,498,525 507,519 516,525,525,540,523,545,527,548 530,559"/>
                    <polygon className={classes['_aus']} id="_aus" points="233,272 239,276 260,274 265,278 267,276 264,268 268,268 272,264 275,262 284,264 288,258 302,265 302,274 298,284 295,285 287,284 279,290 271,290 259,288 254,285 247,289 242,288 238,281 233,279"/>
                    <polygon className={classes['_auv']} id="_auv" points="162,327 162,320 172,315 171,304 175,299 166,290 167,285 160,279 154,277 155,294 141,307 140,316 147,318 157,327"/>
                    <polygon className={classes['_aze']} id="_aze" points="574,317 580,324 580,329 588,334 595,348 607,333 612,341 623,340 619,328 619,314 625,310 621,308 617,309 609,301 604,312 576,302 573,305 579,309 582,313"/>
                    <polygon className={classes['_bal']} id="_bal" points="294,162 302,148 303,136 314,131 318,128 336,146 334,160 335,170 330,177 325,179 320,188 316,182 312,180"/>
                    <polygon className={classes['_bar']} id="_bar" points="107,377 115,370 120,370 122,368 119,358 135,339 151,337 160,332 162,327 157,327 147,318 145,324 124,326 113,321 107,327 108,337 101,356 104,359 102,367"/>
                    <polygon className={classes['_bel']} id="_bel" points="191,211 176,214 172,222 185,224 193,233 204,240 209,236 206,226 205,216 193,213"/>
                    <polygon className={classes['_ber']} id="_ber" points="286,189 278,187 279,182 273,181 260,189 258,204 256,207 257,221 288,213 288,206 285,203 285,194"/>
                    <polygon className={classes['_bhm']} id="_bhm" points="273,163 276,170 281,170 285,162 294,162 312,180 305,181 297,187 286,189 278,187 279,182 273,181 260,189 255,183 251,182 251,180 249,173 261,173 266,176 271,171 270,167"/>
                    <polygon className={classes['_bie']} id="_bie" points="358,192 374,181 382,179 387,168 387,159 410,161 410,172 419,180 422,185 428,185 428,190 421,194 425,206 417,213 415,220 403,220 398,218 393,220 382,216 368,216 360,223 360,216 357,214 357,210 362,207 362,201"/>
                    <polygon className={classes['_bis']} id="_bis" points="109,232 112,237 117,238 130,252 130,264 135,269 128,286 129,287 120,302 110,299 106,300 82,288 72,285 67,280 63,279 63,232"/>
                    <polygon className={classes['_bor']} id="_bor" points="135,269 128,286 129,287 120,302 122,309 140,316 141,307 155,294 154,277 151,271"/>
                    <polygon className={classes['_bos']} id="_bos" points="313,342 298,328 290,315 290,310 295,308 315,310 321,312 321,323 325,325 323,331"/>
                    <polygon className={classes['_bri']} id="_bri" points="155,229 149,228 142,221 142,235 131,233 129,228 112,227 109,232 112,237 117,238 130,252 130,264 135,269 151,271 151,245 153,236"/>
                    <polygon className={classes['_brn']} id="_brn" points="472,0 466,9 470,17 463,20 452,16 456,11 450,6 440,7 409,21 395,17 383,15 379,17 373,15 378,10 367,5 360,6 359,10 355,6 352,11 349,5 342,10 322,18 311,24 287,24 287,0"/>
                    <polygon className={classes['_bul']} id="_bul" points="407,348 402,340 404,328 410,324 403,320 391,320 380,327 365,326 356,325 352,322 349,325 353,333 356,336 350,339 351,343 355,350 362,359 372,357 378,360 391,356 392,351 400,348"/>
                    <g className={classes['_cai']} id="_cai">
                        <polygon points="498,458 493,460 482,462 479,462 474,464 464,461 459,462 459,473 463,480 455,495 465,514 470,514 475,522 471,526 474,532 485,525,498,525 507,519 493,491 480,475 485,475 493,466 501,463"/>
                        <polygon className="water" points="482,462 479,462 480,475 483,475"/>
                    </g>
                    <polygon className={classes['_cas']} id="_cas" points="623,340 619,328 619,314 625,310 621,308 617,309 609,301 590,290 585,281 574,278 572,271 571,252 572,249 575,248 578,252 581,248 582,238 589,234 598,222 613,216 620,220 623,239 613,241 611,247 615,254 605,259 606,263 611,262 621,275 636,274 635,284 643,291 640,284 647,279 654,284 662,287 660,295 651,297 646,294 651,306 655,302 669,311 673,334 672,340 656,350 643,351 638,346 627,349"/>
                    <polygon className={classes['_cau']} id="_cau" points="609,301 590,290 585,281 574,278 572,271 547,268 541,272 544,297 541,303 557,304 561,306 565,303 573,305 576,302 604,312"/>
                    <polygon className={classes['_crp']} id="_crp" points="419,180 422,185 428,185 428,190 421,194 425,206 432,208 439,204 450,207 452,215 459,215 465,224 466,227 483,223 488,227 493,225 496,201 492,187 476,192 451,180 424,175"/>
                    <polygon className={classes['_cly']} id="_cly" points="144,132 139,128 140,123 139,118 143,115 142,107 150,102 158,101 167,104 161,111 156,115 149,125 149,132"/>
                    <polygon className={classes['_cro']} id="_cro" points="269,302 268,305 271,311 274,305 279,306 281,319 298,337 310,346 313,342 298,328 290,315 290,310 295,308 315,310 321,312 322,307 319,302 311,301 295,285 287,284 279,290 271,290"/>
                    <polygon className={classes['_cze']} id="_cze" points="290,230 281,230 273,236 261,237 259,240 275,262 284,264 288,258 302,265 317,251 316,244 312,242 301,243 297,235"/>
                    <g className={classes['_den']} id="_den">
                        <polygon points="249,173 248,172 240,171 239,162 243,147 246,143 254,142 260,139 261,145 258,152 261,159 254,161 249,166"/>
                        <polygon points="261,173 266,176 271,171 270,167 273,163 272,160 268,160 264,162 258,164"/>
                        <polygon className="water" points="261,159 254,161 249,166 249,173 261,173 258,164 264,162"/>
                    </g>
                    <polygon className={classes['_don']} id="_don" points="473,273 495,260 498,259 502,253 509,250 509,246 506,244 506,238 490,241 477,250 462,249 459,266 461,272"/>
                    <polygon className={classes['_ebs']} id="_ebs" points="462,305 470,296 480,294 477,288 468,292 459,284 473,273 495,260 498,259 499,261 486,270 491,276 487,288 482,289 489,296 501,297 522,308 533,311 539,318 536,328 522,337 504,340 491,340 485,338 482,338 475,332"/>
                    <polygon className={classes['_edi']} id="_edi" points="161,111 168,111 173,113 174,116 173,122 162,134 155,134 161,136 164,138 166,145 160,148 151,139 149,132 149,125 156,115"/>
                    <polygon className={classes['_eme']} id="_eme" points="413,421 419,417 424,418 431,425 440,422 442,413 448,412,456,414,465,420,480,415 483,407 491,409 499,400 502,403 496,410 498,414 497,420 503,449 498,458 493,460 482,462 479,462 474,464 464,461 459,462 447,462,441,467,432,471 426,470 402,446 402,432"/>
                    <polygon className={classes['_eng']} id="_eng" points="176,214 172,222 159,224 157,226 160,230 155,229 149,228 142,221 142,235 131,233 129,228 112,227 109,232 63,232 63,204 109,204 111,206 120,204 127,208 131,204 141,207 152,207 161,211 172,210"/>
                    <polygon className={classes['_esa']} id="_esa" points="394,469 369,461 356,459 349,459 342,461 348,474 353,520 358,539 365,553 371,559 393,559 393,494 385,487 389,482 388,476"/>
                    <polygon className={classes['_est']} id="_est" points="382,118 369,117 359,118 351,123 352,131 358,133 358,140 368,137 379,139 385,133"/>
                    <polygon className={classes['_fin']} id="_fin" points="384,101 352,113 348,113 336,106 333,89 345,76 351,64 357,62 354,55 348,52 347,45 343,38 330,29 333,24 341,30 354,29 355,18 362,17 369,23 371,28 376,37 375,52 394,83 394,88"/>
                    <polygon className={classes['_fra']} id="_fra" points="256,207 242,213 233,214 228,219 228,226 223,237 223,242 227,248 238,251 242,249 242,242 257,221"/>
                    <polygon className={classes['_gda']} id="_gda" points="330,177 325,179 320,188 322,192 322,199 331,200 342,199 349,193 351,186 349,179 342,175 338,175 334,178"/>
                    <polygon className={classes['_geo']} id="_geo" points="522,308 533,311 539,318 536,328 547,324 554,324 558,327 561,321 574,317 582,313 579,309 573,305 565,303 561,306 557,304 541,303 526,303"/>
                    <polygon className={classes['_gib']} id="_gib" points="71,370 68,366 58,366 52,372 48,373 49,379 52,385 64,384 74,382"/>
                    <polygon className={classes['_gob']} id="_gob" points="336,146 344,140 347,141 352,147 356,148 359,145 358,140 358,133 352,131 351,123 359,118 369,117 382,118 384,112 393,112 385,106 384,101 352,113 348,113 336,106 333,89 345,76 351,64 357,62 354,55 348,52 341,50 334,65 336,72 312,95 309,109 316,113 319,121 318,128"/>
                    <polygon className={classes['_gol']} id="_gol" points="120,370 122,368 119,358 135,339 151,337 160,332 162,327 162,320 172,315 179,319 179,337 192,350 217,350 217,354 212,358 210,357 208,360 210,370 156,370 154,366 147,370"/>
                    <polygon className={classes['_gor']} id="_gor" points="459,139 456,131 456,122 467,105 485,92 513,87 536,83 555,89 559,101 555,125 535,125 531,132 509,143 506,152 482,138"/>
                    <polygon className={classes['_gre']} id="_gre" points="361,423 357,412 362,413 361,406 369,408 366,399 355,392 362,388 353,378 356,372 363,379 368,373 365,368 389,366 392,360 391,356 378,360 372,357 362,359 354,360 344,367 337,368 337,372 327,382 328,387 338,401 353,401 356,403 341,403 337,407 345,420 346,415 352,422 353,418"/>
                    <g className={classes['_ham']} id="_ham">
                        <polygon points="260,189 255,183 251,182 251,180 249,173 248,172 240,171 239,173 241,179 240,184 240,187 232,191 231,188 226,187 224,189 225,195 223,204 218,210 213,210 212,214 218,214 228,219 233,214 242,213 256,207 258,204"/>
                        <polygon className="water" points="251,182 251,180 240,184 240,186"/>
                    </g>
                    <polygon className={classes['_hel']} id="_hel" points="239,162 240,171 239,173 241,179 240,184 240,187 232,191 231,188 226,187 224,189 212,188 209,190 209,172 219,162"/>
                    <polygon className={classes['_hol']} id="_hol" points="224,189 212,188 209,190 203,195 191,211 193,213 205,216 206,226 212,214 213,210 218,210 223,204 225,195"/>
                    <polygon className={classes['_hun']} id="_hun" points="319,302 311,301 295,285 298,284 302,274 315,274 328,270 337,264 349,265 354,270 344,280 340,294 334,296 325,294"/>
                    <polygon className={classes['_ice']} id="_ice" points="91,37 95,34 99,36 102,29 96,25 98,24 107,28 105,23 111,24 100,18 99,13 109,9 110,17 113,8 117,9 118,20 113,28 120,27 123,21 131,24 136,30 145,29 151,35 152,44 150,49 136,54 120,51 110,53 103,46 102,41"/>
                    <polygon className={classes['_ion']} id="_ion" points="321,374 327,382 328,387 338,401 353,401 356,403 341,403 337,407 345,420 346,415 352,422 353,418 361,423 368,430 376,434 394,434 402,432 402,446 290,446 290,404 298,392 298,389 297,385 293,378 297,372 307,380 311,377 309,374"/>
                    <polygon className={classes['_ire']} id="_ire" points="78,166 80,161 85,161 94,152 87,145 93,143 91,138 94,135 101,139 106,138 112,131 119,131 128,137 129,146 126,149 120,150 119,162 110,174 100,172 84,176"/>
                    <polygon className={classes['_iri']} id="_iri" points="129,146 126,149 120,150 119,162 110,174 100,172 84,176 78,166 63,166 63,204 109,204 129,195 137,197 142,194 136,194 129,188 123,187 122,181 132,180 135,174 131,173 140,167 146,168 149,159 146,148 137,146"/>
                    <polygon className={classes['_irk']} id="_irk" points="619,462 610,464 605,458 584,453 583,447 549,439 544,433 542,426 564,404 563,393 558,384 563,374 568,369 585,369 596,375 608,407 609,430 605,434 608,438 607,445 615,453"/>
                    <polygon className={classes['_irn']} id="_irn" points="715,331 673,334 672,340 656,350 643,351 638,346 627,349 623,340 612,341 607,333 595,348 571,343 575,360 581,362 585,369 596,375 608,407 609,430 615,438 632,439 648,450 654,459 666,455 673,456 696,475 704,474 715,477"/>
                    <polygon className={classes['_isr']} id="_isr" points="497,420 503,449 498,458 501,463 504,467 513,456 516,441 515,428 505,419"/>
                    <g className={classes['_ist']} id="_ist">
                        <polygon points="389,366 395,369 391,374 393,375 390,382 398,381 409,385 429,386 433,383 442,385 444,371 440,355 420,357 418,356 409,352 407,348 400,348 392,351 391,356 392,360"/>
                        <polygon className="water" points="393,375 400,371 406,371 426,361 418,360 421,357 418,356 414,360 400,365"/>
                    </g>
                    <polygon className={classes['_izm']} id="_izm" points="398,381 400,397 397,400 402,402 404,410 408,412 404,417 413,415 413,421 419,417 424,418 431,425 440,422 442,413 439,407 433,407 435,401 449,393 447,386 442,385 433,383 429,386 409,385"/>
                    <polygon className={classes['_jor']} id="_jor" points="504,467 508,473 511,482 519,481 528,471 528,465 539,460 531,451 539,449 540,443 549,439 544,433 542,426 530,438 516,441 513,456"/>
                    <polygon className={classes['_kaz']} id="_kaz" points="715,101 689,106 671,117 659,140 669,147 676,147 676,152 649,159 627,173 594,168 591,173 584,172 571,190 574,196 570,201 559,195 557,208 562,225 573,227 589,234 598,222 613,216 620,220 623,239 613,241 611,247 615,254 605,259 606,263 611,262 621,275 636,274 635,284 643,291 640,284 647,279 654,284 662,287 660,295 651,297 646,294 651,306 655,302 669,311 673,334 715,331"/>
                    <polygon className={classes['_kha']} id="_kha" points="506,238 490,241 477,250 462,249 459,246 459,227 465,224 466,227 483,223 488,227 493,225 499,229 507,230 509,234"/>
                    <polygon className={classes['_kie']} id="_kie" points="425,206 432,208 439,204 450,207 452,215 459,215 465,224 459,227 459,246 462,249 459,266 461,272 456,274 448,274 444,269 435,245 409,239 403,220 415,220 417,213"/>
                    <polygon className={classes['_kra']} id="_kra" points="316,244 319,240 320,234 337,223 357,214 360,216 360,223 364,229 364,236 353,245 356,255 352,258 343,253 327,254 317,251"/>
                    <polygon className={classes['_lap']} id="_lap" points="379,17 373,15 378,10 367,5 360,6 359,10 355,6 352,11 349,5 342,10 322,18 311,24 308,34 312,37 320,42 319,33 330,34 330,29 333,24 341,30 354,29 355,18 362,17 369,23 371,28"/>
                    <polygon className={classes['_lat']} id="_lat" points="334,160 336,146 344,140 347,141 352,147 356,148 359,145 358,140 358,140 368,137 379,139 385,133 388,137 391,146 387,159 387,168 373,160 355,156"/>
                    <polygon className={classes['_lbn']} id="_lbn" points="426,470 424,474,417,476,399,469 394,469 369,461 356,459 349,459 342,461 336,465 332,474 319,481 296,472 284,474 275,472 272,469 272,464 290,446 402,446"/>
                    <polygon className={classes['_lib']} id="_lib" points="342,461 336,465 332,474 319,481 296,472 284,474 275,472 272,469 272,464 251,456 229,453 223,469 214,475 213,507 219,514 237,526 253,528 271,539 294,530 350,559 371,559 365,553 358,539 353,520 348,474"/>
                    <g className={classes['_lig']} id="_lig">
                        <polygon className="water" points="179,319 183,320 190,325 193,324 210,318 218,313 224,313 230,317 236,334 242,341 249,350 192,350 179,337"/>
                        <polygon points="217,350 214,347 213,338 220,330 221,341 219,348"/>
                    </g>
                    <polygon className={classes['_lit']} id="_lit" points="330,177 335,170 334,160 355,156 373,160 387,168 382,179 374,181 358,192 351,186 349,179 342,175 338,175 334,178"/>
                    <polygon className={classes['_lpl']} id="_lpl" points="146,168 149,159 146,148 137,146 137,142 143,137 144,132 149,132 151,139 160,148 160,158 155,168 155,182 146,176"/>
                    <polygon className={classes['_lon']} id="_lon" points="169,184 171,185 173,183 180,187 178,197 167,206 173,207 172,210 161,211 152,207 150,194 157,187"/>
                    <polygon className={classes['_lyo']} id="_lyo" points="175,299 166,290 167,285 160,279 168,270 170,262 185,252 195,257 195,266 193,268 196,274 205,275 194,286 181,284"/>
                    <polygon className={classes['_mac']} id="_mac" points="362,359 354,360 344,367 337,368 333,364 332,351 342,344 351,343 355,350"/>
                    <polygon className={classes['_mad']} id="_mad" points="113,321 107,327 108,337 101,356 97,355 88,361 85,361 82,350 64,340 56,332 65,314 72,313 74,310 107,316"/>
                    <polygon className={classes['_mal']} id="_mal" points="272,464 251,456 229,453 229,438 222,428 231,420 231,418 243,406 270,421 272,411 276,403 282,403 282,406 286,407 290,404 290,446"/>
                    <polygon className={classes['_mar']} id="_mar" points="172,315 179,319 183,320 190,325 189,307 194,302 203,301 207,299 206,289 204,284 197,289 194,286 181,284 175,299 171,304"/>
                    <polygon className={classes['_mat']} id="_mat" points="0,166 63,166 63,279 59,282 53,280 48,286 47,299 39,315 0,315"/>
                    <polygon className={classes['_mil']} id="_mil" points="247,289 246,309 242,316 233,313 225,296 227,289 239,291 242,288"/>
                    <polygon className={classes['_mol']} id="_mol" points="405,299 402,283 397,279 389,266 394,262 403,263 409,265 414,274 419,281 414,287 410,298"/>
                    <polygon className={classes['_mon']} id="_mon" points="190,325 193,324 210,318 203,301 194,302 189,307"/>
                    <polygon className={classes['_mor']} id="_mor" points="74,408 59,404 55,399 53,390 47,391 31,412 13,414 0,422 0,458 19,459 19,450 31,449 76,434 76,426 70,422 75,417"/>
                    <polygon className={classes['_mos']} id="_mos" points="387,159 410,161 410,172 419,180 424,175 451,180 476,192 492,187 513,173 507,166 506,152 482,138 459,139 440,136 422,129 388,137 391,146"/>
                    <polygon className={classes['_mun']} id="_mun" points="233,272 239,276 260,274 265,278 267,276 264,268 253,253 242,249 238,251 227,248 219,250 212,270 220,271 221,268"/>
                    <polygon className={classes['_mur']} id="_mur" points="453,34 445,33 434,51 446,59 438,65 425,60 421,60 420,66 431,75 430,78 412,74 406,61 407,55 397,50 394,44 422,47 432,39 433,32 426,27 409,21 395,17 383,15 379,17 371,28 376,37 375,52 394,83 394,88 414,94 450,96 467,105 485,92 513,87 479,48"/>
                    <polygon className={classes['_nap']} id="_nap" points="266,361 270,370 278,377 284,381 287,391 282,403 282,406 286,407 290,404 298,392 298,389 297,385 293,378 287,376 284,367 280,362 276,358 272,356"/>
                    <polygon className={classes['_nat']} id="_nat" points="0,166 78,166 80,161 85,161 94,152 87,145 93,143 91,138 94,135 101,139 106,138 112,131 119,131 128,137 129,146 137,146 137,142 143,137 144,132 139,128 140,123 139,118 143,115 142,107 150,102 150,49 136,54 120,51 110,53 103,46 102,41 92,37 0,37"/>
                    <polygon className={classes['_nav']} id="_nav" points="120,302 110,299 106,300 82,288 72,285 67,280 63,279 59,282 53,280 48,286 47,299 56,298 56,302 69,303 74,310 107,316 113,321 124,326 145,324 147,318 140,316 122,309"/>
                    <polygon className={classes['_nwy']} id="_nwy" points="308,34 292,48 271,75 252,78 233,91 229,103 232,109 227,113 229,122 239,131 260,123 264,116 267,124 272,124 279,100 283,78 303,56 312,37"/>
                    <polygon className={classes['_nth']} id="_nth" points="243,147 239,162 219,162 209,172 209,190 203,195 191,211 176,214 172,210 173,207 167,206 178,197 180,187 173,183 171,185 169,184 172,181 172,164 166,157 166,145 164,138 161,136 155,134 162,134 173,122 174,116 173,113 227,113 229,122 229,147"/>
                    <polygon className={classes['_nwg']} id="_nwg" points="312,24 308,34 292,48 271,75 252,78 233,91 229,103 232,109 227,113 173,113 168,111 161,111 167,104 158,101 150,102 150,49 152,44 151,35 145,29 136,30 131,24"/>
                    <polygon className={classes['_ode']} id="_ode" points="403,263 409,265 414,274 419,281 414,287 410,298 405,299 406,303 417,302 424,283 435,280 438,282 441,276 448,274 444,269 435,245 409,239 401,248"/>
                    <polygon className={classes['_par']} id="_par" points="151,271 151,245 153,236 190,240 185,252 170,262 168,270 160,279 154,277"/>
                    <polygon className={classes['_per']} id="_per" points="690,502 665,486 661,473 650,484 641,484 632,476 636,468 632,463 629,464 631,468 627,471 619,462 615,453 607,445 608,438 605,434 609,430 615,438 632,439 648,450 654,459 666,455 673,456 696,475 704,474"/>
                    <polygon className={classes['_pic']} id="_pic" points="172,222 159,224 157,226 160,230 155,229 153,236 190,240 193,233 185,224"/>
                    <polygon className={classes['_pie']} id="_pie" points="210,318 218,313 224,313 230,317 233,313 225,296 218,289 213,291 206,289 207,299 203,301"/>
                    <polygon className={classes['_pod']} id="_pod" points="360,223 364,229 364,236 353,245 356,255 352,258 349,265 354,270 376,273 383,266 389,266 394,262 403,263 401,248 409,239 403,220 398,218 393,220 382,216 368,216"/>
                    <polygon className={classes['_por']} id="_por" points="47,299 39,315 27,332 31,341 29,348 30,351 25,359 36,366 42,365 43,359 50,355 48,345 53,340 52,331 56,332 65,314 72,313 74,310 69,303 56,302 56,298 47,299"/>
                    <polygon className={classes['_pru']} id="_pru" points="320,188 316,182 312,180 305,181 297,187 286,189 285,194 285,203 288,206 304,209 306,203 322,199 322,192"/>
                    <polygon className={classes['_red']} id="_red" points="530,559 527,548 523,545 525,540 516,525 507,519 507,519 493,491 480,475 485,475 494,487 501,491 505,490 508,473 511,482 510,487 519,488 532,504 531,507 535,512 539,513 555,546 553,552 559,554 559,559"/>
                    <polygon className={classes['_rom']} id="_rom" points="242,341 249,350 254,356 266,361 272,356 267,346 257,334"/>
                    <g className={classes['_ros']} id="_ros">
                        <polygon points="498,259 499,261 486,270 491,276 487,288 482,289 489,296 501,297 522,308 526,303 541,303 544,297 541,272 528,267 523,251 521,248 509,246 509,250 502,253"/>
                        <polygon className="water" points="498,259 499,261 523,251 521,248"/>
                    </g>
                    <polygon className={classes['_ruh']} id="_ruh" points="212,214 218,214 228,219 228,226 223,237 223,242 227,248 219,250 211,247 204,240 209,236 206,226"/>
                    <polygon className={classes['_rum']} id="_rum" points="410,324 403,320 391,320 380,327 365,326 356,325 352,322 351,316 347,316 339,307 337,299 334,296 340,294 344,280 354,270 376,273 383,266 389,266 397,279 402,283 405,299 406,303 417,302 417,307 411,311"/>
                    <polygon className={classes['_sat']} id="_sat" points="0,315 39,315 27,332 31,341 29,348 30,351 25,359 36,366 42,365 48,373 49,379 42,386 47,391 31,412 13,414 0,422"/>
                    <polygon className={classes['_sau']} id="_sau" points="511,482 510,487 519,488 532,504 531,507 535,512 539,513 555,546 553,552 559,554 569,554,584,548,588,551,595,545,598,545,645,531,658,532,678,515 690,502 665,486 661,473 650,484 641,484 632,476 636,468 632,463 629,464 631,468 627,471 619,462 610,464 605,458 584,453 583,447 549,439 540,443 539,449 531,451 539,460 528,465 528,471 519,481"/>
                    <polygon className={classes['_sax']} id="_sax" points="264,268 268,268 272,264 275,262 259,240 261,237 273,236 281,230 290,230 288,213 257,221 242,242 242,249 253,253"/>
                    <polygon className={classes['_ser']} id="_ser" points="321,312 321,323 325,325 323,331 313,342 310,346 319,352 320,345 327,344 332,351 342,344 351,343 350,339 356,336 353,333 349,325 352,322 351,316 347,316 339,307 337,299 334,296 325,294 319,302 322,307"/>
                    <polygon className={classes['_sev']} id="_sev" points="462,305 470,296 480,294 477,288 468,292 459,284 473,273 461,272 456,274 448,274 441,276 438,282 436,284 440,287 450,284 452,288 447,290 444,296 453,298 453,305 457,306"/>
                    <polygon className={classes['_sib']} id="_sib" points="715,101 689,106 671,117 659,140 669,147 676,147 676,152 649,159 627,173 594,168 596,159 589,151 595,119 593,99 605,87 611,26 616,0 715,0"/>
                    <polygon className={classes['_sil']} id="_sil" points="316,244 312,242 301,243 297,235 290,230 288,213 288,206 304,209 319,230 320,234 319,240"/>
                    <polygon className={classes['_sin']} id="_sin" points="485,475 494,487 501,491 505,490 508,473 504,467 501,463 493,466"/>
                    <polygon className={classes['_ska']} id="_ska" points="243,147 246,143 254,142 260,139 261,145 258,152 261,159 264,162 268,160 272,160 275,155 269,143 271,137 267,124 264,116 260,123 239,131 229,122 229,147"/>
                    <polygon className={classes['_slk']} id="_slk" points="352,258 343,253 327,254 317,251 302,265 302,274 315,274 328,270 337,264 349,265"/>
                    <polygon className={classes['_stp']} id="_stp" points="382,118 384,112 393,112 385,106 384,101 394,88 414,94 450,96 467,105 456,122 456,131 459,139 440,136 422,129 388,137 385,133"/>
                    <polygon className={classes['_sog']} id="_sog" points="49,379 52,385 64,384 74,382 96,387 96,408 91,413,81,411,78,406 74,408 59,404 55,399 53,390 47,391 42,386"/>
                    <polygon className={classes['_svl']} id="_svl" points="42,365 43,359 50,355 48,345 53,340 52,331 56,332 64,340 82,350 85,361 81,368 74,367 71,370 71,370 68,366 58,366 52,372 48,373"/>
                    <polygon className={classes['_swe']} id="_swe" points="348,52 341,50 334,65 336,72 312,95 309,109 316,113 319,121 318,128 314,131 303,136 302,148 294,162 285,162 281,170 276,170 273,163 272,160 275,155 269,143 271,137 267,124 272,124 279,100 283,78 303,56 312,37 320,42 319,33 330,34 330,29 343,38 347,45"/>
                    <polygon className={classes['_swi']} id="_swi" points="210,270 194,286 197,289 204,284 206,289 213,291 218,289 225,296 227,289 239,291 242,288 238,281 233,279 233,272 221,268 220,271 212,270"/>
                    <polygon className={classes['_syr']} id="_syr" points="502,403 496,410 498,414 497,420 505,419 515,428 516,441 530,438 542,426 564,404 563,393 558,384 563,374 558,373 552,380 546,378 530,390 520,389 516,393 506,396"/>
                    <polygon className={classes['_tun']} id="_tun" points="229,453 229,438 222,428 231,420 231,418 227,417 220,420 221,412 216,410 210,411 206,415 201,415 196,421 195,447 201,460 205,461 214,475 223,469"/>
                    <polygon className={classes['_tus']} id="_tus" points="230,317 236,334 242,341 257,334 255,328 242,316 233,313"/>
                    <polygon className={classes['_tyr']} id="_tyr" points="249,350 254,356 266,361 270,370 278,377 284,381 287,391 282,403 276,403 264,404 251,401 247,402 231,418 227,417 220,420 221,412 216,410 216,383 220,364 217,354 217,350"/>
                    <polygon className={classes['_ura']} id="_ura" points="472,0 466,9 470,17 463,20 452,16 456,11 450,6 440,7 445,9 448,20 455,24 453,34 479,48 513,87 536,83 555,89 585,93 593,99 605,87 611,26 616,0 715,0"/>
                    <polygon className={classes['_ven']} id="_ven" points="271,342 266,325 258,319 258,305 266,300 269,302 271,290 259,288 254,285 247,289 246,309 242,316 255,328 257,334 267,346"/>
                    <g className={classes['_vol']} id="_vol">
                        <polygon points="572,271 571,252 572,249 575,248 578,252 581,248 582,238 589,234 573,227 562,225 557,208 559,195 570,201 574,196 571,190 584,172 591,173 594,168 596,159 589,151 595,119 593,99 585,93 555,89 559,101 555,125 535,125 531,132 509,143 506,152 507,166 513,173 492,187 496,201 493,225 499,229 507,230 509,234 506,238 506,244 509,246 509,250 509,246 521,248 523,251 528,267 541,272 547,268"/>
                        <polygon className="water" points="521,248 549,233 575,248 572,249 549,236 523,251"/>
                    </g>
                    <polygon className={classes['_wal']} id="_wal" points="109,204 129,195 137,197 142,194 136,194 129,188 123,187 122,181 132,180 135,174 131,173 140,167 146,168 146,176 155,182 157,187 150,194 152,207 141,207 131,204 127,208 120,204 111,206"/>
                    <polygon className={classes['_war']} id="_war" points="304,209 306,203 322,199 322,192 322,199 331,200 342,199 349,193 351,186 358,192 362,201 362,207 357,210 357,214 337,223 320,234 319,230"/>
                    <polygon className={classes['_wbs']} id="_wbs" points="475,332 471,335 456,337 440,355 420,357 418,356 409,352 407,348 402,340 404,328 410,324 411,311 417,307 417,302 424,283 435,280 438,282 436,284 440,287 450,284 452,288 447,290 444,296 453,298 453,305 457,306 462,305"/>
                    <polygon className={classes['_wme']} id="_wme" points="216,410 210,411 206,415 201,415 191,411,183,411,180,410,169,412,153,406,122,404,106,410 96,408 96,387 95,384 100,378 107,379 107,377 115,370 147,370 150,371 156,370 210,370 208,380 211,384 216,383"/>
                    <polygon className={classes['_wsa']} id="_wsa" points="0,458 19,459 19,450 31,449 173,533 176,531 219,514 237,526 253,528 271,539 294,530 350,559 0,559"/>
                    <polygon className={classes['_whi']} id="_whi" points="440,7 445,9 448,20 455,24 453,34 445,33 434,51 446,59 438,65 425,60 421,60 420,66 431,75 430,78 412,74 406,61 407,55 397,50 394,44 422,47 432,39 433,32 426,27 409,21"/>
                    <polygon className={classes['_yor']} id="_yor" points="169,184 172,181 172,164 166,157 166,145 160,148 160,158 155,168 155,182 157,187"/>
                    <text className="labeltext" x="635" y="362">nc</text>
                    <text className="labeltext" x="653" y="452">sc</text>
                </g>
                <g id="SupplyCenterLayer">
                    <use height="7" href="#SupplyCenter" id="sc_LON" transform="translate(-6,-4)" width="7" x="162.8" y="204.6"/>
                    <use height="7" href="#SupplyCenter" id="sc_LIV" transform="translate(-5.4,-6.0)" width="7" x="150.7" y="170.7"/>
                    <use height="7" href="#SupplyCenter" id="sc_EDI" transform="translate(-6.7,-6.7)" width="7" x="159.9" y="141.7"/>
                    <use height="7" href="#SupplyCenter" id="sc_GIB" width="7" x="56.7" y="378.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_CAI" transform="translate(-6,-4)" width="7" x="471.1" y="469.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_ALE" width="7" x="441.4" y="472.7"/>
                    <use height="7" href="#SupplyCenter" id="sc_ASW" width="7" x="482.5" y="542.7"/>
                    <use height="7" href="#SupplyCenter" id="sc_PAR" width="7" x="169.1" y="243.5"/>
                    <use height="7" href="#SupplyCenter" id="sc_BOR" width="7" x="136.6" y="279.6"/>
                    <use height="7" href="#SupplyCenter" id="sc_MAR" width="7" x="193.0" y="287.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_LYO" width="7" x="188.2" y="273.2"/>
                    <use height="7" href="#SupplyCenter" id="sc_HAM" width="7" x="243.4" y="192.7"/>
                    <use height="7" href="#SupplyCenter" id="sc_BER" transform="translate(-3.3,-6.0)" width="7" x="277.6" y="208"/>
                    <use height="7" href="#SupplyCenter" id="sc_FRA" transform="translate(-2.7,-4.7)" width="7" x="232.2" y="242.2"/>
                    <use height="7" href="#SupplyCenter" id="sc_MUN" transform="translate(-4.7,-4.0)" width="7" x="255.2" y="267.6"/>
                    <use height="7" href="#SupplyCenter" id="sc_MIL" transform="translate(-4.7,-6.0)" width="7" x="238.1" y="308.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_VEN" transform="translate(-8.7,-5.4)" width="7" x="261.7" y="295.3"/>
                    <use height="7" href="#SupplyCenter" id="sc_ROM" width="7" x="251.1" y="344.2"/>
                    <use height="7" href="#SupplyCenter" id="sc_NAP" width="7" x="273.5" y="364.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_WAR" transform="translate(2.0,-10.0)" width="7" x="335.3" y="214.5"/>
                    <use height="7" href="#SupplyCenter" id="sc_GDA" width="7" x="324.7" y="188.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_KRA" transform="translate(-1.3,-6.7)" width="7" x="324.1" y="245.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_MOS" width="7" x="475.0" y="160.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_GOR" width="7" x="491.7" y="103.5"/>
                    <use height="7" href="#SupplyCenter" id="sc_STP" width="7" x="397.6" y="107.7"/>
                    <use height="7" href="#SupplyCenter" id="sc_MUR" width="7" x="393.3" y="24.2"/>
                    <use height="7" href="#SupplyCenter" id="sc_ROS" width="7" x="522.0" y="273.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_BAR" transform="translate(0,-4)" width="7" x="139.4" y="331.9"/>
                    <use height="7" href="#SupplyCenter" id="sc_MAD" width="7" x="87.1" y="327.7"/>
                    <use height="7" href="#SupplyCenter" id="sc_SVE" transform="translate(-4.7,-4.7)" width="7" x="49.6" y="363.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_ADA" transform="translate(-4.0,-5.4)" width="7" x="488.8" y="400.5"/>
                    <use height="7" href="#SupplyCenter" id="sc_IZM" width="7" x="410.3" y="406.9"/>
                    <use height="7" href="#SupplyCenter" id="sc_IST" width="7" x="405.4" y="356.7"/>
                    <use height="7" href="#SupplyCenter" id="sc_ANK" transform="translate(-2.0,-4.0)" width="7" x="461.2" y="365.9"/>
                    <use height="7" href="#SupplyCenter" id="sc_SEV" transform="translate(-4,-4)" width="7" x="458.4" y="300.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_KHA" width="7" x="472.6" y="230.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_KIE" width="7" x="417.4" y="227.2"/>
                    <use height="7" href="#SupplyCenter" id="sc_ODE" transform="translate(-4.0,-7.4)" width="7" x="430.1" y="276"/>
                    <use height="7" href="#SupplyCenter" id="sc_IRE" width="7" x="111.1" y="161.5"/>
                    <use height="7" href="#SupplyCenter" id="sc_MOR" width="7" x="34.0" y="416.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_NWY" width="7" x="262.3" y="109.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_ISR" transform="translate(-4.0,-6.7)" width="7" x="506.5" y="454.3"/>
                    <use height="7" href="#SupplyCenter" id="sc_LIB" width="7" x="238.4" y="465.6"/>
                    <use height="7" href="#SupplyCenter" id="sc_BEL" transform="translate(-17.4,0.7)" width="7" x="204" y="215"/>
                    <use height="7" href="#SupplyCenter" id="sc_MON" transform="translate(-10, 6)" width="7" x="205" y="298"/>
                    <use height="7" href="#SupplyCenter" id="sc_SWI" transform="translate(-4)" width="7" x="225" y="271"/>
                    <use height="7" href="#SupplyCenter" id="sc_AUS" width="7" x="287.0" y="266.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_DEN" transform="translate(-6.7,-6.7)" width="7" x="265.8" y="168.5"/>
                    <use height="7" href="#SupplyCenter" id="sc_HOL" width="7" x="212.0" y="193.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_CRO" width="7" x="279.4" y="298.2"/>
                    <use height="7" href="#SupplyCenter" id="sc_SER" width="7" x="331.1" y="309.3"/>
                    <use height="7" href="#SupplyCenter" id="sc_TUN" width="7" x="215.8" y="429.5"/>
                    <use height="7" href="#SupplyCenter" id="sc_BIE" width="7" x="405.0" y="189.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_CZE" transform="translate(-11.4,-2.7)" width="7" x="293" y="238"/>
                    <use height="7" href="#SupplyCenter" id="sc_LIT" transform="translate(-8.0,-4.7)" width="7" x="375.9" y="172.2"/>
                    <use height="7" href="#SupplyCenter" id="sc_SWE" transform="translate(-2,-4)" width="7" x="309.4" y="124.3"/>
                    <use height="7" href="#SupplyCenter" id="sc_POR" width="7" x="34.7" y="332.6"/>
                    <use height="7" href="#SupplyCenter" id="sc_BUL" width="7" x="360.8" y="343.2"/>
                    <use height="7" href="#SupplyCenter" id="sc_GEO" transform="translate(-4.0,-4.7)" width="7" x="567" y="310.8"/>
                    <use height="7" href="#SupplyCenter" id="sc_GRE" width="7" x="360.8" y="403.4"/>
                    <use height="7" href="#SupplyCenter" id="sc_IRN" width="7" x="663.5" y="370.1"/>
                    <use height="7" href="#SupplyCenter" id="sc_RUM" transform="translate(1.3,-6.0)" width="7" x="391.2" y="311.4"/>
                    <use height="7" href="#SupplyCenter" id="sc_HUN" width="7" x="332.0" y="273.0"/>
                    <use height="7" href="#SupplyCenter" id="sc_SAU" width="7" x="607.7" y="492.5"/>
                </g>
                <g id="OrderLayer">
                    <g id="Layer2">{renderedOrders2}</g>
                    <g id="Layer1">{renderedOrders}</g>
                </g>
                <g id="UnitLayer">{renderedUnits}</g>
                <g id="DislodgedUnitLayer">{renderedDislodgedUnits}</g>
                <g id="HighestOrderLayer">{renderedHighestOrders}</g>
                <g className={classes['BriefLabelLayer']} id="BriefLabelLayer" transform="translate(-7,10)">
                    <text x="515" y="376">ada</text>
                    <text x="299" y="348">adr</text>
                    <text x="384" y="408">aeg</text>
                    <text x="328" y="365">alb</text>
                    <text x="429" y="478">ale</text>
                    <text x="139" y="475">alg</text>
                    <text x="205" y="256">als</text>
                    <text x="463" y="399">ana</text>
                    <text x="90" y="369">adl</text>
                    <text x="481" y="354">ank</text>
                    <text x="299" y="361">apu</text>
                    <text x="625" y="541">ara</text>
                    <text x="50" y="17">arc</text>
                    <text x="578" y="332">arm</text>
                    <text x="428" y="542">asw</text>
                    <text x="272" y="277">aus</text>
                    <text x="156" y="308">auv</text>
                    <text x="595" y="321">aze</text>
                    <text x="317" y="153">bal</text>
                    <text x="119" y="340">bar</text>
                    <text x="199" y="220">bel</text>
                    <text x="267" y="201">ber</text>
                    <text x="288" y="174">bhm</text>
                    <text x="398" y="196">bie</text>
                    <text x="97" y="261">bis</text>
                    <text x="137" y="291">bor</text>
                    <text x="310" y="323">bos</text>
                    <text x="140" y="250">bri</text>
                    <text x="310" y="8">brn</text>
                    <text x="380" y="338">bul</text>
                    <text x="475" y="493">cai</text>
                    <text x="620" y="290">cas</text>
                    <text x="561" y="286">cau</text>
                    <text x="463" y="203">crp</text>
                    <text x="149" y="106">cly</text>
                    <text x="292" y="296">cro</text>
                    <text x="300" y="247">cze</text>
                    <text x="250" y="156">den</text>
                    <text x="472" y="255">don</text>
                    <text x="493" y="316">ebs</text>
                    <text x="161" y="120">edi</text>
                    <text x="444" y="439">eme</text>
                    <text x="108" y="215">eng</text>
                    <text x="371" y="505">esa</text>
                    <text x="367" y="124">est</text>
                    <text x="365" y="80">fin</text>
                    <text x="238" y="226">fra</text>
                    <text x="336" y="186">gda</text>
                    <text x="548" y="311">geo</text>
                    <text x="66" y="374">gib</text>
                    <text x="330" y="117">gob</text>
                    <text x="167" y="351">gol</text>
                    <text x="510" y="110">gor</text>
                    <text x="343" y="385">gre</text>
                    <text x="235" y="199">ham</text>
                    <text x="224" y="173">hel</text>
                    <text x="205" y="200">hol</text>
                    <text x="325" y="280">hun</text>
                    <text x="122" y="38">ice</text>
                    <text x="319" y="416">ion</text>
                    <text x="103" y="150">ire</text>
                    <text x="96" y="187">iri</text>
                    <text x="581" y="416">irk</text>
                    <text x="668" y="402">irn</text>
                    <text x="510" y="434">isr</text>
                    <text x="426" y="367">ist</text>
                    <text x="423" y="397">izm</text>
                    <text x="520" y="463">jor</text>
                    <text x="675" y="220">kaz</text>
                    <text x="471" y="235">kha</text>
                    <text x="439" y="228">kie</text>
                    <text x="343" y="239">kra</text>
                    <text x="344" y="16">lap</text>
                    <text x="371" y="147">lat</text>
                    <text x="317" y="463">lbn</text>
                    <text x="276" y="500">lib</text>
                    <text x="206" y="333">lig</text>
                    <text x="360" y="173">lit</text>
                    <text x="153" y="148">lpl</text>
                    <text x="166" y="190">lon</text>
                    <text x="176" y="274">lyo</text>
                    <text x="346" y="351">mac</text>
                    <text x="90" y="335">mad</text>
                    <text x="248" y="425">mal</text>
                    <text x="180" y="302">mar</text>
                    <text x="20" y="244">mat</text>
                    <text x="238" y="293">mil</text>
                    <text x="407" y="272">mol</text>
                    <text x="198" y="309">mon</text>
                    <text x="30" y="429">mor</text>
                    <text x="468" y="167">mos</text>
                    <text x="236" y="258">mun</text>
                    <text x="460" y="70">mur</text>
                    <text x="290" y="384">nap</text>
                    <text x="60" y="90">nat</text>
                    <text x="81" y="296">nav</text>
                    <text x="260" y="81">nwy</text>
                    <text x="196" y="150">nth</text>
                    <text x="205" y="58">nwg</text>
                    <text x="425" y="256">ode</text>
                    <text x="161" y="254">par</text>
                    <text x="645" y="463">per</text>
                    <text x="183" y="226">pic</text>
                    <text x="219" y="300">pie</text>
                    <text x="380" y="242">pod</text>
                    <text x="38" y="338">por</text>
                    <text x="297" y="192">pru</text>
                    <text x="518" y="509">red</text>
                    <text x="258" y="345">rom</text>
                    <text x="515" y="280">ros</text>
                    <text x="217" y="227">ruh</text>
                    <text x="371" y="295">rum</text>
                    <text x="15" y="371">sat</text>
                    <text x="575" y="486">sau</text>
                    <text x="270" y="219">sax</text>
                    <text x="335" y="328">ser</text>
                    <text x="457" y="287">sev</text>
                    <text x="650" y="65">sib</text>
                    <text x="305" y="224">sil</text>
                    <text x="500" y="477">sin</text>
                    <text x="248" y="131">ska</text>
                    <text x="322" y="260">slk</text>
                    <text x="419" y="110">stp</text>
                    <text x="76" y="395">sog</text>
                    <text x="62" y="349">svl</text>
                    <text x="295" y="105">swe</text>
                    <text x="218" y="278">swi</text>
                    <text x="530" y="406">syr</text>
                    <text x="208" y="429">tun</text>
                    <text x="243" y="325">tus</text>
                    <text x="242" y="387">tyr</text>
                    <text x="535" y="40">ura</text>
                    <text x="255" y="293">ven</text>
                    <text x="542" y="178">vol</text>
                    <text x="140" y="174">wal</text>
                    <text x="324" y="213">war</text>
                    <text x="435" y="320">wbs</text>
                    <text x="170" y="389">wme</text>
                    <text x="90" y="515">wsa</text>
                    <text x="438" y="19">whi</text>
                    <text x="164" y="171">yor</text>
                </g>
                <g id="FullLabelLayer" visibility="hidden"/>
                <rect className="currentnoterect" height="40" width="716" x="0" y="560"/>
                <text className={classes['CurrentNote']} id="CurrentNote" x="10" y="576">{nb_centers_per_power ? nb_centers_per_power : ''}</text>
                <text className={classes['CurrentNote2']} id="CurrentNote2" x="10" y="592">{note ? note : ''}</text>
                <text className={classes['CurrentPhase']} id="CurrentPhase" x="645" y="578">{current_phase}</text>
                <g className={classes['MouseLayer']} id="MouseLayer">
                    <polygon id="ada" onClick={this.onClick} onMouseOver={this.onHover} points="483,407 491,409 499,400 502,403 506,396,516,393,520,389,530,390,546,378,552,380,558,373 563,374 568,369 585,369 581,362 575,360 571,343 569,340 563,339 560,337 555,341,543,345,539,352,515,359,502,357 480,376 482,383 478,393"/>
                    <polygon id="adr" onClick={this.onClick} onMouseOver={this.onHover} points="309,374 308,372 288,354 291,350 281,351 275,348 271,342 266,325 258,319 258,305 266,300 269,302 268,305 271,311 274,305 279,306 281,319 298,337 310,346 319,352 321,354 319,371 321,374"/>
                    <polygon id="aeg" onClick={this.onClick} onMouseOver={this.onHover} points="361,423 357,412 362,413 361,406 369,408 366,399 355,392 362,388 353,378 356,372 363,379 368,373 365,368 389,366 395,369 391,374 393,375 390,382 398,381 400,397 397,400 402,402 404,410 408,412 404,417 413,415 413,421 402,432 390,429 376,430 371,428 368,430"/>
                    <polygon id="alb" onClick={this.onClick} onMouseOver={this.onHover} points="319,352 321,354 319,371 321,374 327,382 337,372 337,368 333,364 332,351 327,344 320,345"/>
                    <polygon id="ale" onClick={this.onClick} onMouseOver={this.onHover} points="459,462 447,462,441,467,432,471 426,470 424,474,417,476,399,469 394,469 388,476,389,482,385,487,393,494 393,526 412,530,424,529,440,521,456,525,465,534 474,532 471,526,475,522,470,514,465,514,455,495,463,480,459,473"/>
                    <polygon id="alg" onClick={this.onClick} onMouseOver={this.onHover} points="201,415 191,411,183,411,180,410,169,412,153,406,122,404,106,410 96,408 91,413,81,411,78,406 74,408 75,417,70,422,77,428,76,434 31,449 173,533 176,531 219,514 213,507 214,475 205,461 201,460 195,447 196,421"/>
                    <polygon id="als" onClick={this.onClick} onMouseOver={this.onHover} points="193,233 204,240 211,247 219,250 212,270 210,270 205,275 196,274 193,268 195,266 195,257 185,252 190,240"/>
                    <polygon id="ana" onClick={this.onClick} onMouseOver={this.onHover} points="480,376 472,378,464,376,452,379 447,386 449,393,435,401,433,407,439,407 442,413 448,412,456,414,465,420,480,415 483,407 478,393 482,383"/>
                    <polygon id="adl" onClick={this.onClick} onMouseOver={this.onHover} points="74,382 96,387 95,384 100,378 107,379 107,377 102,367 104,359 101,356 97,355 88,361 85,361 81,368 74,367 71,370"/>
                    <polygon id="ank" onClick={this.onClick} onMouseOver={this.onHover} points="440,355 456,337,471,335 475,332 482,338,485,338,491,340,504,340,522,337 536,328 547,324 554,324 558,327 560,337 555,341,543,345,539,352,515,359,502,357 480,376 472,378,464,376,452,379 447,386 442,385 444,371"/>
                    <polygon id="apu" onClick={this.onClick} onMouseOver={this.onHover} points="309,374 308,372 288,354 291,350 281,351 275,348 271,342 267,346 272,356 276,358 280,362 284,367 287,376 293,378 297,372 307,380 311,377"/>
                    <polygon id="ara" onClick={this.onClick} onMouseOver={this.onHover} points="559,554 569,554,584,548,588,551,595,545,598,545,645,531,658,532,678,515 690,502 704,474 715,477 715,559 559,559"/>
                    <polygon id="arc" onClick={this.onClick} onMouseOver={this.onHover} points="0,37 91,37 95,34 99,36 102,29 96,25 98,24 107,28 105,23 111,24 100,18 99,13 109,9 110,17 113,8 117,9 118,20 113,28 120,27 123,21 131,24 287,24 287,0 0,0"/>
                    <polygon id="arm" onClick={this.onClick} onMouseOver={this.onHover} points="571,343 569,340 563,339 560,337 558,327 561,321 574,317 580,324 580,329 588,334 595,348"/>
                    <polygon id="asw" onClick={this.onClick} onMouseOver={this.onHover} points="393,559 393,526 412,530,424,529,440,521,456,525,465,534 474,532 485,525,498,525 507,519 516,525,525,540,523,545,527,548 530,559"/>
                    <polygon id="aus" onClick={this.onClick} onMouseOver={this.onHover} points="233,272 239,276 260,274 265,278 267,276 264,268 268,268 272,264 275,262 284,264 288,258 302,265 302,274 298,284 295,285 287,284 279,290 271,290 259,288 254,285 247,289 242,288 238,281 233,279"/>
                    <polygon id="auv" onClick={this.onClick} onMouseOver={this.onHover} points="162,327 162,320 172,315 171,304 175,299 166,290 167,285 160,279 154,277 155,294 141,307 140,316 147,318 157,327"/>
                    <polygon id="aze" onClick={this.onClick} onMouseOver={this.onHover} points="574,317 580,324 580,329 588,334 595,348 607,333 612,341 623,340 619,328 619,314 625,310 621,308 617,309 609,301 604,312 576,302 573,305 579,309 582,313"/>
                    <polygon id="bal" onClick={this.onClick} onMouseOver={this.onHover} points="294,162 302,148 303,136 314,131 318,128 336,146 334,160 335,170 330,177 325,179 320,188 316,182 312,180"/>
                    <polygon id="bar" onClick={this.onClick} onMouseOver={this.onHover} points="107,377 115,370 120,370 122,368 119,358 135,339 151,337 160,332 162,327 157,327 147,318 145,324 124,326 113,321 107,327 108,337 101,356 104,359 102,367"/>
                    <polygon id="bel" onClick={this.onClick} onMouseOver={this.onHover} points="191,211 176,214 172,222 185,224 193,233 204,240 209,236 206,226 205,216 193,213"/>
                    <polygon id="ber" onClick={this.onClick} onMouseOver={this.onHover} points="286,189 278,187 279,182 273,181 260,189 258,204 256,207 257,221 288,213 288,206 285,203 285,194"/>
                    <polygon id="bhm" onClick={this.onClick} onMouseOver={this.onHover} points="273,163 276,170 281,170 285,162 294,162 312,180 305,181 297,187 286,189 278,187 279,182 273,181 260,189 255,183 251,182 251,180 249,173 261,173 266,176 271,171 270,167"/>
                    <polygon id="bie" onClick={this.onClick} onMouseOver={this.onHover} points="358,192 374,181 382,179 387,168 387,159 410,161 410,172 419,180 422,185 428,185 428,190 421,194 425,206 417,213 415,220 403,220 398,218 393,220 382,216 368,216 360,223 360,216 357,214 357,210 362,207 362,201"/>
                    <polygon id="bis" onClick={this.onClick} onMouseOver={this.onHover} points="109,232 112,237 117,238 130,252 130,264 135,269 128,286 129,287 120,302 110,299 106,300 82,288 72,285 67,280 63,279 63,232"/>
                    <polygon id="bor" onClick={this.onClick} onMouseOver={this.onHover} points="135,269 128,286 129,287 120,302 122,309 140,316 141,307 155,294 154,277 151,271"/>
                    <polygon id="bos" onClick={this.onClick} onMouseOver={this.onHover} points="313,342 298,328 290,315 290,310 295,308 315,310 321,312 321,323 325,325 323,331"/>
                    <polygon id="bri" onClick={this.onClick} onMouseOver={this.onHover} points="155,229 149,228 142,221 142,235 131,233 129,228 112,227 109,232 112,237 117,238 130,252 130,264 135,269 151,271 151,245 153,236"/>
                    <polygon id="brn" onClick={this.onClick} onMouseOver={this.onHover} points="472,0 466,9 470,17 463,20 452,16 456,11 450,6 440,7 409,21 395,17 383,15 379,17 373,15 378,10 367,5 360,6 359,10 355,6 352,11 349,5 342,10 322,18 311,24 287,24 287,0"/>
                    <polygon id="bul" onClick={this.onClick} onMouseOver={this.onHover} points="407,348 402,340 404,328 410,324 403,320 391,320 380,327 365,326 356,325 352,322 349,325 353,333 356,336 350,339 351,343 355,350 362,359 372,357 378,360 391,356 392,351 400,348"/>
                    <g id="cai" onClick={this.onClick} onMouseOver={this.onHover}>
                        <polygon points="498,458 493,460 482,462 479,462 474,464 464,461 459,462 459,473 463,480 455,495 465,514 470,514 475,522 471,526 474,532 485,525,498,525 507,519 493,491 480,475 485,475 493,466 501,463"/>
                        <polygon points="482,462 479,462 480,475 483,475"/>
                    </g>
                    <polygon id="cas" onClick={this.onClick} onMouseOver={this.onHover} points="623,340 619,328 619,314 625,310 621,308 617,309 609,301 590,290 585,281 574,278 572,271 571,252 572,249 575,248 578,252 581,248 582,238 589,234 598,222 613,216 620,220 623,239 613,241 611,247 615,254 605,259 606,263 611,262 621,275 636,274 635,284 643,291 640,284 647,279 654,284 662,287 660,295 651,297 646,294 651,306 655,302 669,311 673,334 672,340 656,350 643,351 638,346 627,349"/>
                    <polygon id="cau" onClick={this.onClick} onMouseOver={this.onHover} points="609,301 590,290 585,281 574,278 572,271 547,268 541,272 544,297 541,303 557,304 561,306 565,303 573,305 576,302 604,312"/>
                    <polygon id="crp" onClick={this.onClick} onMouseOver={this.onHover} points="419,180 422,185 428,185 428,190 421,194 425,206 432,208 439,204 450,207 452,215 459,215 465,224 466,227 483,223 488,227 493,225 496,201 492,187 476,192 451,180 424,175"/>
                    <polygon id="cly" onClick={this.onClick} onMouseOver={this.onHover} points="144,132 139,128 140,123 139,118 143,115 142,107 150,102 158,101 167,104 161,111 156,115 149,125 149,132"/>
                    <polygon id="cro" onClick={this.onClick} onMouseOver={this.onHover} points="269,302 268,305 271,311 274,305 279,306 281,319 298,337 310,346 313,342 298,328 290,315 290,310 295,308 315,310 321,312 322,307 319,302 311,301 295,285 287,284 279,290 271,290"/>
                    <polygon id="cze" onClick={this.onClick} onMouseOver={this.onHover} points="290,230 281,230 273,236 261,237 259,240 275,262 284,264 288,258 302,265 317,251 316,244 312,242 301,243 297,235"/>
                    <g id="den" onClick={this.onClick} onMouseOver={this.onHover}>
                        <polygon points="249,173 248,172 240,171 239,162 243,147 246,143 254,142 260,139 261,145 258,152 261,159 254,161 249,166"/>
                        <polygon points="261,173 266,176 271,171 270,167 273,163 272,160 268,160 264,162 258,164"/>
                        <polygon points="261,159 254,161 249,166 249,173 261,173 258,164 264,162"/>
                    </g>
                    <polygon id="don" onClick={this.onClick} onMouseOver={this.onHover} points="473,273 495,260 498,259 502,253 509,250 509,246 506,244 506,238 490,241 477,250 462,249 459,266 461,272"/>
                    <polygon id="ebs" onClick={this.onClick} onMouseOver={this.onHover} points="462,305 470,296 480,294 477,288 468,292 459,284 473,273 495,260 498,259 499,261 486,270 491,276 487,288 482,289 489,296 501,297 522,308 533,311 539,318 536,328 522,337 504,340 491,340 485,338 482,338 475,332"/>
                    <polygon id="edi" onClick={this.onClick} onMouseOver={this.onHover} points="161,111 168,111 173,113 174,116 173,122 162,134 155,134 161,136 164,138 166,145 160,148 151,139 149,132 149,125 156,115"/>
                    <polygon id="eme" onClick={this.onClick} onMouseOver={this.onHover} points="413,421 419,417 424,418 431,425 440,422 442,413 448,412,456,414,465,420,480,415 483,407 491,409 499,400 502,403 496,410 498,414 497,420 503,449 498,458 493,460 482,462 479,462 474,464 464,461 459,462 447,462,441,467,432,471 426,470 402,446 402,432"/>
                    <polygon id="eng" onClick={this.onClick} onMouseOver={this.onHover} points="176,214 172,222 159,224 157,226 160,230 155,229 149,228 142,221 142,235 131,233 129,228 112,227 109,232 63,232 63,204 109,204 111,206 120,204 127,208 131,204 141,207 152,207 161,211 172,210"/>
                    <polygon id="esa" onClick={this.onClick} onMouseOver={this.onHover} points="394,469 369,461 356,459 349,459 342,461 348,474 353,520 358,539 365,553 371,559 393,559 393,494 385,487 389,482 388,476"/>
                    <polygon id="est" onClick={this.onClick} onMouseOver={this.onHover} points="382,118 369,117 359,118 351,123 352,131 358,133 358,140 368,137 379,139 385,133"/>
                    <polygon id="fin" onClick={this.onClick} onMouseOver={this.onHover} points="384,101 352,113 348,113 336,106 333,89 345,76 351,64 357,62 354,55 348,52 347,45 343,38 330,29 333,24 341,30 354,29 355,18 362,17 369,23 371,28 376,37 375,52 394,83 394,88"/>
                    <polygon id="fra" onClick={this.onClick} onMouseOver={this.onHover} points="256,207 242,213 233,214 228,219 228,226 223,237 223,242 227,248 238,251 242,249 242,242 257,221"/>
                    <polygon id="gda" onClick={this.onClick} onMouseOver={this.onHover} points="330,177 325,179 320,188 322,192 322,199 331,200 342,199 349,193 351,186 349,179 342,175 338,175 334,178"/>
                    <polygon id="geo" onClick={this.onClick} onMouseOver={this.onHover} points="522,308 533,311 539,318 536,328 547,324 554,324 558,327 561,321 574,317 582,313 579,309 573,305 565,303 561,306 557,304 541,303 526,303"/>
                    <polygon id="gib" onClick={this.onClick} onMouseOver={this.onHover} points="71,370 68,366 58,366 52,372 48,373 49,379 52,385 64,384 74,382"/>
                    <polygon id="gob" onClick={this.onClick} onMouseOver={this.onHover} points="336,146 344,140 347,141 352,147 356,148 359,145 358,140 358,133 352,131 351,123 359,118 369,117 382,118 384,112 393,112 385,106 384,101 352,113 348,113 336,106 333,89 345,76 351,64 357,62 354,55 348,52 341,50 334,65 336,72 312,95 309,109 316,113 319,121 318,128"/>
                    <polygon id="gol" onClick={this.onClick} onMouseOver={this.onHover} points="120,370 122,368 119,358 135,339 151,337 160,332 162,327 162,320 172,315 179,319 179,337 192,350 217,350 217,354 212,358 210,357 208,360 210,370 156,370 154,366 147,370"/>
                    <polygon id="gor" onClick={this.onClick} onMouseOver={this.onHover} points="459,139 456,131 456,122 467,105 485,92 513,87 536,83 555,89 559,101 555,125 535,125 531,132 509,143 506,152 482,138"/>
                    <polygon id="gre" onClick={this.onClick} onMouseOver={this.onHover} points="361,423 357,412 362,413 361,406 369,408 366,399 355,392 362,388 353,378 356,372 363,379 368,373 365,368 389,366 392,360 391,356 378,360 372,357 362,359 354,360 344,367 337,368 337,372 327,382 328,387 338,401 353,401 356,403 341,403 337,407 345,420 346,415 352,422 353,418"/>
                    <g id="ham" onClick={this.onClick} onMouseOver={this.onHover}>
                        <polygon points="260,189 255,183 251,182 251,180 249,173 248,172 240,171 239,173 241,179 240,184 240,187 232,191 231,188 226,187 224,189 225,195 223,204 218,210 213,210 212,214 218,214 228,219 233,214 242,213 256,207 258,204"/>
                        <polygon points="251,182 251,180 240,184 240,186"/>
                    </g>
                    <polygon id="hel" onClick={this.onClick} onMouseOver={this.onHover} points="239,162 240,171 239,173 241,179 240,184 240,187 232,191 231,188 226,187 224,189 212,188 209,190 209,172 219,162"/>
                    <polygon id="hol" onClick={this.onClick} onMouseOver={this.onHover} points="224,189 212,188 209,190 203,195 191,211 193,213 205,216 206,226 212,214 213,210 218,210 223,204 225,195"/>
                    <polygon id="hun" onClick={this.onClick} onMouseOver={this.onHover} points="319,302 311,301 295,285 298,284 302,274 315,274 328,270 337,264 349,265 354,270 344,280 340,294 334,296 325,294"/>
                    <polygon id="ice" onClick={this.onClick} onMouseOver={this.onHover} points="91,37 95,34 99,36 102,29 96,25 98,24 107,28 105,23 111,24 100,18 99,13 109,9 110,17 113,8 117,9 118,20 113,28 120,27 123,21 131,24 136,30 145,29 151,35 152,44 150,49 136,54 120,51 110,53 103,46 102,41"/>
                    <polygon id="ion" onClick={this.onClick} onMouseOver={this.onHover} points="321,374 327,382 328,387 338,401 353,401 356,403 341,403 337,407 345,420 346,415 352,422 353,418 361,423 368,430 376,434 394,434 402,432 402,446 290,446 290,404 298,392 298,389 297,385 293,378 297,372 307,380 311,377 309,374"/>
                    <polygon id="ire" onClick={this.onClick} onMouseOver={this.onHover} points="78,166 80,161 85,161 94,152 87,145 93,143 91,138 94,135 101,139 106,138 112,131 119,131 128,137 129,146 126,149 120,150 119,162 110,174 100,172 84,176"/>
                    <polygon id="iri" onClick={this.onClick} onMouseOver={this.onHover} points="129,146 126,149 120,150 119,162 110,174 100,172 84,176 78,166 63,166 63,204 109,204 129,195 137,197 142,194 136,194 129,188 123,187 122,181 132,180 135,174 131,173 140,167 146,168 149,159 146,148 137,146"/>
                    <polygon id="irk" onClick={this.onClick} onMouseOver={this.onHover} points="619,462 610,464 605,458 584,453 583,447 549,439 544,433 542,426 564,404 563,393 558,384 563,374 568,369 585,369 596,375 608,407 609,430 605,434 608,438 607,445 615,453"/>
                    <polygon id="irn-nc" onClick={this.onClick} onMouseOver={this.onHover} points="715,331 673,334 672,340 656,350 643,351 638,346 627,349 623,340 612,341 607,333 595,348 571,343 575,360 581,362 585,369 596,375 608,407 715,400"/>
                    <polygon id="irn-sc" onClick={this.onClick} onMouseOver={this.onHover} points="608,407 609,430 615,438 632,439 648,450 654,459 666,455 673,456 696,475 704,474 715,477 715,400"/>
                    <polygon id="isr" onClick={this.onClick} onMouseOver={this.onHover} points="497,420 503,449 498,458 501,463 504,467 513,456 516,441 515,428 505,419"/>
                    <g id="ist" onClick={this.onClick} onMouseOver={this.onHover}>
                        <polygon points="389,366 395,369 391,374 393,375 390,382 398,381 409,385 429,386 433,383 442,385 444,371 440,355 420,357 418,356 409,352 407,348 400,348 392,351 391,356 392,360"/>
                        <polygon points="393,375 400,371 406,371 426,361 418,360 421,357 418,356 414,360 400,365"/>
                    </g>
                    <polygon id="izm" onClick={this.onClick} onMouseOver={this.onHover} points="398,381 400,397 397,400 402,402 404,410 408,412 404,417 413,415 413,421 419,417 424,418 431,425 440,422 442,413 439,407 433,407 435,401 449,393 447,386 442,385 433,383 429,386 409,385"/>
                    <polygon id="jor" onClick={this.onClick} onMouseOver={this.onHover} points="504,467 508,473 511,482 519,481 528,471 528,465 539,460 531,451 539,449 540,443 549,439 544,433 542,426 530,438 516,441 513,456"/>
                    <polygon id="kaz" onClick={this.onClick} onMouseOver={this.onHover} points="715,101 689,106 671,117 659,140 669,147 676,147 676,152 649,159 627,173 594,168 591,173 584,172 571,190 574,196 570,201 559,195 557,208 562,225 573,227 589,234 598,222 613,216 620,220 623,239 613,241 611,247 615,254 605,259 606,263 611,262 621,275 636,274 635,284 643,291 640,284 647,279 654,284 662,287 660,295 651,297 646,294 651,306 655,302 669,311 673,334 715,331"/>
                    <polygon id="kha" onClick={this.onClick} onMouseOver={this.onHover} points="506,238 490,241 477,250 462,249 459,246 459,227 465,224 466,227 483,223 488,227 493,225 499,229 507,230 509,234"/>
                    <polygon id="kie" onClick={this.onClick} onMouseOver={this.onHover} points="425,206 432,208 439,204 450,207 452,215 459,215 465,224 459,227 459,246 462,249 459,266 461,272 456,274 448,274 444,269 435,245 409,239 403,220 415,220 417,213"/>
                    <polygon id="kra" onClick={this.onClick} onMouseOver={this.onHover} points="316,244 319,240 320,234 337,223 357,214 360,216 360,223 364,229 364,236 353,245 356,255 352,258 343,253 327,254 317,251"/>
                    <polygon id="lap" onClick={this.onClick} onMouseOver={this.onHover} points="379,17 373,15 378,10 367,5 360,6 359,10 355,6 352,11 349,5 342,10 322,18 311,24 308,34 312,37 320,42 319,33 330,34 330,29 333,24 341,30 354,29 355,18 362,17 369,23 371,28"/>
                    <polygon id="lat" onClick={this.onClick} onMouseOver={this.onHover} points="334,160 336,146 344,140 347,141 352,147 356,148 359,145 358,140 358,140 368,137 379,139 385,133 388,137 391,146 387,159 387,168 373,160 355,156"/>
                    <polygon id="lbn" onClick={this.onClick} onMouseOver={this.onHover} points="426,470 424,474,417,476,399,469 394,469 369,461 356,459 349,459 342,461 336,465 332,474 319,481 296,472 284,474 275,472 272,469 272,464 290,446 402,446"/>
                    <polygon id="lib" onClick={this.onClick} onMouseOver={this.onHover} points="342,461 336,465 332,474 319,481 296,472 284,474 275,472 272,469 272,464 251,456 229,453 223,469 214,475 213,507 219,514 237,526 253,528 271,539 294,530 350,559 371,559 365,553 358,539 353,520 348,474"/>
                    <g id="lig" onClick={this.onClick} onMouseOver={this.onHover}>
                        <polygon points="179,319 183,320 190,325 193,324 210,318 218,313 224,313 230,317 236,334 242,341 249,350 192,350 179,337"/>
                        <polygon points="217,350 214,347 213,338 220,330 221,341 219,348"/>
                    </g>
                    <polygon id="lit" onClick={this.onClick} onMouseOver={this.onHover} points="330,177 335,170 334,160 355,156 373,160 387,168 382,179 374,181 358,192 351,186 349,179 342,175 338,175 334,178"/>
                    <polygon id="lpl" onClick={this.onClick} onMouseOver={this.onHover} points="146,168 149,159 146,148 137,146 137,142 143,137 144,132 149,132 151,139 160,148 160,158 155,168 155,182 146,176"/>
                    <polygon id="lon" onClick={this.onClick} onMouseOver={this.onHover} points="169,184 171,185 173,183 180,187 178,197 167,206 173,207 172,210 161,211 152,207 150,194 157,187"/>
                    <polygon id="lyo" onClick={this.onClick} onMouseOver={this.onHover} points="175,299 166,290 167,285 160,279 168,270 170,262 185,252 195,257 195,266 193,268 196,274 205,275 194,286 181,284"/>
                    <polygon id="mac" onClick={this.onClick} onMouseOver={this.onHover} points="362,359 354,360 344,367 337,368 333,364 332,351 342,344 351,343 355,350"/>
                    <polygon id="mad" onClick={this.onClick} onMouseOver={this.onHover} points="113,321 107,327 108,337 101,356 97,355 88,361 85,361 82,350 64,340 56,332 65,314 72,313 74,310 107,316"/>
                    <polygon id="mal" onClick={this.onClick} onMouseOver={this.onHover} points="272,464 251,456 229,453 229,438 222,428 231,420 231,418 243,406 270,421 272,411 276,403 282,403 282,406 286,407 290,404 290,446"/>
                    <polygon id="mar" onClick={this.onClick} onMouseOver={this.onHover} points="172,315 179,319 183,320 190,325 189,307 194,302 203,301 207,299 206,289 204,284 197,289 194,286 181,284 175,299 171,304"/>
                    <polygon id="mat" onClick={this.onClick} onMouseOver={this.onHover} points="0,166 63,166 63,279 59,282 53,280 48,286 47,299 39,315 0,315"/>
                    <polygon id="mil" onClick={this.onClick} onMouseOver={this.onHover} points="247,289 246,309 242,316 233,313 225,296 227,289 239,291 242,288"/>
                    <polygon id="mol" onClick={this.onClick} onMouseOver={this.onHover} points="405,299 402,283 397,279 389,266 394,262 403,263 409,265 414,274 419,281 414,287 410,298"/>
                    <polygon id="mon" onClick={this.onClick} onMouseOver={this.onHover} points="190,325 193,324 210,318 203,301 194,302 189,307"/>
                    <polygon id="mor" onClick={this.onClick} onMouseOver={this.onHover} points="74,408 59,404 55,399 53,390 47,391 31,412 13,414 0,422 0,458 19,459 19,450 31,449 76,434 76,426 70,422 75,417"/>
                    <polygon id="mos" onClick={this.onClick} onMouseOver={this.onHover} points="387,159 410,161 410,172 419,180 424,175 451,180 476,192 492,187 513,173 507,166 506,152 482,138 459,139 440,136 422,129 388,137 391,146"/>
                    <polygon id="mun" onClick={this.onClick} onMouseOver={this.onHover} points="233,272 239,276 260,274 265,278 267,276 264,268 253,253 242,249 238,251 227,248 219,250 212,270 220,271 221,268"/>
                    <polygon id="mur" onClick={this.onClick} onMouseOver={this.onHover} points="453,34 445,33 434,51 446,59 438,65 425,60 421,60 420,66 431,75 430,78 412,74 406,61 407,55 397,50 394,44 422,47 432,39 433,32 426,27 409,21 395,17 383,15 379,17 371,28 376,37 375,52 394,83 394,88 414,94 450,96 467,105 485,92 513,87 479,48"/>
                    <polygon id="nap" onClick={this.onClick} onMouseOver={this.onHover} points="266,361 270,370 278,377 284,381 287,391 282,403 282,406 286,407 290,404 298,392 298,389 297,385 293,378 287,376 284,367 280,362 276,358 272,356"/>
                    <polygon id="nat" onClick={this.onClick} onMouseOver={this.onHover} points="0,166 78,166 80,161 85,161 94,152 87,145 93,143 91,138 94,135 101,139 106,138 112,131 119,131 128,137 129,146 137,146 137,142 143,137 144,132 139,128 140,123 139,118 143,115 142,107 150,102 150,49 136,54 120,51 110,53 103,46 102,41 92,37 0,37"/>
                    <polygon id="nav" onClick={this.onClick} onMouseOver={this.onHover} points="120,302 110,299 106,300 82,288 72,285 67,280 63,279 59,282 53,280 48,286 47,299 56,298 56,302 69,303 74,310 107,316 113,321 124,326 145,324 147,318 140,316 122,309"/>
                    <polygon id="nwy" onClick={this.onClick} onMouseOver={this.onHover} points="308,34 292,48 271,75 252,78 233,91 229,103 232,109 227,113 229,122 239,131 260,123 264,116 267,124 272,124 279,100 283,78 303,56 312,37"/>
                    <polygon id="nth" onClick={this.onClick} onMouseOver={this.onHover} points="243,147 239,162 219,162 209,172 209,190 203,195 191,211 176,214 172,210 173,207 167,206 178,197 180,187 173,183 171,185 169,184 172,181 172,164 166,157 166,145 164,138 161,136 155,134 162,134 173,122 174,116 173,113 227,113 229,122 229,147"/>
                    <polygon id="nwg" onClick={this.onClick} onMouseOver={this.onHover} points="312,24 308,34 292,48 271,75 252,78 233,91 229,103 232,109 227,113 173,113 168,111 161,111 167,104 158,101 150,102 150,49 152,44 151,35 145,29 136,30 131,24"/>
                    <polygon id="ode" onClick={this.onClick} onMouseOver={this.onHover} points="403,263 409,265 414,274 419,281 414,287 410,298 405,299 406,303 417,302 424,283 435,280 438,282 441,276 448,274 444,269 435,245 409,239 401,248"/>
                    <polygon id="par" onClick={this.onClick} onMouseOver={this.onHover} points="151,271 151,245 153,236 190,240 185,252 170,262 168,270 160,279 154,277"/>
                    <polygon id="per" onClick={this.onClick} onMouseOver={this.onHover} points="690,502 665,486 661,473 650,484 641,484 632,476 636,468 632,463 629,464 631,468 627,471 619,462 615,453 607,445 608,438 605,434 609,430 615,438 632,439 648,450 654,459 666,455 673,456 696,475 704,474"/>
                    <polygon id="pic" onClick={this.onClick} onMouseOver={this.onHover} points="172,222 159,224 157,226 160,230 155,229 153,236 190,240 193,233 185,224"/>
                    <polygon id="pie" onClick={this.onClick} onMouseOver={this.onHover} points="210,318 218,313 224,313 230,317 233,313 225,296 218,289 213,291 206,289 207,299 203,301"/>
                    <polygon id="pod" onClick={this.onClick} onMouseOver={this.onHover} points="360,223 364,229 364,236 353,245 356,255 352,258 349,265 354,270 376,273 383,266 389,266 394,262 403,263 401,248 409,239 403,220 398,218 393,220 382,216 368,216"/>
                    <polygon id="por" onClick={this.onClick} onMouseOver={this.onHover} points="47,299 39,315 27,332 31,341 29,348 30,351 25,359 36,366 42,365 43,359 50,355 48,345 53,340 52,331 56,332 65,314 72,313 74,310 69,303 56,302 56,298 47,299"/>
                    <polygon id="pru" onClick={this.onClick} onMouseOver={this.onHover} points="320,188 316,182 312,180 305,181 297,187 286,189 285,194 285,203 288,206 304,209 306,203 322,199 322,192"/>
                    <polygon id="red" onClick={this.onClick} onMouseOver={this.onHover} points="530,559 527,548 523,545 525,540 516,525 507,519 507,519 493,491 480,475 485,475 494,487 501,491 505,490 508,473 511,482 510,487 519,488 532,504 531,507 535,512 539,513 555,546 553,552 559,554 559,559"/>
                    <polygon id="rom" onClick={this.onClick} onMouseOver={this.onHover} points="242,341 249,350 254,356 266,361 272,356 267,346 257,334"/>
                    <g id="ros" onClick={this.onClick} onMouseOver={this.onHover}>
                        <polygon points="498,259 499,261 486,270 491,276 487,288 482,289 489,296 501,297 522,308 526,303 541,303 544,297 541,272 528,267 523,251 521,248 509,246 509,250 502,253"/>
                        <polygon points="498,259 499,261 523,251 521,248"/>
                    </g>
                    <polygon id="ruh" onClick={this.onClick} onMouseOver={this.onHover} points="212,214 218,214 228,219 228,226 223,237 223,242 227,248 219,250 211,247 204,240 209,236 206,226"/>
                    <polygon id="rum" onClick={this.onClick} onMouseOver={this.onHover} points="410,324 403,320 391,320 380,327 365,326 356,325 352,322 351,316 347,316 339,307 337,299 334,296 340,294 344,280 354,270 376,273 383,266 389,266 397,279 402,283 405,299 406,303 417,302 417,307 411,311"/>
                    <polygon id="sat" onClick={this.onClick} onMouseOver={this.onHover} points="0,315 39,315 27,332 31,341 29,348 30,351 25,359 36,366 42,365 48,373 49,379 42,386 47,391 31,412 13,414 0,422"/>
                    <polygon id="sau" onClick={this.onClick} onMouseOver={this.onHover} points="511,482 510,487 519,488 532,504 531,507 535,512 539,513 555,546 553,552 559,554 569,554,584,548,588,551,595,545,598,545,645,531,658,532,678,515 690,502 665,486 661,473 650,484 641,484 632,476 636,468 632,463 629,464 631,468 627,471 619,462 610,464 605,458 584,453 583,447 549,439 540,443 539,449 531,451 539,460 528,465 528,471 519,481"/>
                    <polygon id="sax" onClick={this.onClick} onMouseOver={this.onHover} points="264,268 268,268 272,264 275,262 259,240 261,237 273,236 281,230 290,230 288,213 257,221 242,242 242,249 253,253"/>
                    <polygon id="ser" onClick={this.onClick} onMouseOver={this.onHover} points="321,312 321,323 325,325 323,331 313,342 310,346 319,352 320,345 327,344 332,351 342,344 351,343 350,339 356,336 353,333 349,325 352,322 351,316 347,316 339,307 337,299 334,296 325,294 319,302 322,307"/>
                    <polygon id="sev" onClick={this.onClick} onMouseOver={this.onHover} points="462,305 470,296 480,294 477,288 468,292 459,284 473,273 461,272 456,274 448,274 441,276 438,282 436,284 440,287 450,284 452,288 447,290 444,296 453,298 453,305 457,306"/>
                    <polygon id="sib" onClick={this.onClick} onMouseOver={this.onHover} points="715,101 689,106 671,117 659,140 669,147 676,147 676,152 649,159 627,173 594,168 596,159 589,151 595,119 593,99 605,87 611,26 616,0 715,0"/>
                    <polygon id="sil" onClick={this.onClick} onMouseOver={this.onHover} points="316,244 312,242 301,243 297,235 290,230 288,213 288,206 304,209 319,230 320,234 319,240"/>
                    <polygon id="sin" onClick={this.onClick} onMouseOver={this.onHover} points="485,475 494,487 501,491 505,490 508,473 504,467 501,463 493,466"/>
                    <polygon id="ska" onClick={this.onClick} onMouseOver={this.onHover} points="243,147 246,143 254,142 260,139 261,145 258,152 261,159 264,162 268,160 272,160 275,155 269,143 271,137 267,124 264,116 260,123 239,131 229,122 229,147"/>
                    <polygon id="slk" onClick={this.onClick} onMouseOver={this.onHover} points="352,258 343,253 327,254 317,251 302,265 302,274 315,274 328,270 337,264 349,265"/>
                    <polygon id="stp" onClick={this.onClick} onMouseOver={this.onHover} points="382,118 384,112 393,112 385,106 384,101 394,88 414,94 450,96 467,105 456,122 456,131 459,139 440,136 422,129 388,137 385,133"/>
                    <polygon id="sog" onClick={this.onClick} onMouseOver={this.onHover} points="49,379 52,385 64,384 74,382 96,387 96,408 91,413,81,411,78,406 74,408 59,404 55,399 53,390 47,391 42,386"/>
                    <polygon id="svl" onClick={this.onClick} onMouseOver={this.onHover} points="42,365 43,359 50,355 48,345 53,340 52,331 56,332 64,340 82,350 85,361 81,368 74,367 71,370 71,370 68,366 58,366 52,372 48,373"/>
                    <polygon id="swe" onClick={this.onClick} onMouseOver={this.onHover} points="348,52 341,50 334,65 336,72 312,95 309,109 316,113 319,121 318,128 314,131 303,136 302,148 294,162 285,162 281,170 276,170 273,163 272,160 275,155 269,143 271,137 267,124 272,124 279,100 283,78 303,56 312,37 320,42 319,33 330,34 330,29 343,38 347,45"/>
                    <polygon id="swi" onClick={this.onClick} onMouseOver={this.onHover} points="210,270 194,286 197,289 204,284 206,289 213,291 218,289 225,296 227,289 239,291 242,288 238,281 233,279 233,272 221,268 220,271 212,270"/>
                    <polygon id="syr" onClick={this.onClick} onMouseOver={this.onHover} points="502,403 496,410 498,414 497,420 505,419 515,428 516,441 530,438 542,426 564,404 563,393 558,384 563,374 558,373 552,380 546,378 530,390 520,389 516,393 506,396"/>
                    <polygon id="tun" onClick={this.onClick} onMouseOver={this.onHover} points="229,453 229,438 222,428 231,420 231,418 227,417 220,420 221,412 216,410 210,411 206,415 201,415 196,421 195,447 201,460 205,461 214,475 223,469"/>
                    <polygon id="tus" onClick={this.onClick} onMouseOver={this.onHover} points="230,317 236,334 242,341 257,334 255,328 242,316 233,313"/>
                    <polygon id="tyr" onClick={this.onClick} onMouseOver={this.onHover} points="249,350 254,356 266,361 270,370 278,377 284,381 287,391 282,403 276,403 264,404 251,401 247,402 231,418 227,417 220,420 221,412 216,410 216,383 220,364 217,354 217,350"/>
                    <polygon id="ura" onClick={this.onClick} onMouseOver={this.onHover} points="472,0 466,9 470,17 463,20 452,16 456,11 450,6 440,7 445,9 448,20 455,24 453,34 479,48 513,87 536,83 555,89 585,93 593,99 605,87 611,26 616,0 715,0"/>
                    <polygon id="ven" onClick={this.onClick} onMouseOver={this.onHover} points="271,342 266,325 258,319 258,305 266,300 269,302 271,290 259,288 254,285 247,289 246,309 242,316 255,328 257,334 267,346"/>
                    <g id="vol" onClick={this.onClick} onMouseOver={this.onHover}>
                        <polygon points="572,271 571,252 572,249 575,248 578,252 581,248 582,238 589,234 573,227 562,225 557,208 559,195 570,201 574,196 571,190 584,172 591,173 594,168 596,159 589,151 595,119 593,99 585,93 555,89 559,101 555,125 535,125 531,132 509,143 506,152 507,166 513,173 492,187 496,201 493,225 499,229 507,230 509,234 506,238 506,244 509,246 509,250 509,246 521,248 523,251 528,267 541,272 547,268"/>
                        <polygon points="521,248 549,233 575,248 572,249 549,236 523,251"/>
                    </g>
                    <polygon id="wal" onClick={this.onClick} onMouseOver={this.onHover} points="109,204 129,195 137,197 142,194 136,194 129,188 123,187 122,181 132,180 135,174 131,173 140,167 146,168 146,176 155,182 157,187 150,194 152,207 141,207 131,204 127,208 120,204 111,206"/>
                    <polygon id="war" onClick={this.onClick} onMouseOver={this.onHover} points="304,209 306,203 322,199 322,192 322,199 331,200 342,199 349,193 351,186 358,192 362,201 362,207 357,210 357,214 337,223 320,234 319,230"/>
                    <polygon id="wbs" onClick={this.onClick} onMouseOver={this.onHover} points="475,332 471,335 456,337 440,355 420,357 418,356 409,352 407,348 402,340 404,328 410,324 411,311 417,307 417,302 424,283 435,280 438,282 436,284 440,287 450,284 452,288 447,290 444,296 453,298 453,305 457,306 462,305"/>
                    <polygon id="wme" onClick={this.onClick} onMouseOver={this.onHover} points="216,410 210,411 206,415 201,415 191,411,183,411,180,410,169,412,153,406,122,404,106,410 96,408 96,387 95,384 100,378 107,379 107,377 115,370 147,370 150,371 156,370 210,370 208,380 211,384 216,383"/>
                    <polygon id="wsa" onClick={this.onClick} onMouseOver={this.onHover} points="0,458 19,459 19,450 31,449 173,533 176,531 219,514 237,526 253,528 271,539 294,530 350,559 0,559"/>
                    <polygon id="whi" onClick={this.onClick} onMouseOver={this.onHover} points="440,7 445,9 448,20 455,24 453,34 445,33 434,51 446,59 438,65 425,60 421,60 420,66 431,75 430,78 412,74 406,61 407,55 397,50 394,44 422,47 432,39 433,32 426,27 409,21"/>
                    <polygon id="yor" onClick={this.onClick} onMouseOver={this.onHover} points="169,184 172,181 172,164 166,157 166,145 160,148 160,158 155,168 155,182 157,187"/>
                </g>
            </svg>
        );
    }
}
SvgModern.propTypes = {
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
