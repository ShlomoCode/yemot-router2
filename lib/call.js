import { makeMessagesData, makeTapModeRead, makeSttModeRead, makeRecordModeRead } from './response_functions.js';
import { HangupError, TimeoutError, ExitError, CallError } from './errors.js';
import colors from 'colors';
import ms from 'ms';

function shiftDuplicatedValues (values) {
    /** אם יש ערך מסויים כמה פעמים, שייקבע רק האחרון **/
    for (const key of Object.keys(values)) {
        const value = values[key];
        if (Array.isArray(value)) {
            values[key] = value[value.length - 1];
        }
    }
    return values;
}

class Call {
    #eventsEmitter;
    #defaults;
    #valNameIndex;
    #timeoutId;
    #_responsesTextQueue;
    #responsesTextQueue;
    #values;

    constructor (callId, eventsEmitter, defaults) {
        this.#eventsEmitter = eventsEmitter;
        this.#defaults = defaults;

        this.callId = callId;
        this.did = '';
        this.phone = '';
        this.real_did = '';
        this.extension = '';

        this.#valNameIndex = 0;
        this.#_responsesTextQueue = '';
        this.#responsesTextQueue = {
            pull: () => {
                const queueText = this.#_responsesTextQueue;
                this.#_responsesTextQueue = '';
                return queueText;
            },
            push: (newResText) => {
                this.#_responsesTextQueue += `${newResText}&`;
            }
        };
    }

    get defaults () {
        return this.#defaults;
    }

    set defaults (newDefaults) {
        if (newDefaults.id_list_message?.prependToNextAction) {
            throw new CallError({ message: 'prependToNextAction is not supported as default', call: this });
        }

        if (typeof newDefaults.read?.timeout !== 'undefined' && !ms(newDefaults.read.timeout)) {
            throw new CallError({ message: 'timeout must be a valid ms liberty string/milliseconds number', call: this });
        }

        this.#defaults = {
            ...this.#defaults,
            ...newDefaults
        };
    }

    get values () {
        return this.#values;
    }

    set values (newValues) {
        throw new CallError({ message: 'call.values is read-only', call: this });
    }

    #logger (msg, color = 'blue') {
        if (!this.#defaults.printLog) return;
        console.log(colors[color](`[${this.callId}]: ${msg}`));
    }

    async read (messages, mode = 'tap', options = {}) {
        if (!Array.isArray(messages)) {
            throw new CallError({ message: `messages must be array, got ${typeof messages}`, call: this });
        }

        if (!messages.length) {
            throw new CallError({ message: 'messages must not be empty array', call: this });
        }

        if (messages.some((message) => typeof message !== 'object')) {
            throw new CallError({ message: `message must be object, one or more of the messages got type ${typeof messages}`, call: this });
        }

        if (messages.some((message) => typeof message.type !== 'string')) {
            throw new CallError({ message: `message type must be string, one or more of the messages got type ${typeof messages.type}`, call: this });
        }

        messages.forEach((message) => {
            if (typeof message.data === 'undefined') {
                throw new CallError({ message: 'message data is required, got undefined', call: this });
            }
            if (message.type !== 'zmanim' && message.type !== 'music_on_hold') {
                if (['number', 'digits'].includes(message.type) && Number.isInteger(message.data)) return;
                if (typeof message.data !== 'string') throw new CallError({ message: `message (in type ${message.type}) data must be string, got ${typeof message.data}`, call: this });
            }
        });

        if (!['tap', 'stt', 'record'].includes(mode)) {
            throw new CallError({ message: `mode '${mode}' is invalid. valid modes are: tap, stt, record`, call: this });
        }

        let valName;
        let responseText;
        const sendResp = async () => {
            if (options.val_name) {
                valName = options.val_name;
            } else {
                this.#valNameIndex++;
                valName = `val_${this.#valNameIndex}`;
            }

            const messagesCombined = makeMessagesData(messages, {
                removeInvalidChars: options.removeInvalidChars ?? this.#defaults.read.removeInvalidChars ?? this.#defaults.removeInvalidChars
            }, this);

            const readOptions = {
                ...this.#defaults.read[mode],
                timeout: this.#defaults.read.timeout,
                re_enter_if_exists: this.#defaults.read.re_enter_if_exists,
                removeInvalidChars: this.#defaults.read.removeInvalidChars ?? this.#defaults.removeInvalidChars,
                ...options,
                valName
            };

            const readOptionsDeprecates = [
                ['play_ok_mode', 'typing_playback_mode'],
                ['read_none', 'allow_empty'],
                ['read_none_var', 'empty_val'],
                ['block_change_type_lang', 'block_change_keyboard'],
                ['min', 'min_digits'],
                ['max', 'max_digits'],
                ['block_zero', 'block_zero_key'],
                ['block_asterisk', 'block_asterisk_key'],
                ['record_ok', 'no_confirm_menu'],
                ['record_hangup', 'save_on_hangup'],
                ['record_attach', 'append_to_existing_file'],
                ['allow_typing', 'block_typing'],
                ['use_records_engine', 'use_records_recognition_engine'],
                ['lenght_min', 'min_length'],
                ['length_min', 'min_length'],
                ['lenght_max', 'min_length'],
                ['length_max', 'max_length']
            ];

            for (const [oldName, newName] of readOptionsDeprecates) {
                if (typeof readOptions[oldName] !== 'undefined') {
                    throw new CallError({ message: `read option '${oldName}' is deprecated, use '${newName}' instead`, call: this });
                }
            }

            if (mode === 'tap') {
                responseText = makeTapModeRead(messagesCombined, readOptions, this);
            } else if (mode === 'stt') {
                responseText = makeSttModeRead(messagesCombined, readOptions, this);
            } else if (mode === 'record') {
                responseText = makeRecordModeRead(messagesCombined, readOptions, this);
            }

            this.send(this.#responsesTextQueue.pull() + responseText);

            await this.blockRunningUntilNextRequest(options.timeout ?? this.#defaults.read.timeout);

            if (!this.#values[valName]) {
                await sendResp();
            }
        };

        await sendResp();

        const value = this.#values[valName];
        if (options.allow_empty && String(value) === String(options.empty_val)) {
            return options.empty_val;
        }
        return value;
    }

    go_to_folder (target) {
        const responseTxt = `go_to_folder=${target}`;
        this.send(this.#responsesTextQueue.pull() + responseTxt);
        throw new ExitError(this, { target, caller: 'go_to_folder' });
    }

    restart_ext () {
        const currentFolder = this.extension;
        return this.go_to_folder(`/${currentFolder}`);
    }

    hangup () {
        return this.go_to_folder('hangup');
    }

    /**
    * @param {Msg[]} messages
    * @param {Object} options
    * @param {Boolean} options.prependToNextAction
    * @param {Boolean} options.removeInvalidChars
    */
    id_list_message (messages, options = {}) {
        if (!Array.isArray(messages)) {
            throw new CallError({ message: `messages must be array, got ${typeof messages}.\nmessages got: ${JSON.stringify(messages)}`, call: this });
        }

        if (!['object', 'undefined'].includes(typeof options)) {
            throw new CallError({ message: `if you pass options argument to id_list_message it must be object, but got ${typeof options} ('${options}')`, call: this });
        }

        const { prependToNextAction = false } = options;

        if (prependToNextAction && messages.some((message) => message?.type === 'go_to_folder')) {
            throw new CallError({ message: 'if you use go_to_folder message type in id_list_message you can\'t use prependToNextAction=true!', call: this });
        }

        const goToFolderMessageIndex = messages.findIndex((message) => message?.type === 'go_to_folder');
        if (goToFolderMessageIndex !== -1 && goToFolderMessageIndex !== messages.length - 1) {
            throw new CallError({ message: 'go_to_folder message type must be the last message in id_list_message. No further messages can be threaded after this message type', call: this });
        }

        const messagesCombined = makeMessagesData(messages, { removeInvalidChars: options.removeInvalidChars ?? this.#defaults.id_list_message.removeInvalidChars ?? this.#defaults.removeInvalidChars }, this);
        const responseTxt = `id_list_message=${messagesCombined}`;

        if (prependToNextAction) {
            this.#responsesTextQueue.push(responseTxt);
        } else {
            if (this.res._headerSent) {
                this.#logger('Cannot send id_list_message after sending response (probably done from uncaughtErrorHandler due to error in asynchronous code after returning response)', 'red');
                return;
            }
            this.send(this.#responsesTextQueue.pull() + responseTxt + '&');
            throw new ExitError(this, {
                target: goToFolderMessageIndex !== -1 ? messages[goToFolderMessageIndex].data : `parent of /${this.extension}`,
                caller: goToFolderMessageIndex !== -1 ? 'go_to_folder' : 'id_list_message'
            });
        }
    }

    routing_yemot (number) {
        const responseTxt = `routing_yemot=${number}`;
        this.send(this.#responsesTextQueue.pull() + responseTxt);
        throw new ExitError(this, { target: `other system - ${number}`, caller: 'routing_yemot' });
    }

    send (data) {
        this.res.send(data);
    }

    setReqValues (req, res) {
        this.req = req;
        this.res = res;

        this.#values = shiftDuplicatedValues(req.method === 'POST' ? req.body : req.query);

        this.phone = this.#values.ApiPhone;
        this.callId = this.#values.ApiCallId;
        this.did = this.#values.ApiDID;
        this.real_did = this.#values.ApiRealDID;
        this.extension = this.#values.ApiExtension;

        const valuesToInject = Object.keys(this.#values).filter((key) => key.startsWith('Api'));
        for (const key of valuesToInject) {
            this[key] = this.#values[key];
        }
    }

    async blockRunningUntilNextRequest (timeout) {
        this.#logger(`🔒 fn running blocked - waiting to next request from yemot ${timeout ? `(timeout ${timeout === 'number' ? ms(timeout, { long: true }) : ms(ms(timeout), { long: true })} is defined)` : ''}`);
        return new Promise((resolve, reject) => {
            clearTimeout(this.#timeoutId);
            if (timeout) {
                const timeoutMilliseconds = typeof timeout === 'number' ? timeout : ms(timeout);
                this.#timeoutId = setTimeout(() => {
                    if (!this.res._headerSent) this.res.json({ message: 'timeout' });
                    reject(new TimeoutError(this, timeoutMilliseconds));
                }, timeoutMilliseconds);
            }
            this.#eventsEmitter.once(this.callId, (isHangup) => {
                clearTimeout(this.#timeoutId);
                this.#logger('🔓 fn running unblocked');
                if (isHangup) {
                    if (!this.res._headerSent) this.res.json({ message: 'hangup' });
                    reject(new HangupError(this));
                } else {
                    resolve();
                }
            });
        });
    }

    get query () {
        throw new CallError({ message: 'call.query is deprecated, use call.values instead', call: this });
    }

    get body () {
        throw new CallError({ message: 'call.body is deprecated, use call.values instead', call: this });
    }

    get params () {
        throw new CallError({ message: 'call.params is deprecated, use call.req.params instead', call: this });
    }
}

export default Call;
