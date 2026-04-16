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
//// Tables.

import React from "react";
import PropTypes from "prop-types";
import { Slider } from "./slider";
import { Button } from "./button";

class DefaultWrapper {
    constructor(data) {
        this.data = data;
        this.get = this.get.bind(this);
    }

    get(fieldName) {
        return this.data[fieldName];
    }
}

function defaultWrapper(data) {
    return new DefaultWrapper(data);
}

function getHeader(columns) {
    const header = [];
    for (let entry of Object.entries(columns)) {
        const name = entry[0];
        const title = entry[1][0];
        const order = entry[1][1];
        if (name === "name") {
            header.push([order, name, title]);
        }
    }
    header.sort((a, b) => {
        let t = a[0] - b[0];
        if (t === 0) t = a[1].localeCompare(b[1]);
        if (t === 0) t = a[2].localeCompare(b[2]);
        return t;
    });
    return header;
}

export const PowersInfoTable = ({
    className,
    caption,
    columns,
    data,
    wrapper = defaultWrapper,
    countries,
    stances,
    isBot,
    player,
    stanceUpdated,
    onChangeStance,
    onChangeIsBot,
}) => {
    const header = getHeader(columns);

    const handleStance = (country, stance) => {
        onChangeStance(country, stance);
    };

    const handleIsBot = (country, checked) => {
        onChangeIsBot(country, checked);
    };

    return (
        <div className={"table-responsive"}>
            <table className={className}>
                <caption>
                    {caption} ({data.length})
                </caption>
                <thead className={"thead-light"}>
                    <tr>
                        {header.map((column, colIndex) => (
                            <th key={colIndex}>{column[2]}</th>
                        ))}
                        <th>
                            <span title="What is your attitute toward this player?">Your stance toward this player</span>
                        </th>
                        <th>
                            <span title="Do you think this player is a bot?">Do you think this player is a bot?</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, rowIndex) => {
                        const wrapped = wrapper(row);
                        return (
                            <tr key={rowIndex}>
                                {header.map((headerColumn, colIndex) => (
                                    <td className={"align-middle"} key={colIndex}>
                                        {wrapped.get(headerColumn[1])}
                                    </td>
                                ))}

                                {player !== countries[rowIndex] && !row.isEliminated() ? (
                                    <td style={{ display: "flex", flexDirection: "row" }}>
                                        <Button
                                            pickEvent={true}
                                            title={"No change"}
                                            onClick={() => {
                                                handleStance(
                                                    countries[rowIndex],
                                                    stances[countries[rowIndex]] ? stances[countries[rowIndex]] : 3,
                                                );
                                            }}
                                        ></Button>
                                        &nbsp;
                                        <Slider
                                            country={countries[rowIndex]}
                                            onChangeStance={handleStance}
                                            stance={stances[countries[rowIndex]]}
                                            dict={{
                                                1: "Very hostile",
                                                2: "Slightly hostile",
                                                3: "Neutral",
                                                4: "Slightly friendly",
                                                5: "Very friendly",
                                            }}
                                            clicked={stanceUpdated[countries[rowIndex]]}
                                        />
                                    </td>
                                ) : null}

                                {player !== countries[rowIndex] && !row.isEliminated() ? (
                                    <td className={"align-middle"}>
                                        <input
                                            type="checkbox"
                                            defaultChecked={isBot[countries[rowIndex]] === true}
                                            onClick={(e) => {
                                                handleIsBot(countries[rowIndex], e.target.checked);
                                            }}
                                        ></input>
                                    </td>
                                ) : null}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

PowersInfoTable.propTypes = {
    wrapper: PropTypes.func,
    columns: PropTypes.object,
    className: PropTypes.string,
    caption: PropTypes.string,
    data: PropTypes.array,
    stances: PropTypes.object,
    isBot: PropTypes.object,
};
