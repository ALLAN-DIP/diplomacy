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
import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { MapData } from "../utils/map_data";
import { SvgStandard } from "../maps/standard/SvgStandard";
import { SvgAncMed } from "../maps/ancmed/SvgAncMed";
import { SvgModern } from "../maps/modern/SvgModern";
import { SvgPure } from "../maps/pure/SvgPure";

function getMapComponent(mapName) {
    const mapComponents = {
        standard: SvgStandard,
        ancmed: SvgAncMed,
        modern: SvgModern,
        pure: SvgPure,
    };
    return mapComponents[mapName] || SvgStandard;
}

/**
 * MapContainer renders the game map in either interactive (current phase) or
 * read-only (results/history) mode.
 */
function MapContainerBase({
    mode,
    gameEngine,
    mapInfo,
    showAbbreviations,
    onError,
    // Current-mode props
    powerName,
    orderType,
    orderPath,
    orders,
    hoverOrders,
    shiftKeyPressed,
    onOrderBuilding,
    onOrderBuilt,
    onChangeOrderDistribution,
    orderDistribution,
    displayVisualAdvice,
    visibleDistributionOrder,
    hoverDistributionOrder,
    onSelectLocation,
    onSelectVia,
    getOrderBuilding,
    // Results-mode props
    showOrders,
    onHover,
}) {
    const Map = getMapComponent(gameEngine.map_name);

    // Memoize MapData — it's an expensive wrapper around mapInfo + gameEngine.
    // gameEngine is a stable mutable reference; mapInfo never changes mid-game.
    const mapData = useMemo(() => new MapData(mapInfo, gameEngine), [mapInfo, gameEngine]);

    // Memoize formatted orders for the current-phase map. Re-derives only when
    // the raw orders object, hover orders, or the active power changes.
    const formattedOrders = useMemo(() => {
        const result = {};
        if (orders) {
            for (let entry of Object.entries(orders)) {
                result[entry[0]] = [];
                if (entry[1]) {
                    for (let orderObject of Object.values(entry[1]))
                        result[entry[0]].push(orderObject.order);
                }
            }
        }
        if (hoverOrders && powerName && result[powerName]) {
            for (let oo of hoverOrders) {
                result[powerName].push(oo);
            }
        }
        return result;
    }, [orders, hoverOrders, powerName]);

    // Memoize the orderBuilding descriptor so the SVG map only sees a new
    // object when the type or path actually changes.
    const orderBuilding = useMemo(
        () => getOrderBuilding && getOrderBuilding(powerName, orderType, orderPath),
        [getOrderBuilding, powerName, orderType, orderPath],
    );

    if (mode === "current") {
        return (
            <div id="current-map" key="current-map">
                <Map
                    game={gameEngine}
                    showAbbreviations={showAbbreviations}
                    mapData={mapData}
                    onError={onError}
                    orderBuilding={orderBuilding}
                    onOrderBuilding={onOrderBuilding}
                    onOrderBuilt={onOrderBuilt}
                    orders={formattedOrders}
                    shiftKeyPressed={shiftKeyPressed}
                    onChangeOrderDistribution={onChangeOrderDistribution}
                    orderDistribution={orderDistribution}
                    displayVisualAdvice={displayVisualAdvice}
                    visibleDistributionOrder={visibleDistributionOrder}
                    hoverDistributionOrder={hoverDistributionOrder}
                    onSelectLocation={onSelectLocation}
                    onSelectVia={onSelectVia}
                />
            </div>
        );
    }

    // Results mode
    const resultsOrders =
        (showOrders &&
            gameEngine.order_history.contains(gameEngine.phase) &&
            gameEngine.order_history.get(gameEngine.phase)) ||
        null;

    return (
        <div id="past-map" key="past-map">
            <Map
                game={gameEngine}
                showAbbreviations={showAbbreviations}
                mapData={mapData}
                onError={onError}
                orders={resultsOrders}
                onHover={showOrders ? onHover : null}
                onSelectVia={onSelectVia}
            />
        </div>
    );
}

/**
 * Memoized MapContainer — skips re-rendering when none of the map-relevant
 * props have changed (e.g. a chat message arriving should not redraw the SVG).
 */
export const MapContainer = React.memo(MapContainerBase);

MapContainerBase.propTypes = {
    mode: PropTypes.oneOf(["current", "results"]).isRequired,
    gameEngine: PropTypes.object.isRequired,
    mapInfo: PropTypes.object.isRequired,
    showAbbreviations: PropTypes.bool.isRequired,
    onError: PropTypes.func.isRequired,
    // Current-mode props
    powerName: PropTypes.string,
    orderType: PropTypes.string,
    orderPath: PropTypes.array,
    orders: PropTypes.object,
    hoverOrders: PropTypes.array,
    shiftKeyPressed: PropTypes.bool,
    onOrderBuilding: PropTypes.func,
    onOrderBuilt: PropTypes.func,
    onChangeOrderDistribution: PropTypes.func,
    orderDistribution: PropTypes.array,
    displayVisualAdvice: PropTypes.bool,
    visibleDistributionOrder: PropTypes.array,
    hoverDistributionOrder: PropTypes.array,
    onSelectLocation: PropTypes.func,
    onSelectVia: PropTypes.func,
    getOrderBuilding: PropTypes.func,
    // Results-mode props
    showOrders: PropTypes.bool,
    onHover: PropTypes.func,
};
