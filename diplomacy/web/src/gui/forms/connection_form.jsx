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
import React, { useEffect } from "react";
import { Forms, useFormAdapter } from "../components/forms";
import { UTILS } from "../../diplomacy/utils/utils";
import PropTypes from "prop-types";
import { DipStorage } from "../utils/dipStorage";

export const API_PORT = 443;

function initState() {
    let defaultHostname = "diplomacy-api.feng-gu.com";
    let defaultPort = 443;

    const currentHostname = window.location.hostname;
    if (
        currentHostname === "localhost" ||
        currentHostname === "127.0.0.1" ||
        currentHostname === "0.0.0.0"
    ) {
        defaultHostname = "localhost";
        defaultPort = 8433;
    }

    return {
        hostname: defaultHostname,
        port: defaultPort,
        username: "",
        password: "",
        showServerFields: false,
    };
}

export const ConnectionForm = ({ onChange: onChangeProp, onSubmit }) => {
    const buildInitialState = () => {
        const initial = initState();
        const savedState = DipStorage.getConnectionForm();
        if (savedState) {
            if (savedState.username) initial.username = savedState.username;
            if (savedState.password) initial.password = savedState.password;
            if (savedState.showServerFields) initial.showServerFields = savedState.showServerFields;
        }
        return initial;
    };

    const [state, adapter] = useFormAdapter(buildInitialState);

    useEffect(() => {
        // Auto-submit if credentials are saved in local storage
        const savedState = DipStorage.getConnectionForm();
        if (savedState && savedState.username && savedState.password && onSubmit) {
            setTimeout(() => {
                onSubmit({
                    ...adapter.state,
                    hostname: adapter.state.hostname,
                    port: adapter.state.port,
                });
            }, 100);
        }
    }, []); // eslint-disable-line

    const updateServerFieldsView = () => {
        DipStorage.setConnectionshowServerFields(!state.showServerFields);
        adapter.setState({ showServerFields: !state.showServerFields });
    };

    const handleChange = (newState) => {
        const initial = initState();
        if (newState.hostname !== initial.hostname) DipStorage.setConnectionHostname(newState.hostname);
        else DipStorage.setConnectionHostname(null);
        if (newState.port !== initial.port) DipStorage.setConnectionPort(newState.port);
        else DipStorage.setConnectionPort(null);
        if (newState.username !== initial.username) DipStorage.setConnectionUsername(newState.username);
        else DipStorage.setConnectionUsername(null);
        if (newState.password !== initial.password) DipStorage.setConnectionPassword(newState.password);
        else DipStorage.setConnectionPassword(null);
        if (onChangeProp) onChangeProp(newState);
    };

    const onChange = Forms.createOnChangeCallback(adapter, handleChange);
    const handleSubmit = Forms.createOnSubmitCallback(adapter, onSubmit);

    return (
        <form>
            {Forms.createRow(
                Forms.createColLabel("username", "username:"),
                <input
                    className={"form-control"}
                    type={"text"}
                    id={"username"}
                    value={Forms.getValue(state, "username")}
                    onChange={onChange}
                />,
            )}
            {Forms.createRow(
                Forms.createColLabel("password", "password:"),
                <input
                    className={"form-control"}
                    type={"password"}
                    id={"password"}
                    value={Forms.getValue(state, "password")}
                    onChange={onChange}
                />,
            )}
            <div>
                <div className={state.showServerFields ? "mb-2" : "mb-4"}>
                    <span className={"button-server"} onClick={updateServerFieldsView}>
                        server settings{" "}
                        {state.showServerFields
                            ? UTILS.html.UNICODE_BOTTOM_ARROW
                            : UTILS.html.UNICODE_TOP_ARROW}
                    </span>
                </div>
                {state.showServerFields && (
                    <div className={"mb-4"}>
                        {Forms.createRow(
                            <label className={"col"} htmlFor={"hostname"}>
                                hostname:
                            </label>,
                            <input
                                className={"form-control"}
                                type={"text"}
                                id={"hostname"}
                                value={Forms.getValue(state, "hostname")}
                                onChange={onChange}
                            />,
                        )}
                        {Forms.createRow(
                            <label className={"col"} htmlFor={"port"}>
                                port:
                            </label>,
                            <input
                                className={"form-control"}
                                type={"number"}
                                id={"port"}
                                value={Forms.getValue(state, "port")}
                                onChange={onChange}
                            />,
                        )}
                    </div>
                )}
            </div>
            {Forms.createRow("", Forms.createSubmit("connect", true, handleSubmit))}
        </form>
    );
};

ConnectionForm.propTypes = {
    onChange: PropTypes.func,
    onSubmit: PropTypes.func,
};
