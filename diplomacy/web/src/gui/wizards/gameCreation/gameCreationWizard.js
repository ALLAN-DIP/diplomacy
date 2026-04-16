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
import React, { useState } from "react";
import PropTypes from "prop-types";
import { Panels } from "./panelList";
import { PanelChooseMap } from "./panelChooseMap";
import { PanelChoosePlayers } from "./panelChoosePlayers";
import { PanelChoosePower } from "./panelChoosePower";
import { PanelChooseSettings } from "./panelChooseSettings";
import { Maps } from "./mapList";
import { UTILS } from "../../../diplomacy/utils/utils";
import "./gameCreationWizard.css";

export const GameCreationWizard = (props) => {
    const [state, setState] = useState({
        panel: Panels.CHOOSE_MAP,
        game_id: UTILS.createGameID(props.username),
        power_name: null,
        n_controls: -1,
        deadline: 0,
        registration_password: "",

        map: Maps[0],
        no_press: false,
        player_type: "",
    });

    const updateParams = (params) => {
        setState((prev) => ({ ...prev, ...params }));
    };

    const goToPanel = (panelID) => {
        if (panelID < Panels.CHOOSE_MAP) props.onCancel();
        else if (panelID > Panels.CHOOSE_SETTINGS) {
            const rules = ["POWER_CHOICE"];
            if (state.no_press) rules.push("NO_PRESS");
            if (!state.deadline) {
                rules.push("NO_DEADLINE");
                rules.push("REAL_TIME");
            }
            props.onSubmit({
                game_id: state.game_id,
                map_name: state.map.name,
                power_name: state.power_name,
                n_controls: state.n_controls,
                deadline: state.deadline,
                registration_password: state.registration_password || null,
                rules: rules,
                player_type: state.player_type,
            });
        } else setState((prev) => ({ ...prev, panel: panelID, registration_password: "" }));
    };

    const backward = (step) => {
        goToPanel(state.panel - (step ? step : 1));
    };

    const forward = (step) => {
        goToPanel(state.panel + (step ? step : 1));
    };

    const renderPanel = () => {
        switch (state.panel) {
            case Panels.CHOOSE_MAP:
                return (
                    <PanelChooseMap
                        forward={forward}
                        params={state}
                        onUpdateParams={updateParams}
                        cancel={props.onCancel}
                    />
                );
            case Panels.CHOOSE_PLAYERS:
                return (
                    <PanelChoosePlayers
                        backward={backward}
                        forward={forward}
                        onUpdateParams={updateParams}
                        nbPowers={props.availableMaps[state.map.name].powers.length}
                        cancel={props.onCancel}
                    />
                );
            case Panels.CHOOSE_POWER:
                return (
                    <PanelChoosePower
                        backward={backward}
                        forward={forward}
                        onUpdateParams={updateParams}
                        powers={props.availableMaps[state.map.name].powers}
                        cancel={props.onCancel}
                    />
                );
            case Panels.CHOOSE_SETTINGS:
                return (
                    <PanelChooseSettings
                        backward={backward}
                        forward={forward}
                        onUpdateParams={updateParams}
                        username={props.username}
                        params={state}
                        cancel={props.onCancel}
                    />
                );
            default:
                return "";
        }
    };

    return <div className="game-creation-wizard">{renderPanel()}</div>;
};

GameCreationWizard.propTypes = {
    onCancel: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    availableMaps: PropTypes.object.isRequired,
    username: PropTypes.string.isRequired,
};
