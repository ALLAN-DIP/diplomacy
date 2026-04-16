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
import PropTypes from "prop-types";

export const JoinForm = ({ game_id, password_required, powers, availablePowers, onChange: onChangeProp, onSubmit }) => {
    const powerNameID = `power_name_${game_id}`;
    const passwordID = `registration_password_${game_id}`;
    const defaultPowerName = (powers && powers.length && powers[0]) || "";

    const [state, adapter] = useFormAdapter({
        [powerNameID]: defaultPowerName,
        [passwordID]: "",
    });

    const onChange = Forms.createOnChangeCallback(adapter, onChangeProp);
    const handleSubmit = Forms.createOnSubmitCallback(adapter, onSubmit);

    return (
        <form className={"form-inline"}>
            <div className={"form-group mr-2"}>
                {Forms.createLabel(powerNameID, "Power:")}
                <select
                    id={powerNameID}
                    className={"from-control custom-select ml-2"}
                    value={Forms.getValue(state, powerNameID)}
                    onChange={onChange}
                >
                    {Forms.createSelectOptions(availablePowers, true)}
                </select>
            </div>
            {password_required ? (
                <div className={"form-group mr-2"}>
                    {Forms.createLabel(passwordID, "", "sr-only")}
                    <input
                        id={passwordID}
                        type={"password"}
                        className={"form-control"}
                        placeholder={"registration password"}
                        value={Forms.getValue(state, passwordID)}
                        onChange={onChange}
                    />
                </div>
            ) : (
                ""
            )}
            {Forms.createSubmit("join", false, handleSubmit)}
        </form>
    );
};

JoinForm.propTypes = {
    game_id: PropTypes.string.isRequired,
    password_required: PropTypes.bool.isRequired,
    powers: PropTypes.arrayOf(PropTypes.string),
    availablePowers: PropTypes.arrayOf(PropTypes.string),
    onChange: PropTypes.func,
    onSubmit: PropTypes.func,
};
