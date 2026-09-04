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
import React, { useContext, useState, useEffect } from "react";
import { Tabs } from "../components/tabs";
import { Table } from "../components/table";
import { FindForm } from "../forms/find_form";
import { InlineGameView } from "../utils/inline_game_view";
import { Helmet } from "react-helmet-async";
import { Navigation } from "../components/navigation";
import { PageContext } from "../components/page_context";
import { ContentGame } from "./content_game";
import PropTypes from "prop-types";
import { Tab } from "../components/tab";
import { GameCreationWizard } from "../wizards/gameCreation/gameCreationWizard";

const TABLE_LOCAL_GAMES = {
    game_id: ["Game ID", 0],
    deadline: ["Deadline", 1],
    rights: ["Rights", 2],
    rules: ["Rules", 3],
    players: ["Players/Expected", 4],
    status: ["Status", 5],
    phase: ["Phase", 6],
    join: ["Join", 7],
    actions: ["Actions", 8],
};

export const ContentGames = ({ myGames, gamesFound }) => {
    const page = useContext(PageContext);
    const [tab, setTab] = useState(null);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const onFind = (form) => {
        for (let field of ["game_id", "status", "include_protected", "for_omniscience"])
            if (!form[field]) form[field] = null;
        page.channel
            .listGames(form)
            .then((data) => {
                page.success("Found " + data.length + " data.");
                page.addGamesFound(data);
                page.loadGames();
            })
            .catch((error) => {
                page.error("Error when looking for distant games: " + error);
            });
    };

    const onCreate = (form) => {
        let networkGame = null;
        page.channel
            .createGame(form)
            .then((game) => {
                page.addToMyGames(game.local);
                networkGame = game;
                return networkGame.getAllPossibleOrders();
            })
            .then((allPossibleOrders) => {
                networkGame.local.setPossibleOrders(allPossibleOrders);
                page.load(`game: ${networkGame.local.game_id}`, <ContentGame data={networkGame.local} />, {
                    success: "Game created.",
                });
            })
            .catch((error) => {
                page.error("Error when creating a game: " + error);
            });
    };

    const wrapGameData = (gameData) => {
        return new InlineGameView(page, gameData, page.availableMaps);
    };

    const gameCreationButton = () => (
        <button
            type="button"
            className="btn btn-danger btn-sm mx-0 mx-sm-4"
            onClick={() =>
                page.dialog((onClose) => (
                    <GameCreationWizard
                        availableMaps={page.availableMaps}
                        onCancel={onClose}
                        username={page.channel.username}
                        onSubmit={(form) => {
                            onClose();
                            onCreate(form);
                        }}
                    />
                ))
            }
        >
            <strong>create a game</strong>
        </button>
    );

    const title = "Games";
    const navigation = [
        ["load a game from disk", page.loadGameFromDisk],
        ["logout", page.logout],
    ];
    const sortedMyGames = [...myGames].sort((a, b) => b.timestamp_created - a.timestamp_created);
    const sortedGamesFound = [...gamesFound].sort((a, b) => b.timestamp_created - a.timestamp_created);
    const activeTab = tab ? tab : sortedMyGames.length ? "my-games" : "find";

    return (
        <main>
            <Helmet>
                <title>{title} | Diplomacy</title>
            </Helmet>
            <Navigation
                title={title}
                afterTitle={gameCreationButton()}
                username={page.channel.username}
                navigation={navigation}
            />
            <Tabs menu={["find", "my-games"]} titles={["Find", "My Games"]} onChange={setTab} active={activeTab}>
                {activeTab === "find" ? (
                    <Tab id="tab-games-find" display={true}>
                        <FindForm onSubmit={onFind} />
                        <Table
                            className={"table table-striped"}
                            caption={"Games"}
                            columns={TABLE_LOCAL_GAMES}
                            data={sortedGamesFound}
                            wrapper={wrapGameData}
                        />
                    </Tab>
                ) : (
                    ""
                )}
                {activeTab === "my-games" ? (
                    <Tab id={"tab-my-games"} display={true}>
                        <Table
                            className={"table table-striped"}
                            caption={"My games"}
                            columns={TABLE_LOCAL_GAMES}
                            data={sortedMyGames}
                            wrapper={wrapGameData}
                        />
                    </Tab>
                ) : (
                    ""
                )}
            </Tabs>
        </main>
    );
};

ContentGames.propTypes = {
    gamesFound: PropTypes.array.isRequired,
    myGames: PropTypes.array.isRequired,
};
