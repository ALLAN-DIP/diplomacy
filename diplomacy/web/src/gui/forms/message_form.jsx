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
import React from 'react';
import {Forms} from "../components/forms";
import {UTILS} from "../../diplomacy/utils/utils";
import PropTypes from "prop-types";
import {Button} from "../components/button";

export class MessageForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = this.initState();
        this.handleChange = this.handleChange.bind(this);
    }

    initState() {
        return {message: '', truth: false};
    }

    handleChange = (event) => {
        this.setState({message: event.target.value});
    }

    render() {
        const onChange = Forms.createOnChangeCallback(this, this.props.onChange);
        const onSubmitTruth = Forms.createOnSubmitCallbackWithInit(this, this.props.onSubmit, this.initState(), true);
        const onSubmitLie = Forms.createOnSubmitCallbackWithInit(this, this.props.onSubmit, this.initState(), false);
        const truthTitle = `send (${this.props.sender} ${UTILS.html.UNICODE_SMALL_RIGHT_ARROW} ${this.props.recipient})`;
        const lieTitle = `send (${this.props.sender} ${UTILS.html.UNICODE_SMALL_RIGHT_ARROW} ${this.props.recipient})`;

        return (
            <div className='message-form'>
                <div className={'form-group'}>
                    {Forms.createLabel('message', '', 'sr-only')}
                    <textarea id={'message'} className={'form-control'}
                              value={this.state.message} onChange={this.handleChange}/>
                </div>
                <Button key={'t'} title={truthTitle} onClick={() => {
                    this.props.onSendMessage(this.props.engine, this.props.recipient, this.state.message, true);
                    this.setState({message: ''});
                }} pickEvent={true}/>
                <Button key={'l'} title={lieTitle} onClick={() => {
                    this.props.onSendMessage(this.props.engine, this.props.recipient, this.state.message, false)
                    this.setState({message: ''});
                }} pickEvent={true}/>
            </div>
        );
    }
}

MessageForm.propTypes = {
    sender: PropTypes.string,
    recipient: PropTypes.string,
    onChange: PropTypes.func,
    onSubmit: PropTypes.func
};
