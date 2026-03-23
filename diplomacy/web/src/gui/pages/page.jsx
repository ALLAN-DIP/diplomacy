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
/** Main class to use to create app GUI. **/

import React, { Suspense } from "react";

import { Switch, Route, withRouter, Redirect } from "react-router-dom";

import { UTILS } from "../../diplomacy/utils/utils";
import { Diplog } from "../../diplomacy/utils/diplog";
import { DipStorage } from "../utils/dipStorage";
import { PageContext } from "../components/page_context";
import { loadGameFromDisk } from "../utils/load_game_from_disk";
import PropTypes from "prop-types";

// Lazy load components for code splitting

const ContentConnection = React.lazy(() => import("./content_connection").then(module => ({ default: module.ContentConnection })));
const ContentGames = React.lazy(() => import("./content_games").then(module => ({ default: module.ContentGames })));
const ContentGame = React.lazy(() => import("./content_game").then(module => ({ default: module.ContentGame })));

import { confirmAlert } from "react-confirm-alert";
import "react-confirm-alert/src/react-confirm-alert.css";

class PageBase extends React.Component {
    constructor(props) {
        super(props);
        this.connection = null;
        this.channel = null;
        this.availableMaps = null;
        this.state = {
            // Page messages
            error: null,
            info: null,
            success: null,
            // Page content parameters
            name: null,
            body: null,
            // Games.
            games: {}, // Games found.
            myGames: {}, // Games locally stored.
        };
        this.error = this.error.bind(this);
        this.info = this.info.bind(this);
        this.success = this.success.bind(this);
        this.logout = this.logout.bind(this);
        this.loadGameFromDisk = this.loadGameFromDisk.bind(this);
        this._post_remove = this._post_remove.bind(this);
        this._add_to_my_games = this._add_to_my_games.bind(this);
        this._remove_from_my_games = this._remove_from_my_games.bind(this);
        this._remove_from_games = this._remove_from_games.bind(this);
        this.onReconnectionError = this.onReconnectionError.bind(this);
    }

    static wrapMessage(message) {
        return message ? `(${UTILS.date()}) ${message}` : "";
    }

    static __sort_games(games) {
        // Sort games with not-joined games first, else compare game ID.
        games.sort((a, b) => (a.role ? 1 : 0) - (b.role ? 1 : 0) || a.game_id.localeCompare(b.game_id));
        return games;
    }

    static defaultPage() {
        return <ContentConnection />;
    }

    setState(state) {
        return new Promise((resolve) => super.setState(state, resolve));
    }

    onReconnectionError(error) {
        this.__disconnect(error);
    }

    /**
     * @callback OnClose
     */

    /**
     * @callback DialogBuilder
     * @param {OnClose} onClose
     */

    /**
     * open a dialog box
     * @param {DialogBuilder} builder - a callback to generate dialog GUI. Will be executed with a `onClose` callback
     * parameter to call when dialog must be closed: `builder(onClose)`.
     */
    dialog(builder) {
        confirmAlert({ customUI: ({ onClose }) => builder(onClose) });
    }

    //// Methods to load a page.

    load(name, body, messages) {
        const newState = {};
        if (messages) {
            for (let key of ["error", "info", "success"]) newState[key] = PageBase.wrapMessage(messages[key]);
        }
        Diplog.printMessages(newState);
        newState.name = name;
        newState.body = body;

        if (name === "games") {
            this.props.history.push("/games");
            DipStorage.setCurrentPath("/games");
        } else if (name && name.startsWith("game: ")) {
            const gameId = name.substring(6);
            const gamePath = `/game/${gameId}`;
            this.props.history.push(gamePath);
            DipStorage.setCurrentPath(gamePath);
        }

        return this.setState(newState);
    }

    loadGames(messages) {
        if (messages) {
            const newState = {};
            for (let key of ["error", "info", "success"]) newState[key] = PageBase.wrapMessage(messages[key]);
            Diplog.printMessages(newState);
            this.setState(newState);
        }
        this.setState({ name: "games" });
        this.props.history.push("/games");
    }

    loadGameFromDisk() {
        return loadGameFromDisk()
            .then((game) => {
                this.success(`Game loaded from disk: ${game.game_id}`);
                // Add to games found so it can be resolved by getGame
                this.addGamesFound([game]);
                this.setState({ name: `game: ${game.game_id}` });
                this.props.history.push(`/game/${game.game_id}`);
            })
            .catch(this.error);
    }

