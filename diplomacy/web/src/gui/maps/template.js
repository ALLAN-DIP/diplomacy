
import React from 'react';
import PropTypes from 'prop-types';
/* PythonTemplate.style_content */
/* PythonTemplate.extra_content */
import {getClickedID, parseLocation, setInfluence} from "../common/common";
import {Game} from "../../../diplomacy/engine/game";
import {MapData} from "../../utils/map_data";
import {UTILS} from "../../../diplomacy/utils/utils";
import {Diplog} from "../../../diplomacy/utils/diplog";
import {extendOrderBuilding} from "../../utils/order_building";
import {Unit} from "../common/unit";
import {Hold} from "../common/hold";
import {Move} from "../common/move";
import {SupportMove} from "../common/supportMove";
import {SupportHold} from "../common/supportHold";
import {Convoy} from "../common/convoy";
import {Build} from "../common/build";
import {Disband} from "../common/disband";

export class PythonTemplate/* classname */ extends React.Component {
    constructor(props) {
        super(props);
        this.onClick = this.onClick.bind(this);
        this.onHover = this.onHover.bind(this);
    }
    onClick(event) {
        if (this.props.orderBuilding)
            return this.handleClickedID(getClickedID(event));
    }
    onHover(event) {
        return this.handleHoverID(getClickedID(event));
    }
    handleClickedID(id) {
        const orderBuilding = this.props.orderBuilding;
        if (!orderBuilding.builder)
            return this.props.onError('No orderable locations.');
        const province = this.props.mapData.getProvince(id);
        if (!province)
            throw new Error(`Cannot find a province named ${id}`);

        const stepLength = orderBuilding.builder.steps.length;
        if (orderBuilding.path.length >= stepLength)
            throw new Error(`Order building: current steps count (${orderBuilding.path.length}) should be less than` +
                ` expected steps count (${stepLength}) (${orderBuilding.path.join(', ')}).`);

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
                    if (value.includes(possibleLocation))
                        validLocations.push(possibleLocation);
                }
            } catch (error) {
                return this.props.onError(error);
            }
        }
        if (!validLocations.length)
            return this.props.onError('Disallowed.');

        if (validLocations.length > 1 && orderBuilding.type === 'S' && orderBuilding.path.length >= 2) {
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
                    if (validLocations[i - 1].substring(0, 3).toUpperCase() !== validLocations[i].substring(0, 3).toUpperCase()) {
                        /* No same prefix with previous location. We does not have a coast. */
                        isACoast = false;
                        break;
                    }
                }
                if (location.length !== 3)
                    validLocationsNoProvinceName.push(location);
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
                return this.props.onSelectLocation(validLocations, orderBuilding.power, orderBuilding.type, orderBuilding.path);
            } else {
                Diplog.warn(`Forced to select first valid location.`);
                validLocations = [validLocations[0]];
            }
        }
        let orderBuildingType = orderBuilding.type;
        if (lengthAfterClick === stepLength && orderBuildingType === 'M') {
            const moveOrderPath = ['M'].concat(orderBuilding.path, validLocations[0]);
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
            orderBuilding.power, orderBuildingType, orderBuilding.path, validLocations[0],
            this.props.onOrderBuilding, this.props.onOrderBuilt, this.props.onError
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
                        if (pieces[1].slice(0, 3) === name.toUpperCase().slice(0, 3))
                            orders.push(order);
                    }
                }
            }
        }
        return orders;
    }
    getNeighbors(extraLocation) {
        const selectedPath = [this.props.orderBuilding.type].concat(this.props.orderBuilding.path);
        if (extraLocation)
            selectedPath.push(extraLocation);
        const possibleNeighbors = UTILS.javascript.getTreeValue(this.props.game.ordersTree, selectedPath);
        const neighbors = possibleNeighbors ? possibleNeighbors.map(neighbor => parseLocation(neighbor)) : [];
        return neighbors.length ? neighbors: null;
    }
    render() {
        const classes = "PythonTemplate"/* classes */;
        const game = this.props.game;
        const mapData = this.props.mapData;
        const orders = this.props.orders;

        /* Current phase. */
        const current_phase = (game.phase[0] === '?' || game.phase === 'COMPLETED') ? 'FINAL' : game.phase;

        /* Notes. */
        const nb_centers = [];
        for (let power of Object.values(game.powers)) {
            if (!power.isEliminated())
                nb_centers.push([power.name.substr(0, 3), power.centers.length]);
        }
        /* Sort nb_centers by descending number of centers. */
        nb_centers.sort((a, b) => {
            return -(a[1] - b[1]) || a[0].localeCompare(b[0]);
        });
        const nb_centers_per_power = nb_centers.map((couple) => (couple[0] + ': ' + couple[1])).join(' ');
        const note = game.note;

        /* Adding units, influence and orders. */
        const renderedUnits = [];
        const renderedDislodgedUnits = [];
        const renderedOrders = [];
        const renderedOrders2 = [];
        const renderedHighestOrders = [];
        for (let power of Object.values(game.powers)) if (!power.isEliminated()) {
            for (let unit of power.units) {
                renderedUnits.push(
                    <Unit key={unit}
                          unit={unit}
                          powerName={power.name}
                          isDislodged={false}
                          coordinates={Coordinates}
                          symbolSizes={SymbolSizes}/>
                );
            }
            for (let unit of Object.keys(power.retreats)) {
                renderedDislodgedUnits.push(
                    <Unit key={unit}
                          unit={unit}
                          powerName={power.name}
                          isDislodged={true}
                          coordinates={Coordinates}
                          symbolSizes={SymbolSizes}/>
                );
            }
            for (let center of power.centers) {
                setInfluence(classes, mapData, center, power.name);
            }
            for (let loc of power.influence) {
                if (!mapData.supplyCenters.has(loc))
                    setInfluence(classes, mapData, loc, power.name);
            }

            if (orders) {
                const powerOrders = (orders && orders.hasOwnProperty(power.name) && orders[power.name]) || [];
                for (let order of powerOrders) {
                    const tokens = order.split(/ +/);
                    if (!tokens || tokens.length < 3)
                        continue;
                    const unit_loc = tokens[1];
                    if (tokens[2] === 'H') {
                        renderedOrders.push(
                            <Hold key={order}
                                  loc={unit_loc}
                                  powerName={power.name}
                                  coordinates={Coordinates}
                                  symbolSizes={SymbolSizes}
                                  colors={Colors}/>
                        );
                    } else if (tokens[2] === '-') {
                        const destLoc = tokens[tokens.length - (tokens[tokens.length - 1] === 'VIA' ? 2 : 1)];
                        renderedOrders.push(
                            <Move key={order}
                                  srcLoc={unit_loc}
                                  dstLoc={destLoc}
                                  powerName={power.name}
                                  phaseType={game.getPhaseType()}
                                  coordinates={Coordinates}
                                  symbolSizes={SymbolSizes}
                                  colors={Colors}/>
                        );
                    } else if (tokens[2] === 'S') {
                        const destLoc = tokens[tokens.length - 1];
                        if (tokens.includes('-')) {
                            const srcLoc = tokens[4];
                            renderedOrders2.push(
                                <SupportMove key={order}
                                             loc={unit_loc}
                                             srcLoc={srcLoc}
                                             dstLoc={destLoc}
                                             powerName={power.name}
                                             coordinates={Coordinates}
                                             symbolSizes={SymbolSizes}
                                             colors={Colors}/>
                            );
                        } else {
                            renderedOrders2.push(
                                <SupportHold key={order}
                                             loc={unit_loc}
                                             dstLoc={destLoc}
                                             powerName={power.name}
                                             coordinates={Coordinates}
                                             symbolSizes={SymbolSizes}
                                             colors={Colors}/>
                            );
                        }
                    } else if (tokens[2] === 'C') {
                        const srcLoc = tokens[4];
                        const destLoc = tokens[tokens.length - 1];
                        if ((srcLoc !== destLoc) && (tokens.includes('-'))) {
                            renderedOrders2.push(
                                <Convoy key={order}
                                        loc={unit_loc}
                                        srcLoc={srcLoc}
                                        dstLoc={destLoc}
                                        powerName={power.name}
                                        coordinates={Coordinates} colors={Colors}
                                        symbolSizes={SymbolSizes}/>
                            );
                        }
                    } else if (tokens[2] === 'B') {
                        renderedHighestOrders.push(
                            <Build key={order}
                                   unitType={tokens[0]}
                                   loc={unit_loc}
                                   powerName={power.name}
                                   coordinates={Coordinates}
                                   symbolSizes={SymbolSizes}/>
                        );
                    } else if (tokens[2] === 'D') {
                        renderedHighestOrders.push(
                            <Disband key={order}
                                     loc={unit_loc}
                                     phaseType={game.getPhaseType()}
                                     coordinates={Coordinates}
                                     symbolSizes={SymbolSizes}/>
                        );
                    } else if (tokens[2] === 'R') {
                        const destLoc = tokens[3];
                        renderedOrders.push(
                            <Move key={order}
                                  srcLoc={unit_loc}
                                  dstLoc={destLoc}
                                  powerName={power.name}
                                  phaseType={game.getPhaseType()}
                                  coordinates={Coordinates}
                                  symbolSizes={SymbolSizes}
                                  colors={Colors}/>
                        );
                    } else {
                        throw new Error(`Unknown error to render (${order}).`);
                    }
                }
            }
        }

        if (this.props.orderBuilding && this.props.orderBuilding.path.length) {
            const clicked = parseLocation(this.props.orderBuilding.path[0]);
            const province  = this.props.mapData.getProvince(clicked);
            if (!province)
                throw new Error(('Unknown clicked province ' + clicked));
            const clickedID = province.getID(classes);
            if (!clicked)
                throw new Error(`Unknown path (${clickedID}) for province (${clicked}).`);
            classes[clickedID] = 'provinceRed';
            const neighbors = this.getNeighbors();
            if (neighbors) {
                for (let neighbor of neighbors) {
                    const neighborProvince = this.props.mapData.getProvince(neighbor);
                    if (!neighborProvince)
                        throw new Error('Unknown neighbor province ' + neighbor);
                    const neighborID = neighborProvince.getID(classes);
                    if (!neighborID)
                        throw new Error(`Unknown neighbor path (${neighborID}) for province (${neighbor}).`);
                    classes[neighborID] = neighborProvince.isWater() ? 'provinceBlue' : 'provinceGreen';
                }
            }
        }

        if (this.props.showAbbreviations === false) {
            classes['BriefLabelLayer'] = 'visibilityHidden';
        }

        // prettier-ignore
        return (
"PythonTemplate"/* svg */
        );
    }
}
PythonTemplate/* classname */.propTypes = {
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
    showAbbreviations: PropTypes.bool
};
