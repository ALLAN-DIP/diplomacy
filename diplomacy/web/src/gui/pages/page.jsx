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
/** Main component to use to create app GUI. **/

import React, { Suspense, useRef, useEffect, useState } from "react";

import { Switch, Route, withRouter, Redirect } from "react-router-dom";

import { UTILS } from "../../diplomacy/utils/utils";
import { Diplog } from "../../diplomacy/utils/diplog";
import { DipStorage } from "../utils/dipStorage";
import { Connection } from "../../diplomacy/client/connection";
import { Channel } from "../../diplomacy/client/channel";
import { PageContext } from "../components/page_context";
import { loadGameFromDisk } from "../utils/load_game_from_disk";
import { usePromiseState } from "../utils/usePromiseState";
import { Game } from "../../diplomacy/engine/game";
import PropTypes from "prop-types";

const ContentConnection = React.lazy(() =>
    import("./content_connection").then((module) => ({ default: module.ContentConnection })),
);
const ContentGames = React.lazy(() => import("./content_games").then((module) => ({ default: module.ContentGames })));
const ContentGame = React.lazy(() => import("./content_game").then((module) => ({ default: module.ContentGame })));

import { confirmAlert } from "react-confirm-alert";
import "react-confirm-alert/src/react-confirm-alert.css";

function wrapMessage(message) {
    return message ? `(${UTILS.date()}) ${message}` : "";
}

/**
 * Route target for /game/:gameId. Extracted as a named component so we can
 * declare prop-types for the router's `match` object (otherwise ESLint flags
 * the inline render-prop for accessing undocumented props).
 */
const GameRoute = ({ match, page }) => {
    if (!page.channel) return <Redirect to="/" />;
    const game = page.getGame(match.params.gameId);
    // Only a full Game instance carries the state (messages, history, methods)
    // that ContentGame needs. Raw entries from `listGames` are just summaries
    // — drop back to the games list so the user can re-join and pick up full
    // state.
    if (!(game instanceof Game)) return <Redirect to="/games" />;
    return <ContentGame data={game} />;
};

GameRoute.propTypes = {
    match: PropTypes.shape({
        params: PropTypes.shape({
            gameId: PropTypes.string,
        }),
    }),
    page: PropTypes.object,
};

function sortGames(games) {
    games.sort((a, b) => (a.role ? 1 : 0) - (b.role ? 1 : 0) || a.game_id.localeCompare(b.game_id));
    return games;
}

