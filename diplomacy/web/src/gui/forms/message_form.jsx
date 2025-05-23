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
import React from "react";
import { Forms } from "../components/forms";
import PropTypes from "prop-types";
import { Button } from "../components/button";

export class MessageForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = this.initState();
        this.handleChange = this.handleChange.bind(this);
    }

    initState() {
        return { message: this.props.defaultMessage, truth: false };
    }

    handleChange = (event) => {
        this.setState({ message: event.target.value });
        this.props.handleMessage(event.target.value);
    };

    render() {
        const truthTitle = `Send Truth`;
        const lieTitle = `Send Lie`;

        return (
            <div className="message-form">
                <div className={"form-group"}>
                    {Forms.createLabel("message", "", "sr-only")}
                    <textarea
                        id={"message"}
                        className={"form-control"}
                        value={this.state.message}
                        onChange={this.handleChange}
                    />
                </div>
                <div className={"send-buttons"}>
                    <div className={"truth-button"}>
                        <Button
                            key={"t"}
                            title={truthTitle + ` to ${this.props.recipient}`}
                            onClick={() => {
                                this.props.onSendMessage(
                                    this.props.engine,
                                    this.props.recipient,
                                    this.state.message,
                                    true,
                                );
                                this.setState({ message: "" });
                                this.props.handleMessage("");
                            }}
                            pickEvent={true}
                        />
                    </div>

                    <div className={"deception-button"}>
                        <Button
                            key={"l"}
                            title={lieTitle + ` to ${this.props.recipient}`}
                            onClick={() => {
                                this.props.onSendMessage(
                                    this.props.engine,
                                    this.props.recipient,
                                    this.state.message,
                                    false,
                                );
                                this.setState({ message: "" });
                                this.props.handleMessage("");
                            }}
                            pickEvent={true}
                        />
                    </div>
                </div>
            </div>
        );
    }
}

MessageForm.propTypes = {
    sender: PropTypes.string,
    recipient: PropTypes.string,
    onChange: PropTypes.func,
    onSubmit: PropTypes.func,
    defaultMessage: PropTypes.string,
};
