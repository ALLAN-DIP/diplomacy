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
        header.push([order, name, title]);
    }
    header.sort((a, b) => {
        let t = a[0] - b[0];
        if (t === 0) t = a[1].localeCompare(b[1]);
        if (t === 0) t = a[2].localeCompare(b[2]);
        return t;
    });
    return header;
}

export const Table = ({ className, caption, columns, data, wrapper = defaultWrapper }) => {
    const header = getHeader(columns);
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
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

Table.propTypes = {
    wrapper: PropTypes.func,
    columns: PropTypes.object,
    className: PropTypes.string,
    caption: PropTypes.string,
    data: PropTypes.array,
};
