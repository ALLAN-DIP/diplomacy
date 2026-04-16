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
import { FancyBox } from "../../components/fancyBox";
import PropTypes from "prop-types";
import { UTILS } from "../../../diplomacy/utils/utils";
import { ArrowLeftIcon } from "@primer/octicons-react";

const DEADLINES = [
    [0, "(no deadline)"],
    [60, "1 min"],
    [60 * 5, "5 min"],
    [60 * 10, "10 min"],
    [60 * 30, "30 min"],
    [60 * 60 * 2, "2 hrs"],
    [60 * 60 * 24, "24 hrs"],
];

export const PanelChooseSettings = (props) => {
    const onCheckNoPress = (event) => {
        props.onUpdateParams({ no_press: event.target.checked });
    };

    const onSelectDeadline = (event) => {
        props.onUpdateParams({ deadline: parseInt(event.target.value) });
    };

    const onSetRegistrationPassword = (event) => {
        props.onUpdateParams({ registration_password: event.target.value });
    };

    const onSetGameID = (event) => {
        let gameID = event.target.value;
        if (!gameID) gameID = UTILS.createGameID(props.username);
        props.onUpdateParams({ game_id: gameID });
    };

    return (
        <FancyBox title={"Other settings"} onClose={props.cancel}>
            <div>
                <form>
                    <div className="form-group row align-items-center mb-2">
                        <label className="col-md col-form-label" htmlFor="deadline">
                            Deadline
                        </label>
                        <div className="col-md">
                            <select
                                id="deadline"
                                className="custom-select custom-select-sm"
                                value={props.params.deadline}
                                onChange={onSelectDeadline}
                            >
                                {DEADLINES.map((deadline, index) => (
                                    <option key={index} value={deadline[0]}>
                                        {deadline[1]}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="form-group row mb-2">
                        <label className="col-md col-form-label" htmlFor="registration-password">
                            Login password
                        </label>
                        <div className="col-md">
                            <input
                                type="password"
                                className="form-control form-control-sm"
                                id="registration-password"
                                value={props.params.registration_password}
                                onChange={onSetRegistrationPassword}
                                placeholder="(no password)"
                            />
                        </div>
                    </div>
                    <div className="form-group row mb-2">
                        <label className="col-md col-form-label" htmlFor="game-id">
                            Game ID
                        </label>
                        <div className="col-md">
                            <input
                                type="text"
                                className="form-control form-control-sm"
                                id="game-id"
                                value={props.params.game_id}
                                onChange={onSetGameID}
                            />
                        </div>
                    </div>
                    <div className="custom-control custom-checkbox mb-5">
                        <input
                            type="checkbox"
                            className="custom-control-input"
                            id="no-press"
                            checked={props.params.no_press}
                            onChange={onCheckNoPress}
                        />
                        <label className="custom-control-label" htmlFor="no-press">
                            No messages allowed
                        </label>
                    </div>
                </form>
            </div>
            <div className="row">
                <div className="col-sm">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm btn-block"
                        onClick={() => props.backward()}
                    >
                        <ArrowLeftIcon />
                    </button>
                </div>
                <div className="col-sm">
                    <button
                        type="button"
                        className="btn btn-success btn-sm btn-block inline"
                        onClick={() => props.forward()}
                    >
                        <strong>create the game</strong>
                    </button>
                </div>
            </div>
        </FancyBox>
    );
};

PanelChooseSettings.propTypes = {
    backward: PropTypes.func.isRequired,
    forward: PropTypes.func.isRequired,
    cancel: PropTypes.func.isRequired,
    params: PropTypes.object.isRequired,
    onUpdateParams: PropTypes.func.isRequired,
    username: PropTypes.string.isRequired,
};
