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

export class PlayerPowersInfoTable extends React.Component {
    constructor(props) {
        super(props);
        if (!this.props.wrapper) this.props.wrapper = defaultWrapper;
        console.log(this.props);
    }

    getHeader(columns) {
        const header = [];
        for (let entry of Object.entries(columns)) {
            if (entry.length > 0 && entry[0] === "controller") continue;
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

    getHeaderLine(header) {
        return (
            <thead className={"thead-light"}>
                <tr>
                    {header.map((column, colIndex) => (
                        <th key={colIndex}>{column[2]}</th>
                    ))}
                </tr>
            </thead>
        );
    }

    getBodyRow(header, row, rowIndex, wrapper, countries, player) {
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
    }

    getBodyLines(header, data, wrapper, countries, player) {
        return (
            <tbody>
                {data.map((row, rowIndex) => this.getBodyRow(header, row, rowIndex, wrapper, countries, player))}
            </tbody>
        );
    }

    render() {
        const header = this.getHeader(this.props.columns);
        return (
            <div className={"table-responsive"}>
                <table className={this.props.className}>
                    <caption>
                        {this.props.caption} ({this.props.data.length})
                    </caption>
                    {this.getHeaderLine(header)}
                    {this.getBodyLines(
                        header,
                        this.props.data,
                        this.props.wrapper,
                        this.props.countries,
                        this.props.player,
                    )}
                </table>
            </div>
        );
    }
}

PlayerPowersInfoTable.propTypes = {
    wrapper: PropTypes.func,
    columns: PropTypes.object,
    className: PropTypes.string,
    caption: PropTypes.string,
    data: PropTypes.array,
};
