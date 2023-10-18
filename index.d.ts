import { EventEmitter } from 'events';
import { Router, Request, Send } from 'express';

type Defaults = {
    printLog?: boolean;
    read?: {
        timeout?: number;
        tap?: TapOptions;
        stt?: SstOptions;
        record?: RecordOptions;
    };
    id_list_message?: IdListMessageOptions;
};

// from @types/express - https://github.com/DefinitelyTyped/DefinitelyTyped/blob/f800de4ffd291820a9e444e6b6cd3ac9b4a16e53/types/express/index.d.ts#L73-#L92
interface ExpressRouterOptions {
    /**
     * Enable case sensitivity.
     */
    caseSensitive?: boolean | undefined;

    /**
     * Preserve the req.params values from the parent router.
     * If the parent and the child have conflicting param names, the child’s value take precedence.
     *
     * @default false
     * @since 4.5.0
     */
    mergeParams?: boolean | undefined;

    /**
     * Enable strict routing.
     */
    strict?: boolean | undefined;
}

type YemotRouterOptions = ExpressRouterOptions & {
    timeout?: number;
    printLog?: boolean;
    uncaughtErrorHandler?: (error: Error, call: Call) => void;
    defaults?: Defaults;
};

type CallHandler = (call: Call) => Promise<void>;

interface RouterEventEmitter extends EventEmitter {
    on(eventName: 'call_hangup' | 'call_continue' | 'new_call', listener: (call: Call) => void): this;
    once(eventName: 'call_hangup' | 'call_continue' | 'new_call', listener: (call: Call) => void): this;
}

interface YemotRouter extends Omit<Router, 'get' | 'post' | 'all'> {
    get: (path: string, handler: CallHandler) => void;
    post: (path: string, handler: CallHandler) => void;
    all: (path: string, handler: CallHandler) => void;
    /**
     * delete call from active calls by callId
     * @returns true if the call was deleted, false if the call was not found
     */
    deleteCall: (callId: string) => boolean;
    events: RouterEventEmitter;
    defaults: Defaults;
}

export declare function YemotRouter(options?: YemotRouterOptions): YemotRouter;

// based of https://tchumim.com/post/157692, https://tchumim.com/post/157706
type ReadModes = {
    tap: TapOptions;
    stt: SstOptions;
    record: RecordOptions;
};

export type Call = {
    req: Request;
    did: string;
    phone: string;
    real_did: string;
    callId: string;
    extension: string;
    read<T extends keyof ReadModes>(messages: Msg[], mode: T, options?: ReadModes[T]): Promise<string>;
    go_to_folder(target: string): void;
    id_list_message(messages: Msg[], options?: IdListMessageOptions): void;
    routing_yemot(number: string): void;
    restart_ext(): void;
    hangup(): void;
    send: Send;
    readonly values: { readonly [key: string]: string };
    defaults: Defaults;
};

export type Msg = {
    type: 'file' | 'text' | 'speech' | 'digits' | 'number' | 'alpha' | 'zmanim' | 'go_to_folder' | 'system_message' | 'music_on_hold' | 'date' | 'dateH';
    data: string | number | { time?: string; zone?: string; difference?: string };
    removeInvalidChars?: boolean;
};

type GeneralOptions = {
    val_name?: string;
    re_enter_if_exists?: boolean;
    removeInvalidChars?: boolean;
};

interface TapOptions extends GeneralOptions {
    max_digits?: number;
    min_digits?: number;
    sec_wait?: number;
    typing_playback_mode?: 'number' | 'Digits' | 'File' | 'TTS' | 'Alpha' | 'No' | 'HebrewKeyboard' | 'EmailKeyboard' | 'EnglishKeyboard' | 'DigitsKeyboard' | 'TeudatZehut' | 'Price' | 'Time' | 'Phone' | 'No';
    block_asterisk_key?: boolean;
    block_zero_key?: boolean;
    replace_char?: string;
    digits_allowed?: Array<number | string>;
    amount_attempts?: number;
    allow_empty?: boolean;
    empty_val?: string;
    block_change_type_lang?: boolean;
}

interface SstOptions extends GeneralOptions {
    lang?: string;
    block_typing?: boolean;
    max_digits?: number;
    use_records_recognition_engine?: boolean;
    quiet_max?: number;
    length_max?: number;
}

interface RecordOptions extends GeneralOptions {
    path?: string;
    file_name?: string;
    no_confirm_menu?: boolean;
    save_on_hangup?: boolean;
    append_to_existing_file?: boolean;
    min_length?: number;
    max_length?: number;
}

type IdListMessageOptions = {
    removeInvalidChars?: boolean;
    prependToNextAction?: boolean;
};

export class CallError extends Error {
    readonly date: Date;
    readonly call: Call;

    constructor(options: { message: string; call: Call });
}

export class ExitError extends CallError {
    readonly context: {
        caller: 'go_to_folder' | 'id_list_message' | 'routing_yemot';
        target: string;
    };

    constructor(call: Call, context: ExitError['context']);
}

export class HangupError extends CallError {
    constructor(call: Call);
}

export class TimeoutError extends CallError {
    readonly timeout: number;

    constructor(call: Call, timeout: number);
}