const PageBase = ({ history }) => {
    const { state, setState, stateRef } = usePromiseState({
        error: null,
        info: null,
        success: null,
        name: null,
        body: null,
        games: {},
        myGames: {},
    });

    // True while we are trying to silently restore a persisted session.
    // Route guards check this to show a spinner instead of redirecting.
    const [isSessionRestoring, setIsSessionRestoring] = useState(() => {
        // Only enter the restoring state if there actually is a saved session.
        return !!DipStorage.getSession();
    });

    // Stable page object that is the context value.
    // Children access page.connection, page.channel, etc. directly.
    const pageRef = useRef(null);
    if (!pageRef.current) {
        pageRef.current = {
            connection: null,
            channel: null,
            availableMaps: null,
        };
    }
    const page = pageRef.current;

    // Keep dynamic references up to date on each render.
    page.props = { history };
    page.setState = setState;

    // --- Message methods ---
    page.error = (message) => {
        message = wrapMessage(message);
        Diplog.error(message);
        return setState({ error: message });
    };

    page.info = (message) => {
        message = wrapMessage(message);
        Diplog.info(message);
        return setState({ info: message });
    };

    page.success = (message) => {
        message = wrapMessage(message);
        Diplog.success(message);
        return setState({ success: message });
    };

    page.warn = (message) => page.info(message);

    // --- Navigation / loading ---
    page.load = (name, body, messages) => {
        const newState = {};
        if (messages) {
            for (let key of ["error", "info", "success"]) newState[key] = wrapMessage(messages[key]);
        }
        Diplog.printMessages(newState);
        newState.name = name;
        newState.body = body;

        if (name === "games") {
            history.push("/games");
            DipStorage.setCurrentPath("/games");
        } else if (name && name.startsWith("game: ")) {
            const gameId = name.substring(6);
            const gamePath = `/game/${gameId}`;
            history.push(gamePath);
            DipStorage.setCurrentPath(gamePath);
        }

        return setState(newState);
    };

    page.loadGames = (messages) => {
        if (messages) {
            const newState = {};
            for (let key of ["error", "info", "success"]) newState[key] = wrapMessage(messages[key]);
            Diplog.printMessages(newState);
            setState(newState);
        }
        setState({ name: "games" });
        history.push("/games");
    };

    page.loadGameFromDisk = () => {
        return loadGameFromDisk()
            .then((game) => {
                page.success(`Game loaded from disk: ${game.game_id}`);
                page.addGamesFound([game]);
                setState({ name: `game: ${game.game_id}` });
                history.push(`/game/${game.game_id}`);
            })
            .catch(page.error);
    };

    page.getName = () => stateRef.current.name;

    // --- Dialog ---
    page.dialog = (builder) => {
        confirmAlert({ customUI: ({ onClose }) => builder(onClose) });
    };

    // --- Disconnect / logout ---
    const __disconnect = (error) => {
        page.connection.close();
        page.connection = null;
        page.channel = null;
        page.availableMaps = null;
        DipStorage.clearCurrentPath();
        DipStorage.clearSession();
        const message = wrapMessage(error ? `${error.toString()}` : `Disconnected from channel and server.`);
        Diplog.success(message);
        return setState({
            error: error ? message : null,
            info: null,
            success: error ? null : message,
            name: null,
            body: null,
            games: {},
            myGames: {},
        }).then(() => history.push("/"));
    };

    page.onReconnectionError = (error) => __disconnect(error);

    page.logout = () => {
        window.localStorage.removeItem("hostname");
        if (page.channel) {
            return page.channel
                .logout()
                .then(() => __disconnect())
                .catch((error) => page.error(`Error while disconnecting: ${error.toString()}.`));
        } else {
            return __disconnect();
        }
    };

    // --- Auto-reconnect from persisted session token ---
    // Runs once on mount. If a valid session exists in localStorage, open a
    // new WebSocket, construct a Channel with the stored token, and verify it
    // by making a lightweight channel-level request (getAvailableMaps). The
    // server's attach_connection_handler will re-map the token to the new
    // WebSocket handler, so no password is needed.
    useEffect(() => {
        const session = DipStorage.getSession();
        if (!session || !session.token || page.channel) {
            setIsSessionRestoring(false);
            return;
        }

        const { token, username, hostname, port } = session;
        const useSSL = window.location.protocol.toLowerCase() === "https:" || port == 443;
        const conn = new Connection(hostname, port, useSSL);
        conn.onReconnectionError = page.onReconnectionError;

        conn.connect(page)
            .then(() => {
                page.connection = conn;

                // Manually reconstruct the Channel with the persisted token
                // and register it on the connection so subsequent requests
                // include the token and the server can map it.
                const channel = new Channel(conn, username, token);
                conn.channels[token] = channel;
                page.channel = channel;

                // Validate the token with a lightweight request. If the token
                // expired or was revoked the server will respond with an error
                // and we fall through to the catch below.
                return channel.getAvailableMaps();
            })
            .then((availableMaps) => {
                for (let mapName of Object.keys(availableMaps)) availableMaps[mapName].powers.sort();
                page.availableMaps = availableMaps;

                // Restore user's game list from local storage hints.
                const userGameIndices = DipStorage.getUserGames(username);
                if (userGameIndices && userGameIndices.length) {
                    return page.channel.getGamesInfo({ games: userGameIndices });
                }
                return null;
            })
            .then((gamesInfo) => {
                if (gamesInfo) {
                    page.updateMyGames(gamesInfo);
                }

                Diplog.success(`Session restored for ${username}.`);
                setIsSessionRestoring(false);

                // Navigate to the route the user was on, or /games by default.
                const savedPath = DipStorage.getCurrentPath();
                if (savedPath && savedPath !== "/") {
                    if (savedPath.startsWith("/game/")) {
                        const gameId = savedPath.substring(6);
                        page.setState({ name: `game: ${gameId}` });
                    } else if (savedPath === "/games") {
                        page.setState({ name: "games" });
                    }
                    history.push(savedPath);
                } else {
                    page.setState({ name: "games" });
                    history.push("/games");
                }
            })
            .catch((error) => {
                Diplog.warn("Session restore failed: " + error);
                // Token is stale / server unreachable — clear it so we don't
                // retry on every mount.
                DipStorage.clearSession();
                if (conn) conn.close();
                page.connection = null;
                page.channel = null;
                setIsSessionRestoring(false);
            });
    }, []);

    // --- Game management ---
    page.updateMyGames = (gamesToAdd) => {
        const s = stateRef.current;
        const myGames = Object.assign({}, s.myGames);
        let gamesFound = null;
        for (let gameToAdd of gamesToAdd) {
            myGames[gameToAdd.game_id] = gameToAdd;
            if (Object.prototype.hasOwnProperty.call(s.games, gameToAdd.game_id)) {
                if (!gamesFound) gamesFound = Object.assign({}, s.games);
                gamesFound[gameToAdd.game_id] = gameToAdd;
            }
        }
        if (!gamesFound) gamesFound = s.games;
        return setState({ myGames: myGames, games: gamesFound });
    };

    page.getGame = (gameID) => {
        const s = stateRef.current;
        if (Object.prototype.hasOwnProperty.call(s.myGames, gameID)) return s.myGames[gameID];
        return s.games[gameID];
    };

    page.getMyGames = () => sortGames(Object.values(stateRef.current.myGames));

    page.getGamesFound = () => sortGames(Object.values(stateRef.current.games));

    page.addGamesFound = (gamesToAdd) => {
        const s = stateRef.current;
        const gamesFound = {};
        for (let game of gamesToAdd) {
            gamesFound[game.game_id] = Object.prototype.hasOwnProperty.call(s.myGames, game.game_id)
                ? s.myGames[game.game_id]
                : game;
        }
        return setState({ games: gamesFound });
    };

    const _remove_from_my_games = (gameID) => {
        const s = stateRef.current;
        if (Object.prototype.hasOwnProperty.call(s.myGames, gameID)) {
            const games = Object.assign({}, s.myGames);
            delete games[gameID];
            DipStorage.removeUserGame(page.channel.username, gameID);
            return games;
        } else {
            return s.myGames;
        }
    };

    const _remove_from_games = (gameID) => {
        const s = stateRef.current;
        if (Object.prototype.hasOwnProperty.call(s.games, gameID)) {
            const games = Object.assign({}, s.games);
            delete games[gameID];
            return games;
        } else {
            return s.games;
        }
    };

    const _add_to_my_games = (game) => {
        const s = stateRef.current;
        const myGames = Object.assign({}, s.myGames);
        const gamesFound = Object.prototype.hasOwnProperty.call(s.games, game.game_id)
            ? Object.assign({}, s.games)
            : s.games;
        myGames[game.game_id] = game;
        if (Object.prototype.hasOwnProperty.call(gamesFound, game.game_id)) gamesFound[game.game_id] = game;
        return { myGames: myGames, games: gamesFound };
    };

    page.disconnectGame = (gameID) => {
        const game = page.getGame(gameID);
        if (game) {
            if (game.client) {
                game.client.clearAllCallbacks();
                game.client.callbacksBound = false;
                if (game.client.queue) game.client.queue.append(null);
            }
            return page.channel
                .getGamesInfo({ games: [gameID] })
                .then((gamesInfo) => page.updateMyGames(gamesInfo))
                .catch((error) => page.error(`Error while leaving game ${gameID}: ${error.toString()}`));
        }
        return null;
    };

    const _post_remove = (gameID) => {
        return page
            .disconnectGame(gameID)
            .then(() => {
                const myGames = _remove_from_my_games(gameID);
                const games = _remove_from_games(gameID);
                return setState({ games, myGames });
            })
            .then(() => page.loadGames({ info: `Game ${gameID} deleted.` }));
    };

    page.leaveGame = (gameID) => {
        const s = stateRef.current;
        if (Object.prototype.hasOwnProperty.call(s.myGames, gameID)) {
            const game = s.myGames[gameID];
            if (game.client) {
                return game.client
                    .leave()
                    .then(() => page.disconnectGame(gameID))
                    .then(() => page.loadGames({ info: `Game ${gameID} left.` }))
                    .catch((error) => page.error(`Error when leaving game ${gameID}: ${error.toString()}`));
            }
        } else {
            return page.loadGames({ info: `No game to left.` });
        }
        return null;
    };

    page.removeGame = (gameID) => {
        const game = page.getGame(gameID);
        if (game) {
            if (game.client) {
                return game.client
                    .remove()
                    .then(() => _post_remove(gameID))
                    .catch((error) => page.error(`Error when deleting game ${gameID}: ${error.toString()}`));
            } else {
                return page.channel
                    .joinGame({ game_id: gameID })
                    .then((networkGame) => networkGame.remove())
                    .then(() => _post_remove(gameID))
                    .catch((error) =>
                        page.error(`Error when deleting game after joining it (${gameID}): ${error.toString()}`),
                    );
            }
        }
    };

    page.addToMyGames = (game) => {
        DipStorage.addUserGame(page.channel.username, game.game_id);
        return setState(_add_to_my_games(game)).then(() => page.loadGames());
    };

    page.removeFromMyGames = (gameID) => {
        const myGames = _remove_from_my_games(gameID);
        return setState({ myGames }).then(() => page.loadGames());
    };

    page.hasMyGame = (gameID) => {
        return Object.prototype.hasOwnProperty.call(stateRef.current.myGames, gameID);
    };

    // --- Render ---
    const successMessage = state.success || "-";
    const infoMessage = state.info || "-";
    const errorMessage = state.error || "-";

    return (
        <PageContext.Provider value={page}>
            <div className="page container-fluid" id={state.contentName}>
                <div className={"top-msg row"}>
                    <div
                        title={successMessage !== "-" ? successMessage : ""}
                        className={"col-sm-4 msg success " + (state.success ? "with-msg" : "no-msg")}
                        onClick={() => page.success()}
                    >
                        {successMessage}
                    </div>
                    <div
                        title={infoMessage !== "-" ? infoMessage : ""}
                        className={"col-sm-4 msg info " + (state.info ? "with-msg" : "no-msg")}
                        onClick={() => page.info()}
                    >
                        {infoMessage}
                    </div>
                    <div
                        title={errorMessage !== "-" ? errorMessage : ""}
                        className={"col-sm-4 msg error " + (state.error ? "with-msg" : "no-msg")}
                        onClick={() => page.error()}
                    >
                        {errorMessage}
                    </div>
                </div>
                <Suspense
                    fallback={
                        <div className="loading-fallback">
                            <div className="spinner-border text-primary" role="status">
                                <span className="sr-only">Loading...</span>
                            </div>
                        </div>
                    }
                >
                    {isSessionRestoring ? (
                        <div className="loading-fallback">
                            <div className="spinner-border text-primary" role="status">
                                <span className="sr-only">Restoring session...</span>
                            </div>
                        </div>
                    ) : (
                        <Switch>
                            <Route exact path="/" component={ContentConnection} />
                            <Route
                                path="/games"
                                render={() =>
                                    page.channel ? (
                                        <ContentGames myGames={page.getMyGames()} gamesFound={page.getGamesFound()} />
                                    ) : (
                                        <Redirect to="/" />
                                    )
                                }
                            />
                            <Route
                                path="/game/:gameId"
                                render={(routeProps) => <GameRoute {...routeProps} page={page} />}
                            />
                            <Redirect to="/" />
                        </Switch>
                    )}
                </Suspense>
            </div>
        </PageContext.Provider>
    );
};

PageBase.propTypes = {
    history: PropTypes.shape({
        push: PropTypes.func.isRequired,
    }).isRequired,
};

export const Page = withRouter(PageBase);
