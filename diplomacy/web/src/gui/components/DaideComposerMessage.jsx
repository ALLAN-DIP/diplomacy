const GLOBAL = 'GLOBAL';

export class DaideComposerMessage {

    constructor(message) {
        Object.assign(this, message);
        this.time_sent = message.time_sent;
        this.phase = message.phase;
        this.sender = message.sender;
        this.recipient = message.recipient;
        this.message = message.message;
        this.negotiation = message.negotiation;
        this.daide = message.daide;
        this.gloss = message.gloss;
    }

    isGlobal() {
        return this.recipient === GLOBAL;
    }

}