    getName() {
        return this.state.name;
    }

    //// Methods to sign out channel and go back to connection page.

    __disconnect(error) {
        // Clear local data and go back to connection page.
        this.connection.close();
        this.connection = null;
        this.channel = null;
        this.availableMaps = null;
        DipStorage.clearCurrentPath();
        const message = PageBase.wrapMessage(error ? `${error.toString()}` : `Disconnected from channel and server.`);
        Diplog.success(message);
        return this.setState({
            error: error ? message : null,
            info: null,
            success: error ? null : message,
            name: null,
            body: null,
            // When disconnected, remove all games previously loaded.
            games: {},
            myGames: {},
        }).then(() => this.props.history.push("/"));
    }

    logout() {
        window.localStorage.removeItem("hostname");
        // Disconnect channel and go back to connection page.
        if (this.channel) {
            return this.channel
                .logout()
                .then(() => this.__disconnect())
                .catch((error) => this.error(`Error while disconnecting: ${error.toString()}.`));
        } else {
            return this.__disconnect();
        }
    }

    //// Methods to be used to set page title and messages.

    error(message) {
        message = PageBase.wrapMessage(message);
        Diplog.error(message);
        return this.setState({ error: message });
    }

    info(message) {
        message = PageBase.wrapMessage(message);
        Diplog.info(message);
        return this.setState({ info: message });
    }

    success(message) {
        message = PageBase.wrapMessage(message);
        Diplog.success(message);
        return this.setState({ success: message });
    }

    warn(message) {
        return this.info(message);
    }

    //// Methods to manage games.

    updateMyGames(gamesToAdd) {
        // Update state myGames with given games. This method does not update local storage.
        const myGames = Object.assign({}, this.state.myGames);
        let gamesFound = null;
        for (let gameToAdd of gamesToAdd) {
            myGames[gameToAdd.game_id] = gameToAdd;
            if (Object.prototype.hasOwnProperty.call(this.state.games, gameToAdd.game_id)) {
                if (!gamesFound) gamesFound = Object.assign({}, this.state.games);
                gamesFound[gameToAdd.game_id] = gameToAdd;
            }
        }
        if (!gamesFound) gamesFound = this.state.games;
        return this.setState({ myGames: myGames, games: gamesFound });
    }

    getGame(gameID) {
        if (Object.prototype.hasOwnProperty.call(this.state.myGames, gameID)) return this.state.myGames[gameID];
        return this.state.games[gameID];
    }

    getMyGames() {
        return PageBase.__sort_games(Object.values(this.state.myGames));
    }

    getGamesFound() {
        return PageBase.__sort_games(Object.values(this.state.games));
    }

    addGamesFound(gamesToAdd) {
        const gamesFound = {};
        for (let game of gamesToAdd) {
            gamesFound[game.game_id] = Object.prototype.hasOwnProperty.call(this.state.myGames, game.game_id)
                ? this.state.myGames[game.game_id]
                : game;
        }
        return this.setState({ games: gamesFound });
    }

    leaveGame(gameID) {
        if (Object.prototype.hasOwnProperty.call(this.state.myGames, gameID)) {
            const game = this.state.myGames[gameID];
            if (game.client) {
                return game.client
                    .leave()
                    .then(() => this.disconnectGame(gameID))
                    .then(() => this.loadGames({ info: `Game ${gameID} left.` }))
                    .catch((error) => this.error(`Error when leaving game ${gameID}: ${error.toString()}`));
            }
        } else {
            return this.loadGames({ info: `No game to left.` });
        }
        return null;
    }

    _post_remove(gameID) {
        return this.disconnectGame(gameID)
            .then(() => {
                const myGames = this._remove_from_my_games(gameID);
                const games = this._remove_from_games(gameID);
                return this.setState({ games, myGames });
            })
            .then(() => this.loadGames({ info: `Game ${gameID} deleted.` }));
    }

    removeGame(gameID) {
        const game = this.getGame(gameID);
        if (game) {
            if (game.client) {
                return game.client
                    .remove()
                    .then(() => this._post_remove(gameID))
                    .catch((error) => this.error(`Error when deleting game ${gameID}: ${error.toString()}`));
            } else {
                return this.channel
                    .joinGame({ game_id: gameID })
                    .then((networkGame) => networkGame.remove())
                    .then(() => this._post_remove(gameID))
                    .catch((error) =>
                        this.error(`Error when deleting game after joining it (${gameID}): ${error.toString()}`),
                    );
            }
        }
    }

