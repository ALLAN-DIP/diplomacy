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
import $ from "jquery";
import { STRINGS } from "../../diplomacy/utils/strings";
import { Game } from "../../diplomacy/engine/game";

export function loadGameFromDisk() {
    return new Promise((onLoad, onError) => {
        const input = $(document.createElement("input"));
        input.attr("type", "file");
        input.trigger("click");
        input.change((event) => {
            const file = event.target.files[0];
            if (!file.name.match(/\.json$/i)) {
                onError(`Invalid JSON filename ${file.name}`);
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const savedData = JSON.parse(reader.result);
                const gameObject = {};
                gameObject.game_id = `(local) ${savedData.id}`;
                gameObject.map_name = savedData.map;
                gameObject.rules = savedData.rules;
                gameObject.has_initial_orders = savedData.has_initial_orders || {};
                gameObject.annotated_messages = savedData.annotated_messages || {};
                gameObject.state_history = {};
                gameObject.message_history = {};
                gameObject.order_history = {};
                gameObject.stance_history = {};
                gameObject.is_bot_history = {};
                gameObject.deceiving_history = {};
                gameObject.result_history = {};
                gameObject.log_history = {};
                gameObject.order_suggestions = savedData.order_suggestions || {
                    AUS: [],
                    ENG: [],
                    TUR: [],
                    ITA: [],
                    RUS: [],
                    FRA: [],
                    GER: [],
                };
                gameObject.commentary_durations = savedData.commentary_durations || {};

                // Load all saved phases (expect the latest one) to history fields.
                for (let i = 0; i < savedData.phases.length - 1; ++i) {
                    const savedPhase = savedData.phases[i];
                    const gameState = savedPhase.state;
                    const phaseOrders = savedPhase.orders || {};
                    const phaseResults = savedPhase.results || {};
                    const phaseMessages = {};
                    const phaseLogs = {};
                    const phaseStances = savedPhase.stances || {};
                    const phaseIsBot = savedPhase.is_bot || {};
                    const phaseDeceiving = savedPhase.deceiving || {};
                    if (savedPhase.messages) {
                        for (let message of savedPhase.messages) {
                            phaseMessages[message.time_sent] = message;
                        }
                    }
                    if (savedPhase.logs) {
                        for (let log of savedPhase.logs) {
                            phaseLogs[log.time_sent] = log;
                        }
                    }
                    if (!gameState.name) gameState.name = savedPhase.name;
                    gameObject.state_history[gameState.name] = gameState;
                    gameObject.message_history[gameState.name] = phaseMessages;
                    gameObject.order_history[gameState.name] = phaseOrders;
                    gameObject.stance_history[gameState.name] = phaseStances;
                    gameObject.is_bot_history[gameState.name] = phaseIsBot;
                    gameObject.deceiving_history[gameState.name] = phaseDeceiving;
                    gameObject.result_history[gameState.name] = phaseResults;
                    gameObject.log_history[gameState.name] = phaseLogs;
                }

                // Load latest phase separately and use it later to define the current game phase.
                const latestPhase = savedData.phases[savedData.phases.length - 1];
                const latestGameState = latestPhase.state;
                const latestPhaseOrders = latestPhase.orders || {};
                const latestPhaseStances = latestPhase.stances || {};
                const latestPhaseIsBot = latestPhase.is_bot || {};
                const latestPhaseDeceiving = latestPhase.deceiving || {};
                const latestPhaseResults = latestPhase.results || {};
                const latestPhaseMessages = {};
                const latestPhaseLogs = {};
                if (latestPhase.messages) {
                    for (let message of latestPhase.messages) {
                        latestPhaseMessages[message.time_sent] = message;
                    }
                }
                if (latestPhase.logs) {
                    for (let log of latestPhase.logs) {
                        latestPhaseLogs[log.time_sent] = log;
                    }
                }
                if (!latestGameState.name) latestGameState.name = latestPhase.name;
                // TODO: NB: What if latest phase in loaded JSON contains order results? Not sure if it is well handled.
                gameObject.result_history[latestGameState.name] = latestPhaseResults;

                gameObject.messages = [];
                gameObject.logs = [];
                gameObject.role = STRINGS.OBSERVER_TYPE;
                gameObject.status = STRINGS.COMPLETED;
                gameObject.timestamp_created = 0;
                gameObject.deadline = 0;
                gameObject.n_controls = 0;
                gameObject.registration_password = "";
                gameObject.stances = latestPhaseStances;
                gameObject.is_bot = latestPhaseIsBot;
                gameObject.deceiving = latestPhaseDeceiving;
                const game = new Game(gameObject);

                // Set game current phase and state using latest phase found in JSON file.
                game.setPhaseData({
                    name: latestGameState.name,
                    state: latestGameState,
                    orders: latestPhaseOrders,
                    messages: latestPhaseMessages,
                    logs: latestPhaseLogs,
                    stances: latestPhaseStances,
                    isBot: latestPhaseIsBot,
                    deceiving: latestPhaseDeceiving,
                });
                onLoad(game);
            };
            reader.readAsText(file);
        });
    });
}
