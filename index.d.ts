import { EventEmitter } from 'events';
export declare function YemotRouter(options?: { timeout: number; printLog: boolean; uncaughtErrorHandler: function }): YemotRouter;

type CallHandler = (p: Call) => void;
interface YemotRouter {
    get: (path: string, handler: CallHandler) => void;
    post: (path: string, handler: CallHandler) => void;
    all: (path: string, handler: CallHandler) => void;
    deleteCall: (callId: string) => boolean;
    events: EventEmitter;
    defaults: {
        printLog?: boolean;
        read?: {
            timeout?: number;
            tap?: TapOps;
            stt?: SstOps;
            record?: RecordOps;
        };
        id_list_message?: idListMessageOptions;
    }
}

// based of https://tchumim.com/post/157692, https://tchumim.com/post/157706
type ReadModes = {
    tap: TapOptions;
    stt: SstOptions;
    record: RecordOptions;
};

export type Call = {
    did: string;
    phone: string;
    real_did: string;
    callId: string;
    extension: string;
    read<T extends keyof ReadModes>(messages: Msg[], mode: T, options?: ReadModes[T]): Promise<string>;
    go_to_folder(target: string): void;
    id_list_message(messages: Msg[], options?: idListMessageOptions): void;
    routing_yemot(number: string): void;
    restart_ext(): void;
    hangup(): void;
};

export type Msg = {
    type: 'file' | 'text' | 'speech' | 'digits' | 'number' | 'alpha' | 'zmanim' | 'go_to_folder' | 'system_message' | 'music_on_hold' | 'date' | 'dateH';
    data:
        | string
        | number
        | {
              time?: string;
              zone?: string;
              difference?: string;
          };
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

type idListMessageOptions = {
    removeInvalidChars?: boolean;
    prependToNextAction?: boolean;
};

class CallError extends Error {
    name: string;
    message: string;
    callerFile: string;
    call: Call;
    date: Date;
    isYemotRouterError: boolean;
    constructor ({ message, call = null }) {
    }
}

class ExitError extends CallError {
    constructor(call: Call, context: Object) {}
}

class HangupError extends CallError { }

class TimeoutError extends CallError {
    constructor(call: Call) { }
}

export const errors = {
    ExitError,
    HangupError,
    TimeoutError
};
