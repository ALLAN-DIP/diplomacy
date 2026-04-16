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
import { Forms, useFormAdapter } from "../components/forms";
import { ORDER_BUILDER } from "../utils/order_building";
import { STRINGS } from "../../diplomacy/utils/strings";
import PropTypes from "prop-types";
import { Power } from "../../diplomacy/engine/power";

const HotKey = require("react-shortcut");

export const PowerOrderCreationForm = ({
    orderType,
    orderTypes,
    power,
    role,
    onChange: onChangeProp,
    onPass,
    onVote,
    onSetWaitFlag,
}) => {
    const [state, adapter] = useFormAdapter({ order_type: orderType });

    const onChange = Forms.createOnChangeCallback(adapter, onChangeProp);
    const onReset = Forms.createOnResetCallback(adapter, onChangeProp, { order_type: orderType });
    const onSetOrderType = (letter) => {
        adapter.setState({ order_type: letter }, () => {
            if (onChangeProp) onChangeProp(adapter.state);
        });
    };

    let title = "";
    let titleClass = "mr-4";
    const header = [];
    const votes = [];
    if (orderTypes.length) {
        title = "Create order:";
        header.push(
            ...orderTypes.map((orderLetter, index) => (
                <div key={index} className={"form-check-inline"}>
                    {Forms.createRadio(
                        "order_type",
                        orderLetter,
                        ORDER_BUILDER[orderLetter].name,
                        orderType,
                        onChange,
                    )}
                </div>
            )),
        );
        header.push(Forms.createReset("reset", false, onReset));
    } else if (power.order_is_set) {
        title = "Unorderable power.";
        titleClass += " neutral";
    } else {
        title = "No orders available for this power.";
    }

    if (role !== STRINGS.OMNISCIENT_TYPE) {
        votes.push(
            <strong key={0} className={"ml-4 mr-2"}>
                Vote for draw:
            </strong>,
        );
        switch (power.vote) {
            case "yes":
                votes.push(Forms.createButton("no", () => onVote("no"), "danger"));
                votes.push(Forms.createButton("neutral", () => onVote("neutral"), "info"));
                break;
            case "no":
                votes.push(Forms.createButton("yes", () => onVote("yes"), "success"));
                votes.push(Forms.createButton("neutral", () => onVote("neutral"), "info"));
                break;
            case "neutral":
                votes.push(Forms.createButton("yes", () => onVote("yes"), "success"));
                votes.push(Forms.createButton("no", () => onVote("no"), "danger"));
                break;
            default:
                votes.push(Forms.createButton("yes", () => onVote("yes"), "success"));
                votes.push(Forms.createButton("no", () => onVote("no"), "danger"));
                votes.push(Forms.createButton("neutral", () => onVote("neutral"), "info"));
                break;
        }
    }
    return (
        <div>
            <div>
                <strong key={"title"} className={titleClass}>
                    {title}
                </strong>
            </div>
            <form className={"form-inline power-actions-form"}>
                {header}
                {Forms.createButton(
                    power.wait ? "ready" : "unready",
                    onSetWaitFlag,
                    power.wait ? "success" : "danger",
                )}
                <HotKey keys={["escape"]} onKeysCoincide={onReset} />
                {orderTypes.map((letter, index) => (
                    <HotKey
                        key={index}
                        keys={[letter.toLowerCase()]}
                        onKeysCoincide={() => onSetOrderType(letter)}
                    />
                ))}
            </form>
        </div>
    );
};

PowerOrderCreationForm.propTypes = {
    orderType: PropTypes.oneOf(Object.keys(ORDER_BUILDER)),
    orderTypes: PropTypes.arrayOf(PropTypes.oneOf(Object.keys(ORDER_BUILDER))),
    power: PropTypes.instanceOf(Power),
    role: PropTypes.string,
    onChange: PropTypes.func,
    onSubmit: PropTypes.func,
    onPass: PropTypes.func,
    onVote: PropTypes.func,
    onSetWaitFlag: PropTypes.func,
};
