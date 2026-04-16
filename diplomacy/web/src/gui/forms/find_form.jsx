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
import { STRINGS } from "../../diplomacy/utils/strings";
import PropTypes from "prop-types";

export const FindForm = ({ onChange: onChangeProp, onSubmit }) => {
    const [state, adapter] = useFormAdapter({
        game_id: "",
        status: "",
        include_protected: false,
        for_omniscience: false,
    });

    const onChange = Forms.createOnChangeCallback(adapter, onChangeProp);
    const handleSubmit = Forms.createOnSubmitCallback(adapter, onSubmit);

    return (
        <form>
            {Forms.createRow(
                Forms.createColLabel("game_id", "game id (should contain):"),
                <input
                    className={"form-control"}
                    id={"game_id"}
                    type={"text"}
                    value={Forms.getValue(state, "game_id")}
                    onChange={onChange}
                />,
            )}
            {Forms.createRow(
                Forms.createColLabel("status", "status:"),
                <select
                    className={"form-control custom-select"}
                    id={"status"}
                    value={Forms.getValue(state, "status")}
                    onChange={onChange}
                >
                    {Forms.createSelectOptions(STRINGS.ALL_GAME_STATUSES, true)}
                </select>,
            )}
            <div className={"form-check"}>
                {Forms.createCheckbox(
                    "include_protected",
                    "include protected games.",
                    Forms.getValue(state, "include_protected"),
                    onChange,
                )}
            </div>
            <div className={"form-check mb-4"}>
                {Forms.createCheckbox(
                    "for_omniscience",
                    "for omniscience.",
                    Forms.getValue(state, "for_omniscience"),
                    onChange,
                )}
            </div>
            {Forms.createRow("", Forms.createSubmit("find games", true, handleSubmit))}
        </form>
    );
};

FindForm.propTypes = {
    onChange: PropTypes.func,
    onSubmit: PropTypes.func,
};