    disconnectGame(gameID) {
        const game = this.getGame(gameID);
        if (game) {
            if (game.client) {
                game.client.clearAllCallbacks();
                game.client.callbacksBound = false;
                if (game.client.queue) game.client.queue.append(null);
            }
            return this.channel
                .getGamesInfo({ games: [gameID] })
                .then((gamesInfo) => this.updateMyGames(gamesInfo))
                .catch((error) => this.error(`Error while leaving game ${gameID}: ${error.toString()}`));
        }
        return null;
    }

    _add_to_my_games(game) {
        const myGames = Object.assign({}, this.state.myGames);
        const gamesFound = Object.prototype.hasOwnProperty.call(this.state.games, game.game_id)
            ? Object.assign({}, this.state.games)
            : this.state.games;
        myGames[game.game_id] = game;
        if (Object.prototype.hasOwnProperty.call(gamesFound, game.game_id)) gamesFound[game.game_id] = game;
        return { myGames: myGames, games: gamesFound };
    }

    _remove_from_my_games(gameID) {
        if (Object.prototype.hasOwnProperty.call(this.state.myGames, gameID)) {
            const games = Object.assign({}, this.state.myGames);
            delete games[gameID];
            DipStorage.removeUserGame(this.channel.username, gameID);
            return games;
        } else {
            return this.state.myGames;
        }
    }

    _remove_from_games(gameID) {
        if (Object.prototype.hasOwnProperty.call(this.state.games, gameID)) {
            const games = Object.assign({}, this.state.games);
            delete games[gameID];
            return games;
        } else {
            return this.state.games;
        }
    }

    addToMyGames(game) {
        // Update state myGames with given game **and** update local storage.
        DipStorage.addUserGame(this.channel.username, game.game_id);
        return this.setState(this._add_to_my_games(game)).then(() => this.loadGames());
    }

    removeFromMyGames(gameID) {
        const myGames = this._remove_from_my_games(gameID);
        return this.setState({ myGames }).then(() => this.loadGames());
    }

    hasMyGame(gameID) {
        return Object.prototype.hasOwnProperty.call(this.state.myGames, gameID);
    }

    //// Render method.

    render() {
        const successMessage = this.state.success || "-";
        const infoMessage = this.state.info || "-";
        const errorMessage = this.state.error || "-";
        return (
            <PageContext.Provider value={this}>
                <div className="page container-fluid" id={this.state.contentName}>
                    <div className={"top-msg row"}>
                        <div
                            title={successMessage !== "-" ? successMessage : ""}
                            className={"col-sm-4 msg success " + (this.state.success ? "with-msg" : "no-msg")}
                            onClick={() => this.success()}
                        >
                            {successMessage}
                        </div>
                        <div
                            title={infoMessage !== "-" ? infoMessage : ""}
                            className={"col-sm-4 msg info " + (this.state.info ? "with-msg" : "no-msg")}
                            onClick={() => this.info()}
                        >
                            {infoMessage}
                        </div>
                        <div
                            title={errorMessage !== "-" ? errorMessage : ""}
                            className={"col-sm-4 msg error " + (this.state.error ? "with-msg" : "no-msg")}
                            onClick={() => this.error()}
                        >
                            {errorMessage}
                        </div>
                    </div>
                    <Suspense fallback={
                        <div className="loading-fallback">
                            <div className="spinner-border text-primary" role="status">
                                <span className="sr-only">Loading...</span>
                            </div>
                        </div>
                    }>
                        <Switch>
                            <Route exact path="/" component={ContentConnection} />
                            <Route path="/games" render={() => this.channel ? <ContentGames myGames={this.getMyGames()} gamesFound={this.getGamesFound()} /> : <Redirect to="/" />} />
                            <Route path="/game/:gameId" render={(props) => {
                                if (!this.channel) return <Redirect to="/" />;
                                const game = this.getGame(props.match.params.gameId);
                                return game ? <ContentGame data={game} /> : <Redirect to="/games" />;
                            }} />
                            <Redirect to="/" />
                        </Switch>
                    </Suspense>

                </div>
            </PageContext.Provider>
        );
    }
}

PageBase.propTypes = {
    history: PropTypes.shape({
        push: PropTypes.func.isRequired,
    }).isRequired,
};

export const Page = withRouter(PageBase);
