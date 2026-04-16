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
import React, { memo } from "react";
import PropTypes from "prop-types";
import { UTILS } from "../../diplomacy/utils/utils";
import { STRINGS } from "../../diplomacy/utils/strings";
import { PowerOrderCreationForm } from "../forms/power_order_creation_form";
import { PowerOrders } from "./power_orders";
import { PowerOrdersActionBar } from "./power_orders_actions_bar";
import { Tooltip } from "@mui/material";
import { QuestionIcon } from "@primer/octicons-react";

/**
 * OrderPanel renders the order creation form, order list, and action buttons
 * for the current phase.
 */
function OrderPanelBase({
    engine,
    currentPowerName,
    currentPower,
    orderBuildingType,
    allowedPowerOrderTypes,
    orderTypeToLocs,
    phaseType,
    buildCount,
    suggestionType,
    powerOrders,
    serverOrders,
    orders,
    wait,
    // Callbacks
    onChangeOrderType,
    onSetEmptyOrdersSet,
    setWaitFlag,
    vote,
    onRemoveOrder,
    onReloadServerOrders,
    onRemoveAllCurrentPowerOrders,
    onSetOrders,
    onProcessGame,
    isPlayerGame,
    observerLevel,
}) {
    // Order count text for movement phases
    let numOrderText = "";
    if (phaseType === "M" && orderTypeToLocs) {
        const merged = new Set(Object.values(orderTypeToLocs).flat());
        const unitsWithoutOrders = new Set(
            [...merged].filter((x) => !Object.keys(powerOrders).includes(x))
        );
        if (
            unitsWithoutOrders.size === 0 ||
            merged.size === unitsWithoutOrders.size
        ) {
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

    // Suggestion type display
    const suggestionTypeDisplay = [];
    const hasSuggestionType = (value, match) =>
        value !== null && (value & match) === match;

    if (hasSuggestionType(suggestionType, UTILS.SuggestionType.MESSAGE))
        suggestionTypeDisplay.push("message");
    if (hasSuggestionType(suggestionType, UTILS.SuggestionType.MOVE))
        suggestionTypeDisplay.push("order");
    if (hasSuggestionType(suggestionType, UTILS.SuggestionType.COMMENTARY))
        suggestionTypeDisplay.push("commentary");
    if (
        hasSuggestionType(
            suggestionType,
            UTILS.SuggestionType.MOVE_DISTRIBUTION_TEXTUAL
        ) ||
        hasSuggestionType(
            suggestionType,
            UTILS.SuggestionType.MOVE_DISTRIBUTION_VISUAL
        )
    )
        suggestionTypeDisplay.push(
            <React.Fragment key="order-prob">
                order probability{" "}
                <Tooltip
                    title={
                        <>
                            <p>
                                Hold <kbd>Shift</kbd> and click on a province to
                                display recommended/predicted orders for the
                                province&apos;s unit.
                            </p>
                            <p>
                                Click the province a second time to place an
                                order.
                            </p>
                            <p>
                                Release <kbd>Shift</kbd> to clear all
                                selections.
                            </p>
                        </>
                    }
                >
                    <span>
                        <QuestionIcon />
                    </span>
                </Tooltip>
            </React.Fragment>
        );

    // Render order list
    const renderOrdersList = () => {
        const render = [];
        render.push(
            <PowerOrders
                key={currentPowerName}
                name={currentPowerName}
                wait={wait[currentPowerName]}
                orders={orders[currentPowerName]}
                serverCount={
                    serverOrders[currentPowerName]
                        ? UTILS.javascript.count(serverOrders[currentPowerName])
                        : -1
                }
                onRemove={onRemoveOrder}
            />
        );
        return render;
    };

    return (
        <div>
            {/* Order Creation Form */}
            <div className="mb-4">
                <PowerOrderCreationForm
                    orderType={orderBuildingType}
                    orderTypes={allowedPowerOrderTypes}
                    onChange={onChangeOrderType}
                    onPass={() => onSetEmptyOrdersSet(currentPowerName)}
                    onSetWaitFlag={() => setWaitFlag(!currentPower.wait)}
                    onVote={vote}
                    role={engine.role}
                    power={currentPower}
                />
                {(allowedPowerOrderTypes.length && (
                    <span>
                        <strong>Orderable locations</strong>:{" "}
                        {orderTypeToLocs[orderBuildingType].join(", ")}
                    </span>
                )) || <strong>&nbsp;No orderable location.</strong>}
                {phaseType === "A" &&
                    ((buildCount === null && (
                        <strong>&nbsp;(unknown build count)</strong>
                    )) ||
                        (buildCount === 0 ? (
                            <strong>
                                &nbsp;(nothing to build or disband)
                            </strong>
                        ) : buildCount > 0 ? (
                            <strong>
                                &nbsp;({buildCount} unit
                                {buildCount > 1 && "s"} may be built)
                            </strong>
                        ) : (
                            <strong>
                                &nbsp;({-buildCount} unit
                                {buildCount < -1 && "s"} to disband)
                            </strong>
                        )))}
                {phaseType === "M" && <div>{numOrderText}</div>}
                {suggestionType === null && <div>No advice assigned</div>}
                {suggestionType !== null &&
                    suggestionType === UTILS.SuggestionType.NONE && (
                        <div>No advice this turn</div>
                    )}
                {suggestionType !== null &&
                    suggestionType !== UTILS.SuggestionType.NONE && (
                        <div>
                            You are getting advice:{" "}
                            {suggestionTypeDisplay.reduce((accu, elem) => {
                                return accu === null
                                    ? [elem]
                                    : [...accu, ", ", elem];
                            }, null)}
                        </div>
                    )}
            </div>

            {/* Action Bar */}
            <PowerOrdersActionBar
                onReset={onReloadServerOrders}
                onDeleteAll={onRemoveAllCurrentPowerOrders}
                onUpdate={onSetOrders}
                onProcess={
                    !isPlayerGame && observerLevel === STRINGS.MASTER_TYPE
                        ? onProcessGame
                        : null
                }
            />

            {/* Orders List */}
            <div className={"orders"}>{renderOrdersList()}</div>
        </div>
    );
}

export const OrderPanel = memo(OrderPanelBase);

OrderPanelBase.propTypes = {
    engine: PropTypes.object.isRequired,
    currentPowerName: PropTypes.string.isRequired,
    currentPower: PropTypes.object.isRequired,
    orderBuildingType: PropTypes.string,
    allowedPowerOrderTypes: PropTypes.array.isRequired,
    orderTypeToLocs: PropTypes.object.isRequired,
    phaseType: PropTypes.string,
    buildCount: PropTypes.number,
    suggestionType: PropTypes.number,
    powerOrders: PropTypes.object.isRequired,
    serverOrders: PropTypes.object.isRequired,
    orders: PropTypes.object.isRequired,
    wait: PropTypes.object.isRequired,
    onChangeOrderType: PropTypes.func.isRequired,
    onSetEmptyOrdersSet: PropTypes.func.isRequired,
    setWaitFlag: PropTypes.func.isRequired,
    vote: PropTypes.func.isRequired,
    onRemoveOrder: PropTypes.func.isRequired,
    onReloadServerOrders: PropTypes.func.isRequired,
    onRemoveAllCurrentPowerOrders: PropTypes.func.isRequired,
    onSetOrders: PropTypes.func.isRequired,
    onProcessGame: PropTypes.func,
    isPlayerGame: PropTypes.bool.isRequired,
    observerLevel: PropTypes.string,
};
