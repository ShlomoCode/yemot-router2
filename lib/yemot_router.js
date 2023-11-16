import { HangupError, TimeoutError, ExitError } from './errors.js';
import Call from './call.js';
import { Router } from 'express';
import EventEmitter from 'events';
import colors from 'colors';
import globalDefaults from './defaults.js';
import ms from 'ms';
import { parse as parseStack } from 'stack-trace';

function YemotRouter (options = {}) {
    const ops = {
        printLog: options.printLog,
        timeout: options.timeout,
        uncaughtErrorHandler: options.uncaughtErrorHandler || null,
        defaults: options.defaults || {}
    };

    if (options.uncaughtErrorsHandler) {
        throw new Error('YemotRouter: uncaughtErrorsHandler is renamed to uncaughtErrorHandler');
    }

    if (typeof ops.timeout !== 'undefined' && !ms(ops.timeout)) {
        throw new Error('YemotRouter: timeout must be a valid ms liberty string/milliseconds number');
    }

    if (ops.defaults.id_list_message?.prependToNextAction) {
        throw new Error('YemotRouter: prependToNextAction is not supported as default');
    }

    let mergedDefaults = {
        printLog: ops.printLog ?? globalDefaults.printLog,
        removeInvalidChars: ops.defaults?.removeInvalidChars ?? globalDefaults.removeInvalidChars,
        read: {
            timeout: ops.timeout ?? globalDefaults.read.timeout,
            tap: {
                ...globalDefaults.read.tap,
                ...ops.defaults.read?.tap
            },
            stt: {
                ...globalDefaults.read.stt,
                ...ops.defaults.read?.stt
            },
            record: {
                ...globalDefaults.read.record,
                ...ops.defaults.read?.record
            }
        },
        id_list_message: {
            ...globalDefaults.id_list_message,
            ...ops.defaults.id_list_message
        }
    };

    const activeCalls = {};
    const eventsEmitter = new EventEmitter();

    function logger (callId, msg, color = 'blue') {
        if (!(ops.printLog ?? mergedDefaults.printLog)) return;
        console.log(colors[color](`[${callId}]: ${msg}`));
    }

    function deleteCall (callId) {
        const call = activeCalls[callId];
        if (call && call._timeoutId) {
            clearTimeout(call._timeoutId);
        }
        delete activeCalls[callId];
        return !!call;
    }

    async function makeNewCall (fn, callId, call) {
        try {
            await fn(call);
            deleteCall(callId);
            logger(callId, '🆗 the function is done');
        } catch (error) {
            deleteCall(callId);

            const [trace] = parseStack(error);
            const errorPath = trace ? `(${trace.getFileName()}:${trace.getLineNumber()}:${trace.getColumnNumber()})` : '';

            // טיפול בשגיאות מלאכותיות שנועדו לעצור את ריצת הפונקציה - בניתוק לדוגמה
            if (error instanceof HangupError) {
                logger(callId, '👋 the call was hangup by the caller');
            } else if (error instanceof TimeoutError) {
                logger(callId, `💣 timeout for receiving a response from the caller (after ${ms(error.timeout, { long: true })}). the call has been deleted from active calls`);
            } else if (error instanceof ExitError) {
                logger(callId, `👋 the call was exited from the extension /${call.extension}` + (error.context ? ` (by ${error.context?.caller} to ${error.context?.target})` : ''));
            } else {
                if (ops.uncaughtErrorHandler) {
                    logger(callId, `💥 Uncaught error. applying uncaughtErrorHandler ${errorPath}`, 'red');
                    try {
                        await ops.uncaughtErrorHandler(error, call);
                    } catch (err) {
                        const [trace] = parseStack(err);
                        const errorPath = `${trace.getFileName()}:${trace.getLineNumber()}:${trace.getColumnNumber()}`;
                        if (err instanceof ExitError) {
                            console.log(`👋 the call was exited from the extension /${call.extension} in uncaughtErrorHandler ${errorPath}` + (error.context ? ` (by ${error.context?.caller} to ${error.context?.target})` : ''));
                        } else {
                            console.error('💥 Error in uncaughtErrorHandler! process is crashing');
                            throw err;
                        }
                    }
                } else {
                    logger(callId, `💥 Uncaught error. no uncaughtErrorHandler, throwing error ${errorPath}`, 'red');
                    throw error;
                }
            }
        }
    }

    const expressRouter = Router(options);

    const proxyHandler = {
        get (target, key) {
            if (key === 'add_fn') {
                throw new Error('YemotRouter: router.add_fn is deprecated, use get/post/all instead');
            } else if (['get', 'post', 'all'].includes(key)) {
                return (path, fn) => {
                    target[key](path, (req, res, next) => {
                        if (req.method === 'POST' && !req.body) {
                            throw new Error('YemotRouter: it look you use api_url_post=yes, but you didn\'t include express.urlencoded({ extended: true }) middleware! (https://expressjs.com/en/4x/api.html#express.urlencoded)');
                        }

                        const values = req.method === 'POST' ? req.body : req.query;
                        const requiredValues = ['ApiPhone', 'ApiDID', 'ApiExtension', 'ApiCallId'];
                        if (requiredValues.some((key) => !Object.prototype.hasOwnProperty.call(values, key))) {
                            return res.json({ message: 'the request is not valid yemot request' });
                        }

                        const callId = values.ApiCallId;

                        let isNewCall = false;
                        let currentCall = activeCalls[callId];
                        if (!currentCall) {
                            isNewCall = true;
                            currentCall = new Call(callId, eventsEmitter, mergedDefaults);
                            currentCall.setReqValues(req, res);
                            if (values.hangup === 'yes') {
                                logger(callId, '👋 call is hangup (outside the function)');
                                eventsEmitter.emit('call_hangup', currentCall);
                                return res.json({ message: 'hangup' });
                            }
                            activeCalls[callId] = currentCall;
                            logger(callId, `📞 new call - from ${values.ApiPhone || 'AnonymousPhone'}`);
                            eventsEmitter.emit('new_call', currentCall);
                        } else {
                            currentCall.setReqValues(req, res);
                        }

                        if (isNewCall) {
                            makeNewCall(fn, callId, currentCall);
                        } else {
                            eventsEmitter.emit(callId, values.hangup === 'yes');
                            eventsEmitter.emit(values.hangup === 'yes' ? 'call_hangup' : 'call_continue', currentCall);
                        }
                    });
                };
            } else if (key === 'deleteCall') {
                return deleteCall;
            } else if (key === 'activeCalls') {
                return activeCalls;
            } else if (key === 'defaults') {
                return mergedDefaults;
            } else if (key === 'events') {
                return eventsEmitter;
            } else if (key === 'asExpressRouter') {
                return new Proxy(expressRouter, proxyHandler);
            } else if (['use', 'handle', 'set', 'name', 'length', 'caseSensitive', 'stack'].includes(key)) {
                return target[key];
            } else {
                throw new Error(`YemotRouter: ${key.toString()} is not supported yet [get]`);
            }
        },
        set (target, key, value) {
            if (key === 'defaults') {
                if (value.id_list_message?.prependToNextAction) {
                    throw new Error('prependToNextAction is not supported as default');
                }

                if (typeof value.read?.timeout !== 'undefined' && !ms(value.read.timeout)) {
                    throw new Error('timeout must be a valid ms liberty string/milliseconds number');
                }

                mergedDefaults = {
                    ...mergedDefaults,
                    ...value
                };
            } else {
                throw new Error(`YemotRouter: ${key.toString()} is not supported yet [set]`);
            }
        }
    };

    return new Proxy(expressRouter, proxyHandler);
}

export default YemotRouter;
