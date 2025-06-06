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
const GLOBAL = "GLOBAL";

export class Message {
    constructor(message) {
        Object.assign(this, message);
        this.time_sent = message.time_sent;
        this.phase = message.phase;
        this.sender = message.sender;
        this.recipient = message.recipient;
        this.message = message.message;
        this.truth = message.truth;
        this.recipient_annotation = message.recipient_annotation;
        this.type = message.type;
    }

    isGlobal() {
        return this.recipient === GLOBAL;
    }
}
