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
import React, { useState } from "react";
import { Forms } from "../components/forms";
import PropTypes from "prop-types";
import { Button } from "../components/button";

export const MessageForm = ({ defaultMessage, recipient, engine, onSendMessage, handleMessage }) => {
    const [message, setMessage] = useState(defaultMessage);

    const handleChange = (event) => {
        setMessage(event.target.value);
        handleMessage(event.target.value);
    };

    const truthTitle = `Send Truth`;
    const lieTitle = `Send Lie`;

    return (
        <div className="message-form">
            <div className={"form-group"}>
                {Forms.createLabel("message", "", "sr-only")}
                <textarea
                    id={"message"}
                    className={"form-control"}
                    value={message}
                    onChange={handleChange}
                />
            </div>
            <div className={"send-buttons"}>
                <div className={"truth-button"}>
                    <Button
                        key={"t"}
                        title={truthTitle + ` to ${recipient}`}
                        onClick={() => {
                            onSendMessage(engine, recipient, message, true);
                            setMessage("");
                            handleMessage("");
                        }}
                        pickEvent={true}
                    />
                </div>

                <div className={"deception-button"}>
                    <Button
                        key={"l"}
                        title={lieTitle + ` to ${recipient}`}
                        onClick={() => {
                            onSendMessage(engine, recipient, message, false);
                            setMessage("");
                            handleMessage("");
                        }}
                        pickEvent={true}
                    />
                </div>
            </div>
        </div>
    );
};

MessageForm.propTypes = {
    sender: PropTypes.string,
    recipient: PropTypes.string,
    onChange: PropTypes.func,
    onSubmit: PropTypes.func,
    defaultMessage: PropTypes.string,
};
