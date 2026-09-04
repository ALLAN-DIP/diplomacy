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
import React, { useContext, useRef, useEffect } from "react";
import { Connection } from "../../diplomacy/client/connection";
import { ConnectionForm } from "../forms/connection_form";
import { DipStorage } from "../utils/dipStorage";
import { Helmet } from "react-helmet-async";
import { Navigation } from "../components/navigation";
import { PageContext } from "../components/page_context";

export const ContentConnection = () => {
    const page = useContext(PageContext);
    const connectionRef = useRef(null);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const onSubmit = (data) => {
        for (let fieldName of ["hostname", "port", "username", "password", "showServerFields"])
            if (!Object.prototype.hasOwnProperty.call(data, fieldName)) return page.error(`Missing ${fieldName}, got ${JSON.stringify(data)}`);
        page.info("Connecting ...");
        if (page.connection) {
            page.connection.close();
        }
        if (connectionRef.current) {
            connectionRef.current.close();
            if (connectionRef.current.currentConnectionProcessing) {
                connectionRef.current.currentConnectionProcessing.stop();
            }
        }
        connectionRef.current = new Connection(data.hostname, data.port, window.location.protocol.toLowerCase() === "https:" || data.port == 443);
        connectionRef.current.onReconnectionError = page.onReconnectionError;
        connectionRef.current
            .connect(page)
            .then(() => {
                page.connection = connectionRef.current;
                connectionRef.current = null;
                page.success(`Successfully connected to server ${data.username}:${data.port}`);
                page.connection
                    .authenticate(data.username, data.password)
                    .then((channel) => {
                        page.channel = channel;
                        // Persist session so the user can survive page
                        // refreshes / direct-URL navigation without
                        // re-entering credentials.
                        DipStorage.setSession(
                            channel.token,
                            data.username,
                            data.hostname,
                            data.port,
                        );
                        return channel.getAvailableMaps();
                    })
                    .then((availableMaps) => {
                        for (let mapName of Object.keys(availableMaps)) availableMaps[mapName].powers.sort();
                        page.availableMaps = availableMaps;
                        const userGameIndices = DipStorage.getUserGames(page.channel.username);
                        if (userGameIndices && userGameIndices.length) {
                            return page.channel.getGamesInfo({ games: userGameIndices });
                        } else {
                            return null;
                        }
                    })
                    .then((gamesInfo) => {
                        if (gamesInfo) {
                            page.success("Found " + gamesInfo.length + " user games.");
                            page.updateMyGames(gamesInfo);
                        }

                        const savedPath = DipStorage.getCurrentPath();
                        if (savedPath && savedPath !== "/") {
                            DipStorage.clearCurrentPath();
                            if (savedPath.startsWith("/game/")) {
                                const gameId = savedPath.substring(6);
                                page.setState({ name: `game: ${gameId}` });
                            } else if (savedPath === "/games") {
                                page.setState({ name: "games" });
                            }
                            page.props.history.push(savedPath);
                            page.success(`Account ${data.username} connected.`);
                        } else {
                            page.loadGames({ success: `Account ${data.username} connected.` });
                        }
                    })
                    .catch((error) => {
                        page.error("Error while authenticating: " + error + " Please re-try.");
                    });
            })
            .catch((error) => {
                page.error("Error while connecting: " + error + " Please re-try.");
            });
    };

    const title = "Connection";
    return (
        <main>
            <Helmet>
                <title>{title} | Diplomacy</title>
            </Helmet>
            <Navigation title={title} />
            <ConnectionForm onSubmit={onSubmit} />
        </main>
    );
};
