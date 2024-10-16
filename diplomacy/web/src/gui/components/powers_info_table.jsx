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

export class PowersInfoTable extends React.Component {
    // className
    // caption
    // columns : {name: [title, order]}
    // data: [objects with expected column names]
    // wrapper: (optional) function to use to wrap one data entry into an object before accessing fields.
    // Must return an instance with a method get(name).
    // If provided: wrapper(data_entry).get(field_name)
    // else: data_entry[field_name]

    constructor(props) {
        super(props);
        if (!this.props.wrapper) this.props.wrapper = defaultWrapper;
    }

    getHeader(columns) {
        const header = [];
        for (let entry of Object.entries(columns)) {
            const name = entry[0];
            const title = entry[1][0];
            const order = entry[1][1];
            if (name === 'name') {
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

    getHeaderLine(header) {
        return (
            <thead className={"thead-light"}>
                <tr>
                    {header.map((column, colIndex) => (
                        <th key={colIndex}>{column[2]}</th>
                    ))}
                    <th>
                        <span title="What is your attitute toward this player?">
                            Your stance toward other players
                        </span>
                    </th>
                    <th>
                        <span title="Do you think this player is a bot?">
                            Which players do you think are bots?
                        </span>
                    </th>
                </tr>
            </thead>
        );
    }

    handleStance = (country, stance) => {
        this.props.onChangeStance(country, stance);
    };

    handleIsBot = (country, isBot) => {
        this.props.onChangeIsBot(country, isBot);
    };

    handleDeceiving = (country, checked) => {
        this.props.onChangeDeceiving(country, checked);
    };

    getBodyRow(header, row, rowIndex, wrapper, countries, stances, isBot, player) {
        const wrapped = wrapper(row);

        return (
            <tr key={rowIndex}>
                {header.map((headerColumn, colIndex) => (
                    <td className={"align-middle"} key={colIndex}>
                        {wrapped.get(headerColumn[1])}
                    </td>
                ))}

                {player !== countries[rowIndex] ? (
                    <td>
                        <Slider
                            country={countries[rowIndex]}
                            onChangeStance={this.handleStance}
                            stance={stances[countries[rowIndex]]}
                            dict={{0: 'Hostile', 1: 'Neutral', 2: 'Friendly'}}
                        />
                    </td>
                ) : null}

                {player !== countries[rowIndex] ? (
                    <td className={"align-middle"}>
                        <Slider
                            country={countries[rowIndex]}
                            onChangeStance={this.handleIsBot}
                            stance={isBot[countries[rowIndex]]}
                            dict={{0: 'This player is a bot', 1: 'Not sure', 2: 'This player is a real human'}}
                        />
                    </td>
                ) : null}

                {/* {player !== countries[rowIndex] ? (
                    <td className={"align-middle"}>
                        <input
                            type="checkbox"
                            defaultChecked={
                                this.props.deceiving &&
                                this.props.deceiving[countries[rowIndex]]
                            }
                            onClick={(e) => {
                                this.handleDeceiving(
                                    countries[rowIndex],
                                    e.target.checked
                                );
                            }}
                        ></input>
                    </td>
                ) : null} */}
            </tr>
        );
    }

    getBodyLines(header, data, wrapper, countries, stances, isBot, player) {
        return (
            <tbody>
                {data.map((row, rowIndex) =>
                    this.getBodyRow(
                        header,
                        row,
                        rowIndex,
                        wrapper,
                        countries,
                        stances,
                        isBot,
                        player
                    )
                )}
            </tbody>
        );
    }

    render() {
        const header = this.getHeader(this.props.columns);
        return (
            <div className={"table-responsive"}>
                <table className={this.props.className}>
                    {this.getHeaderLine(header)}
                    {this.getBodyLines(
                        header,
                        this.props.data,
                        this.props.wrapper,
                        this.props.countries,
                        this.props.stances,
                        this.props.isBot,
                        this.props.player
                    )}
                </table>
            </div>
        );
    }
}

PowersInfoTable.propTypes = {
    wrapper: PropTypes.func,
    columns: PropTypes.object,
    className: PropTypes.string,
    caption: PropTypes.string,
    data: PropTypes.array,
    stances: PropTypes.object,
    isBot: PropTypes.object,
};
