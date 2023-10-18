class CallError extends Error {
    constructor ({ message, call }) {
        super();

        this.name = 'CallError';
        this.message = message;
        this.call = call;
        this.date = new Date();
    }
}

class ExitError extends CallError {
    constructor (call, context) {
        super({ call, message: 'the call was exited from the extension (by go_to_folder or id_list_message)' });

        this.name = 'ExitError';
        this.context = context;
    }
}

class HangupError extends CallError {
    constructor (call) {
        super({ call, message: 'the call was hangup by the caller' });

        this.name = 'HangupError';
    }
}

class TimeoutError extends CallError {
    constructor (call, timeout) {
        super({ call, message: 'timeout for receiving a response from the caller' });

        this.name = 'TimeoutError';
        this.timeout = timeout;
    }
}

module.exports = {
    HangupError,
    TimeoutError,
    ExitError,
    CallError
};